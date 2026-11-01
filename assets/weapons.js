/* ============================================================
   Weapon lookup (weapons.html): every Legendary and Exotic weapon in
   Bungie's item database, searchable, and for each one every perk it
   can roll, its base stats (hidden ones too), its frame, where it
   drops and our God Roll.

   The weapon list comes from the Locker's item database
   (assets/locker-worker.js: Bungie's DestinyInventoryItemLiteDefinition,
   trimmed, cached in IndexedDB per game version and shared with the
   Locker), so new weapons show up on their own after a game update.
   A weapon's details are a few small requests to Bungie when it's
   opened: its full definition (per version), its perk plug sets and
   its collectible (the "Source:" line).

   Several items can share a name (reissues in later seasons, crafted
   and Adept copies); they're one weapon here with a version picker,
   newest first (Bungie's definition index).

   Signed in, perks that are on (or a free swap on) one of your copies
   are marked: one Profile call (102, 201, 205, 305, 310).
   URLs: weapons.html?w=<item hash> opens a version; ?q=<text> searches.
   ============================================================ */
(function(){
  const BUNGIE = "https://www.bungie.net";
  const API_KEY = window.RallyFlagAPI.BUNGIE_API_KEY;
  const WEAPON_BUCKETS = new Set([1498876634, 2465295065, 953998645]);
  const AMMO = { 1: "Primary", 2: "Special", 3: "Heavy" };
  const RARITY = { 6: "Exotic", 5: "Legendary" };
  const PAGE = 48;
  // The same plug filters and stat order as the Locker's item popup.
  const SHOW_PLUG = /trait|intrinsic|magazine|barrel|battery|sight|scope|haft|stock|bowstring|arrow|blade|guard|grip|frame|archetype/i;
  const HIDE_PLUG = /shader|ornament|memento|flair|tracker|restore|deprecated|transmat|emote|mod$/i;
  const MW_PLUG = /^(?:tier \d+|masterworked):\s*(.+)$/i;
  const STAT_ORDER = ["Rounds Per Minute", "Charge Time", "Draw Time", "Impact", "Blast Radius", "Velocity", "Range", "Stability",
    "Handling", "Reload Speed", "Aim Assistance", "Airborne Effectiveness", "Zoom", "Ammo Generation", "Recoil Direction", "Magazine"];
  const STAT_SHORT = { "Rounds Per Minute": "RPM", "Aim Assistance": "Aim Assist", "Airborne Effectiveness": "Airborne", "Ammo Generation": "Ammo Gen" };
  // Stats the game doesn't show on the weapon (the reason people look them up).
  const HIDDEN = /aim assistance|zoom|recoil direction|airborne|ammo generation/i;
  const NO_BAR = /per minute|magazine|charge time|draw time|recoil direction/i;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const img = p => p ? (p.charAt(0) === "/" ? BUNGIE + p : p) : "";
  const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/["“”'’]/g, "");

  let DB = null, WEAPONS = [], BY_HASH = new Map();
  const view = { q: "", type: "", element: "", ammo: "", rarity: "", shown: PAGE };

  // ---------------- item database (shared with the Locker) ----------------
  function loadDb(){
    return new Promise((resolve, reject) => {
      const w = new Worker("assets/locker-worker.js");
      w.onmessage = e => {
        const m = e.data;
        if (m.type === "progress") setStatus(m.step);
        else if (m.type === "done"){ w.terminate(); resolve(m.db); }
        else { w.terminate(); reject(new Error(m.message)); }
      };
      w.onerror = e => { w.terminate(); reject(new Error(e.message || "The item database didn't load")); };
      w.postMessage({ apiKey: API_KEY });
    });
  }
  function setStatus(text, error){
    const el = $("wl-status");
    el.hidden = !text;
    el.classList.toggle("error", !!error);
    el.innerHTML = text ? esc(text) + (error ? ' <button type="button" class="wl-btn" id="wl-retry">Try again</button>' : "") : "";
    if (error) $("wl-retry").addEventListener("click", start);
  }

  // One entry per weapon name; its hashes are the versions.
  function buildIndex(){
    const byName = new Map();
    for (const h in DB.items){
      const d = DB.items[h];
      if (d.t !== 3 || !RARITY[d.r] || !WEAPON_BUCKETS.has(d.b) || !d.n || !d.i) continue;
      let w = byName.get(d.n);
      if (!w){ w = { name: d.n, key: fold(d.n), hashes: [], d }; byName.set(d.n, w); }
      w.hashes.push(+h);
      // Represent the weapon by a copy you can get (one with a collectible).
      if (d.l && !w.d.l) w.d = d;
    }
    WEAPONS = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const w of WEAPONS){
      // Copies of one version (same season watermark) collapse into the collectible one.
      const seen = new Map();
      for (const h of w.hashes){ const d = DB.items[h], k = d.w || h; if (!seen.has(k) || (d.l && !DB.items[seen.get(k)].l)) seen.set(k, h); }
      w.versions = [...seen.values()];
      for (const h of w.hashes) BY_HASH.set(h, w);
    }
  }

  // ---------------- search view ----------------
  function filtersHtml(){
    const types = [...new Set(WEAPONS.map(w => w.d.y).filter(Boolean))].sort();
    const elements = [...new Set(WEAPONS.map(w => w.d.d).filter(d => DB.damage[d]))].sort((a, b) => DB.damage[a].n.localeCompare(DB.damage[b].n));
    const sel = (id, label, all, opts, cur) => '<label class="wl-filter"><span>' + label + '</span><select id="' + id + '" class="wl-select"><option value="">' + all + "</option>" +
      opts.map(([v, t]) => '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? " selected" : "") + ">" + esc(t) + "</option>").join("") + "</select></label>";
    return sel("wl-type", "Type", "All types", types.map(t => [t, t]), view.type) +
      sel("wl-element", "Element", "All elements", elements.map(d => [d, DB.damage[d].n]), view.element) +
      sel("wl-ammo", "Ammo", "All ammo", Object.entries(AMMO), view.ammo) +
      sel("wl-rarity", "Rarity", "Exotic and Legendary", [["6", "Exotic"], ["5", "Legendary"]], view.rarity);
  }
  function matches(){
    const q = fold(view.q.trim());
    let list = WEAPONS.filter(w => (!view.type || w.d.y === view.type) && (!view.element || String(w.d.d) === view.element) &&
      (!view.ammo || String(w.d.a) === view.ammo) && (!view.rarity || String(w.d.r) === view.rarity) && (!q || w.key.includes(q)));
    // Names that start with the search first.
    if (q) list = list.filter(w => w.key.startsWith(q)).concat(list.filter(w => !w.key.startsWith(q)));
    return list;
  }
  function tileHtml(w){
    const d = w.d, el = DB.damage[d.d];
    return '<li><a class="wl-tile' + (d.r === 6 ? " exotic" : "") + '" href="?w=' + w.versions[0] + '" data-w="' + esc(w.name) + '">' +
      '<span class="wl-icon"><img src="' + esc(img(d.i)) + '" alt="" width="48" height="48" loading="lazy">' + (d.w ? '<img class="wm" src="' + esc(img(d.w)) + '" alt="" width="48" height="48" loading="lazy">' : "") + "</span>" +
      '<span class="wl-tile-text"><b>' + esc(w.name) + "</b><small>" + (el && el.i ? '<img src="' + esc(img(el.i)) + '" alt="" width="14" height="14">' : "") + esc((d.r === 6 ? "Exotic " : "") + (d.y || "Weapon")) +
      (w.versions.length > 1 ? " · " + w.versions.length + " versions" : "") + "</small></span></a></li>";
  }
  function renderResults(){
    const list = matches(), shown = list.slice(0, view.shown);
    $("wl-count").textContent = list.length.toLocaleString() + (list.length === 1 ? " weapon" : " weapons");
    $("wl-results").innerHTML = shown.map(tileHtml).join("") || '<li class="wl-none">No weapons match. Check the spelling or clear a filter.</li>';
    $("wl-more").hidden = list.length <= view.shown;
    $("wl-more").textContent = "Show more (" + (list.length - view.shown).toLocaleString() + " left)";
  }
  function renderSearch(){
    $("wl-filters").innerHTML = filtersHtml();
    for (const [id, key] of [["wl-type", "type"], ["wl-element", "element"], ["wl-ammo", "ammo"], ["wl-rarity", "rarity"]])
      $(id).addEventListener("change", e => { view[key] = e.target.value; view.shown = PAGE; renderResults(); history.replaceState(history.state, "", listUrl()); });
    renderResults();
  }

  // ---------------- a weapon ----------------
  const DEFS = new Map();
  function manifestGet(kind, h){
    const key = kind + ":" + h;
    if (!DEFS.has(key)) DEFS.set(key, fetch(BUNGIE + "/Platform/Destiny2/Manifest/" + kind + "/" + h + "/", { headers: { "X-API-Key": API_KEY } })
      .then(r => r.json()).then(j => { if (!j.Response) throw new Error(j.Message || "Bungie didn't send it"); return j.Response; })
      .catch(e => { DEFS.delete(key); throw e; }));
    return DEFS.get(key);
  }
  const showPlug = h => { const p = DB.items[h]; return p && p.n && !/^(empty|locked|default) /i.test(p.n) && !HIDE_PLUG.test(p.y || "") && SHOW_PLUG.test(p.y || ""); };
  const isIntrinsic = h => /intrinsic|frame|archetype/i.test((DB.items[h] || {}).y || "");
  const colLabel = h => { const y = (DB.items[h] || {}).y || "Perk"; return /trait/i.test(y) && !/origin/i.test(y) ? "Trait" : y.replace(/^Enhanced /, ""); };

  // Frame, perk columns and masterwork choices for one version.
  async function rollOf(def){
    const entries = (def.sockets && def.sockets.socketEntries) || [];
    const sets = await Promise.all(entries.map(e => {
      const h = e.randomizedPlugSetHash || e.reusablePlugSetHash;
      if (h) return manifestGet("DestinyPlugSetDefinition", h).then(s => s.reusablePlugItems || []).catch(() => []);
      return (e.reusablePlugItems || []).length ? e.reusablePlugItems : e.singleInitialItemHash ? [{ plugItemHash: e.singleInitialItemHash }] : [];
    }));
    let frame = null;
    const cols = [], mw = new Map();
    sets.forEach((items, k) => {
      // Perks Bungie retired from the pool (currentlyCanRoll false) are left
      // out, unless that's all there is (fixed rolls).
      const live = items.filter(p => p.currentlyCanRoll !== false);
      const list = (live.length ? live : items).map(p => p.plugItemHash).filter(h => DB.items[h]);
      if (!list.length) return;
      if (list.some(h => MW_PLUG.test(DB.items[h].n))){
        for (const h of list){ const m = MW_PLUG.exec(DB.items[h].n); if (m && (!mw.has(m[1]) || /^masterworked/i.test(DB.items[h].n))) mw.set(m[1], h); }
        return;
      }
      if (isIntrinsic(list[0])){ if (!frame) frame = list[0]; return; }
      const seen = new Set(), perks = list.filter(h => showPlug(h) && !seen.has(DB.items[h].n) && seen.add(DB.items[h].n));
      if (perks.length) cols.push({ label: colLabel(perks[0]), perks, socket: k });
    });
    // Masterwork: only the stats this weapon has (the plug set is shared by every weapon type).
    const has = new Set(Object.values((def.stats && def.stats.stats) || {}).map(s => DB.stats[s.statHash]).filter(Boolean));
    return { frame, cols, mw: [...mw].filter(([stat]) => has.has(stat)).map(([stat, h]) => ({ stat, h })) };
  }

  // Our God Roll for this weapon, by hash or by name: { w, names (lowercase) }.
  function ourRoll(weapon){
    const list = (window.GodRollsData && GodRollsData.WEAPONS) || [];
    const g = list.find(x => weapon.hashes.includes(x.itemHash) || weapon.hashes.includes(x.craftedItemHash)) || list.find(x => fold(x.name) === weapon.key);
    if (!g) return null;
    const names = new Set(g.perkHashes.map(h => (DB.items[h] || {}).n).filter(Boolean).map(n => { const m = MW_PLUG.exec(n); return (m ? "masterwork: " + m[1] : n).toLowerCase(); }));
    return { g, names };
  }

  // ---------------- your copies (signed in) ----------------
  let profileJob = null;
  function profile(){
    if (!window.RallyFlagAuth || !RallyFlagAuth.isSignedIn()) return Promise.resolve(null);
    if (!profileJob) profileJob = (async () => {
      const get = async path => { const r = await RallyFlagAuth.authedFetch(path), j = await r.json(); if (!r.ok || j.ErrorCode !== 1) throw new Error(j.Message || "HTTP " + r.status); return j.Response; };
      const m = await get("/Platform/User/GetMembershipsForCurrentUser/");
      const list = m.destinyMemberships || [], me = list.find(x => x.membershipId === m.primaryMembershipId) || list[0];
      if (!me) return null;
      const p = await get("/Platform/Destiny2/" + me.membershipType + "/Profile/" + me.membershipId + "/?components=102,201,205,305,310");
      const items = [].concat((p.profileInventory && p.profileInventory.data && p.profileInventory.data.items) || [],
        ...Object.values((p.characterInventories && p.characterInventories.data) || {}).map(c => c.items),
        ...Object.values((p.characterEquipment && p.characterEquipment.data) || {}).map(c => c.items));
      const sockets = (p.itemComponents && p.itemComponents.sockets && p.itemComponents.sockets.data) || {};
      const plugs = (p.itemComponents && p.itemComponents.reusablePlugs && p.itemComponents.reusablePlugs.data) || {};
      // itemHash -> [Set of plug names on that copy (current and free swaps)]
      const copies = new Map();
      for (const it of items){
        if (!it.itemInstanceId || !BY_HASH.has(it.itemHash)) continue;
        const names = new Set();
        for (const s of (sockets[it.itemInstanceId] || {}).sockets || []) if (s.plugHash && DB.items[s.plugHash]) names.add(DB.items[s.plugHash].n.toLowerCase());
        for (const k in (plugs[it.itemInstanceId] || {}).plugs || {}) for (const x of plugs[it.itemInstanceId].plugs[k]) if (DB.items[x.plugItemHash]) names.add(DB.items[x.plugItemHash].n.toLowerCase());
        if (!copies.has(it.itemHash)) copies.set(it.itemHash, []);
        copies.get(it.itemHash).push(names);
      }
      return copies;
    })().catch(e => { console.warn("Your copies didn't load:", e.message); return null; });
    return profileJob;
  }

  // ---------------- Clarity (community perk research) ----------------
  // The Locker's code and rules (HANDOFF item 65): their text unedited,
  // credited with a link next to it, clearly not ours, a way to send them
  // feedback, only their latest version (the worker checks versions.json).
  // Loaded the first time a perk is tapped; the same on/off setting as
  // the Locker's Tools → Perk insights.
  const CL_TAB = ' target="_blank" rel="noopener"', CL_NEW = '<span class="sr-only"> (opens in a new tab)</span>';
  const CLARITY_KEY = "rallyflag_locker_clarity", CLARITY_SITE = "https://d2clarity.com", CLARITY_DISCORD = "https://d2clarity.com/discord", CLARITY_KOFI = "https://url.d2clarity.com/ko-fi";
  const CLARITY = { on: (() => { try { return localStorage.getItem(CLARITY_KEY) !== "off"; } catch (e){ return true; } })(), data: null, job: null, err: "" };
  function loadClarity(){
    if (CLARITY.data || !CLARITY.on) return Promise.resolve(CLARITY.data);
    if (!CLARITY.job) CLARITY.job = new Promise(resolve => {
      const w = new Worker("assets/locker-worker.js");
      const end = (data, err) => { w.terminate(); CLARITY.data = data; CLARITY.err = err || ""; CLARITY.job = null; resolve(data); };
      w.onmessage = e => e.data.type === "done" ? end(e.data.db) : e.data.type === "error" ? end(null, e.data.message) : 0;
      w.onerror = e => end(null, e.message || "worker failed");
      w.postMessage({ kind: "clarity" });
    });
    return CLARITY.job;
  }
  const CLARITY_ICON = { solar: "Solar", arc: "Arc", void: "Void", stasis: "Stasis", strand: "Strand", kinetic: "Kinetic", primary: "Primary ammo", special: "Special ammo", heavy: "Heavy ammo",
    barrier: "Barrier", overload: "Overload", unstoppable: "Unstoppable", hunter: "Hunter", titan: "Titan", warlock: "Warlock", enhancedArrow: "Enhanced" };
  function clarityText(blocks){
    const piece = s => {
      const cls = s.classNames || [];
      if (!s.text){ const k = cls.find(c => CLARITY_ICON[c]); return k ? '<span class="cl-ico cl-' + k + '" role="img" aria-label="' + CLARITY_ICON[k] + '"></span>' : ""; }
      let t = esc(s.text);
      if (s.link && /^https:\/\//.test(s.link)) t = '<a href="' + esc(s.link) + '"' + CL_TAB + ">" + t + CL_NEW + "</a>";
      return cls.includes("bold") ? "<b>" + t + "</b>" : t;
    };
    return blocks.map(b => (b.classNames || []).includes("spacer") && !b.linesContent ? '<div class="cl-gap"></div>'
      : '<p class="cl-line' + ((b.classNames || []).includes("bold") ? " cl-bold" : "") + '">' + (b.linesContent || []).map(piece).join("") + "</p>").join("");
  }
  function clarityHtml(h){
    if (!CLARITY.on || !CLARITY.data) return CLARITY.on && CLARITY.err ? '<p class="cl-wait">Clarity\'s notes didn\'t load (' + esc(CLARITY.err) + ").</p>" : "";
    // Their entry is under this perk's hash, or another copy of it (enhanced, older).
    const name = (DB.items[h] || {}).n;
    let blocks = CLARITY.data.perks[h];
    if (!blocks && name) for (const k in CLARITY.data.perks) if ((DB.items[k] || {}).n === name){ blocks = CLARITY.data.perks[k]; break; }
    if (!blocks) return "";
    return '<div class="clarity" lang="en"><div class="cl-head"><span>Community Insights by <a href="' + CLARITY_SITE + '"' + CL_TAB + ">Clarity" + CL_NEW + '</a><span class="sr-only">, not Rally Flag</span></span>' +
      '<a href="' + CLARITY_DISCORD + '"' + CL_TAB + ' title="Tell Clarity about a mistake in this description">Report<span class="sr-only"> a mistake to Clarity on Discord</span>' + CL_NEW + "</a></div>" + clarityText(blocks) + "</div>";
  }
  // Credits under the perks, with the switch.
  function clarityCredits(){
    return '<p class="wl-clarity" id="wl-clarity"><button type="button" class="wl-btn" id="wl-clarity-on" aria-pressed="' + CLARITY.on + '">Clarity notes ' + (CLARITY.on ? "on" : "off") + "</button>" +
      '<span>Perk numbers come from <a href="' + CLARITY_SITE + '"' + CL_TAB + ">Clarity" + CL_NEW + "</a>, a community research project (not part of Rally Flag). " +
      'Spot a mistake? Tell <a href="' + CLARITY_DISCORD + '"' + CL_TAB + ">Clarity's Discord" + CL_NEW + '</a>. You can <a href="' + CLARITY_KOFI + '"' + CL_TAB + ">support them on Ko-fi" + CL_NEW + "</a>.</span></p>";
  }

  // ---------------- detail view ----------------
  let current = null; // { weapon, hash, defs: Map(hash -> def) }
  function statsHtml(def){
    const stats = Object.values((def.stats && def.stats.stats) || {}).map(s => ({ name: DB.stats[s.statHash], value: s.value }))
      .filter(s => s.name && STAT_ORDER.includes(s.name)).sort((a, b) => STAT_ORDER.indexOf(a.name) - STAT_ORDER.indexOf(b.name));
    if (!stats.length) return "";
    return '<div class="wl-stats">' + stats.map(s => '<div class="wl-stat"><span>' + esc(STAT_SHORT[s.name] || s.name) + (HIDDEN.test(s.name) ? '<em class="wl-hidden" title="Not shown in game">hidden</em>' : "") + "</span><b>" + s.value + "</b>" +
      (s.name === "Recoil Direction" ? recoilHtml(s.value) : NO_BAR.test(s.name) ? "<i></i>" : '<span class="wl-bar"><i style="width:' + Math.max(0, Math.min(100, s.value)) + '%"></i></span>') + "</div>").join("") + "</div>";
  }
  // Recoil Direction compass (the formula vendors.html and the Locker use).
  const LEAN = [-8 / 9, -0.8453835700401364, -0.7191262172221752, -0.5224757798155321, -0.2746817727777316, 0, 0.2746817727777319, 0.5224757798155313, 0.7191262172221743, 0.8453835700401364];
  function recoilHtml(value){
    const half = 0.9 * (100 - value), center = value >= 100 ? 0 : (Math.floor(value / 10) % 2 === 0 ? -1 : 1) * LEAN[value % 10] * half;
    const pt = deg => { const r = deg * Math.PI / 180; return [(1 + Math.sin(r)).toFixed(4), (1 - Math.cos(r)).toFixed(4)]; };
    let inner;
    if (half < 1){ const [x, y] = pt(center), [ox, oy] = pt(center + 180); inner = '<line class="spread" x1="' + ox + '" y1="' + oy + '" x2="' + x + '" y2="' + y + '" stroke-width="0.1"></line>'; }
    else { const [x1, y1] = pt(center + half), [x2, y2] = pt(center - half); inner = '<path class="spread" d="M1,1 L' + x1 + "," + y1 + " A1,1 0 0,0 " + x2 + "," + y2 + ' Z"></path>'; }
    return '<svg class="wl-recoil" viewBox="0 0 2 1" role="img" aria-label="Recoil direction ' + value + '"><circle class="dial" r="1" cx="1" cy="1"></circle>' + inner + "</svg>";
  }
  function perkHtml(h, ours, have){
    const p = DB.items[h];
    return '<button type="button" class="wl-perk' + (ours ? " ours" : "") + (have ? " have" : "") + '" data-plug="' + h + '" aria-pressed="false">' +
      '<span class="wl-perk-icon">' + (p.i ? '<img src="' + esc(img(p.i)) + '" alt="" width="36" height="36" loading="lazy">' : "") + "</span>" +
      '<span class="wl-perk-name">' + esc(p.n) + "</span>" +
      (ours || have ? '<span class="sr-only">' + (ours ? ", our God Roll" : "") + (have ? ", on a copy you own" : "") + "</span>" : "") + "</button>";
  }

  async function openWeapon(weapon, hash, push){
    current = { weapon, hash: null };
    document.body.classList.add("wl-detail-on");
    $("wl-search-view").hidden = true; $("wl-detail").hidden = false;
    $("wl-detail").innerHTML = '<p class="wl-status" role="status">Loading ' + esc(weapon.name) + "…</p>";
    document.title = weapon.name + " - Weapon Lookup - Rally Flag";
    window.scrollTo(0, 0);
    let defs;
    try { defs = await Promise.all(weapon.versions.map(h => manifestGet("DestinyInventoryItemDefinition", h))); }
    catch (e){ $("wl-detail").innerHTML = '<p class="wl-status error" role="status">Bungie didn\'t send this weapon (' + esc(e.message) + '). <button type="button" class="wl-btn" id="wl-again">Try again</button></p>'; $("wl-again").addEventListener("click", () => openWeapon(weapon, hash)); return; }
    if (!current || current.weapon !== weapon) return; // left it while loading
    // Newest version first (Bungie's definition index grows with each release).
    const versions = weapon.versions.map((h, k) => ({ h, def: defs[k] })).sort((a, b) => (b.def.index || 0) - (a.def.index || 0));
    const ours = ourRoll(weapon);
    const pick = versions.find(v => v.h === hash) || (ours && versions.find(v => v.h === ours.g.itemHash)) || versions[0];
    await showVersion(weapon, versions, pick, ours);
    const url = "?w=" + pick.h;
    if (push) history.pushState({ w: pick.h }, "", url); else history.replaceState({ w: pick.h }, "", url);
  }

  async function showVersion(weapon, versions, v, ours){
    current = { weapon, hash: v.h };
    const def = v.def, d = DB.items[v.h] || weapon.d, el = DB.damage[d.d];
    // This version's lore, or another version's (reissues often have none).
    const loreHash = def.loreHash || (weapon.hashes.map(h => (DB.items[h] || {}).lo).find(Boolean)) || 0;
    const [roll, source, copies] = await Promise.all([
      rollOf(def),
      // Only a real "Source: …" line (some say things like "Random Perks: …").
      def.collectibleHash ? manifestGet("DestinyCollectibleDefinition", def.collectibleHash).then(c => /^source:/i.test(c.sourceString || "") ? c.sourceString : "").catch(() => "") : "",
      profile()
    ]);
    if (!current || current.hash !== v.h) return; // moved on while loading
    // Your copies of any version of this weapon, and the perks they have.
    const mine = copies ? weapon.hashes.flatMap(h => copies.get(h) || []) : [];
    const have = new Set(mine.flatMap(s => [...s]));
    const ourName = n => ours && ours.names.has(n.toLowerCase());
    const versionsHtml = versions.length > 1 ? '<div class="wl-versions" role="group" aria-label="Versions">' + versions.map((x, k) => {
      const xd = DB.items[x.h] || {};
      return '<button type="button" class="wl-version" data-version="' + x.h + '" aria-pressed="' + (x === v) + '">' + (xd.w ? '<img src="' + esc(img(xd.w)) + '" alt="" width="20" height="20">' : "") +
        (k === 0 ? "Newest" : "Version " + (versions.length - k)) + (ours && x.h === ours.g.itemHash ? " · our pick" : "") + "</button>"; }).join("") + "</div>" : "";
    const cols = roll.cols.map(c => '<div class="wl-col" role="group" aria-label="' + esc(c.label) + '"><div class="wl-col-h">' + esc(c.label) + "</div>" +
      c.perks.map(h => perkHtml(h, ourName(DB.items[h].n), have.has(DB.items[h].n.toLowerCase()))).join("") + "</div>").join("");
    const mwCol = roll.mw.length ? '<div class="wl-col" role="group" aria-label="Masterwork"><div class="wl-col-h">Masterwork</div>' +
      roll.mw.map(m => perkHtml(m.h, ours && ours.names.has(("masterwork: " + m.stat).toLowerCase()), false).replace(esc(DB.items[m.h].n), esc(m.stat))).join("") + "</div>" : "";
    const frame = roll.frame ? '<div class="wl-frame"><img src="' + esc(img((DB.items[roll.frame] || {}).i)) + '" alt="" width="40" height="40"><div><b>' + esc(DB.items[roll.frame].n) + "</b><small>" + esc(DB.items[roll.frame].x || "") + "</small></div></div>" : "";
    const notes = [
      ours ? '<div class="wl-note ours"><span><strong>Our God Roll</strong> is marked in gold below.</span><a href="god-rolls.html#weapon-' + esc(ours.g.slug) + '">Why this roll →</a></div>' : "",
      copies ? '<div class="wl-note"><span>' + (mine.length ? "You have " + mine.length + (mine.length === 1 ? " copy" : " copies") + ". Perks on " + (mine.length === 1 ? "it" : "at least one of them") + " (or a free swap) have a dot."
        : "You don't have a copy of this weapon.") + "</span>" + (mine.length && window.rallyFlagHasLocker && rallyFlagHasLocker() ? '<a href="locker.html?q=' + encodeURIComponent('name:"' + weapon.name.replace(/["“”]/g, "") + '"') + '">Find in Locker →</a>' : "") + "</div>" : ""
    ].join("");
    $("wl-detail").innerHTML =
      '<button type="button" class="wl-btn wl-back" id="wl-back">← All weapons</button>' +
      '<article class="wl-card panel-card' + (d.r === 6 ? " exotic" : "") + '" aria-labelledby="wl-name">' +
        '<header class="wl-head">' + (def.screenshot ? '<img class="wl-shot" src="' + esc(img(def.screenshot)) + '" alt="" loading="lazy">' : "") +
          '<span class="wl-icon big"><img src="' + esc(img(d.i)) + '" alt="" width="72" height="72">' + (d.w ? '<img class="wm" src="' + esc(img(d.w)) + '" alt="" width="72" height="72">' : "") + "</span>" +
          '<div class="wl-title"><h2 id="wl-name" tabindex="-1">' + esc(weapon.name) + "</h2>" +
            '<p class="wl-meta">' + (el && el.i ? '<img src="' + esc(img(el.i)) + '" alt="" width="16" height="16">' : "") + esc([el && el.n, AMMO[d.a], (d.r === 6 ? "Exotic " : "Legendary ") + (d.y || "weapon")].filter(Boolean).join(" · ")) + "</p>" +
            (source ? '<p class="wl-source">' + esc(source) + "</p>" : "") + "</div></header>" +
        (def.flavorText ? '<p class="wl-flavor">“' + esc(def.flavorText) + '”</p>' : "") +
        versionsHtml + notes +
        '<div class="wl-body"><section class="wl-side" aria-labelledby="wl-h-stats"><h3 class="wl-h" id="wl-h-stats">Base stats</h3>' + statsHtml(def) +
          (frame ? '<h3 class="wl-h">Frame</h3>' + frame : "") + "</section>" +
          '<section class="wl-main" aria-labelledby="wl-h-perks"><h3 class="wl-h" id="wl-h-perks">' + (roll.cols.length ? "Every perk it can roll" : "Perks") + "</h3>" +
            '<p class="wl-hint">Tap a perk to read what it does; tap it again to close.</p>' +
            (cols || mwCol ? '<div class="wl-cols">' + cols + mwCol + "</div>" : '<p class="muted">Bungie lists no perk choices for this version.</p>') +
            '<p class="wl-links"><a href="https://www.light.gg/db/items/' + v.h + '/" target="_blank" rel="noopener">light.gg<span class="sr-only"> (opens in a new tab)</span> ↗</a></p>' +
            clarityCredits() +
            (loreHash ? '<details class="wl-lore" data-lore="' + loreHash + '"><summary>Lore</summary><div class="lore-text" aria-live="polite"></div></details>' : "") +
          "</section>" +
          '<div class="wl-perk-info" id="wl-perk-info" role="status" tabindex="0" hidden></div>' +
        "</div></article>";
    $("wl-back").addEventListener("click", () => { if (history.state && history.state.fromList) history.back(); else showList(true); });
    $("wl-detail").querySelectorAll("[data-version]").forEach(b => b.addEventListener("click", () => {
      const x = versions.find(y => y.h === +b.dataset.version);
      showVersion(weapon, versions, x, ours).then(() => { history.replaceState(Object.assign({}, history.state, { w: x.h }), "", "?w=" + x.h); const again = $("wl-detail").querySelector('[data-version="' + x.h + '"]'); if (again) again.focus(); });
    }));
    // Lore: fetched when opened.
    const lore = $("wl-detail").querySelector(".wl-lore");
    if (lore) lore.addEventListener("toggle", () => {
      const box = lore.querySelector(".lore-text");
      if (!lore.open || box.dataset.done) return;
      box.innerHTML = '<p class="muted">Loading the lore…</p>';
      manifestGet("DestinyLoreDefinition", lore.dataset.lore).then(l => {
        const dp = l.displayProperties || {};
        box.dataset.done = "1";
        box.innerHTML = dp.description ? (l.subtitle ? '<p class="lore-sub">' + esc(l.subtitle) + "</p>" : "") + dp.description.split(/\n\s*\n|\n/).filter(x => x.trim()).map(x => "<p>" + esc(x) + "</p>").join("")
          : '<p class="muted">Bungie has no lore for this weapon.</p>';
      }, e => { box.innerHTML = '<p class="muted">The lore didn\'t load (' + esc(e.message) + ").</p>"; });
    });
    // Tap a perk to read it; tap it again to close.
    $("wl-detail").querySelectorAll("[data-plug]").forEach(b => b.addEventListener("click", () => {
      const open = b.getAttribute("aria-pressed") === "true";
      $("wl-detail").querySelectorAll('[data-plug][aria-pressed="true"]').forEach(x => x.setAttribute("aria-pressed", "false"));
      if (open){ const box = $("wl-perk-info"); box.hidden = true; box.innerHTML = ""; delete box.dataset.h; return; }
      b.setAttribute("aria-pressed", "true");
      showPerk(b);
    }));
  }
  // The description box for a perk button: Bungie's text, then Clarity's.
  function showPerk(b){
    const box = $("wl-perk-info"), h = +b.dataset.plug, p = DB.items[h] || {}, name = b.querySelector(".wl-perk-name").textContent;
    const fill = () => {
      box.hidden = false; box.dataset.h = h;
      box.innerHTML = "<b>" + esc(name) + "</b>" + (p.y ? ' <span class="muted">' + esc(p.y) + "</span>" : "") + "<p>" + esc(p.x || "Bungie gives no description for this one.") + "</p>" +
        (CLARITY.on && !CLARITY.data && CLARITY.job ? '<p class="cl-wait">Loading Clarity\'s notes…</p>' : clarityHtml(h));
    };
    fill();
    if (CLARITY.on && !CLARITY.data) loadClarity().then(() => { if (box.isConnected && box.dataset.h === String(h)) fill(); });
  }

  // The search and filters as a link: ?q=…&type=…&element=…&ammo=…&rarity=…
  const FILTERS = ["q", "type", "element", "ammo", "rarity"];
  function listUrl(){
    const u = new URLSearchParams();
    for (const k of FILTERS) if (view[k]) u.set(k, view[k]);
    const s = u.toString();
    return location.pathname + (s ? "?" + s : "");
  }
  function showList(push){
    current = null;
    document.body.classList.remove("wl-detail-on");
    $("wl-detail").hidden = true; $("wl-detail").innerHTML = ""; $("wl-search-view").hidden = false;
    document.title = "Weapon Lookup - Rally Flag";
    const url = listUrl();
    if (push) history.pushState({ list: true }, "", url);
    renderResults();
  }

  // ---------------- start ----------------
  function route(push){
    const params = new URLSearchParams(location.search), h = +params.get("w");
    if (h && BY_HASH.has(h)) return openWeapon(BY_HASH.get(h), h, push);
    if (h) setStatus("That weapon isn't in Bungie's database. Search for it below.");
    for (const k of FILTERS) view[k] = params.get(k) || "";
    $("wl-q").value = view.q;
    renderSearch();
    showList(false);
  }
  async function start(){
    setStatus("Loading Bungie's item database…");
    try { DB = await loadDb(); }
    catch (e){ setStatus("Bungie's item database didn't load (" + e.message + ").", true); return; }
    setStatus("");
    buildIndex();
    renderSearch();
    $("wl-q").addEventListener("input", e => { view.q = e.target.value; view.shown = PAGE; renderResults(); history.replaceState(history.state, "", listUrl()); });
    $("wl-clear").addEventListener("click", () => {
      Object.assign(view, { q: "", type: "", element: "", ammo: "", rarity: "", shown: PAGE });
      $("wl-q").value = ""; renderSearch(); $("wl-q").focus();
      history.replaceState(history.state, "", location.pathname);
    });
    $("wl-more").addEventListener("click", () => { view.shown += PAGE; renderResults(); });
    $("wl-results").addEventListener("click", e => {
      const a = e.target.closest("a[data-w]");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      history.replaceState({ list: true }, "", listUrl());
      const w = WEAPONS.find(x => x.name === a.dataset.w);
      openWeapon(w, null, true).then(() => { history.replaceState(Object.assign({}, history.state, { fromList: true }), ""); const n = $("wl-name"); if (n) n.focus(); });
    });
    window.addEventListener("popstate", () => route(false));
    // Clarity notes on/off (remembered, shared with the Locker).
    $("wl-detail").addEventListener("click", e => {
      if (!e.target.closest("#wl-clarity-on")) return;
      CLARITY.on = !CLARITY.on;
      try { CLARITY.on ? localStorage.removeItem(CLARITY_KEY) : localStorage.setItem(CLARITY_KEY, "off"); } catch (err){}
      $("wl-clarity").outerHTML = clarityCredits();
      const open = $("wl-detail").querySelector('[data-plug][aria-pressed="true"]');
      if (open) showPerk(open);
      $("wl-clarity-on").focus();
    });
    $("wl-app").hidden = false;
    route(false);
  }
  start();
})();
