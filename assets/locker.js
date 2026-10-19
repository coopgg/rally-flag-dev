/* ============================================================
   Locker (dev-only preview, stage 1: read-only).

   Shows every weapon and armor piece across the signed-in player's
   characters and vault, Rally Flag style: God Roll matches from
   god-rolls-data.js, armor set progress from Bungie's set table joined
   to sets-data.js, and item details (perk columns, stats).

   Data: one GetProfile call (components below) plus the trimmed item
   database from assets/locker-worker.js (cached in IndexedDB).
   locker.html?demo uses assets/locker-demo.json instead of an account
   (built by tools/build-locker-demo.js from real manifest hashes).

   Nothing here writes to Bungie: moving/equipping is stage 2.
   ============================================================ */
(function(){
  const BUNGIE = "https://www.bungie.net";
  const COMPONENTS = "100,102,200,201,205,300,304,305,310";
  const DEMO = new URLSearchParams(location.search).has("demo");

  const CLASS_NAMES = ["Titan", "Hunter", "Warlock"];
  const BUCKETS = [
    { hash: 1498876634, label: "Kinetic Weapons", kind: "weapons" },
    { hash: 2465295065, label: "Energy Weapons", kind: "weapons" },
    { hash: 953998645, label: "Power Weapons", kind: "weapons" },
    { hash: 3448274439, label: "Helmets", kind: "armor" },
    { hash: 3551918588, label: "Gauntlets", kind: "armor" },
    { hash: 14239492, label: "Chest Armor", kind: "armor" },
    { hash: 20886954, label: "Leg Armor", kind: "armor" },
    { hash: 1585787867, label: "Class Items", kind: "armor" }
  ];
  const BUCKET_BY_HASH = new Map(BUCKETS.map(b => [b.hash, b]));
  const ARMOR_SLOTS = BUCKETS.filter(b => b.kind === "armor").map(b => b.hash);
  const STATE_LOCKED = 1, STATE_MASTERWORK = 4;
  // Plugs worth showing in the perk columns; cosmetics, trackers and
  // empty sockets are left out.
  const SHOW_PLUG = /trait|intrinsic|magazine|barrel|battery|sight|scope|haft|stock|bowstring|arrow|blade|guard|grip|frame|archetype|armor perk|mod$|tuning/i;
  const HIDE_PLUG = /shader|ornament|memento|flair|tracker|restore|deprecated|transmat|emote/i;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const img = p => p ? (p.charAt(0) === "/" ? BUNGIE + p : p) : "";
  const slugify = s => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  let DB = null, PROFILE = null, ITEMS = [], OWNERS = [], SETS = [];
  const state = { owner: "all", type: null, flags: new Set(), q: "" };

  // ---------------- status panels ----------------
  function showStatus(html){ $("locker-status").innerHTML = html ? '<div class="locker-panel panel-card">' + html + "</div>" : ""; }
  function showSignedOut(){
    showStatus(
      "<p>Sign in with Bungie.net to see your weapons and armor here, matched against our God Rolls and armor sets. Rally Flag only reads your gear; nothing is stored anywhere but your browser.</p>" +
      '<div class="locker-actions"><button class="locker-btn" type="button" id="locker-signin">Sign in with Bungie.net</button>' +
      '<a class="locker-btn ghost" href="locker.html?demo">Try it with sample data</a></div>');
    $("locker-signin").addEventListener("click", () => RallyFlagAuth.signIn());
  }
  const steps = [];
  function step(text, done){
    if (done && steps.length) steps[steps.length - 1].done = true;
    if (text) steps.push({ text, done: false });
    showStatus('<ul class="locker-steps">' + steps.map(s => '<li class="' + (s.done ? "done" : "") + '">' + esc(s.text) + "</li>").join("") + "</ul>");
  }
  function showError(message){
    showStatus("<p>Couldn't load your gear: " + esc(message) + "</p>" +
      '<div class="locker-actions"><button class="locker-btn" type="button" id="locker-retry">Try again</button></div>');
    $("locker-retry").addEventListener("click", () => location.reload());
  }

  // ---------------- data ----------------
  function loadDatabase(){
    return new Promise((resolve, reject) => {
      const worker = new Worker("assets/locker-worker.js");
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === "progress") step(m.step, false);
        else if (m.type === "done"){ worker.terminate(); resolve(m.db); }
        else if (m.type === "error"){ worker.terminate(); reject(new Error(m.message)); }
      };
      worker.onerror = (e) => reject(new Error(e.message || "item database worker failed"));
      worker.postMessage({ apiKey: window.RallyFlagAPI.BUNGIE_API_KEY });
    });
  }
  async function authedGet(path){
    const res = await RallyFlagAuth.authedFetch(path);
    const data = await res.json();
    if (!res.ok || data.ErrorCode !== 1) throw new Error((data && data.Message) || ("HTTP " + res.status));
    return data.Response;
  }
  async function loadProfile(){
    if (DEMO){
      const res = await fetch("assets/locker-demo.json");
      if (!res.ok) throw new Error("sample data missing (HTTP " + res.status + ")");
      return res.json();
    }
    const memberships = await authedGet("/Platform/User/GetMembershipsForCurrentUser/");
    const list = memberships.destinyMemberships || [];
    if (!list.length) throw new Error("this Bungie account has no linked Destiny 2 platform.");
    const primary = list.find(m => m.membershipId === memberships.primaryMembershipId) || list[0];
    return authedGet("/Platform/Destiny2/" + primary.membershipType + "/Profile/" + primary.membershipId + "/?components=" + COMPONENTS);
  }

  // ---------------- model ----------------
  const data = (o, k) => (o && o[k] && o[k].data) || {};

  function buildModel(){
    const chars = data(PROFILE, "characters");
    const order = (PROFILE.profile && PROFILE.profile.data && PROFILE.profile.data.characterIds) || Object.keys(chars);
    OWNERS = order.filter(id => chars[id]).map(id => ({ id, cls: chars[id].classType, name: CLASS_NAMES[chars[id].classType] || "Guardian", light: chars[id].light, bg: chars[id].emblemBackgroundPath }));
    const ownerById = new Map(OWNERS.map(o => [o.id, o]));

    const comp = PROFILE.itemComponents || {};
    const instances = (comp.instances && comp.instances.data) || {};
    const stats = (comp.stats && comp.stats.data) || {};
    const sockets = (comp.sockets && comp.sockets.data) || {};
    const reusable = (comp.reusablePlugs && comp.reusablePlugs.data) || {};

    // God Rolls: item hash (pattern or crafted) -> weapon entry.
    const rollByHash = new Map();
    for (const w of (window.GodRollsData && GodRollsData.WEAPONS) || []){
      rollByHash.set(w.itemHash, w);
      if (w.craftedItemHash) rollByHash.set(w.craftedItemHash, w);
    }
    // Armor sets: item hash -> Bungie set, joined to ours by name or slug.
    const ours = (window.ArmorSetsData && ArmorSetsData.SETS) || [];
    const ourByKey = new Map();
    for (const s of ours){ ourByKey.set(slugify(s.name), s); ourByKey.set(s.slug, s); }
    const setByItem = new Map();
    for (const hash in DB.sets){
      const s = DB.sets[hash];
      const entry = { hash, name: s.n, ours: ourByKey.get(slugify(s.n)) || null };
      for (const h of s.items) setByItem.set(h, entry);
    }

    ITEMS = [];
    const add = (it, owner, equipped) => {
      const def = DB.items[it.itemHash];
      if (!def || (def.t !== 2 && def.t !== 3) || !BUCKET_BY_HASH.has(def.b) || !it.itemInstanceId) return;
      const inst = instances[it.itemInstanceId] || {};
      const plugs = ((sockets[it.itemInstanceId] && sockets[it.itemInstanceId].sockets) || []).map(s => s.plugHash || 0);
      const alts = (reusable[it.itemInstanceId] && reusable[it.itemInstanceId].plugs) || {};
      const item = {
        id: it.itemInstanceId, hash: it.itemHash, def, owner, equipped, state: it.state || 0,
        power: (inst.primaryStat && inst.primaryStat.value) || 0,
        damage: inst.damageTypeHash || def.d || 0,
        plugs, alts, stats: (stats[it.itemInstanceId] && stats[it.itemInstanceId].stats) || {},
        roll: null, set: def.t === 2 ? setByItem.get(it.itemHash) || null : null
      };
      const roll = rollByHash.get(it.itemHash);
      if (roll){
        const have = new Set(plugs);
        for (const k in alts) for (const p of alts[k]) have.add(p.plugItemHash);
        const matched = roll.perkHashes.filter(h => have.has(h)).length;
        item.roll = { weapon: roll, matched, total: roll.perkHashes.length, full: matched === roll.perkHashes.length };
      }
      // Searchable text: name, type and every visible perk.
      item.text = (def.n + " " + (def.y || "") + " " + plugs.map(h => DB.items[h] ? DB.items[h].n : "").join(" ")).toLowerCase();
      ITEMS.push(item);
    };
    for (const it of (data(PROFILE, "profileInventory").items || [])) add(it, "vault", false);
    const invs = data(PROFILE, "characterInventories"), eqs = data(PROFILE, "characterEquipment");
    for (const o of OWNERS){
      for (const it of ((invs[o.id] && invs[o.id].items) || [])) add(it, o.id, false);
      for (const it of ((eqs[o.id] && eqs[o.id].items) || [])) add(it, o.id, true);
    }

    // Set progress per (set, class): distinct armor slots owned anywhere.
    const progress = new Map();
    for (const item of ITEMS){
      if (!item.set) continue;
      const key = item.set.hash + ":" + item.def.c;
      if (!progress.has(key)) progress.set(key, { set: item.set, cls: item.def.c, slots: new Set(), equipped: new Set() });
      const p = progress.get(key);
      p.slots.add(item.def.b);
      if (item.equipped) p.equipped.add(item.def.b);
    }
    SETS = [...progress.values()].sort((a, b) => b.slots.size - a.slots.size || a.set.name.localeCompare(b.set.name));
    for (const item of ITEMS) if (item.set) item.setProgress = progress.get(item.set.hash + ":" + item.def.c);
  }

  // ---------------- rendering ----------------
  const ownerLabel = id => id === "vault" ? "Vault" : ((OWNERS.find(o => o.id === id) || {}).name || "");
  const tierClass = def => "tier-" + (def.r === 6 ? 6 : 5);

  function renderOwners(){
    const counts = id => ITEMS.filter(i => i.owner === id).length;
    const cards = [
      '<button type="button" class="owner-card all" data-owner="all" aria-pressed="' + (state.owner === "all") + '"><span class="owner-name">All gear</span><span class="owner-meta">' + ITEMS.length + " items</span></button>"
    ].concat(OWNERS.map(o =>
      '<button type="button" class="owner-card" data-owner="' + o.id + '" aria-pressed="' + (state.owner === o.id) + '" style="background-image:url(\'' + esc(img(o.bg)) + '\')">' +
        '<span class="owner-name">' + esc(o.name) + '</span><span class="owner-meta">Power ' + esc(o.light) + " · " + counts(o.id) + " items</span></button>"
    )).concat([
      '<button type="button" class="owner-card vault" data-owner="vault" aria-pressed="' + (state.owner === "vault") + '"><span class="owner-name">Vault</span><span class="owner-meta">' + counts("vault") + " items</span></button>"
    ]);
    $("owner-grid").innerHTML = cards.join("");
  }

  function setStatus(p){
    const n = p.slots.size;
    if (n >= 4) return p.equipped.size >= 4 ? "4-piece bonus active" : "4-piece bonus ready";
    if (n >= 2) return (p.equipped.size >= 2 ? "2-piece bonus active" : "2-piece bonus ready") + " · " + (4 - n) + " more for 4-piece";
    return (2 - n) + " more for the 2-piece bonus";
  }
  function setHref(p){ return p.set.ours ? "armor-set-bonuses.html?highlight=" + p.set.ours.slug : null; }

  function renderSets(){
    const list = state.owner === "all" || state.owner === "vault" ? SETS : SETS.filter(p => p.cls === (OWNERS.find(o => o.id === state.owner) || {}).cls);
    $("sets-hint").textContent = list.length ? list.length + " sets you own pieces of" : "no set pieces yet";
    $("set-grid").innerHTML = list.map(p => {
      const pips = ARMOR_SLOTS.map(s => '<span class="set-pip' + (p.slots.has(s) ? " on" : "") + '"></span>').join("");
      const href = setHref(p);
      return '<div class="set-card panel-card">' +
        '<div><div class="set-card-name">' + esc(p.set.ours ? p.set.ours.name : p.set.name) + '</div><div class="set-card-class">' + esc(CLASS_NAMES[p.cls] || "") + " · " + p.slots.size + ' of 5 slots</div></div>' +
        '<div class="set-pips" role="img" aria-label="' + p.slots.size + ' of 5 armor slots owned">' + pips + "</div>" +
        '<div class="set-card-status">' + esc(setStatus(p)) + "</div>" +
        (href ? '<a href="' + href + '">Set bonuses →</a>' : "") +
      "</div>";
    }).join("");
  }

  function matches(item){
    if (state.owner !== "all" && item.owner !== state.owner) return false;
    const bucket = BUCKET_BY_HASH.get(item.def.b);
    if (state.type && bucket.kind !== state.type) return false;
    if (state.flags.has("exotic") && item.def.r !== 6) return false;
    if (state.flags.has("godroll") && !(item.roll && item.roll.full)) return false;
    if (state.flags.has("set") && !item.set) return false;
    if (state.flags.has("equipped") && !item.equipped) return false;
    if (state.q && !state.q.split(/\s+/).every(w => item.text.includes(w))) return false;
    return true;
  }

  function tileHtml(item){
    const d = item.def, dmg = DB.damage[item.damage];
    const label = [d.n, d.y, item.power ? "power " + item.power : "", ownerLabel(item.owner) + (item.equipped ? ", equipped" : ""),
      item.roll && item.roll.full ? "matches our God Roll" : "", item.set ? "part of a set" : ""].filter(Boolean).join(", ");
    const ownerTag = state.owner === "all" ? '<span class="tile-owner" aria-hidden="true">' + (item.owner === "vault" ? "V" : ownerLabel(item.owner).charAt(0)) + "</span>" : "";
    return '<button type="button" class="item-tile ' + tierClass(d) + (item.equipped ? " equipped" : "") + '" data-id="' + item.id + '" aria-label="' + esc(label) + '">' +
      '<img class="icon" src="' + esc(img(d.i)) + '" alt="" loading="lazy" width="64" height="64">' +
      (d.w ? '<img class="wm" src="' + esc(img(d.w)) + '" alt="" loading="lazy" width="64" height="64">' : "") +
      (item.set ? '<span class="tile-badge set" aria-hidden="true">' + item.setProgress.slots.size + "</span>" : "") +
      ownerTag +
      (item.roll && item.roll.full ? '<span class="tile-badge" aria-hidden="true">★</span>' : "") +
      '<span class="tile-power">' + (dmg && dmg.i && d.t === 3 ? '<img src="' + esc(img(dmg.i)) + '" alt="" width="12" height="12">' : "") + (item.power || "") + "</span>" +
    "</button>";
  }

  function renderItems(){
    const shown = ITEMS.filter(matches);
    const html = BUCKETS.map(b => {
      const items = shown.filter(i => i.def.b === b.hash).sort((x, y) => (y.equipped - x.equipped) || (y.power - x.power) || x.def.n.localeCompare(y.def.n));
      if (!items.length) return "";
      return '<section class="bucket" aria-labelledby="b-' + b.hash + '"><h2 id="b-' + b.hash + '">' + b.label + " <span>" + items.length + "</span></h2>" +
        '<div class="item-grid">' + items.map(tileHtml).join("") + "</div></section>";
    }).join("");
    $("buckets").innerHTML = html || '<p class="locker-empty">Nothing matches these filters.</p>';
    $("locker-count").textContent = "Showing " + shown.length + " of " + ITEMS.length + " items";
  }

  function render(){ renderOwners(); renderSets(); renderItems(); }

  // ---------------- item details ----------------
  function plugHtml(hash, cls, ours){
    const p = DB.items[hash];
    if (!p) return "";
    return '<div class="plug ' + cls + (ours ? " ours" : "") + '">' + (p.i ? '<img src="' + esc(img(p.i)) + '" alt="" width="26" height="26">' : "") +
      "<span>" + esc(p.n) + "</span>" + (ours ? '<span class="ours-mark" title="In our God Roll">★</span>' : "") + "</div>";
  }
  function showPlug(hash){
    const p = DB.items[hash];
    return p && p.n && !/^(empty|locked) /i.test(p.n) && !HIDE_PLUG.test(p.y || "") && SHOW_PLUG.test(p.y || "");
  }

  function openItem(id){
    const item = ITEMS.find(i => i.id === id);
    if (!item) return;
    const d = item.def, dmg = DB.damage[item.damage];
    const ourPerks = new Set(item.roll ? item.roll.weapon.perkHashes : []);
    const typeLine = [d.r === 6 ? "Exotic" : "Legendary", d.y].filter(Boolean).join(" ") + (d.t === 3 && dmg ? " · " + dmg.n : "");
    const tags = ['<span class="tag power">' + (item.power || "–") + "</span>",
      '<span class="tag">' + esc(ownerLabel(item.owner)) + (item.equipped ? " · equipped" : "") + "</span>"]
      .concat(item.state & STATE_MASTERWORK ? ['<span class="tag">Masterworked</span>'] : [])
      .concat(item.state & STATE_LOCKED ? ['<span class="tag">Locked</span>'] : []);

    let rollHtml = "";
    if (item.roll){
      const r = item.roll, w = r.weapon;
      rollHtml = '<div class="dlg-section"><div class="callout">' +
        (r.full ? "<strong>★ This is our God Roll</strong>: all " + r.total + " perks we run are on this copy."
                : "<strong>" + r.matched + " of " + r.total + "</strong> perks from our God Roll are on this copy" + ' <span class="muted">(★ marks them below)</span>.') +
        ' <a href="god-rolls.html#weapon-' + esc(w.slug) + '">See our roll →</a></div></div>';
    }

    // One column per socket that has something worth showing: the
    // selected plug first, then any alternatives you can swap to for free.
    const cols = [];
    item.plugs.forEach((h, idx) => {
      if (!showPlug(h)) return;
      const alts = (item.alts[idx] || []).map(p => p.plugItemHash).filter(a => a !== h && showPlug(a));
      cols.push('<div class="perk-col">' + plugHtml(h, "", ourPerks.has(h)) + alts.map(a => plugHtml(a, "alt", ourPerks.has(a))).join("") + "</div>");
    });
    const perksHtml = cols.length ? '<div class="dlg-section"><div class="dlg-label">' + (d.t === 3 ? "Perks" : "Perks &amp; mods") + '</div><div class="perk-cols">' + cols.join("") + "</div></div>" : "";

    const statRows = Object.values(item.stats)
      .map(s => ({ name: DB.stats[s.statHash], value: s.value }))
      .filter(s => s.name && s.value != null && s.name !== "Power")
      .sort((a, b) => a.name.localeCompare(b.name));
    const bar = s => /per minute|magazine|charge time|draw time|reload time|ammo/i.test(s.name) ? "" : '<span class="stat-bar"><i style="width:' + Math.max(0, Math.min(100, s.value)) + '%"></i></span>';
    const statsHtml = statRows.length ? '<div class="dlg-section"><div class="dlg-label">Stats</div>' +
      statRows.map(s => '<div class="stat-row"><span>' + esc(s.name) + "</span>" + (bar(s) || "<span></span>") + "<b>" + s.value + "</b></div>").join("") + "</div>" : "";

    let setHtml = "";
    if (item.set){
      const p = item.setProgress, ours = item.set.ours;
      setHtml = '<div class="dlg-section"><div class="callout"><strong>' + esc(ours ? ours.name : item.set.name) + "</strong> set · you own " + p.slots.size + " of 5 " + esc(CLASS_NAMES[p.cls] || "") + " slots. " + esc(setStatus(p)) + "." +
        (ours ? '<br><span class="muted">2-piece: ' + esc(ours.two[0]) + " · 4-piece: " + esc(ours.four[0]) + '</span> <a href="' + setHref(p) + '">Set bonuses →</a>' : "") +
        "</div></div>";
    }

    const dlg = $("item-dialog");
    dlg.innerHTML =
      '<div class="dlg-head"><div class="dlg-icon ' + tierClass(d) + '"><img src="' + esc(img(d.i)) + '" alt="">' + (d.w ? '<img src="' + esc(img(d.w)) + '" alt="">' : "") + "</div>" +
        '<div><h2 class="dlg-name" id="dlg-name">' + esc(d.n) + '</h2><div class="dlg-type">' + esc(typeLine) + '</div><div class="dlg-meta">' + tags.join("") + "</div></div>" +
        '<button type="button" class="dlg-close" aria-label="Close">×</button></div>' +
      '<div class="dlg-body">' + rollHtml + setHtml + perksHtml + statsHtml + "</div>";
    dlg.querySelector(".dlg-close").addEventListener("click", () => dlg.close());
    dlg.showModal();
  }

  // ---------------- wiring ----------------
  function wire(){
    $("owner-grid").addEventListener("click", e => {
      const b = e.target.closest("[data-owner]");
      if (!b) return;
      state.owner = b.dataset.owner;
      render();
    });
    $("locker-chips").addEventListener("click", e => {
      const b = e.target.closest(".chip");
      if (!b) return;
      if (b.dataset.kind === "type"){
        state.type = state.type === b.dataset.value ? null : b.dataset.value;
        document.querySelectorAll('#locker-chips [data-kind="type"]').forEach(c => c.setAttribute("aria-pressed", String(c.dataset.value === state.type)));
      } else {
        const v = b.dataset.value;
        state.flags.has(v) ? state.flags.delete(v) : state.flags.add(v);
        b.setAttribute("aria-pressed", String(state.flags.has(v)));
      }
      renderItems();
    });
    let t = 0;
    $("locker-search").addEventListener("input", e => {
      clearTimeout(t);
      t = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); renderItems(); }, 120);
    });
    $("buckets").addEventListener("click", e => {
      const tile = e.target.closest(".item-tile");
      if (tile) openItem(tile.dataset.id);
    });
    // Click on the backdrop closes the dialog.
    $("item-dialog").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  }

  async function init(){
    if (!DEMO && !RallyFlagAuth.isSignedIn()){ showSignedOut(); return; }
    try {
      step(DEMO ? "Loading sample gear…" : "Loading your gear from Bungie.net…", false);
      const [db, profile] = await Promise.all([loadDatabase(), loadProfile()]);
      DB = db; PROFILE = profile;
      buildModel();
      showStatus("");
      if (DEMO){
        $("demo-banner").innerHTML = '<div class="demo-banner panel-card"><span>You\'re looking at <strong>sample data</strong>, not a real account.</span>' +
          (RallyFlagAuth.isSignedIn() ? '<a class="locker-btn ghost" href="locker.html">See your own gear</a>' : '<button class="locker-btn ghost" type="button" id="demo-signin">Sign in to see yours</button>') + "</div>";
        const b = $("demo-signin");
        if (b) b.addEventListener("click", () => RallyFlagAuth.signIn(location.pathname));
      }
      $("locker-app").hidden = false;
      wire();
      render();
    } catch (e){
      showError(e.message || String(e));
    }
  }
  init();
})();
