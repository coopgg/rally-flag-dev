/* ============================================================
   Locker (dev-only preview, stage 2: move / equip / lock / postmaster).

   Shows every weapon and armor piece across the signed-in player's
   characters and vault, Rally Flag style: God Roll matches from
   god-rolls-data.js, armor set progress from Bungie's set table joined
   to sets-data.js, and item details (perk columns, stats).

   Data: one GetProfile call (components below) plus the trimmed item
   database from assets/locker-worker.js (cached in IndexedDB).
   locker.html?demo uses assets/locker-demo.json instead of an account
   (built by tools/build-locker-demo.js from real manifest hashes).

   Stage 2 writes to Bungie only when the player presses a button (or
   drops a tile): TransferItem, EquipItem, SetLockState and
   PullFromPostmaster, one at a time through a queue. These need the
   app's "Move or equip Destiny gear" OAuth scope (set on bungie.net).
   In ?demo every action is simulated locally.
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
  const POSTMASTER_BUCKET = 215593132, POSTMASTER_CAP = 21;
  // Plugs worth showing in the perk columns; cosmetics, trackers and
  // empty sockets are left out.
  const SHOW_PLUG = /trait|intrinsic|magazine|barrel|battery|sight|scope|haft|stock|bowstring|arrow|blade|guard|grip|frame|archetype|armor perk|mod$|tuning/i;
  const HIDE_PLUG = /shader|ornament|memento|flair|tracker|restore|deprecated|transmat|emote/i;

  // Small line icons (stroke follows the text colour).
  const svg = d => '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  const ICON_TRASH = svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>');
  const ICON_LOCK = svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
  const ICON_UNLOCK = svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>');
  const INVENTORY_CAP = 9; // Bungie: 9 unequipped items per weapon/armor slot on a character
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const img = p => p ? (p.charAt(0) === "/" ? BUNGIE + p : p) : "";
  const slugify = s => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  let DB = null, PROFILE = null, ITEMS = [], OWNERS = [], SETS = [], POSTMASTER = [], MEMBERSHIP_TYPE = 0, PROFILE_PATH = "";

  // Bungie's profile can lag a moment behind a move, so a reload or
  // Refresh right after one would put the item back where it was. Every
  // change we make is noted here (this tab, 5 minutes) and laid over any
  // profile Bungie minted before it (like DIM keeps its own state).
  const JOURNAL_KEY = "rallyflag_locker_journal", JOURNAL_MS = 5 * 60 * 1000;
  function readJournal(){
    try {
      const j = JSON.parse(sessionStorage.getItem(JOURNAL_KEY) || "{}"), now = Date.now();
      for (const k in j) if (now - j[k].at > JOURNAL_MS) delete j[k];
      return j;
    } catch (e){ return {}; }
  }
  function remember(entries){
    const j = readJournal(), at = Date.now();
    for (const [key, value] of entries) j[key] = Object.assign({ at }, value);
    try { sessionStorage.setItem(JOURNAL_KEY, JSON.stringify(j)); } catch (e){}
  }
  const rememberItems = items => remember(items.map(i => [i.id, { owner: i.owner, equipped: i.equipped, locked: !!(i.state & STATE_LOCKED) }]));
  // Returns how many journal entries were newer than the profile.
  function applyJournal(){
    // The older of Bungie's two stamps: inventory ("secondary") data can
    // be older than the response that carries it.
    const stamps = [PROFILE.responseMintedTimestamp, PROFILE.secondaryComponentsMintedTimestamp].map(t => Date.parse(t || "")).filter(t => t > 0);
    const j = readJournal(), minted = stamps.length ? Math.min(...stamps) : 0;
    let applied = 0;
    for (const key in j){
      const e = j[key];
      if (e.at <= minted) continue;
      if (key.startsWith("pm:")){
        const pm = POSTMASTER.find(p => p.id === key.slice(3));
        if (pm){ POSTMASTER = POSTMASTER.filter(p => p !== pm); if (pm.gear) ITEMS.push(pm.gear); applied++; }
        continue;
      }
      const item = ITEMS.find(i => i.id === key);
      if (!item) continue;
      if (e.equipped) for (const i of ITEMS) if (i !== item && i.owner === e.owner && i.def.b === item.def.b) i.equipped = false;
      item.owner = e.owner; item.equipped = e.equipped;
      item.state = e.locked ? (item.state | STATE_LOCKED) : (item.state & ~STATE_LOCKED);
      applied++;
    }
    return applied;
  }
  // owners: the character/vault cards toggled on; none means everyone.
  const state = { owners: new Set(), type: null, flags: new Set(), q: "" };
  const showsOwner = id => !state.owners.size || state.owners.has(id);
  // Folded slots and opened vault lists, remembered per browser.
  const FOLD_KEY = "rallyflag_locker_folds";
  const folds = (() => { try { const f = JSON.parse(localStorage.getItem(FOLD_KEY) || "{}"); return { slots: new Set(f.slots || []), vaults: new Set(f.vaults || []), pmOpen: !!f.pmOpen }; } catch (e){ return { slots: new Set(), vaults: new Set(), pmOpen: false }; } })();
  function saveFolds(){ try { localStorage.setItem(FOLD_KEY, JSON.stringify({ slots: [...folds.slots], vaults: [...folds.vaults], pmOpen: folds.pmOpen })); } catch (e){} }

  // Favorite / Junk tags, per item, kept in this browser (no server to sync them).
  const TAG_KEY = "rallyflag_locker_tags";
  const TAGS = (() => { try { return JSON.parse(localStorage.getItem(TAG_KEY) || "{}"); } catch (e){ return {}; } })();
  function toggleTag(id, tag){
    TAGS[id] === tag ? delete TAGS[id] : (TAGS[id] = tag);
    try { localStorage.setItem(TAG_KEY, JSON.stringify(TAGS)); } catch (e){}
  }
  const VAULT_PREVIEW = 12; // two rows of the vault column; phones show 10 (CSS)
  // Which view is open: gear (default) or armor sets (#sets).
  function showView(name, focus){
    const sets = name === "sets";
    $("tab-gear").setAttribute("aria-selected", String(!sets));
    $("tab-sets").setAttribute("aria-selected", String(sets));
    $("tab-gear").tabIndex = sets ? -1 : 0;
    $("tab-sets").tabIndex = sets ? 0 : -1;
    $("view-gear").hidden = sets;
    $("view-sets").hidden = !sets;
    if (focus) $(sets ? "tab-sets" : "tab-gear").focus();
    history.replaceState(null, "", location.pathname + location.search + (sets ? "#sets" : ""));
  }

  // ---------------- status panels ----------------
  function showStatus(html){ $("locker-status").innerHTML = html ? '<div class="locker-panel panel-card">' + html + "</div>" : ""; }
  function showSignedOut(){
    showStatus(
      "<p>Sign in with Bungie.net to see your weapons and armor here, matched against our God Rolls and armor sets. Rally Flag only moves or equips something when you press a button, and nothing is stored anywhere but your browser.</p>" +
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
    // no-store: never a browser-cached copy of the profile after a move.
    const res = await RallyFlagAuth.authedFetch(path, { cache: "no-store" });
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
    PROFILE_PATH = "/Platform/Destiny2/" + primary.membershipType + "/Profile/" + primary.membershipId;
    return authedGet(PROFILE_PATH + "/?components=" + COMPONENTS);
  }

  // ---------------- model ----------------
  const data = (o, k) => (o && o[k] && o[k].data) || {};

  function buildModel(){
    const chars = data(PROFILE, "characters");
    const order = (PROFILE.profile && PROFILE.profile.data && PROFILE.profile.data.characterIds) || Object.keys(chars);
    OWNERS = order.filter(id => chars[id]).map(id => ({ id, cls: chars[id].classType, name: CLASS_NAMES[chars[id].classType] || "Guardian", light: chars[id].light, bg: chars[id].emblemBackgroundPath, emblem: chars[id].emblemPath }));
    const user = (PROFILE.profile && PROFILE.profile.data && PROFILE.profile.data.userInfo) || {};
    MEMBERSHIP_TYPE = user.membershipType || (chars[OWNERS[0] && OWNERS[0].id] || {}).membershipType || 0;

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

    ITEMS = []; POSTMASTER = [];
    // A weapon or armor piece as the Locker models it, or null.
    const gearItem = (it, owner, equipped) => {
      const def = DB.items[it.itemHash];
      if (!def || (def.t !== 2 && def.t !== 3) || !BUCKET_BY_HASH.has(def.b) || !it.itemInstanceId) return null;
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
      return item;
    };
    const add = (it, owner, equipped) => { const g = gearItem(it, owner, equipped); if (g) ITEMS.push(g); };
    for (const it of (data(PROFILE, "profileInventory").items || [])) add(it, "vault", false);
    const invs = data(PROFILE, "characterInventories"), eqs = data(PROFILE, "characterEquipment");
    for (const o of OWNERS){
      ((invs[o.id] && invs[o.id].items) || []).forEach((it, idx) => {
        // The postmaster lives in each character's inventory (its own bucket)
        // and holds anything: gear, engrams, materials.
        if (it.bucketHash === POSTMASTER_BUCKET){
          POSTMASTER.push({ id: it.itemInstanceId || ("pm-" + o.id + "-" + idx), instanceId: it.itemInstanceId || "0", hash: it.itemHash,
            owner: o.id, quantity: it.quantity || 1, gear: gearItem(it, o.id, false) });
        } else add(it, o.id, false);
      });
      for (const it of ((eqs[o.id] && eqs[o.id].items) || [])) add(it, o.id, true);
    }
    JOURNAL_APPLIED = applyJournal();
    computeSets();
  }
  let JOURNAL_APPLIED = 0;

  // Set progress per (set, class): distinct armor slots owned anywhere.
  function computeSets(){
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
    const cards = OWNERS.map(o =>
      '<button type="button" class="owner-card" data-owner="' + o.id + '" aria-pressed="' + state.owners.has(o.id) + '" style="background-image:url(\'' + esc(img(o.bg)) + '\')">' +
        '<span class="owner-name">' + esc(o.name) + '</span><span class="owner-meta">Power ' + esc(o.light) + " · " + counts(o.id) + " items</span></button>"
    ).concat([
      '<button type="button" class="owner-card vault" data-owner="vault" aria-pressed="' + state.owners.has("vault") + '"><span class="owner-name">Vault</span><span class="owner-meta">' + counts("vault") + " items</span></button>"
    ]);
    $("owner-grid").innerHTML = cards.join("");
    renderFarm();
  }

  // ---------------- farming mode ----------------
  // Per character, while this tab is open and visible: every 45 seconds,
  // re-sync, move extras to the vault so each weapon/armor slot keeps
  // 2 free spaces (junk first, then unlocked, lowest power first; never
  // equipped items), and pull weapons/armor from the postmaster when
  // there's room (then on to the vault), so new drops don't land in (and
  // overflow) the postmaster.
  // Kept in sessionStorage: closing the tab turns it off.
  const FARM_KEY = "rallyflag_locker_farming", FARM_EVERY = 45000, FARM_KEEP = INVENTORY_CAP - 2;
  const farming = (() => { try { return new Set(JSON.parse(sessionStorage.getItem(FARM_KEY) || "[]")); } catch (e){ return new Set(); } })();
  let farmTimer = 0, farmNote = "";
  function saveFarm(){ try { sessionStorage.setItem(FARM_KEY, JSON.stringify([...farming])); } catch (e){} }
  function renderFarm(){
    const row = $("farm-row");
    if (!row) return;
    row.innerHTML = '<span class="farm-label">Farming mode</span>' +
      OWNERS.map(o => '<button type="button" class="farm-btn" data-farm="' + o.id + '" aria-pressed="' + farming.has(o.id) + '">' + esc(o.name) + "</button>").join("") +
      '<span class="farm-note" id="farm-note" aria-live="polite">' + esc(farming.size ? farmNote || "Keeping 2 free spaces per slot; checks every 45s while this page is open." : "Keeps inventory and postmaster from filling up while you play.") + "</span>";
  }
  function setFarmTimer(){
    clearInterval(farmTimer);
    if (farming.size) farmTimer = setInterval(farmTick, FARM_EVERY);
  }
  // What farming would do for one character right now.
  function farmPlan(charId){
    const moves = [], pulls = [];
    for (const b of BUCKETS){
      const inv = ITEMS.filter(i => i.owner === charId && !i.equipped && i.def.b === b.hash);
      const extra = inv.length - FARM_KEEP;
      if (extra > 0){
        const order = (x, y) => ((TAGS[y.id] === "junk") - (TAGS[x.id] === "junk")) || ((x.state & STATE_LOCKED) - (y.state & STATE_LOCKED)) ||
          ((TAGS[x.id] === "favorite") - (TAGS[y.id] === "favorite")) || (x.power - y.power);
        moves.push(...inv.sort(order).slice(0, extra));
      }
    }
    // Postmaster weapons/armor: pulled and sent straight on to the vault, so
    // the 2 free spaces stay free. At most 10 a round keeps a round short.
    pulls.push(...POSTMASTER.filter(p => p.owner === charId && p.gear).slice(0, 10));
    return { moves, pulls };
  }
  async function farmTick(){
    if (!farming.size || document.hidden || isBusy()) return;
    await sync();
    for (const charId of farming){
      const { moves, pulls } = farmPlan(charId), who = ownerLabel(charId);
      if (!moves.length && !pulls.length) continue;
      const parts = [moves.length ? "moved " + moves.length + " to the vault" : "", pulls.length ? "sent " + pulls.length + " from the postmaster to the vault" : ""].filter(Boolean).join(", ");
      farmNote = "Last check: " + who + " " + parts + ".";
      await run("Farming on your " + who + ": making room", "Farming on your " + who + ": " + parts + ".", async () => {
        for (const i of moves) await moveTo(i, "vault");
        for (const p of pulls){ await pull(p); await moveTo(p.gear, "vault"); }
      });
    }
    renderFarm();
  }

  function setStatus(p){
    const n = p.slots.size;
    if (n >= 4) return p.equipped.size >= 4 ? "4-piece bonus active" : "4-piece bonus ready";
    if (n >= 2) return (p.equipped.size >= 2 ? "2-piece bonus active" : "2-piece bonus ready") + " · " + (4 - n) + " more for 4-piece";
    return (2 - n) + " more for the 2-piece bonus";
  }
  function setHref(p){ return p.set.ours ? "armor-set-bonuses.html?highlight=" + p.set.ours.slug : null; }

  function renderSets(){
    // Sets follow the selected characters' classes (all of them when no
    // character is selected).
    const chosen = OWNERS.filter(o => state.owners.has(o.id));
    const list = chosen.length ? SETS.filter(p => chosen.some(o => o.cls === p.cls)) : SETS;
    $("sets-count").textContent = list.length;
    $("sets-hint").textContent = list.length
      ? "Armor sets you own pieces of" + (chosen.length ? " for your " + chosen.map(o => o.name).join(" and ") : ", per class") + ". Pieces in your vault count too."
      : "You don't own any set pieces for " + (chosen.length > 1 ? "these characters" : "this character") + " yet.";
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
    if (!showsOwner(item.owner)) return false;
    const bucket = BUCKET_BY_HASH.get(item.def.b);
    if (state.type && bucket.kind !== state.type) return false;
    if (state.flags.has("exotic") && item.def.r !== 6) return false;
    if (state.flags.has("godroll") && !(item.roll && item.roll.full)) return false;
    if (state.flags.has("set") && !item.set) return false;
    if (state.flags.has("equipped") && !item.equipped) return false;
    if (state.flags.has("favorite") && TAGS[item.id] !== "favorite") return false;
    if (state.flags.has("junk") && TAGS[item.id] !== "junk") return false;
    if (state.q && !state.q.split(/\s+/).every(w => item.text.includes(w))) return false;
    return true;
  }

  function tileHtml(item){
    const d = item.def, dmg = DB.damage[item.damage];
    const label = [d.n, d.y, item.power ? "power " + item.power : "", ownerLabel(item.owner) + (item.equipped ? ", equipped" : ""),
      item.roll && item.roll.full ? "matches our God Roll" : "", item.set ? "part of a set" : "",
      TAGS[item.id] ? "tagged " + TAGS[item.id] : ""].filter(Boolean).join(", ");
    const tag = TAGS[item.id];
    return '<button type="button" class="item-tile ' + tierClass(d) + (item.equipped ? " equipped" : "") + (tag ? " tag-" + tag : "") + '" data-id="' + item.id + '" draggable="true" aria-label="' + esc(label) + '">' +
      '<img class="icon" src="' + esc(img(d.i)) + '" alt="" loading="lazy" width="64" height="64">' +
      (d.w ? '<img class="wm" src="' + esc(img(d.w)) + '" alt="" loading="lazy" width="64" height="64">' : "") +
      (item.set ? '<span class="tile-badge set" aria-hidden="true">' + item.setProgress.slots.size + "</span>" : "") +
      (item.roll && item.roll.full || tag ? '<span class="tile-badges" aria-hidden="true">' + (item.roll && item.roll.full ? '<span class="tile-badge">★</span>' : "") +
        (tag === "favorite" ? '<span class="tile-badge fav">♥</span>' : tag === "junk" ? '<span class="tile-badge junk">' + ICON_TRASH + "</span>" : "") + "</span>" : "") +
      '<span class="tile-power">' + (dmg && dmg.i && d.t === 3 ? '<img src="' + esc(img(dmg.i)) + '" alt="" width="12" height="12">' : "") + (item.power || "") + "</span>" +
    "</button>";
  }

  // Each slot is split by who holds the item: one group per character
  // (equipped first), then the vault. Wide screens lay the groups out as
  // aligned columns (like DIM); phones stack them under small labels.
  function renderItems(){
    const shown = ITEMS.filter(matches);
    const groups = OWNERS.map(o => o.id).concat("vault").filter(showsOwner);
    // Character columns share the width; the vault gets a double column.
    const colsTemplate = groups.map(g => g === "vault" ? "minmax(0, 2fr)" : "minmax(0, 1fr)").join(" ");
    const isJunk = i => TAGS[i.id] === "junk" ? 1 : 0;
    const byPower = (x, y) => (y.equipped - x.equipped) || (isJunk(x) - isJunk(y)) || (y.power - x.power) || x.def.n.localeCompare(y.def.n);
    // Long vault lists show a preview, but never while searching or
    // filtering, so a match can't end up hidden.
    const filtering = !!(state.q || state.type || state.flags.size);
    const html = BUCKETS.map(b => {
      const inSlot = shown.filter(i => i.def.b === b.hash);
      if (!inSlot.length) return "";
      const cols = groups.map(g => {
        const items = inSlot.filter(i => i.owner === g).sort(byPower);
        const long = g === "vault" && !filtering && items.length > VAULT_PREVIEW;
        const open = folds.vaults.has(b.hash);
        // Characters: the equipped item on its own row, then the inventory
        // with its count against Bungie's 9-per-slot limit. Vault: one grid.
        let body;
        if (g === "vault") body = items.length ? '<div class="item-grid" id="vg-' + b.hash + "-" + g + '">' + items.map(tileHtml).join("") + "</div>" : '<div class="group-empty">—</div>';
        else {
          const eq = items.filter(i => i.equipped), inv = items.filter(i => !i.equipped);
          const invTotal = ITEMS.filter(i => i.owner === g && !i.equipped && i.def.b === b.hash).length; // filters don't change how full it is
          body = (eq.length ? '<div class="equip-row"><div class="item-grid">' + eq.map(tileHtml).join("") + '</div><span class="equip-label">Equipped</span></div>' : "") +
            '<div class="inv-label' + (invTotal >= INVENTORY_CAP ? " full" : "") + '">Inventory ' + invTotal + "/" + INVENTORY_CAP + "</div>" +
            (inv.length ? '<div class="item-grid">' + inv.map(tileHtml).join("") + "</div>" : "");
        }
        return '<div class="owner-group' + (g === "vault" ? " vault" : "") + (items.length ? "" : " empty") + (long && !open ? " clipped" : "") + '" data-owner="' + g + '">' +
          '<div class="group-label">' + esc(ownerLabel(g)) + (g === "vault" ? " · " + items.length : "") + "</div>" + body +
          (long ? '<button type="button" class="vault-more" data-slot="' + b.hash + '" aria-expanded="' + open + '" aria-controls="vg-' + b.hash + "-" + g + '">' + (open ? "Show less" : "Show all " + items.length) + "</button>" : "") +
          "</div>";
      }).join("");
      const folded = folds.slots.has(b.hash);
      return '<section class="bucket' + (folded ? " folded" : "") + '" aria-labelledby="b-' + b.hash + '">' +
        '<h2 id="b-' + b.hash + '"><button type="button" class="bucket-toggle" data-slot="' + b.hash + '" aria-expanded="' + !folded + '" aria-controls="bb-' + b.hash + '">' +
          '<span class="chev" aria-hidden="true"></span>' + b.label + " <span>" + inSlot.length + "</span></button></h2>" +
        '<div class="owner-groups' + (groups.length > 1 ? " multi" : "") + '" id="bb-' + b.hash + '" style="--cols:' + colsTemplate + '"' + (folded ? " hidden" : "") + ">" + cols + "</div></section>";
    }).join("");
    $("buckets").innerHTML = postmasterHtml() + (html || '<p class="locker-empty">Nothing matches these filters.</p>');
    $("locker-count").textContent = "Showing " + shown.length + " of " + ITEMS.length + " items";
    $("fold-all").textContent = BUCKETS.every(b => folds.slots.has(b.hash)) ? "Expand all" : "Collapse all";
  }

  // Postmaster: a slim foldable bar (closed by default) with a count and
  // "Pull all" per character, red as it nears Bungie's 21-item limit
  // (after that, new items are lost). Open, it shows small tiles.
  function postmasterHtml(){
    const groups = OWNERS.filter(o => showsOwner(o.id)).map(o => ({ o, items: POSTMASTER.filter(p => p.owner === o.id) })).filter(g => g.items.length);
    if (!groups.length) return "";
    const open = folds.pmOpen, total = groups.reduce((n, g) => n + g.items.length, 0);
    const chips = groups.map(g => {
      const full = g.items.length >= POSTMASTER_CAP - 3;
      return '<span class="pm-chip' + (full ? " nearly-full" : "") + '"><span>' + esc(g.o.name) + " " + g.items.length + "/" + POSTMASTER_CAP + (full ? " · almost full" : "") + "</span>" +
        '<button type="button" class="pm-all" data-pm-all="' + g.o.id + '" aria-label="Pull all ' + g.items.length + " items to your " + esc(g.o.name) + '">Pull all</button></span>';
    }).join("");
    const tiles = groups.map(g => '<div class="pm-group"><div class="group-label">' + esc(g.o.name) + '</div><div class="item-grid pm-grid">' +
      g.items.map(p => {
        const d = p.gear ? p.gear.def : DB.items[p.hash] || { n: "Loading…" };
        return '<button type="button" class="item-tile pm-tile ' + (p.gear ? tierClass(d) : "") + '" data-pm="' + esc(p.id) + '" aria-label="' + esc(d.n + (p.quantity > 1 ? ", " + p.quantity + " of them" : "") + ", in your " + g.o.name + "'s postmaster") + '">' +
          (d.i ? '<img class="icon" src="' + esc(img(d.i)) + '" alt="" loading="lazy" width="44" height="44">' : "") +
          (p.quantity > 1 ? '<span class="tile-power">' + p.quantity + "</span>" : "") + "</button>";
      }).join("") + "</div></div>").join("");
    return '<section class="bucket postmaster' + (open ? "" : " folded") + '" aria-labelledby="pm-head"><div class="pm-bar">' +
      '<h2 id="pm-head"><button type="button" class="bucket-toggle" data-slot="pm" aria-expanded="' + open + '" aria-controls="pm-body"><span class="chev" aria-hidden="true"></span>Postmaster <span>' + total + "</span></button></h2>" +
      chips + '</div><div class="pm-body" id="pm-body"' + (open ? "" : " hidden") + ">" + tiles + "</div></section>";
  }

  function render(){ renderOwners(); renderSets(); renderItems(); }

  // ---------------- actions (stage 2) ----------------
  // One Bungie action at a time; the model is updated after each step
  // succeeds, so the page always shows where things really are.
  const ACTIONS = "/Platform/Destiny2/Actions/Items/";
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let queue = Promise.resolve();
  const enqueue = fn => { const p = queue.then(fn); queue = p.catch(() => {}); return p; };

  // Bungie's error statuses, in player words.
  const FRIENDLY = {
    DestinyNoRoomInDestination: "There's no room there: that character already has 9 items in this slot, or the vault is full.",
    DestinyItemUniqueEquipRestricted: "You can only equip one Exotic weapon and one Exotic armor piece at a time.",
    DestinyCannotPerformActionAtThisLocation: "Bungie only allows this while that character is in orbit or a social space.",
    DestinyCharacterNotInTower: "Bungie only allows this while that character is in orbit or a social space.",
    DestinyItemNotTransferrable: "Bungie doesn't allow this item to be moved.",
    DestinyItemNotFound: "Bungie couldn't find this item where we expected it. Try Refresh.",
    AccessNotPermittedByApplicationScope: "Bungie says your sign-in doesn't include permission to move gear. Bungie adds that permission when you sign in, so sign in again (once the site's app has \"Move or equip Destiny gear\" turned on)."
  };
  async function post(endpoint, body){
    if (DEMO){ await sleep(250); return; }
    const res = await RallyFlagAuth.authedFetch(ACTIONS + endpoint + "/", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ membershipType: MEMBERSHIP_TYPE }, body))
    });
    let data = {};
    try { data = await res.json(); } catch (e){}
    if (!res.ok || data.ErrorCode !== 1){
      const status = data.ErrorStatus || "";
      const scope = status === "AccessNotPermittedByApplicationScope" || /scope/i.test(status + " " + (data.Message || ""));
      const err = new Error(FRIENDLY[status] || (scope ? FRIENDLY.AccessNotPermittedByApplicationScope : (data.Message || "Bungie said no (HTTP " + res.status + ").")));
      // Bungie's own code, shown small under the message, for bug reports.
      err.code = (status || "HTTP " + res.status) + (data.ErrorCode ? " #" + data.ErrorCode : "");
      err.scope = scope;
      err.status = status;
      throw err;
    }
    if (data.ThrottleSeconds) await sleep(data.ThrottleSeconds * 1000);
  }
  const ownerOf = id => OWNERS.find(o => o.id === id);
  const classOk = (item, charId) => item.def.t !== 2 || item.def.c === 3 || item.def.c === (ownerOf(charId) || {}).cls;

  const transfer = (item, toVault, charId) => post("TransferItem", { itemReferenceHash: item.hash, stackSize: 1, transferToVault: toVault, itemId: item.id, characterId: charId });
  // Model + journal update for one finished transfer step.
  const landed = (item, owner) => { item.owner = owner; item.equipped = false; rememberItems([item]); };
  async function equipCall(item, charId){
    await post("EquipItem", { itemId: item.id, characterId: charId });
    for (const i of ITEMS) if (i.owner === charId && i.equipped && i.def.b === item.def.b) i.equipped = false;
    item.equipped = true;
    rememberItems(ITEMS.filter(i => i.owner === charId && i.def.b === item.def.b));
  }
  // An equipped item can't leave: equip the best other item in that slot
  // first (a Legendary when there is one, so the Exotic limit can't bite).
  async function swapOut(item){
    const rep = ITEMS.filter(i => i !== item && i.owner === item.owner && !i.equipped && i.def.b === item.def.b && classOk(i, item.owner))
      .sort((a, b) => (a.def.r === 6) - (b.def.r === 6) || b.power - a.power)[0];
    if (!rep) throw new Error("It's equipped and your " + ownerLabel(item.owner) + " has nothing else in that slot to swap in. Move something there first.");
    await equipCall(rep, item.owner);
  }
  async function moveTo(item, dest){
    if (item.owner === dest) return;
    if (item.equipped) await swapOut(item);
    if (item.owner !== "vault"){ await transfer(item, true, item.owner); landed(item, "vault"); }
    if (dest !== "vault"){ await transfer(item, false, dest); landed(item, dest); }
  }
  async function equipOn(item, charId){
    if (!classOk(item, charId)) throw new Error("Only a " + (CLASS_NAMES[item.def.c] || "matching class") + " can equip this.");
    await moveTo(item, charId);
    await equipCall(item, charId);
  }
  async function setLock(item, locked){
    await post("SetLockState", { state: locked, itemId: item.id, characterId: item.owner === "vault" ? OWNERS[0].id : item.owner });
    item.state = locked ? (item.state | STATE_LOCKED) : (item.state & ~STATE_LOCKED);
    rememberItems([item]);
  }
  async function pull(pm){
    await post("PullFromPostmaster", { itemReferenceHash: pm.hash, stackSize: pm.quantity, itemId: pm.instanceId, characterId: pm.owner });
    POSTMASTER = POSTMASTER.filter(p => p !== pm);
    if (pm.gear) ITEMS.push(pm.gear);
    remember([["pm:" + pm.id, { pulled: true }]].concat(pm.gear ? [[pm.gear.id, { owner: pm.gear.owner, equipped: false, locked: !!(pm.gear.state & STATE_LOCKED) }]] : []));
  }

  // "Not found" means the page's idea of where an item is went stale
  // (e.g. moved in game). Ask Bungie where it really is (one item), fix
  // the page, and let the action retry once. Returns true if it moved.
  async function relocate(item){
    if (DEMO || !PROFILE_PATH) return false;
    const r = await authedGet(PROFILE_PATH + "/Item/" + item.id + "/?components=300,307");
    const loc = r.item && r.item.data && r.item.data.location;
    const owner = r.characterId || (loc === 2 ? "vault" : null);
    if (!owner) return false;
    const equipped = !!(r.instance && r.instance.data && r.instance.data.isEquipped);
    const changed = owner !== item.owner || equipped !== item.equipped;
    item.owner = owner; item.equipped = equipped;
    rememberItems([item]);
    return changed;
  }

  // Runs an action with a visible status, then re-renders.
  function run(busy, done, fn, after, item){
    toast(busy + "…", "busy");
    document.body.classList.add("locker-busy");
    const attempt = async () => {
      try { await fn(); }
      catch (err){
        if (err.status === "DestinyItemNotFound" && item && await relocate(item).catch(() => false)){ await fn(); return; }
        throw err;
      }
    };
    return enqueue(attempt).then(() => {
      computeSets(); render();
      if (after) after(); // redraws the popup first, so the message isn't wiped
      toast(done, "ok");
    }, err => {
      computeSets(); render(); // partial progress (e.g. reached the vault) still shows
      if (after) after();
      toast(err.message || String(err), "error", err);
    }).finally(() => { document.body.classList.remove("locker-busy"); scheduleSync(); });
  }

  // After every action, re-read the profile from Bungie once things go
  // quiet (one sync for a burst of moves). The move journal keeps the
  // page right even if Bungie's copy is still a few seconds behind.
  const isBusy = () => document.body.classList.contains("locker-busy");
  // For taps while an action or sync is running: say so instead of ignoring them.
  function busyNotice(){
    if (!isBusy()) return false;
    if (!$("locker-toast").classList.contains("busy")) toast("One moment, syncing with Bungie…", "busy");
    return true;
  }
  let syncTimer = 0;
  function scheduleSync(){ clearTimeout(syncTimer); syncTimer = setTimeout(sync, 1500); }
  async function sync(){
    if (isBusy()) return scheduleSync();
    document.body.classList.add("locker-busy"); // actions wait for the fresh model
    try {
      PROFILE = await loadProfile(); buildModel(); render(); resolvePostmasterNames();
      const dlg = $("item-dialog");
      if (dlg.open && dlg.dataset.item) ITEMS.some(i => i.id === dlg.dataset.item) ? openItem(dlg.dataset.item) : dlg.close();
    } catch (e){ /* a missed sync is harmless: the journal keeps the page right */ }
    finally {
      document.body.classList.remove("locker-busy");
      const t = $("locker-toast");
      if (t.classList.contains("busy") && t.textContent.startsWith("One moment")) t.className = "locker-toast"; // our own notice: done
    }
  }
  // Redrawing the popup (innerHTML) must not destroy the message element
  // when it's hosted inside the popup: park it, redraw, put it back.
  function redrawDialog(dlg, html){
    const t = $("locker-toast"), inside = dlg.contains(t);
    if (inside) document.body.appendChild(t);
    dlg.innerHTML = html;
    if (inside) dlg.appendChild(t);
  }
  let toastTimer = 0;
  function toast(text, kind, err){
    const t = $("locker-toast");
    // A modal popup makes the rest of the page inert, so while it's open
    // the message lives inside it (its button must stay clickable).
    const dlg = $("item-dialog"), host = dlg.open ? dlg : document.body;
    if (t.parentNode !== host) host.appendChild(t);
    t.textContent = text;
    // Errors carry Bungie's code, and a permission error offers a fresh sign-in.
    if (err && err.code){ const c = document.createElement("small"); c.className = "toast-code"; c.textContent = "Bungie: " + err.code; t.appendChild(c); }
    if (err && err.scope && !DEMO){
      const b = document.createElement("button");
      b.type = "button"; b.className = "toast-action"; b.textContent = "Sign in again";
      b.addEventListener("click", () => { RallyFlagAuth.signOut(); RallyFlagAuth.signIn(location.pathname); });
      t.appendChild(b);
    }
    t.className = "locker-toast show " + kind + (t.querySelector("button") ? " has-action" : "");
    clearTimeout(toastTimer);
    if (kind !== "busy") toastTimer = setTimeout(() => { t.className = "locker-toast"; }, kind === "error" ? (err && err.scope ? 20000 : 9000) : 3500);
  }

  // Postmaster names for things outside the trimmed database (engrams,
  // consumables): looked up one by one, only when something is waiting.
  async function resolvePostmasterNames(){
    const missing = [...new Set(POSTMASTER.filter(p => !DB.items[p.hash]).map(p => p.hash))];
    await Promise.all(missing.map(async h => {
      try {
        const res = await fetch(BUNGIE + "/Platform/Destiny2/Manifest/DestinyInventoryItemDefinition/" + h + "/", { headers: { "X-API-Key": window.RallyFlagAPI.BUNGIE_API_KEY } });
        const d = (await res.json()).Response;
        if (d && d.displayProperties) DB.items[h] = { n: d.displayProperties.name || "Unknown item", i: d.displayProperties.icon, y: d.itemTypeDisplayName || "" };
      } catch (e){}
    }));
    if (missing.length) renderItems();
  }

  // ---------------- item details ----------------
  // Same reading order as DIM's popup (header, stats, frame, perk columns,
  // mods) so it feels familiar, in Rally Flag's own look (styles in
  // locker.html). Tapping a perk or mod shows its name and description.
  function showPlug(hash){
    const p = DB.items[hash];
    return p && p.n && !/^(empty|locked) /i.test(p.n) && !HIDE_PLUG.test(p.y || "") && SHOW_PLUG.test(p.y || "");
  }
  const isIntrinsic = p => /intrinsic|frame|archetype/i.test(p.y || "");
  const isMod = p => /mod$/i.test(p.y || "");

  // DIM's stat order, with its short labels.
  const STAT_ORDER = ["Rounds Per Minute", "Charge Time", "Draw Time", "Impact", "Blast Radius", "Velocity", "Range", "Stability",
    "Handling", "Reload Speed", "Aim Assistance", "Airborne Effectiveness", "Zoom", "Ammo Generation", "Recoil Direction", "Magazine",
    "Weapons", "Health", "Class", "Grenade", "Super", "Melee"];
  const STAT_SHORT = { "Rounds Per Minute": "RPM", "Aim Assistance": "Aim Assist", "Airborne Effectiveness": "Airborne", "Ammo Generation": "Ammo Gen" };
  const NO_BAR = /per minute|magazine|charge time|draw time|recoil direction/i;

  // Recoil Direction compass: the same formula as vendors.html /
  // api-debug.html (verified against DIM's own drawings), drawn in the
  // theme colours. A wider wedge means more side-to-side kick.
  const RECOIL_LEAN_RATIO = [-8 / 9, -0.8453835700401364, -0.7191262172221752, -0.5224757798155321, -0.2746817727777316, 0,
    0.2746817727777319, 0.5224757798155313, 0.7191262172221743, 0.8453835700401364];
  function recoilCompassHtml(value){
    const half = 0.9 * (100 - value);
    const center = value >= 100 ? 0 : (Math.floor(value / 10) % 2 === 0 ? -1 : 1) * RECOIL_LEAN_RATIO[value % 10] * half;
    const pt = deg => { const r = deg * Math.PI / 180; return [(1 + Math.sin(r)).toFixed(4), (1 - Math.cos(r)).toFixed(4)]; };
    let inner;
    if (half < 1){
      const [x, y] = pt(center), [ox, oy] = pt(center + 180);
      inner = '<line class="spread" x1="' + ox + '" y1="' + oy + '" x2="' + x + '" y2="' + y + '" stroke-width="0.1"></line>';
    } else {
      const [x1, y1] = pt(center + half), [x2, y2] = pt(center - half);
      inner = '<path class="spread" d="M1,1 L' + x1 + "," + y1 + " A1,1 0 0,0 " + x2 + "," + y2 + ' Z"></path>';
    }
    return '<svg class="recoil-compass" viewBox="0 0 2 1" role="img" aria-label="Recoil direction ' + value + '"><circle class="dial" r="1" cx="1" cy="1"></circle>' + inner + "</svg>";
  }

  function dotHtml(hash, cls, ours){
    const p = DB.items[hash];
    return '<button type="button" class="perk-dot ' + cls + '" data-plug="' + hash + '" aria-pressed="false" title="' + esc(p.n) + '" aria-label="' +
      esc(p.n + (cls === "sel" ? " (on this copy)" : " (can swap to)") + (ours ? ", in our God Roll" : "")) + '">' +
      (p.i ? '<img src="' + esc(img(p.i)) + '" alt="" width="44" height="44">' : "") + (ours ? '<span class="ours" aria-hidden="true"></span>' : "") + "</button>";
  }

  function openItem(id){
    const item = ITEMS.find(i => i.id === id);
    if (!item) return;
    const d = item.def, dmg = DB.damage[item.damage];
    const ourPerks = new Set(item.roll ? item.roll.weapon.perkHashes : []);
    const eyebrow = (d.r === 6 ? "Exotic" : "Legendary") + " · " + (d.y || "");
    const sub = (d.t === 3 && dmg ? "<span>" + (dmg.i ? '<img src="' + esc(img(dmg.i)) + '" alt="">' : "") + esc(dmg.n) + "</span>" : "") +
      "<span>" + esc(ownerLabel(item.owner)) + (item.equipped ? " · equipped" : "") + "</span>" +
      (item.state & STATE_MASTERWORK ? '<span class="flag">Masterworked</span>' : "") +
      (item.state & STATE_LOCKED ? '<span class="flag">Locked</span>' : "");

    // Rally Flag's own notes first: our God Roll and armor set progress.
    let notes = "";
    if (item.roll){
      const r = item.roll;
      notes += '<div class="callout godroll"><span><strong>' + (r.full ? "Our God Roll" : r.matched + " of " + r.total + " God Roll perks") + "</strong>" +
        ' <span class="muted">(gold diamonds below)</span></span><a href="god-rolls.html#weapon-' + esc(r.weapon.slug) + '">See our roll →</a></div>';
    }
    if (item.set){
      const p = item.setProgress, ours = item.set.ours;
      notes += '<div class="callout"><span><strong>' + esc(ours ? ours.name : item.set.name) + "</strong> " + p.slots.size + '/5 · <span class="muted">' + esc(setStatus(p)) + "</span></span>" +
        (ours ? '<a href="' + setHref(p) + '">Set bonuses →</a>' : "") + "</div>";
    }

    const statRows = Object.values(item.stats)
      .map(st => ({ name: DB.stats[st.statHash], value: st.value }))
      .filter(st => st.name && st.value != null && st.name !== "Power")
      .sort((a, b) => {
        const ia = STAT_ORDER.indexOf(a.name), ib = STAT_ORDER.indexOf(b.name);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name);
      });
    const barMax = d.t === 2 ? 42 : 100;
    const stats = statRows.map(st => '<div class="stat-row"><span>' + esc(STAT_SHORT[st.name] || st.name) + "</span><b>" + st.value + "</b>" +
      (st.name === "Recoil Direction" ? recoilCompassHtml(st.value)
        : NO_BAR.test(st.name) ? "<i></i>" : '<span class="stat-bar"><i style="width:' + Math.max(0, Math.min(100, st.value / barMax * 100)) + '%"></i></span>') + "</div>").join("");

    // Sort sockets into the frame line, perk columns and mod squares.
    let intrinsic = "";
    const cols = [], mods = [];
    item.plugs.forEach((h, idx) => {
      if (!showPlug(h)) return;
      const p = DB.items[h];
      if (isIntrinsic(p) && !intrinsic){
        const rpm = statRows.find(st => st.name === "Rounds Per Minute"), impact = statRows.find(st => st.name === "Impact");
        const detail = rpm && impact ? rpm.value + " rpm / " + impact.value + " impact" : (p.y || "");
        intrinsic = '<div class="intrinsic">' + (p.i ? '<img src="' + esc(img(p.i)) + '" alt="" width="42" height="42">' : "") + "<div><b>" + esc(p.n) + "</b><small>" + esc(detail) + "</small></div></div>";
      } else if (isMod(p)){
        // Mod slots list every mod you own as an option; show only the one in it.
        mods.push('<button type="button" class="mod-sq" data-plug="' + h + '" aria-pressed="false" title="' + esc(p.n) + '" aria-label="' + esc(p.n) + '">' +
          (p.i ? '<img src="' + esc(img(p.i)) + '" alt="" width="44" height="44">' : "") + "</button>");
      } else {
        const alts = (item.alts[idx] || []).map(a => a.plugItemHash).filter(a => a !== h && showPlug(a));
        cols.push('<div class="perk-col">' + dotHtml(h, "sel", ourPerks.has(h)) + alts.map(a => dotHtml(a, "alt", ourPerks.has(a))).join("") + "</div>");
      }
    });

    const label = t => '<div class="dlg-label">' + t + "</div>";
    // Equip on a character that can use it; move to any character or the vault.
    const ownerBtn = (o, act, current) => '<button type="button" class="act-btn' + (current ? " current" : "") + '" data-act="' + act + '" data-to="' + o.id + '"' + (current ? ' aria-disabled="true"' : "") + ">" +
      (o.emblem ? '<img src="' + esc(img(o.emblem)) + '" alt="" width="20" height="20">' : "") + esc(o.name) + "</button>";
    const actions = '<div class="dlg-actions">' +
      '<div class="act-row"><span class="act-label">Equip</span>' + OWNERS.filter(o => classOk(item, o.id)).map(o => ownerBtn(o, "equip", item.owner === o.id && item.equipped)).join("") + "</div>" +
      '<div class="act-row"><span class="act-label">Move</span>' + OWNERS.concat([{ id: "vault", name: "Vault" }]).map(o => ownerBtn(o, "move", item.owner === o.id)).join("") +
        // Icon shows what a tap does: a closed lock locks it, an open lock unlocks it.
        '<button type="button" class="act-btn lock icon-only" data-act="lock" aria-label="' + (item.state & STATE_LOCKED ? "Unlock (it's locked)" : "Lock") + '" title="' + (item.state & STATE_LOCKED ? "Unlock" : "Lock") + '">' + (item.state & STATE_LOCKED ? ICON_UNLOCK : ICON_LOCK) + "</button></div>" +
      '<div class="act-row"><span class="act-label">Tag</span>' +
        '<button type="button" class="act-btn tag" data-tag="favorite" aria-pressed="' + (TAGS[item.id] === "favorite") + '">♥ Favorite</button>' +
        '<button type="button" class="act-btn tag" data-tag="junk" aria-pressed="' + (TAGS[item.id] === "junk") + '">' + ICON_TRASH + "Junk</button></div></div>";
    const blocks = [
      notes ? '<div class="rf-notes">' + notes + "</div>" : "",
      stats ? label("Stats") + stats : "",
      intrinsic ? label(d.t === 3 ? "Frame" : "Archetype") + intrinsic : "",
      cols.length ? label("Perks") + '<div class="perk-cols" role="group" aria-label="Perks">' + cols.join("") + "</div>" : "",
      mods.length ? label("Mods") + '<div class="mod-row" role="group" aria-label="Mods">' + mods.join("") + "</div>" : ""
    ].filter(Boolean).map(b => '<div class="dlg-block">' + b + "</div>");
    const hasPlugs = cols.length || mods.length;

    const dlg = $("item-dialog");
    dlg.dataset.item = item.id;
    redrawDialog(dlg,
      '<div class="dlg-head ' + tierClass(d) + '"><div class="dlg-icon"><img src="' + esc(img(d.i)) + '" alt="">' + (d.w ? '<img src="' + esc(img(d.w)) + '" alt="">' : "") + "</div>" +
        '<div class="dlg-title"><div class="dlg-eyebrow">' + esc(eyebrow) + '</div><h2 class="dlg-name" id="dlg-name">' + esc(d.n) + '</h2><div class="dlg-sub">' + sub + "</div></div>" +
        (item.power ? '<div class="dlg-power"><small>Power</small><b>' + item.power + "</b></div>" : "") +
        '<button type="button" class="dlg-close" aria-label="Close">×</button></div>' +
      actions +
      '<div class="dlg-body">' + blocks.join("") +
        (hasPlugs ? '<div class="plug-info" id="plug-info" aria-live="polite">Tap a perk or mod to see what it does.</div>' : "") + "</div>");
    dlg.querySelector(".dlg-close").addEventListener("click", () => dlg.close());
    dlg.querySelectorAll("[data-plug]").forEach(b => b.addEventListener("click", () => {
      dlg.querySelectorAll("[data-plug]").forEach(o => o.setAttribute("aria-pressed", String(o === b)));
      const p = DB.items[b.dataset.plug];
      $("plug-info").innerHTML = "<b>" + esc(p.n) + "</b>" + (p.y ? " · " + esc(p.y) : "") + (ourPerks.has(+b.dataset.plug) ? " · in our God Roll" : "") +
        (p.x ? "<br>" + esc(p.x) : "");
    }));
    // Tags are local (no Bungie call), so they apply instantly.
    dlg.querySelectorAll("[data-tag]").forEach(b => b.addEventListener("click", () => {
      toggleTag(item.id, b.dataset.tag);
      renderItems();
      openItem(item.id);
      const again = dlg.querySelector('[data-tag="' + b.dataset.tag + '"]');
      if (again) again.focus();
    }));
    dlg.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
      if (b.getAttribute("aria-disabled") === "true" || busyNotice()) return;
      const to = b.dataset.to, where = ownerLabel(to), name = d.n;
      const reopen = () => { if (dlg.open && dlg.dataset.item === item.id) openItem(item.id); };
      if (b.dataset.act === "equip") run("Equipping " + name + " on your " + where, "Equipped " + name + " on your " + where + ".", () => equipOn(item, to), reopen, item);
      else if (b.dataset.act === "move") run("Moving " + name + " to " + (to === "vault" ? "the vault" : "your " + where), "Moved " + name + " to " + (to === "vault" ? "the vault" : "your " + where) + ".", () => moveTo(item, to), reopen, item);
      else {
        const lock = !(item.state & STATE_LOCKED);
        run((lock ? "Locking " : "Unlocking ") + name, (lock ? "Locked " : "Unlocked ") + name + ".", () => setLock(item, lock), reopen, item);
      }
    }));
    if (!dlg.open) dlg.showModal();
  }

  // Postmaster items: a short popup with what it is and a Pull button.
  function openPostmaster(id){
    const p = POSTMASTER.find(x => x.id === id);
    if (!p) return;
    const d = p.gear ? p.gear.def : DB.items[p.hash] || { n: "Unknown item" }, o = ownerOf(p.owner);
    const dlg = $("item-dialog");
    dlg.dataset.item = "";
    redrawDialog(dlg,
      '<div class="dlg-head ' + (p.gear ? tierClass(d) : "") + '"><div class="dlg-icon">' + (d.i ? '<img src="' + esc(img(d.i)) + '" alt="">' : "") + "</div>" +
        '<div class="dlg-title"><div class="dlg-eyebrow">Postmaster · ' + esc(o.name) + '</div><h2 class="dlg-name" id="dlg-name">' + esc(d.n) + '</h2><div class="dlg-sub"><span>' + esc(d.y || "") + (p.quantity > 1 ? " · ×" + p.quantity : "") + "</span></div></div>" +
        '<button type="button" class="dlg-close" aria-label="Close">×</button></div>' +
      '<div class="dlg-actions"><div class="act-row"><button type="button" class="act-btn" id="pm-pull">' + (o.emblem ? '<img src="' + esc(img(o.emblem)) + '" alt="" width="20" height="20">' : "") + "Pull to " + esc(o.name) + "</button></div></div>");
    dlg.querySelector(".dlg-close").addEventListener("click", () => dlg.close());
    $("pm-pull").addEventListener("click", () => {
      if (busyNotice()) return;
      run("Pulling " + d.n + " to your " + o.name, "Pulled " + d.n + " to your " + o.name + ".", () => pull(p), () => dlg.close());
    });
    if (!dlg.open) dlg.showModal();
  }

  // ---------------- wiring ----------------
  function wire(){
    $("owner-grid").addEventListener("click", e => {
      const b = e.target.closest("[data-owner]");
      if (!b) return;
      // Toggle: tap to show only this (plus any others on), tap again to undo.
      const id = b.dataset.owner;
      state.owners.has(id) ? state.owners.delete(id) : state.owners.add(id);
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
      const pmTile = e.target.closest("[data-pm]");
      if (pmTile) return openPostmaster(pmTile.dataset.pm);
      const pmAll = e.target.closest("[data-pm-all]");
      if (pmAll){
        if (busyNotice()) return;
        const charId = pmAll.dataset.pmAll, list = POSTMASTER.filter(p => p.owner === charId), who = ownerLabel(charId);
        return run("Pulling " + list.length + " items to your " + who, "Pulled everything to your " + who + ".", async () => { for (const p of list) await pull(p); });
      }
      const tile = e.target.closest(".item-tile");
      if (tile) return openItem(tile.dataset.id);
      const slot = e.target.closest(".bucket-toggle");
      const more = e.target.closest(".vault-more");
      const btn = slot || more;
      if (!btn) return;
      if (slot && slot.dataset.slot === "pm"){ folds.pmOpen = !folds.pmOpen; saveFolds(); renderItems(); return $("pm-head").querySelector("button").focus(); }
      const set = slot ? folds.slots : folds.vaults, h = +btn.dataset.slot;
      set.has(h) ? set.delete(h) : set.add(h);
      saveFolds();
      renderItems();
      const again = document.querySelector((slot ? ".bucket-toggle" : ".vault-more") + '[data-slot="' + h + '"]');
      if (again) again.focus(); // keep keyboard focus on the toggle
    });
    // Drag a tile onto another character's or the vault's column (pointer
    // devices; the popup's Move buttons do the same everywhere).
    let dragId = null;
    $("buckets").addEventListener("dragstart", e => {
      const tile = e.target.closest(".item-tile[data-id]");
      if (!tile){ e.preventDefault(); return; }
      dragId = tile.dataset.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragId);
    });
    $("buckets").addEventListener("dragover", e => {
      const g = e.target.closest(".owner-group[data-owner]");
      const item = dragId && ITEMS.find(i => i.id === dragId);
      if (!g || !item || g.dataset.owner === item.owner || !g.closest("#bb-" + item.def.b)) return;
      e.preventDefault();
      document.querySelectorAll(".drop-target").forEach(x => x !== g && x.classList.remove("drop-target"));
      g.classList.add("drop-target");
    });
    $("buckets").addEventListener("dragleave", e => { const g = e.target.closest(".owner-group"); if (g && !g.contains(e.relatedTarget)) g.classList.remove("drop-target"); });
    $("buckets").addEventListener("dragend", () => { dragId = null; document.querySelectorAll(".drop-target").forEach(x => x.classList.remove("drop-target")); });
    $("buckets").addEventListener("drop", e => {
      const g = e.target.closest(".owner-group[data-owner]");
      const item = dragId && ITEMS.find(i => i.id === dragId);
      if (!g || !item) return;
      e.preventDefault();
      const to = g.dataset.owner, where = to === "vault" ? "the vault" : "your " + ownerLabel(to);
      if (!busyNotice()) run("Moving " + item.def.n + " to " + where, "Moved " + item.def.n + " to " + where + ".", () => moveTo(item, to), null, item);
    });
    $("farm-row").addEventListener("click", e => {
      const b = e.target.closest("[data-farm]");
      if (!b) return;
      const id = b.dataset.farm;
      farming.has(id) ? farming.delete(id) : farming.add(id);
      farmNote = "";
      saveFarm(); setFarmTimer(); renderFarm();
      $("farm-row").querySelector('[data-farm="' + id + '"]').focus();
      if (farming.has(id)) farmTick(); // first check right away
    });
    // Coming back to the tab: catch up once.
    document.addEventListener("visibilitychange", () => { if (!document.hidden && farming.size) farmTick(); });
    $("locker-refresh").addEventListener("click", async () => {
      if (busyNotice()) return;
      toast("Refreshing from Bungie…", "busy");
      try {
        PROFILE = await loadProfile(); buildModel(); render(); resolvePostmasterNames();
        toast(JOURNAL_APPLIED ? "Up to date. Bungie's copy is a few seconds behind, so your latest moves are kept." : "Up to date.", "ok");
      }
      catch (err){ toast("Couldn't refresh: " + (err.message || err), "error"); }
    });
    $("fold-all").addEventListener("click", () => {
      const all = BUCKETS.every(b => folds.slots.has(b.hash));
      BUCKETS.forEach(b => all ? folds.slots.delete(b.hash) : folds.slots.add(b.hash));
      saveFolds();
      renderItems();
    });
    document.querySelector(".view-tabs").addEventListener("click", e => {
      const t = e.target.closest(".view-tab");
      if (t) showView(t.id === "tab-sets" ? "sets" : "gear");
    });
    // Arrow keys move between the two tabs (WAI-ARIA tabs pattern).
    document.querySelector(".view-tabs").addEventListener("keydown", e => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      const toSets = e.key === "End" || ((e.key === "ArrowRight" || e.key === "ArrowLeft") && $("tab-gear").getAttribute("aria-selected") === "true");
      showView(toSets ? "sets" : "gear", true);
    });
    // Click on the backdrop closes the dialog.
    $("item-dialog").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
    $("item-dialog").addEventListener("close", () => document.body.appendChild($("locker-toast")));
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
      resolvePostmasterNames();
      setFarmTimer();
      if (location.hash === "#sets") showView("sets");
      window.addEventListener("hashchange", () => showView(location.hash === "#sets" ? "sets" : "gear"));
    } catch (e){
      showError(e.message || String(e));
    }
  }
  init();
})();
