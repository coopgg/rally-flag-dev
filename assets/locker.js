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
  const COMPONENTS = "100,102,103,200,201,205,206,300,304,305,310";
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
  // Banner: armor stat totals per character (game order) and the vault's
  // space, as DIM shows them. Capacities come from Bungie's bucket table.
  const ARMOR_STATS = [2996146975, 392767087, 1943323491, 1735777505, 144602215, 4244567218];
  const VAULT_SPACE = [[138197802, "Vault", "Vault"], [1469714392, "Consumables", "Cons"], [3313201758, "Modifications", "Mods"]];
  // Plugs worth showing in the perk columns; cosmetics, trackers and
  // empty sockets are left out.
  const SHOW_PLUG = /trait|intrinsic|magazine|barrel|battery|sight|scope|haft|stock|bowstring|arrow|blade|guard|grip|frame|archetype|armor perk|mod$|tuning/i;
  const HIDE_PLUG = /shader|ornament|memento|flair|tracker|restore|deprecated|transmat|emote/i;

  // Small line icons (stroke follows the text colour).
  const svg = d => '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  const ICON_TRASH = svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>');
  const ICON_KEEP = svg('<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>');
  const ICON_INFUSE = svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>');
  const ICON_ARCHIVE = svg('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>');
  const ICON_NOTE = svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>');
  // DIM's tags. Junk sorts last and is what Junk cleanup sends; Favorite
  // and Keep protect an item when farming or loadouts need room.
  const TAG_LIST = [["favorite", "Favorite", "♥"], ["keep", "Keep", ICON_KEEP], ["junk", "Junk", ICON_TRASH], ["infuse", "Infuse", ICON_INFUSE], ["archive", "Archive", ICON_ARCHIVE]];
  // PvE / PvP marks, apart from tags: an item can be Favorite and PvP, or
  // both PvE and PvP. USE[id] is "pve", "pvp" or "both".
  const ICON_PVE = svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>');
  const ICON_PVP = svg('<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 17.5L21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2"/>');
  const USE_LIST = [["pve", "PvE", ICON_PVE, "Vanguard, raids, dungeons"], ["pvp", "PvP", ICON_PVP, "Crucible, Trials, Gambit"]];
  const hasUse = (id, u) => USE[id] === u || USE[id] === "both";
  const wishName = item => item.def.n.toLowerCase();
  // Masterwork plugs are "Tier 1: Range" … "Tier 9: Range", "Masterworked: Range".
  const MW_PLUG = /^(?:tier \d+|masterworked):\s*(.+)$/i;
  const mwStatOf = item => { for (const h of item.plugs){ const m = MW_PLUG.exec((DB.items[h] || {}).n || ""); if (m) return m[1]; } return ""; };
  // What a copy has for wish-list matching: every perk it has or can switch
  // to, and its masterwork's stat (at any tier: the tier can be raised).
  const wishHave = item => { const have = new Set(perkNames(item).split("|")), mw = mwStatOf(item); if (mw) have.add("masterwork: " + mw.toLowerCase()); return have; };
  const wishOf = item => item.def.t === 3 ? WISHES[wishName(item)] || null : null;
  // How close this copy is to its best wish-list roll: { k, n, total, full }.
  function wishMatch(item){
    const rolls = wishOf(item);
    if (!rolls || !rolls.length) return null;
    const have = wishHave(item);
    let best = null;
    rolls.forEach((r, k) => {
      const n = r.groups.filter(g => g.some(x => have.has(x.toLowerCase()))).length;
      if (!best || n / r.groups.length > best.n / best.total) best = { k, n, total: r.groups.length };
    });
    best.full = best.n === best.total;
    return best;
  }
  function saveWish(name, rolls){
    rolls && rolls.length ? (WISHES[name] = rolls) : delete WISHES[name];
    TAG_AT["wish:" + name] = Date.now();
    saveTags(); tagsChanged();
  }
  const ICON_WISH = svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>');
  const useText = id => USE[id] === "both" ? "PvE and PvP" : USE[id] === "pve" ? "PvE" : USE[id] === "pvp" ? "PvP" : "";
  const ICON_LOCK = svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
  const ICON_UNLOCK = svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>');
  const INVENTORY_CAP = 9; // Bungie: 9 unequipped items per weapon/armor slot on a character
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const img = p => p ? (p.charAt(0) === "/" ? BUNGIE + p : p) : "";
  // Ornaments: plugs flagged o by the worker. "Default Ornament" is the
  // plug that takes one off, so it counts as none.
  const isOrnamentPlug = h => !!(DB.items[h] && DB.items[h].o);
  const isOrnament = h => isOrnamentPlug(h) && !/^Default /.test(DB.items[h].n);
  // What the item looks like in game: the ornament's icon when one is on (as DIM shows it).
  const iconOf = item => (item.ornament && DB.items[item.ornament] && DB.items[item.ornament].i) || item.def.i;
  // Masterworked: Bungie's own gold frame (DestinyInventoryItemConstants-
  // Definition; a brighter one for Exotics). Gear tier: gold diamonds down
  // the left edge, as in game and DIM, drawn bolder than Bungie's overlay so
  // they read on bright weapon art.
  // Each diamond 7 units tall with a 2.5-unit gap, stacked from the top.
  const tierPips = n => '<svg class="tier-pips" viewBox="0 0 10 45" preserveAspectRatio="xMidYMin meet" aria-hidden="true">' +
    Array.from({ length: n }, (_, k) => { const y = k * 9.5; return '<path d="M5 ' + y + "l4.5 3.5L5 " + (y + 7) + "L0.5 " + (y + 3.5) + 'z"/>'; }).join("") + "</svg>";
  const MW_OVERLAY = { 5: "/img/destiny_content/items/masterwork-overlay-border.png", 6: "/img/destiny_content/items/masterwork-overlay-exotic-border.png" };
  const slugify = s => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  let SHOWN = []; // items the gear view shows right now (filters + search), for bulk actions
  let DB = null, PROFILE = null, ITEMS = [], OWNERS = [], SETS = [], POSTMASTER = [], MEMBERSHIP_TYPE = 0, PROFILE_PATH = "", INSTANCE_HASH = new Map();

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
  const rememberItems = items => remember(items.map(i => [i.id, { owner: i.owner, equipped: i.equipped, locked: !!(i.state & STATE_LOCKED), orn: i.ornament || 0 }]));
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
      if (key.startsWith("sock:")){ for (const k in e.plugs) patchPlug(key.slice(5), +k, e.plugs[k]); applied++; continue; }
      if (key.startsWith("sc:")){ patchSubclass(key.slice(3), e.id); applied++; continue; }
      if (key.startsWith("gls:")){ const [, ch, ix] = key.split(":"); setGameSlot(ch, +ix, e.lo); applied++; continue; }
      if (key.startsWith("glo:")){ const [, ch, ix] = key.split(":"); patchGameIdentifiers(ch, +ix, { nameHash: e.nameHash, iconHash: e.iconHash, colorHash: e.colorHash }); applied++; continue; }
      if (key.startsWith("art:")){ patchSubclass(key.slice(4), e.id, isArtifact); applied++; continue; }
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
      if ("orn" in e) item.ornament = e.orn;
      applied++;
    }
    return applied;
  }
  // owners: the character/vault cards toggled on; none means everyone.
  // focus: whose gear is shown, one character or the vault (like DIM on a
  // phone); remembered per browser, first time the last-played character.
  const FOCUS_KEY = "rallyflag_locker_focus";
  const state = { type: null, flags: new Set(), tag: "", sort: (() => { try { return localStorage.getItem("rallyflag_locker_sort") || "power"; } catch (e){ return "power"; } })(), q: "", focus: (() => { try { return localStorage.getItem(FOCUS_KEY); } catch (e){ return null; } })() };
  // Folded slots and opened vault lists, remembered per browser.
  const FOLD_KEY = "rallyflag_locker_folds";
  const folds = (() => { try { const f = JSON.parse(localStorage.getItem(FOLD_KEY) || "{}"); return { slots: new Set(f.slots || []), vaults: new Set(f.vaults || []), pmOpen: !!f.pmOpen }; } catch (e){ return { slots: new Set(), vaults: new Set(), pmOpen: false }; } })();
  function saveFolds(){ try { localStorage.setItem(FOLD_KEY, JSON.stringify({ slots: [...folds.slots], vaults: [...folds.vaults], pmOpen: folds.pmOpen })); } catch (e){} }

  // Favorite / Junk tags, per item, kept in this browser (no server to sync them).
  const TAG_KEY = "rallyflag_locker_tags";
  const TAGS = (() => { try { return JSON.parse(localStorage.getItem(TAG_KEY) || "{}"); } catch (e){ return {}; } })();
  // When each tag was last set or removed (removed = no TAGS entry), so
  // tags can be merged with the player's other devices (sync, below).
  const TAG_TIME_KEY = "rallyflag_locker_tag_times";
  const TAG_AT = (() => { try { return JSON.parse(localStorage.getItem(TAG_TIME_KEY) || "{}"); } catch (e){ return {}; } })();
  // A short note per item (like DIM's), stored and synced with its tag.
  const NOTE_KEY = "rallyflag_locker_notes";
  const NOTES = (() => { try { return JSON.parse(localStorage.getItem(NOTE_KEY) || "{}"); } catch (e){ return {}; } })();
  // Wish lists (like DIM's): per weapon name, rolls you want, each a list
  // of perk columns, each column the perk names any of which will do.
  // Matched by name, so enhanced and older versions count too.
  const WISH_KEY = "rallyflag_locker_wishes";
  const WISHES = (() => { try { return JSON.parse(localStorage.getItem(WISH_KEY) || "{}"); } catch (e){ return {}; } })();
  const USE_KEY = "rallyflag_locker_use";
  const USE = (() => { try { return JSON.parse(localStorage.getItem(USE_KEY) || "{}"); } catch (e){ return {}; } })();
  function saveTags(){ try { localStorage.setItem(WISH_KEY, JSON.stringify(WISHES)); localStorage.setItem(USE_KEY, JSON.stringify(USE)); localStorage.setItem(TAG_KEY, JSON.stringify(TAGS)); localStorage.setItem(TAG_TIME_KEY, JSON.stringify(TAG_AT)); localStorage.setItem(NOTE_KEY, JSON.stringify(NOTES)); } catch (e){} }
  function setNote(id, text){
    text = String(text || "").trim().slice(0, 120);
    if ((NOTES[id] || "") === text) return false;
    text ? (NOTES[id] = text) : delete NOTES[id];
    TAG_AT[id] = Date.now();
    saveTags(); tagsChanged();
    return true;
  }
  // PvE/PvP: each button toggles its own half.
  function setUse(id, value){
    if ((USE[id] || "") === value) return;
    value ? (USE[id] = value) : delete USE[id];
    TAG_AT[id] = Date.now();
    saveTags(); tagsChanged();
  }
  function toggleUse(id, u){
    const pve = u === "pve" ? !hasUse(id, "pve") : hasUse(id, "pve"), pvp = u === "pvp" ? !hasUse(id, "pvp") : hasUse(id, "pvp");
    setUse(id, pve && pvp ? "both" : pve ? "pve" : pvp ? "pvp" : "");
  }
  function toggleTag(id, tag){
    TAGS[id] === tag ? delete TAGS[id] : (TAGS[id] = tag);
    TAG_AT[id] = Date.now();
    saveTags();
    tagsChanged();
  }
  // Which view is open: gear (default), loadouts (#loadouts), armor sets (#sets) or progress (#progress).
  const VIEWS = ["gear", "loadouts", "sets", "progress"];
  function showView(name, focus){
    if (!VIEWS.includes(name)) name = "gear";
    for (const v of VIEWS){
      const tab = $("tab-" + v), on = v === name;
      tab.setAttribute("aria-selected", String(on)); tab.tabIndex = on ? 0 : -1;
      $("view-" + v).hidden = !on;
    }
    $("locker-search").parentElement.hidden = name !== "gear"; // search is for gear
    if (name === "loadouts" && DB) renderLoadouts();
    if (name === "progress" && DB) renderProgress();
    if (focus) $("tab-" + name).focus();
    history.replaceState(null, "", location.pathname + location.search + (name === "gear" ? "" : "#" + name));
  }

  // ---------------- Progress (like Ishtar's) ----------------
  // Season pass rank, weekly milestones, bounties and quests with their
  // objectives, and seals. Loaded when the tab first opens (one extra
  // GetProfile call, and the worker's small progress database), again
  // after 2 minutes away or on Refresh, so the Gear view isn't slowed.
  const PROGRESS_COMPONENTS = "100,104,200,201,202,300,301,700", PURSUITS_BUCKET = 1345459588;
  let PDB = null, PROG = null, progAt = 0, progLoading = null, progError = "", progFocus = null, sealsAll = false;
  function loadProgressDb(){
    return new Promise((resolve, reject) => {
      const w = new Worker("assets/locker-worker.js");
      w.onmessage = e => {
        const m = e.data;
        if (m.type === "progress"){ const n = $("pg-note"); if (n) n.textContent = m.step; }
        else if (m.type === "done"){ w.terminate(); resolve(m.db); }
        else if (m.type === "error"){ w.terminate(); reject(new Error(m.message)); }
      };
      w.onerror = e => reject(new Error(e.message || "progress database worker failed"));
      w.postMessage({ kind: "progress", apiKey: window.RallyFlagAPI.BUNGIE_API_KEY });
    });
  }
  async function loadProgressData(){
    if (!DEMO) return authedGet(PROFILE_PATH + "/?components=" + PROGRESS_COMPONENTS);
    // Sample data: bounty expiry is stored in hours from now.
    const p = JSON.parse(JSON.stringify(PROFILE.progress || {}));
    for (const c of Object.values((p.characterInventories || {}).data || {}))
      for (const it of c.items) if (it._hours) it.expirationDate = new Date(Date.now() + it._hours * 3600e3).toISOString();
    return p;
  }
  function renderProgress(force){
    const fresh = PROG && !force && Date.now() - progAt < 120000;
    if (!fresh && !progLoading){
      progError = "";
      progLoading = Promise.all([PDB || loadProgressDb(), loadProgressData()])
        .then(([db, data]) => { PDB = db; PROG = data; progAt = Date.now(); })
        .catch(e => { progError = (e && e.message) || String(e); })
        .finally(() => { progLoading = null; if (!$("view-progress").hidden) drawProgress(); });
    }
    drawProgress();
  }
  const pct = (a, b) => b ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : 0;
  const barHtml = (a, b, done) => '<span class="pg-bar' + (done ? " done" : "") + '" aria-hidden="true"><i style="width:' + pct(a, b) + '%"></i></span>';
  function untilText(iso){
    const ms = Date.parse(iso) - Date.now();
    if (!(ms > 0)) return "Expired";
    const h = Math.round(ms / 3600e3);
    return h < 1 ? "Expires within the hour" : h < 48 ? "Expires in " + h + "h" : "Expires in " + Math.round(h / 24) + " days";
  }
  function objectiveRow(o){
    const desc = (PDB.objectives || {})[o.objectiveHash] || "Progress", c = o.completionValue || 1;
    // Most objectives count to a number; one-step ones read as done/not done.
    const val = c === 1 ? (o.complete ? "Done" : "Not yet") : Math.min(o.progress || 0, c).toLocaleString() + " / " + c.toLocaleString();
    return '<div class="pg-obj' + (o.complete ? " done" : "") + '"><span class="pg-obj-d">' + esc(desc) + '</span><span class="pg-obj-v">' + val + "</span>" + barHtml(o.progress || 0, c, o.complete) + "</div>";
  }
  function drawProgress(){
    const box = $("view-progress");
    if (!PROG){
      box.innerHTML = progError ? '<p class="pg-msg">Couldn\'t load your progress: ' + esc(progError) + ' <button type="button" class="act-btn" id="pg-retry">Try again</button></p>'
        : '<p class="pg-msg" role="status">Loading your progress from Bungie.net… <span id="pg-note"></span></p>';
      const r = $("pg-retry"); if (r) r.addEventListener("click", () => renderProgress(true));
      return;
    }
    const was = box.contains(document.activeElement) ? document.activeElement : null;
    const refocus = was && (was.id ? "#" + was.id : was.dataset.pgOwner ? '[data-pg-owner="' + was.dataset.pgOwner + '"]' : null);
    const cps = (PROG.characterProgressions && PROG.characterProgressions.data) || {};
    // Season pass (account-wide; any character's copy).
    let season = "";
    const sh = PROG.profile && PROG.profile.data && PROG.profile.data.currentSeasonHash, sdef = PDB.seasons[sh], now = Date.now();
    const pass = sdef && (sdef.passes.find(p => Date.parse(p.start) <= now && now < Date.parse(p.end)) || sdef.passes[sdef.passes.length - 1]);
    const pdef = pass && PDB.passes[pass.h], anyCp = Object.values(cps)[0];
    if (pdef && anyCp){
      const rp = anyCp.progressions[pdef.r] || {}, pp = anyCp.progressions[pdef.p] || {};
      const capped = rp.levelCap > 0 && rp.level >= rp.levelCap, cur = capped ? pp : rp;
      const rank = (rp.level || 0) + (pp.level || 0), days = Math.max(0, Math.ceil((Date.parse(pass.end) - now) / 86400e3));
      const art = PROG.profileProgression && PROG.profileProgression.data && PROG.profileProgression.data.seasonalArtifact;
      season = '<section class="pg-section pg-season panel-card" aria-labelledby="pg-h-season"><h2 class="dlg-label" id="pg-h-season">Season pass</h2>' +
        '<div class="pg-season-row"><div class="pg-rank"><b>' + rank + '</b><small>rank</small></div><div class="pg-season-main"><div><b>' + esc(sdef.n) + "</b>" + (pdef.n && pdef.n !== sdef.n ? " · " + esc(pdef.n) : "") + "</div>" +
          '<div class="pg-sub">' + (cur.nextLevelAt ? (cur.progressToNextLevel || 0).toLocaleString() + " / " + cur.nextLevelAt.toLocaleString() + " XP to rank " + (rank + 1) : "") +
          (Number.isFinite(days) && days < 3650 ? " · " + days + " day" + (days === 1 ? "" : "s") + " left" : "") + (art && art.powerBonus ? " · artifact +" + art.powerBonus + " Power" : "") + "</div>" +
          barHtml(cur.progressToNextLevel || 0, cur.nextLevelAt || 1) + "</div></div></section>";
    }
    // Weekly milestones: one row each, a status per character.
    const ms = new Map();
    for (const o of OWNERS){
      const m = (cps[o.id] || {}).milestones || {};
      for (const h in m){
        const objs = [].concat(...(m[h].availableQuests || []).map(q => (q.status && q.status.stepObjectives) || []), ...(m[h].activities || []).map(a => (a.challenges || []).map(c => c.objective).filter(Boolean)));
        if (!objs.length) continue;
        const def = PDB.milestones[h] || {}, quest = (m[h].availableQuests || [])[0];
        const name = def.n || (quest && (PDB.pursuits[quest.questItemHash] || {}).n) || "";
        if (!name) continue;
        if (!ms.has(h)) ms.set(h, { name, d: def.d, per: {} });
        ms.get(h).per[o.id] = { done: objs.filter(x => x.complete).length, total: objs.length };
      }
    }
    const msRows = [...ms.values()].sort((a, b) => Object.values(a.per).every(p => p.done === p.total) - Object.values(b.per).every(p => p.done === p.total) || a.name.localeCompare(b.name));
    const milestones = '<section class="pg-section" aria-labelledby="pg-h-ms"><h2 class="dlg-label" id="pg-h-ms">Milestones</h2>' +
      (msRows.length ? '<div class="pg-ms">' + msRows.map(r => '<div class="pg-ms-row"><div class="pg-ms-name"><b>' + esc(r.name) + "</b>" + (r.d ? "<small>" + esc(r.d) + "</small>" : "") + "</div>" +
        '<div class="pg-ms-chars">' + OWNERS.map(o => { const p = r.per[o.id]; return '<span class="pg-ms-char' + (p && p.done === p.total ? " done" : "") + '">' + esc(o.name) + " " + (!p ? "–" : p.done === p.total ? "✓" : p.done + "/" + p.total) + "</span>"; }).join("") + "</div></div>").join("") + "</div>"
        : '<p class="muted">No milestones with objectives this week.</p>') + "</section>";
    // Bounties and quests for one character at a time.
    if (!progFocus || !OWNERS.some(o => o.id === progFocus)) progFocus = (OWNERS.slice().sort((a, b) => b.played - a.played)[0] || {}).id;
    const objData = (PROG.itemComponents && PROG.itemComponents.objectives && PROG.itemComponents.objectives.data) || {};
    const inv = (((PROG.characterInventories || {}).data || {})[progFocus] || {}).items || [];
    const pursuits = inv.filter(it => it.bucketHash === PURSUITS_BUCKET && PDB.pursuits[it.itemHash]).map(it => {
      const def = PDB.pursuits[it.itemHash];
      const objs = ((it.itemInstanceId && objData[it.itemInstanceId] && objData[it.itemInstanceId].objectives) || ((cps[progFocus] || {}).uninstancedItemObjectives || {})[it.itemHash] || []).filter(o => o.visible !== false);
      return { it, def, objs, done: objs.length > 0 && objs.every(o => o.complete), share: objs.length ? objs.reduce((n, o) => n + Math.min(1, (o.progress || 0) / (o.completionValue || 1)), 0) / objs.length : 0 };
    }).sort((a, b) => b.done - a.done || b.share - a.share);
    const card = p => '<div class="pg-card' + (p.done ? " done" : "") + '"><div class="pg-card-head">' + (p.def.i ? '<img src="' + esc(img(p.def.i)) + '" alt="" width="40" height="40" loading="lazy">' : "") +
      '<div><b>' + esc(p.def.n) + '</b><small>' + esc(p.def.y) + (p.done ? ' · <span class="pg-ready">Ready to turn in</span>' : "") + (p.it.expirationDate ? " · " + untilText(p.it.expirationDate) : "") + "</small></div></div>" +
      (p.objs.length ? p.objs.map(objectiveRow).join("") : p.def.x ? '<p class="pg-sub">' + esc(p.def.x) + "</p>" : "") + "</div>";
    const bounties = pursuits.filter(p => p.def.t === 26), quests = pursuits.filter(p => p.def.t !== 26);
    const group = (label, list, empty) => '<h3 class="pg-h3">' + label + " <span>" + list.length + "</span></h3>" + (list.length ? '<div class="pg-cards">' + list.map(card).join("") + "</div>" : '<p class="muted">' + empty + "</p>");
    const pursuitsHtml = '<section class="pg-section" aria-labelledby="pg-h-pursuits"><h2 class="dlg-label" id="pg-h-pursuits">Bounties &amp; quests</h2>' +
      '<div class="pg-owners" role="group" aria-label="Whose pursuits">' + OWNERS.map(o => '<button type="button" class="chip" data-pg-owner="' + o.id + '" aria-pressed="' + (o.id === progFocus) + '">' + esc(o.name) + "</button>").join("") + "</div>" +
      group("Bounties", bounties, "No bounties.") + group("Quests", quests, "No quests.") + "</section>";
    // Seals: closest to done first; finished ones as a list.
    const nodes = (PROG.profilePresentationNodes && PROG.profilePresentationNodes.data && PROG.profilePresentationNodes.data.nodes) || {};
    const sealList = Object.keys(PDB.seals).filter(h => nodes[h] && nodes[h].completionValue > 0).map(h => Object.assign({ h, p: nodes[h].progressValue || 0, c: nodes[h].completionValue }, PDB.seals[h]));
    const open = sealList.filter(s => s.p < s.c).sort((a, b) => b.p / b.c - a.p / a.c), done = sealList.filter(s => s.p >= s.c);
    const SEALS_SHOWN = 8, shownSeals = sealsAll ? open : open.slice(0, SEALS_SHOWN);
    const sealsHtml = '<section class="pg-section" aria-labelledby="pg-h-seals"><h2 class="dlg-label" id="pg-h-seals">Seals</h2>' +
      (open.length ? '<div class="pg-seals" id="pg-seal-list">' + shownSeals.map(s => '<div class="pg-seal">' + (s.i ? '<img src="' + esc(img(s.i)) + '" alt="" width="40" height="40" loading="lazy">' : "") +
        '<div><b>' + esc(s.n) + "</b>" + (s.title && s.title !== s.n ? '<small>Title: ' + esc(s.title) + "</small>" : "") + '<span class="pg-sub">' + s.p + " of " + s.c + " triumphs · " + pct(s.p, s.c) + "%</span>" + barHtml(s.p, s.c) + "</div></div>").join("") + "</div>" +
        (open.length > SEALS_SHOWN ? '<button type="button" class="act-btn" id="pg-seals-more" aria-expanded="' + sealsAll + '" aria-controls="pg-seal-list">' + (sealsAll ? "Show fewer" : "Show all " + open.length + " seals in progress") + "</button>" : "")
        : '<p class="muted">No seals in progress.</p>') +
      (done.length ? '<p class="pg-sub pg-done-seals">Done: ' + done.map(s => esc(s.title || s.n)).join(", ") + "</p>" : "") + "</section>";
    box.innerHTML = '<div class="pg-top"><span class="pg-sub">' + (progLoading ? "Refreshing…" : "Updated " + new Date(progAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })) + '</span><button type="button" class="act-btn" id="pg-refresh">Refresh progress</button></div>' +
      season + milestones + pursuitsHtml + sealsHtml;
    $("pg-refresh").addEventListener("click", () => renderProgress(true));
    box.querySelectorAll("[data-pg-owner]").forEach(b => b.addEventListener("click", () => { progFocus = b.dataset.pgOwner; drawProgress(); box.querySelector('[data-pg-owner="' + progFocus + '"]').focus(); }));
    const more = $("pg-seals-more"); if (more) more.addEventListener("click", () => { sealsAll = !sealsAll; drawProgress(); $("pg-seals-more").focus(); });
    if (refocus){ const t = box.querySelector(refocus); if (t) t.focus(); }
  }

  // ---------------- status panels ----------------
  function showStatus(html){ $("locker-status").innerHTML = html ? '<div class="locker-panel panel-card">' + html + "</div>" : ""; }
  function showSignedOut(){
    showStatus(
      "<p>Sign in with Bungie.net to see your weapons and armor here, matched against our God Rolls and armor sets. Rally Flag only moves or equips something when you press a button. Your Favorite/Junk tags and saved loadouts are kept in this browser and under your Bungie account, so they're on every device where you sign in (see <a href=\"" + PUBLIC_SITE + "privacy.html\"" + NEW_TAB + ">Privacy" + NEW_TAB_NOTE + "</a>).</p>" +
      '<div class="locker-actions"><button class="locker-btn" type="button" id="locker-signin">Sign in with Bungie.net</button>' +
      '<a class="locker-btn ghost" href="locker.html?demo">Try it with sample data</a></div>');
    $("locker-signin").addEventListener("click", () => RallyFlagAuth.signIn());
  }
  const steps = [];
  let loadFailed = false; // once the error shows, late progress mustn't replace it
  function step(text, done){
    if (loadFailed) return;
    if (done && steps.length) steps[steps.length - 1].done = true;
    if (text) steps.push({ text, done: false });
    showStatus('<ul class="locker-steps">' + steps.map(s => '<li class="' + (s.done ? "done" : "") + '">' + esc(s.text) + "</li>").join("") + "</ul>");
  }
  function showError(message){
    loadFailed = true;
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
    if (data && data.ErrorStatus === "SystemDisabled") throw new Error(FRIENDLY.SystemDisabled);
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
    OWNERS = order.filter(id => chars[id]).map(id => ({ id, played: Date.parse(chars[id].dateLastPlayed) || 0, cls: chars[id].classType, name: CLASS_NAMES[chars[id].classType] || "Guardian", light: chars[id].light, stats: chars[id].stats || {}, bg: chars[id].emblemBackgroundPath, emblem: chars[id].emblemPath }));
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
    // Every item instance -> its definition hash (in-game loadouts list
    // instance ids, including subclasses, which aren't Locker gear).
    INSTANCE_HASH = new Map();
    for (const it of (data(PROFILE, "profileInventory").items || []).concat(
      ...Object.values(data(PROFILE, "characterInventories")).map(c => c.items || []),
      ...Object.values(data(PROFILE, "characterEquipment")).map(c => c.items || [])))
      if (it.itemInstanceId) INSTANCE_HASH.set(String(it.itemInstanceId), it.itemHash);
    // A weapon or armor piece as the Locker models it, or null.
    const gearItem = (it, owner, equipped) => {
      const def = DB.items[it.itemHash];
      if (!def || (def.t !== 2 && def.t !== 3) || !BUCKET_BY_HASH.has(def.b) || !it.itemInstanceId) return null;
      const inst = instances[it.itemInstanceId] || {};
      const plugs = ((sockets[it.itemInstanceId] && sockets[it.itemInstanceId].sockets) || []).map(s => s.plugHash || 0);
      const alts = (reusable[it.itemInstanceId] && reusable[it.itemInstanceId].plugs) || {};
      const item = {
        id: it.itemInstanceId, hash: it.itemHash, def, owner, equipped, state: it.state || 0, tier: inst.gearTier || 0,
        power: (inst.primaryStat && inst.primaryStat.value) || 0,
        damage: inst.damageTypeHash || def.d || 0,
        plugs, alts, stats: (stats[it.itemInstanceId] && stats[it.itemInstanceId].stats) || {},
        // Bungie names the applied ornament on the item; the socket says the same.
        ornament: it.overrideStyleItemHash || plugs.find(isOrnament) || 0,
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
      item.text = (def.n + " " + (def.y || "") + " " + plugs.map(h => DB.items[h] && !isOrnamentPlug(h) ? DB.items[h].n : "").join(" ") +
        (item.ornament && DB.items[item.ornament] ? " " + DB.items[item.ornament].n : "")).toLowerCase();
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
    if (!OWNERS.some(o => o.id === state.focus) && state.focus !== "vault")
      state.focus = (OWNERS.slice().sort((a, b) => b.played - a.played)[0] || {}).id || "vault";
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

  // The header (search + cards) stays pinned to the top while scrolling.
  // Its height feeds scroll-padding-top, so focus never hides under it.
  let headWatched = false;
  function pinWatch(){
    if (headWatched || !window.ResizeObserver) return;
    headWatched = true;
    new ResizeObserver(([e]) => document.documentElement.style.setProperty("--head-h", Math.round(e.target.getBoundingClientRect().height) + "px")).observe($("locker-head"));
  }
  function renderOwners(){
    const counts = id => ITEMS.filter(i => i.owner === id).length;
    // Phones and tablets: the cards pick whose gear shows. Wide screens show
    // everyone, so the cards are plain panels (still drop targets).
    const wide = isWide();
    const open = (cls, id) => wide ? '<div class="owner-card' + cls + '" data-owner="' + id + '"' : '<button type="button" class="owner-card' + cls + '" data-owner="' + id + '" aria-pressed="' + (id === state.focus) + '"';
    const close = wide ? "</div>" : "</button>";
    const icon = (path, alt) => path ? '<img src="' + esc(img(path)) + '" alt="' + esc(alt) + '" width="14" height="14">' : esc(alt) + " ";
    const statRow = o => {
      const hs = ARMOR_STATS.filter(h => o.stats[h] != null);
      return hs.length ? '<span class="owner-stats">' + hs.map(h => '<span class="ostat">' + icon((DB.statIcons || {})[h], DB.stats[h] || "") + o.stats[h] + "</span>").join("") + "</span>" : "";
    };
    // Vault space: Bungie's counts for everything that isn't gear, plus the
    // Locker's own gear count (which already includes this session's moves).
    const raw = data(PROFILE, "profileInventory").items || [], gearIds = new Set(ITEMS.map(i => i.id));
    const space = VAULT_SPACE.map(([h, label, short]) => {
      const cap = DB.buckets && DB.buckets[h] && DB.buckets[h].c;
      const n = raw.filter(i => i.bucketHash === h && !gearIds.has(i.itemInstanceId)).length + (h === 138197802 ? counts("vault") : 0);
      return cap ? { label, short, n, cap } : null;
    }).filter(Boolean);
    const money = (data(PROFILE, "profileCurrencies").items || []).filter(c => DB.items[c.itemHash])
      .map(c => '<span class="ostat">' + icon(DB.items[c.itemHash].i, DB.items[c.itemHash].n) + c.quantity.toLocaleString() + "</span>").join("");
    const vaultMeta = space.length
      ? space.map((x, k) => '<span class="' + (k ? "vs-more" : "vs") + '">' + (k ? " · " : "") + '<span class="owner-pw">' + (x.short === x.label ? x.label : '<span aria-hidden="true">' + x.short + '</span><span class="sr-only">' + x.label + "</span>") + " </span>" + x.n + "/" + x.cap + "</span>").join("")
      : counts("vault") + " items";
    const cards = OWNERS.map(o =>
      open("", o.id) + ' style="background-image:url(\'' + esc(img(o.bg)) + '\')">' +
        '<span class="owner-name">' + esc(o.name) + '</span><span class="owner-meta"><span class="owner-pw">Power </span>' + esc(o.light) + '<span class="owner-items"> · Max ' + fmtPower(maxPowerPlan(o.id).power) + " · " + counts(o.id) + " items</span></span>" + statRow(o) + close
    ).concat([
      open(" vault", "vault") + '><span class="owner-name">Vault</span><span class="owner-meta">' + vaultMeta + "</span>" +
        (money ? '<span class="owner-stats">' + money + "</span>" : "") + close
    ]);
    $("owner-grid").setAttribute("aria-label", wide ? "Your characters and vault" : "Show gear for");
    pinWatch();
    $("owner-grid").innerHTML = cards.join("");
    renderFarm();
    renderJunk();
    renderLoadoutCount();
    if (loadoutsShown()) renderLoadouts();
  }

  // ---------------- junk cleanup ----------------
  // Send the vault's Junk-tagged items to a character to dismantle in game.
  // Fills only that character's free spaces per slot; the rest wait in the vault.
  function junkPlan(charId){
    const moves = [];
    let left = 0;
    for (const b of BUCKETS){
      const junk = ITEMS.filter(i => i.owner === "vault" && TAGS[i.id] === "junk" && i.def.b === b.hash);
      const free = INVENTORY_CAP - ITEMS.filter(i => i.owner === charId && !i.equipped && i.def.b === b.hash).length;
      const n = Math.max(0, Math.min(free, junk.length));
      moves.push(...junk.slice(0, n));
      left += junk.length - n;
    }
    return { moves, left };
  }
  // Which items to send to the vault first when a slot needs room (farming,
  // loadouts): junk, then unlocked, then non-favourites, then lowest Power.
  const spareFirst = (x, y) => ((TAGS[y.id] === "junk") - (TAGS[x.id] === "junk")) || ((x.state & STATE_LOCKED) - (y.state & STATE_LOCKED)) ||
    (/^(favorite|keep)$/.test(TAGS[x.id] || "") - /^(favorite|keep)$/.test(TAGS[y.id] || "")) || (x.power - y.power);

  // ---------------- loadouts + max Power ----------------
  // A loadout is the 8 weapon/armor items a character had equipped, saved in
  // this browser per Bungie account (like tags). Equipping one, or a
  // character's max Power set, moves each item over (sending a spare to the
  // vault when a slot is full), then equips Legendaries before Exotics so
  // the one-Exotic rule can't block a swap. Subclass and mods aren't
  // included yet.
  const loadoutKey = () => "rallyflag_locker_loadouts:" + (PROFILE_PATH.split("/").pop() || "demo");
  function readLoadouts(){ try { return JSON.parse(localStorage.getItem(loadoutKey()) || "[]"); } catch (e){ return []; } }
  function setLoadoutsRaw(list){ try { localStorage.setItem(loadoutKey(), JSON.stringify(list)); } catch (e){} }
  // Every change stamps the loadouts it touched (`at`) and notes deletions,
  // so copies from two devices can be merged (see sync below).
  const sansAt = lo => { const c = Object.assign({}, lo); delete c.at; return JSON.stringify(c); };
  function writeLoadouts(list){
    const old = readLoadouts(), oldBy = new Map(old.map(x => [x.id, x])), now = Date.now();
    const out = list.map(lo => { const prev = oldBy.get(lo.id); return Object.assign({}, lo, { at: prev && sansAt(prev) === sansAt(lo) ? prev.at || 1 : now }); });
    const meta = readSyncMeta();
    for (const x of old) if (!out.some(y => y.id === x.id)) meta.deleted[x.id] = now;
    for (const x of out) if (meta.deleted[x.id] && meta.deleted[x.id] < x.at) delete meta.deleted[x.id];
    meta.dirty = true;
    setLoadoutsRaw(out); writeSyncMeta(meta);
    syncGen++; schedulePush();
  }

  // ---------------- loadout and tag sync ----------------
  // Signed-in players' loadouts and Favorite/Junk tags also live on Rally Flag's sync service (a
  // Cloudflare Worker + D1 database, tools/sync-worker), under their
  // Destiny account, so clearing site data or switching devices keeps
  // them. This browser's copy stays the working copy; changes go up a
  // moment later, and the service's copy is merged in on load and when
  // the tab comes back. Merge: per loadout the newest `at` wins, and a
  // deletion wins over anything older than it; per item, the newest tag
  // change wins (a removal is a change too).
  const SYNC_HOST = "https://rallyflag-sync.rallyflag.workers.dev/";
  const SYNC_KEEP_DELETED = 60 * 24 * 3600 * 1000;
  const syncMetaKey = () => "rallyflag_locker_loadouts_sync:" + (PROFILE_PATH.split("/").pop() || "demo");
  function readSyncMeta(){ try { return Object.assign({ version: 0, deleted: {}, dirty: false }, JSON.parse(localStorage.getItem(syncMetaKey()) || "{}")); } catch (e){ return { version: 0, deleted: {}, dirty: false }; } }
  function writeSyncMeta(m){ try { localStorage.setItem(syncMetaKey(), JSON.stringify(m)); } catch (e){} }
  let syncGen = 0, syncTimerLo = 0, syncBusy = false, syncPulledAt = 0;
  let SYNC = { state: DEMO ? "demo" : "off", at: 0, msg: "" };
  const syncOn = () => !DEMO && !!PROFILE_PATH && window.RallyFlagAuth && RallyFlagAuth.isSignedIn();
  // Tags as synced: itemId -> { t: "favorite" | "junk" | "" (removed), at }.
  function readTagState(){
    const out = {};
    for (const id in TAG_AT) out[id] = id.startsWith("wish:") ? { w: WISHES[id.slice(5)] || [], at: TAG_AT[id] } : { t: TAGS[id] || "", n: NOTES[id] || "", u: USE[id] || "", at: TAG_AT[id] };
    for (const name in WISHES) if (!out["wish:" + name]) out["wish:" + name] = { w: WISHES[name], at: 1 };
    for (const id in TAGS) if (!out[id]) out[id] = { t: TAGS[id], n: NOTES[id] || "", u: USE[id] || "", at: 1 }; // tagged before tags synced
    return out;
  }
  function writeTagState(map){
    for (const id of Object.keys(TAGS)) if (!map[id] || !map[id].t) delete TAGS[id];
    for (const id of Object.keys(NOTES)) if (!map[id] || !map[id].n) delete NOTES[id];
    for (const id of Object.keys(USE)) if (!map[id] || !map[id].u) delete USE[id];
    for (const name of Object.keys(WISHES)){ const r = map["wish:" + name]; if (!r || !r.w || !r.w.length) delete WISHES[name]; }
    for (const id of Object.keys(TAG_AT)) delete TAG_AT[id];
    for (const id in map){ if (map[id].t) TAGS[id] = map[id].t; if (map[id].n) NOTES[id] = map[id].n; if (map[id].u) USE[id] = map[id].u; if (map[id].w && map[id].w.length) WISHES[id.slice(5)] = map[id].w; TAG_AT[id] = map[id].at; }
    saveTags();
  }
  function mergeTags(a, b){
    const out = Object.assign({}, a), cut = Date.now() - SYNC_KEEP_DELETED;
    for (const id in b) if (!out[id] || (b[id].at || 0) > (out[id].at || 0)) out[id] = b[id];
    for (const id in out) if (!out[id].t && !out[id].n && !out[id].u && !(out[id].w && out[id].w.length) && out[id].at < cut) delete out[id];
    return out;
  }
  const tagKey = tags => JSON.stringify(Object.keys(tags).sort().map(id => id + ":" + tags[id].t + ":" + (tags[id].n || "") + ":" + (tags[id].u || "") + ":" + JSON.stringify(tags[id].w || []) + ":" + tags[id].at));
  function tagsChanged(){ const m = readSyncMeta(); m.dirty = true; writeSyncMeta(m); syncGen++; schedulePush(); }
  const localState = () => ({ loadouts: readLoadouts(), deleted: readSyncMeta().deleted, tags: readTagState() });
  const serverState = d => ({ loadouts: d.loadouts || [], deleted: d.deleted || {}, tags: d.tags || {} });
  function mergeLoadouts(a, b){
    const deleted = Object.assign({}, a.deleted);
    for (const id in b.deleted) deleted[id] = Math.max(deleted[id] || 0, b.deleted[id]);
    const by = new Map();
    for (const lo of a.loadouts.concat(b.loadouts)){ const cur = by.get(lo.id); if (!cur || (lo.at || 0) > (cur.at || 0)) by.set(lo.id, lo); }
    const cut = Date.now() - SYNC_KEEP_DELETED;
    for (const id in deleted) if (deleted[id] < cut) delete deleted[id];
    // Keep this browser's order; loadouts new from the other copy go last.
    const order = [...new Set(a.loadouts.concat(b.loadouts).map(lo => lo.id))];
    const loadouts = order.map(id => by.get(id)).filter(lo => !(deleted[lo.id] >= (lo.at || 0)));
    return { loadouts, deleted, tags: mergeTags(a.tags || {}, b.tags || {}) };
  }
  const sameSet = (a, b) => JSON.stringify(a.loadouts.map(x => x.id + ":" + x.at).sort()) === JSON.stringify(b.loadouts.map(x => x.id + ":" + x.at).sort()) &&
    JSON.stringify(Object.keys(a.deleted).sort()) === JSON.stringify(Object.keys(b.deleted).sort()) && tagKey(a.tags || {}) === tagKey(b.tags || {});
  function setSync(state, msg){
    SYNC = { state, at: state === "ok" ? Date.now() : SYNC.at, msg: msg || "" };
    // After a failure, try again in a minute (and whenever the tab comes back).
    if (state === "error"){ clearTimeout(syncTimerLo); syncTimerLo = setTimeout(() => readSyncMeta().dirty ? pushLoadouts() : pullLoadouts(), 60000); }
    const el = $("lo-sync");
    if (el) el.textContent = syncText();
  }
  function syncText(){
    if (SYNC.state === "demo") return "Sample data: kept in this browser only.";
    if (SYNC.state === "saving") return "Syncing…";
    if (SYNC.state === "ok") return "Synced to your Bungie account.";
    if (SYNC.state === "error") return SYNC.msg + " They're still saved in this browser, and syncing will try again.";
    return "";
  }
  // kind: "loadouts" (sync) or "shares" (this account's share links).
  async function syncFetch(method, body, kind = "loadouts"){
    const token = RallyFlagAuth.peekAccessToken();
    if (!token) throw new Error(kind === "shares" ? "Sign in again to use share links." : "Sign in again to sync your loadouts.");
    let res;
    try {
      res = await fetch(SYNC_HOST + kind + "/" + PROFILE_PATH.split("/").pop(), { method, headers: Object.assign({ "Authorization": "Bearer " + token }, body ? { "Content-Type": "application/json" } : {}), body: body ? JSON.stringify(body) : undefined });
    } catch (e){ throw new Error("Couldn't reach Rally Flag's sync service."); }
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) return { conflict: true, data };
    if (!res.ok) throw new Error(data.error || "Syncing failed (HTTP " + res.status + ").");
    return { data };
  }
  // Puts the merged copy in this browser; redraws the tab if it changed.
  function adoptMerged(merged, version, dirty){
    const local = localState();
    const changed = !sameSet(local, merged), tagsMoved = tagKey(local.tags) !== tagKey(merged.tags || {});
    setLoadoutsRaw(merged.loadouts);
    if (tagsMoved) writeTagState(merged.tags || {});
    writeSyncMeta({ version, deleted: merged.deleted, dirty });
    if (tagsMoved) render(); // tiles, filters and junk counts show tags
    else if (changed){ renderLoadoutCount(); if (loadoutsShown()) renderLoadouts(); }
  }
  async function pullLoadouts(){
    if (!syncOn() || syncBusy) return;
    syncBusy = true; setSync("saving");
    try {
      const { data } = await syncFetch("GET");
      syncPulledAt = Date.now();
      const server = serverState(data);
      const local = erasedElsewhere(data.version || 0) ? { loadouts: [], deleted: {}, tags: {} } : localState();
      const merged = mergeLoadouts(local, server);
      const ahead = !sameSet(merged, server);
      adoptMerged(merged, data.version || 0, ahead);
      syncBusy = false;
      if (ahead) await pushLoadouts(); else setSync("ok");
    } catch (e){ syncBusy = false; setSync("error", e.message); }
  }
  async function pushLoadouts(){
    if (!syncOn() || syncBusy) return;
    if (!readSyncMeta().dirty){ if (SYNC.state === "saving") setSync("ok"); return; }
    syncBusy = true; setSync("saving");
    try {
      for (let tries = 0; tries < 4; tries++){
        const gen = syncGen, meta = readSyncMeta();
        const r = await syncFetch("PUT", { base: meta.version, loadouts: readLoadouts(), deleted: meta.deleted, tags: readTagState() });
        if (r.conflict){
          // Another device saved first: merge its copy in and try again.
          const server = serverState(r.data);
          if (erasedElsewhere(r.data.version || 0)){ adoptMerged(server, r.data.version || 0, false); syncBusy = false; return setSync("ok"); }
          adoptMerged(mergeLoadouts(localState(), server), r.data.version || 0, true);
          continue;
        }
        const m = readSyncMeta(); m.version = r.data.version; m.dirty = gen !== syncGen; writeSyncMeta(m);
        syncBusy = false;
        if (m.dirty) return schedulePush();
        return setSync("ok");
      }
      throw new Error("Couldn't save: your loadouts kept changing on another device.");
    } catch (e){ syncBusy = false; setSync("error", e.message); }
  }
  // The service's copy is older than one this browser already synced:
  // the player deleted their synced loadouts and tags on another device
  // (the row starts again from version 0). Clear them here too instead of
  // uploading them again.
  function erasedElsewhere(version){
    if (version >= readSyncMeta().version) return false;
    setLoadoutsRaw([]); writeTagState({}); writeSyncMeta({ version: 0, deleted: {}, dirty: false });
    render();
    toast("Your saved loadouts and tags were deleted on another device, so they've been removed here too.", "ok");
    return true;
  }
  // "Delete my saved loadouts and tags": the sync service's copy first (so
  // a failure leaves everything as it was), then this browser's.
  async function eraseLoadouts(){
    clearTimeout(syncTimerLo);
    if (syncOn()) await syncFetch("DELETE");
    setLoadoutsRaw([]); writeTagState({}); writeSyncMeta({ version: 0, deleted: {}, dirty: false });
    syncGen++; loOpen = null; loReview = null;
  }
  function schedulePush(){ if (!syncOn()) return; clearTimeout(syncTimerLo); syncTimerLo = setTimeout(pushLoadouts, 1200); }
  // Coming back to the tab: send anything unsent, and pick up changes made
  // on other devices (at most once a minute).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !PROFILE_PATH) return;
    if (Date.now() - syncPulledAt > 60000) pullLoadouts(); else pushLoadouts();
  });

  // ---------------- share links ----------------
  // locker.html?share=<id> opens a copy of one saved loadout kept on the
  // sync service. Making a link needs a sign-in; opening one doesn't. The
  // copy is the loadout only (name, class, item hashes, subclass, artifact,
  // mod and cosmetic choices): no item instance ids, name or account, so
  // whoever opens it chooses their own copies. "Delete my share links"
  // removes every link this account made.
  const SHARE_ID = (new URLSearchParams(location.search).get("share") || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  const SHARES = { count: null, asked: false, made: null, confirm: false }; // made: { lo, url } for the open loadout
  const shareLink = id => location.origin + location.pathname + "?share=" + id;
  const shareable = lo => ({ name: lo.name, cls: lo.cls, items: lo.items.map(x => ({ hash: x.hash })), subclass: lo.subclass || null, artifact: lo.artifact || null, mods: lo.mods || [], cosmetics: lo.cosmetics || {} });
  async function makeShare(lo){
    const { data } = await syncFetch("POST", { loadout: shareable(lo) }, "shares");
    SHARES.count = null; SHARES.asked = false; // count again (sharing the same loadout twice keeps one link)
    return shareLink(data.id);
  }
  // How many links this account has, for "Delete my share links" (asked once per visit).
  async function countShares(){
    if (SHARES.asked || !syncOn()) return;
    SHARES.asked = true;
    try { SHARES.count = (await syncFetch("GET", null, "shares")).data.count || 0; } catch (e){ SHARES.count = null; return; }
    if (loadoutsShown()) renderLoadouts();
  }
  async function deleteShares(){
    const { data } = await syncFetch("DELETE", null, "shares");
    SHARES.count = 0; SHARES.made = null; SHARES.confirm = false;
    return data.deleted || 0;
  }
  async function fetchShare(id){
    let res;
    try { res = await fetch(SYNC_HOST + "share/" + encodeURIComponent(id)); }
    catch (e){ throw new Error("Couldn't reach Rally Flag's sync service to open the share link. Check your connection and try again."); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.loadout) throw new Error(data.error || "Couldn't open that share link (HTTP " + res.status + ").");
    return data.loadout;
  }
  const fromShare = (id, x) => Object.assign({}, x, { id: "share-" + id, items: x.items.map(i => ({ id: "", hash: i.hash })), share: { id } });
  // Signed in: the shared loadout goes straight to Choose your copies.
  async function openShare(){
    if (!SHARE_ID) return;
    history.replaceState(null, "", location.pathname + (DEMO ? "?demo" : "") + location.hash);
    let lo;
    try { lo = fromShare(SHARE_ID, await fetchShare(SHARE_ID)); }
    catch (e){ showView("loadouts"); toast(e.message, "error"); return; }
    startReview(lo, true);
    showView("loadouts");
    const h = $("lo-h-review"); if (h){ h.scrollIntoView({ block: "start" }); h.focus(); }
    toast("Opened " + lo.name + " from a share link. Choose your copies, then save.", "ok");
  }
  // Signed out: what's in it, by name (from Bungie's item definitions, one
  // small request per item), and a sign-in that comes back to this link.
  async function showSharePreview(){
    showStatus('<p>Loading the shared loadout…</p>');
    let lo;
    try { lo = await fetchShare(SHARE_ID); }
    catch (e){
      showStatus("<p>" + esc(e.message) + "</p>" + '<div class="locker-actions"><button class="locker-btn" type="button" id="locker-signin">Sign in to see your own gear</button></div>');
      $("locker-signin").addEventListener("click", () => RallyFlagAuth.signIn(location.pathname));
      return;
    }
    const hashes = lo.items.map(x => x.hash).concat(lo.subclass ? [lo.subclass.hash] : [], lo.artifact ? [lo.artifact.hash] : []);
    const defs = {};
    await Promise.all(hashes.map(async h => {
      try {
        const res = await fetch("https://www.bungie.net/Platform/Destiny2/Manifest/DestinyInventoryItemDefinition/" + h + "/", { headers: { "X-API-Key": window.RallyFlagAPI.BUNGIE_API_KEY } });
        const d = (await res.json()).Response;
        if (d) defs[h] = { n: d.displayProperties.name, i: d.displayProperties.icon, y: d.itemTypeDisplayName };
      } catch (e){}
    }));
    const row = h => { const d = defs[h] || {}; return '<li>' + (d.i ? '<img src="' + esc(img(d.i)) + '" alt="" width="40" height="40" loading="lazy">' : '<span class="share-noicon"></span>') + "<span><b>" + esc(d.n || "Item") + "</b><small>" + esc(d.y || "") + "</small></span></li>"; };
    const extras = [lo.subclass && lo.subclass.hash, lo.artifact && lo.artifact.hash].filter(Boolean);
    const mods = (lo.mods || []).length;
    showStatus('<h2 class="share-title">' + esc(lo.name) + "</h2>" +
      '<p class="share-sub">Shared loadout · ' + esc(lo.cls === 3 ? "Any class" : CLASS_NAMES[lo.cls] || "") + " · " + lo.items.length + " item" + (lo.items.length === 1 ? "" : "s") + (mods ? " · " + mods + " mod" + (mods === 1 ? "" : "s") : "") + "</p>" +
      '<ul class="share-items">' + lo.items.map(x => row(x.hash)).concat(extras.map(row)).join("") + "</ul>" +
      "<p>Sign in with Bungie.net to import it. You'll choose which of your own copies go in each slot, with their perks shown, before it's saved.</p>" +
      '<div class="locker-actions"><button class="locker-btn" type="button" id="locker-signin">Sign in to import</button>' +
      '<a class="locker-btn ghost" href="' + PUBLIC_SITE + 'privacy.html"' + NEW_TAB + ">Privacy" + NEW_TAB_NOTE + "</a></div>");
    $("locker-signin").addEventListener("click", () => RallyFlagAuth.signIn());
  }
  const gearPower = items => items.length === BUCKETS.length ? items.reduce((n, i) => n + i.power, 0) / items.length : null;
  const fmtPower = n => n == null ? "—" : (Math.round(n * 10) / 10).toFixed(1);
  const equippedOn = charId => BUCKETS.map(b => ITEMS.find(i => i.owner === charId && i.equipped && i.def.b === b.hash)).filter(Boolean);

  // The highest-Power item for every slot this character can use, from
  // anywhere, with at most one Exotic weapon and one Exotic armor piece.
  // Ties go to items already on this character (fewer moves), and away from
  // items equipped on another character.
  function maxPowerPlan(charId){
    const pool = ITEMS.filter(i => classOk(i, charId));
    const here = i => i.owner === charId, elsewhereEquipped = i => i.equipped && !here(i);
    const rank = (a, b) => b.power - a.power || (here(b) && b.equipped) - (here(a) && a.equipped) || here(b) - here(a) || elsewhereEquipped(a) - elsewhereEquipped(b);
    const items = [];
    for (const kind of ["weapons", "armor"]){
      const best = BUCKETS.filter(b => b.kind === kind).map(b => {
        const inSlot = pool.filter(i => i.def.b === b.hash).sort(rank);
        return { leg: inSlot.find(i => i.def.r !== 6) || null, exo: inSlot.find(i => i.def.r === 6) || null };
      });
      let pick = null, score = null;
      for (let ex = -1; ex < best.length; ex++){ // -1: no Exotic; k: the Exotic goes in slot k
        const set = best.map((b, k) => k === ex ? b.exo : b.leg);
        if (set.some(x => !x)) continue;
        const s2 = [set.reduce((n, i) => n + i.power, 0), -set.filter(i => !here(i)).length];
        if (!score || s2[0] > score[0] || (s2[0] === score[0] && s2[1] > score[1])){ score = s2; pick = set; }
      }
      items.push(...(pick || best.map(b => b.leg || b.exo).filter(Boolean)));
    }
    return { items, power: gearPower(items) };
  }

  async function makeRoom(charId, bucket, keep){
    const inv = ITEMS.filter(i => i.owner === charId && !i.equipped && i.def.b === bucket);
    if (inv.length < INVENTORY_CAP) return;
    const spare = inv.filter(i => !keep.has(i.id)).sort(spareFirst)[0];
    if (!spare) throw new Error("Your " + ownerLabel(charId) + " has no room in that slot. Move something to the vault first.");
    await moveTo(spare, "vault");
  }
  async function equipSet(items, charId){
    const keep = new Set(items.map(i => i.id));
    for (const item of items){
      if (item.owner === charId) continue;
      await makeRoom(charId, item.def.b, keep);
      await moveTo(item, charId);
    }
    for (const item of items.slice().sort((a, b) => (a.def.r === 6) - (b.def.r === 6)))
      if (!item.equipped) await equipCall(item, charId);
  }

  // In-game loadouts (component 206): the 10 slots each character has in
  // Destiny. Empty slots have no items. Applying one moves any missing
  // weapons/armor onto the character first (as our own loadouts do), then
  // asks Bungie to equip it, which also sets its subclass and mods.
  function gameLoadouts(charId){
    const raw = (data(PROFILE, "characterLoadouts")[charId] || {}).loadouts || [];
    const L = (DB && DB.loadouts) || { names: {}, icons: {}, colors: {} };
    return raw.map((lo, index) => {
      const all = (lo.items || []).map(x => String(x.itemInstanceId)).filter(id => id && id !== "0");
      // Loadouts hold the subclass (and may hold the artifact); they aren't
      // Locker gear, so the subclass is checked on its own.
      const isSub = id => { const d = DB.items[INSTANCE_HASH.get(id)]; return !!d && /Subclass$/.test(d.y || ""); };
      const isArt = id => { const d = DB.items[INSTANCE_HASH.get(id)]; return !!d && d.y === "Artifact"; };
      const ids = all.filter(id => !isSub(id) && !isArt(id)), sub = all.find(isSub) || "";
      // The ornament the loadout puts on each item (0 = the default look);
      // items whose loadout entry has no ornament plug aren't checked.
      const orn = new Map();
      for (const x of lo.items || []){
        const h = (x.plugItemHashes || []).find(isOrnamentPlug);
        if (h) orn.set(String(x.itemInstanceId), isOrnament(h) ? h : 0);
      }
      return { index, ids, sub, orn, nameHash: lo.nameHash, iconHash: lo.iconHash, colorHash: lo.colorHash,
        name: L.names[lo.nameHash] || "Loadout " + (index + 1), icon: L.icons[lo.iconHash] || "", color: L.colors[lo.colorHash] || "",
        missing: ids.filter(id => !INSTANCE_HASH.has(id)).length, empty: !all.length };
    });
  }
  // Name, icon and colour of an in-game loadout: Destiny only offers its
  // own lists (DIM works the same way), set with UpdateLoadoutIdentifiers.
  let gameEditing = null; // { key, charId, index, nameHash, iconHash, colorHash }
  function patchGameIdentifiers(charId, index, ids){
    const lo = ((data(PROFILE, "characterLoadouts")[charId] || {}).loadouts || [])[index];
    if (lo) Object.assign(lo, ids);
  }
  async function updateGameIdentifiers(charId, index, ids){
    await post("Loadouts/UpdateLoadoutIdentifiers", Object.assign({ loadoutIndex: index, characterId: charId }, ids));
    patchGameIdentifiers(charId, index, ids);
    remember([["glo:" + charId + ":" + index, ids]]);
  }
  // Save what the character wears into a slot (Destiny's own Snapshot:
  // weapons, armor, subclass and mods), or clear a slot. The profile copy
  // is updated here and journalled until Bungie's catches up.
  function setGameSlot(charId, index, lo){
    const list = ((data(PROFILE, "characterLoadouts")[charId] || {}).loadouts || []);
    if (list[index]) list[index] = lo;
  }
  async function snapshotGameLoadout(charId, index, ids){
    await post("Loadouts/SnapshotLoadout", Object.assign({ loadoutIndex: index, characterId: charId }, ids));
    const sc = subclassesOf(charId).find(x => x.equipped);
    const items = equippedOn(charId).map(i => ({ itemInstanceId: i.id, plugItemHashes: plugsOf(i.id) }))
      .concat(sc ? [{ itemInstanceId: sc.id, plugItemHashes: plugsOf(sc.id) }] : []);
    const lo = Object.assign({}, ids, { items });
    setGameSlot(charId, index, lo); remember([["gls:" + charId + ":" + index, { lo }]]);
  }
  async function clearGameLoadout(charId, index){
    await post("Loadouts/ClearLoadout", { loadoutIndex: index, characterId: charId });
    const cur = ((data(PROFILE, "characterLoadouts")[charId] || {}).loadouts || [])[index] || {};
    const lo = { colorHash: cur.colorHash, iconHash: cur.iconHash, nameHash: cur.nameHash, items: [] };
    setGameSlot(charId, index, lo); remember([["gls:" + charId + ":" + index, { lo }]]);
  }
  function gameEditorHtml(o, lo){
    const L = DB.loadouts, ed = gameEditing, order = L.order || {};
    const list = (kind, map) => (order[kind] && order[kind].length ? order[kind] : Object.keys(map).map(Number)).filter(h => map[h]);
    const swatches = (kind, map, cur, label) => '<div class="ge-swatches" role="group" aria-label="' + label + '">' +
      list(kind, map).map((h, k) => '<button type="button" class="ge-swatch" data-ge-' + kind + '="' + h + '" aria-pressed="' + (h === cur) + '" aria-label="' + label + " " + (k + 1) + '">' +
        '<img src="' + esc(img(map[h])) + '" alt="" width="32" height="32" loading="lazy"></button>').join("") + "</div>";
    return '<form class="ge-editor" data-ge-form="' + ed.key + '">' +
      '<div class="ge-preview" aria-hidden="true">' + loBadge(L.icons[ed.iconHash], L.colors[ed.colorHash]) + "<b>" + esc(L.names[ed.nameHash] || lo.name) + "</b></div>" +
      '<label class="lo-name"><span>Name</span><select id="ge-name">' + list("names", L.names).map(h => '<option value="' + h + '"' + (h === ed.nameHash ? " selected" : "") + ">" + esc(L.names[h]) + "</option>").join("") + "</select></label>" +
      '<div class="ge-label">Icon</div>' + swatches("icons", L.icons, ed.iconHash, "Icon") +
      '<div class="ge-label">Colour</div>' + swatches("colors", L.colors, ed.colorHash, "Colour") +
      '<div class="act-row"><button type="submit" class="act-btn">' + (ed.mode === "snapshot" ? "Save " + esc(o.name) + "'s current gear here" : "Save in Destiny") + '<span class="sr-only"> (' + esc(o.name) + " loadout " + (lo.index + 1) + ")</span></button>" +
        '<button type="button" class="act-btn" data-ge-cancel>Cancel</button></div></form>';
  }

  async function equipGameLoadout(charId, lo){
    const gear = lo.ids.map(id => ITEMS.find(i => i.id === id)).filter(Boolean);
    const keep = new Set(gear.map(i => i.id));
    for (const item of gear){
      if (item.owner === charId) continue;
      await makeRoom(charId, item.def.b, keep);
      await moveTo(item, charId);
    }
    await post("Loadouts/EquipLoadout", { loadoutIndex: lo.index, characterId: charId });
    for (const item of gear) if (lo.orn.has(item.id)) item.ornament = lo.orn.get(item.id);
    if (lo.sub && subclassesOf(charId).some(x => x.id === lo.sub && !x.equipped)){ patchSubclass(charId, lo.sub); remember([["sc:" + charId, { id: lo.sub }]]); }
    // Bungie equipped the whole set: show it now (the auto-sync confirms it).
    for (const item of gear){
      for (const i of ITEMS) if (i.owner === charId && i.equipped && i.def.b === item.def.b) i.equipped = false;
      item.equipped = true;
    }
    rememberItems(ITEMS.filter(i => i.owner === charId));
  }
  // Loadouts show as a grid of name tiles (like DIM); tapping one opens its
  // items and buttons under the grid, tapping it again closes them. One open
  // at a time, kept across redraws so an equip doesn't fold it away.
  let loOpen = null;
  function loGrid(group, entries){
    const open = entries.find(e => e.key === loOpen);
    return '<div class="lo-grid">' + entries.map(e =>
      '<button type="button" class="lo-tile' + (e.empty ? " empty" : "") + (e.gone ? " warn" : e.on ? " on" : "") + '" data-lo-pick="' + esc(e.key) + '" aria-expanded="' + (e === open) + '" aria-controls="lo-detail-' + group + '">' +
        e.badge + '<span class="lo-tile-name">' + esc(e.name) + (e.on ? '<span class="sr-only"> (equipped now)</span>' : "") + "</span>" +
        (e.on && !e.gone ? '<span class="lo-check" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="8"/><path d="M4.5 8.2l2.3 2.3 4.7-4.9" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' : "") + "</button>").join("") + "</div>" +
      '<div class="lo-detail" id="lo-detail-' + group + '"' + (open ? "" : " hidden") + ">" + (open ? open.detail : "") + "</div>";
  }
  function loBadge(icon, color){
    return '<span class="lo-badge" aria-hidden="true"' + (color ? ' style="background-image:url(\'' + esc(img(color)) + '\')"' : "") + ">" + (icon ? '<img src="' + esc(img(icon)) + '" alt="" width="28" height="28" loading="lazy">' : "") + "</span>";
  }
  function gameSection(){
    const byId = new Map(ITEMS.map(i => [i.id, i]));
    const ornName = h => h ? (DB.items[h] ? DB.items[h].n : "an unknown ornament") : "the default look";
    const groups = OWNERS.map(o => {
      const list = gameLoadouts(o.id);
      if (!list.length) return "";
      return '<div class="lo-owner">' + esc(o.name) + "</div>" + loGrid("g" + o.id, list.map(lo => {
        const key = o.id + ":" + lo.index, editing = gameEditing && gameEditing.key === key;
        if (lo.empty){
          // An empty slot opens straight into "save what you wear here".
          if (loOpen === "g-" + o.id + "-" + lo.index && !editing) gameEditing = { key, charId: o.id, index: lo.index, nameHash: lo.nameHash, iconHash: lo.iconHash, colorHash: lo.colorHash, mode: "snapshot" };
          return { key: "g-" + o.id + "-" + lo.index, name: "Empty slot " + (lo.index + 1), empty: true, badge: '<span class="lo-badge lo-badge-empty" aria-hidden="true">+</span>',
            detail: '<p class="lo-status muted">Empty slot. Save what your ' + esc(o.name) + " is wearing now (weapons, armor, subclass and mods) into it, with a name, icon and colour from Destiny's lists.</p>" +
              (gameEditing && gameEditing.key === key ? gameEditorHtml(o, lo) : "") };
        }
        // Is it on? Which items are equipped on this character, and which
        // carry the ornament the loadout sets (Destiny applies those too).
        const gear = lo.ids.map(id => byId.get(id)).filter(Boolean);
        const worn = gear.filter(i => i.owner === o.id && i.equipped).length;
        const ornOff = gear.filter(i => lo.orn.has(i.id) && (i.ornament || 0) !== lo.orn.get(i.id));
        const checked = gear.filter(i => lo.orn.has(i.id)).length;
        const mini = id => {
          const i = byId.get(id), d = DB.items[INSTANCE_HASH.get(id)] || {}, icon = i ? iconOf(i) : d.i;
          const off = i && ornOff.includes(i);
          const tip = i ? d.n + (lo.orn.has(id) ? " · " + (off ? "wants " + ornName(lo.orn.get(id)) + ", has " + ornName(i.ornament) : "ornament matches") : "") : "Not found";
          return '<span class="lo-mini' + (INSTANCE_HASH.has(id) ? "" : " gone") + (off ? " orn-off" : "") + '" title="' + esc(tip) + '">' + (icon ? '<img src="' + esc(img(icon)) + '" alt="" width="32" height="32" loading="lazy">' : "") + "</span>";
        };
        const subOn = !lo.sub || subclassesOf(o.id).some(x => x.id === lo.sub && x.equipped);
        const status = "Equipped " + worn + " of " + lo.ids.length + (lo.sub ? " · subclass " + (subOn ? "on" : "not on") : "") + (checked ? " · ornaments " + (checked - ornOff.length) + " of " + checked + " match" : "");
        return {
        key: "g-" + o.id + "-" + lo.index, name: lo.name, gone: lo.missing, on: !lo.missing && worn === lo.ids.length && !ornOff.length && subOn, badge: loBadge(lo.icon, lo.color),
        detail: '<div class="lo-main"><b>' + esc(lo.name) + "</b>" + (lo.missing ? ' <span class="muted">· ' + lo.missing + " not found</span>" : "") + "</div>" +
          '<div class="lo-items" aria-hidden="true">' + lo.ids.map(mini).join("") + "</div>" +
          '<p class="lo-status">' + esc(status) + (ornOff.length ? '<span class="muted"> · wrong ornament: ' + esc(ornOff.map(i => i.def.n).join(", ")) + "</span>" : "") + "</p>" +
          (editing ? gameEditorHtml(o, lo) : "") +
          '<div class="act-row"><button type="button" class="act-btn" data-game-lo="' + lo.index + '" data-to="' + o.id + '">Equip<span class="sr-only"> ' + esc(lo.name) + " on your " + esc(o.name) + "</span></button>" +
            (editing ? "" : '<button type="button" class="act-btn" data-game-edit="' + key + '">Edit name &amp; look<span class="sr-only"> of ' + esc(lo.name) + "</span></button>" +
              '<button type="button" class="act-btn" data-game-snap="' + key + '">Replace with current gear<span class="sr-only"> (' + esc(lo.name) + ")</span></button>" +
              '<button type="button" class="act-btn" data-game-clear="' + key + '">Clear slot<span class="sr-only"> ' + esc(lo.name) + "</span></button>") + "</div>"
      }; }));
    }).join("");
    return groups || '<p class="muted">No in-game loadout slots found.</p>';
  }


  // A saved loadout item -> the item to use: that exact copy, or (for DIM
  // imports from someone else, or a copy since dismantled) your best copy of
  // the same item, preferring one already on the character.
  function loItem(x, charId){
    const exact = x.id && ITEMS.find(i => i.id === x.id);
    if (exact) return exact;
    return ITEMS.filter(i => i.hash === x.hash && (!charId || classOk(i, charId)))
      .sort((a, b) => b.power - a.power || (b.owner === charId) - (a.owner === charId))[0] || null;
  }

  // DIM loadouts: a dim.gg link goes through our Cloudflare Worker
  // (tools/dim-relay; dim.gg doesn't let browsers read it), an
  // app.destinyitemmanager.com link carries the loadout itself, and pasted
  // loadout JSON is read as is. Weapons, armor, subclass (with its super,
  // abilities, aspects and fragments), the artifact and its perks, armor
  // mods and per-slot shaders and ornaments are kept.
  const DIM_RELAY = "https://rallyflag-dim.rallyflag.workers.dev/";
  async function readDimLoadout(text){
    text = text.trim();
    let json = null;
    const inline = text.match(/[?&]loadout=([^&#\s]+)/);
    if (inline){
      try { json = JSON.parse(decodeURIComponent(inline[1].replace(/\+/g, " "))); } catch (e){ throw new Error("That DIM link looks cut off. Copy the whole link and try again."); }
    } else if (text.charAt(0) === "{"){
      try { json = JSON.parse(text); } catch (e){ throw new Error("That isn't a DIM loadout."); }
    } else if (/^(https?:\/\/)?(www\.)?dim\.gg\/[a-z0-9]+/i.test(text)){
      let res;
      // A failed fetch (offline, or a blocker/network filter stopping
      // workers.dev) can't be told apart here, so name both and the way round.
      try { res = await fetch(DIM_RELAY + "?url=" + encodeURIComponent(text)); }
      catch (e){ throw new Error("Couldn't reach Rally Flag's DIM helper (" + new URL(DIM_RELAY).host + "). If you're online, an ad blocker or network filter may be blocking it. Instead, open the link, right-click or long-press \"Open in DIM\", copy that link and paste it here."); }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't read that DIM link.");
      json = body;
    } else throw new Error("Paste a DIM loadout link (dim.gg/…).");
    if (!json || !Array.isArray(json.equipped)) throw new Error("That isn't a DIM loadout.");
    const all = json.equipped.concat(json.unequipped || []);
    const gear = all.filter(x => DB.items[x.hash] && (DB.items[x.hash].t === 2 || DB.items[x.hash].t === 3));
    const params = json.parameters || {};
    const sub = all.find(x => DB.items[x.hash] && /Subclass$/.test(DB.items[x.hash].y || ""));
    const art = all.find(x => DB.items[x.hash] && DB.items[x.hash].y === "Artifact" && x.socketOverrides);
    return {
      id: "dim-" + (json.id || Date.now().toString(36)), name: String(json.name || "DIM loadout").slice(0, 60), cls: json.classType == null ? 3 : json.classType,
      items: gear.map(x => ({ id: String(x.id || ""), hash: x.hash })),
      dim: { id: json.id || "" },
      subclass: sub ? { hash: sub.hash, sockets: sub.socketOverrides || {} } : null,
      artifact: art ? { hash: art.hash, sockets: art.socketOverrides } : null,
      mods: (params.mods || []).filter(h => DB.items[h] && DB.items[h].k),
      cosmetics: params.modsByBucket || {}
    };
  }

  // ---------------- sockets: subclass, mods, cosmetics ----------------
  // Bungie's InsertSocketPlugFree swaps "free" plugs (subclass choices,
  // armor mods, shaders, ornaments) on an item that's on a character.
  // Changes go into the journal like moves, so a lagging profile keeps them.
  const socketData = id => {
    const all = (PROFILE.itemComponents && PROFILE.itemComponents.sockets && PROFILE.itemComponents.sockets.data) || {};
    return (all[id] && all[id].sockets) || [];
  };
  const plugsOf = id => socketData(id).map(x => x.plugHash || 0);
  function patchPlug(id, k, h){
    const sk = socketData(id);
    if (sk[k]) sk[k].plugHash = h;
    const item = ITEMS.find(i => i.id === id);
    if (item) item.plugs[k] = h;
  }
  function rememberPlug(id, k, h){
    const old = readJournal()["sock:" + id];
    remember([["sock:" + id, { plugs: Object.assign({}, old && old.plugs, { [k]: h }) }]]);
  }
  async function insertPlug(itemId, charId, k, h){
    const body = { plug: { socketIndex: k, socketArrayType: 0, plugItemHash: h }, itemId, characterId: charId };
    // Bungie rate-limits socket changes; on "slow down", wait and retry once.
    try { await post("InsertSocketPlugFree", body); }
    catch (e){ if (!/Throttle/.test(e.status || "")) throw e; await sleep(2000); await post("InsertSocketPlugFree", body); }
    patchPlug(itemId, k, h); rememberPlug(itemId, k, h);
  }
  // Subclasses aren't Locker gear: read them from the profile.
  // Subclasses and artifacts aren't Locker gear: read them from the profile.
  // A character wears one of each and keeps the others in its inventory.
  const ARTIFACT_BUCKET = 1506418338, EMPTY_ARTIFACT_PERK = 1235188590;
  const isSubclass = it => !!DB.items[it.itemHash] && /Subclass$/.test(DB.items[it.itemHash].y || "");
  const isArtifact = it => !!DB.items[it.itemHash] && (it.bucketHash === ARTIFACT_BUCKET || DB.items[it.itemHash].y === "Artifact");
  function wornKindOf(charId, isKind){
    const take = (list, equipped) => (list || []).filter(it => it.itemInstanceId && isKind(it))
      .map(it => ({ id: String(it.itemInstanceId), hash: it.itemHash, equipped }));
    return take((data(PROFILE, "characterEquipment")[charId] || {}).items, true).concat(take((data(PROFILE, "characterInventories")[charId] || {}).items, false));
  }
  const subclassesOf = charId => wornKindOf(charId, isSubclass);
  const artifactsOf = charId => wornKindOf(charId, isArtifact);
  function patchSubclass(charId, id, isKind = isSubclass){
    const eq = (data(PROFILE, "characterEquipment")[charId] || {}).items || [], inv = (data(PROFILE, "characterInventories")[charId] || {}).items || [];
    const isSub = isKind;
    const k = inv.findIndex(it => String(it.itemInstanceId) === id && isSub(it)), cur = eq.findIndex(isSub);
    if (k < 0) return;
    const next = inv.splice(k, 1)[0];
    if (cur >= 0) inv.push(eq.splice(cur, 1, next)[0]); else eq.push(next);
  }
  // Errors that would fail every other step too: stop instead of retrying.
  const FATAL = /Scope|NotInTower|CannotPerformActionAtThisLocation|Throttle|SystemDisabled|NotFound/;

  // Set several sockets of one item. A plug can't sit in two sockets at
  // once (two aspects, two copies of a fragment; armor mods may stack, so
  // `stack` turns that off), so a plug that's still
  // in another socket we're changing waits for that one; what's left
  // after that is only reordering and is skipped.
  async function setSockets(itemId, charId, wants, failed, stack){
    const once = h => !stack && !isEmptyPlug(h); // empty sockets repeat freely
    let todo = Object.keys(wants).map(Number).filter(k => plugsOf(itemId)[k] !== wants[k]);
    while (todo.length){
      const cur = plugsOf(itemId);
      const k = todo.find(k => !once(wants[k]) || !cur.some((h, j) => j !== k && h === wants[k] && todo.includes(j)));
      if (k == null) break;
      todo = todo.filter(x => x !== k);
      if (once(wants[k]) && cur.some((h, j) => j !== k && h === wants[k] && !(j in wants))) continue; // already elsewhere: same result
      try { await insertPlug(itemId, charId, k, wants[k]); }
      catch (e){ if (FATAL.test(e.status || "")) throw e; failed.push({ itemId, k, h: wants[k], err: e }); }
    }
  }

  // Armor mods: DIM lists them without saying which piece holds which, so
  // match them by kind (slot, general, tuning, artifice, raid) to the
  // sockets of the armor the character wears: keep any already in place,
  // then fill the rest. If Bungie refuses one (usually not enough energy),
  // clear that piece's other mods and try once more.
  let EMPTY_BY_KIND = null;
  function emptyPlug(kind){
    if (!EMPTY_BY_KIND){
      EMPTY_BY_KIND = {};
      for (const h in DB.items){ const d = DB.items[h]; if (d.k && /^Empty .*Socket$/.test(d.n) && !EMPTY_BY_KIND[d.k]) EMPTY_BY_KIND[d.k] = +h; }
    }
    return EMPTY_BY_KIND[kind] || 0;
  }
  const kindOf = h => (DB.items[h] && DB.items[h].k) || "";
  const isEmptyPlug = h => !DB.items[h] || /^Empty /.test(DB.items[h].n);
  // "Locked Armor Mod" and retired mods fill sockets but can't be put anywhere.
  const isPlaceholderMod = h => !!DB.items[h] && /^(locked|deprecated) /i.test(DB.items[h].n);
  function planMods(armor, mods){
    const sockets = [];
    for (const item of armor) plugsOf(item.id).forEach((h, k) => { if (kindOf(h)) sockets.push({ item, k, kind: kindOf(h), cur: h, want: null }); });
    const left = [];
    for (const h of mods){
      const keep = sockets.find(s => s.want == null && s.cur === h);
      if (keep) keep.want = h; else left.push(h);
    }
    const unplaced = [];
    for (const h of left){
      // An empty socket first, then one holding a mod the loadout doesn't want.
      const open = sockets.filter(s => s.want == null && s.kind === kindOf(h)).sort((a, b) => isEmptyPlug(b.cur) - isEmptyPlug(a.cur));
      if (open.length) open[0].want = h; else unplaced.push(h);
    }
    return { sockets, unplaced };
  }
  async function applyMods(armor, mods, charId, failed){
    const plan = planMods(armor, mods);
    const first = [];
    for (const s of plan.sockets) if (s.want != null && s.cur !== s.want) await setSockets(s.item.id, charId, { [s.k]: s.want }, first, true);
    for (const f of first){
      const item = ITEMS.find(i => i.id === f.itemId);
      for (const s of plan.sockets) if (s.item === item && s.want == null && !isEmptyPlug(plugsOf(item.id)[s.k]) && emptyPlug(s.kind))
        await setSockets(item.id, charId, { [s.k]: emptyPlug(s.kind) }, [], true);
      await setSockets(f.itemId, charId, { [f.k]: f.h }, failed, true);
    }
    return plan.unplaced;
  }

  // The artifact (as DIM does it): the copy of that artifact on this
  // character, worn, then its perks one socket at a time. Bungie won't take
  // a perk that's already in another socket, so a socket whose perk the
  // loadout wants somewhere else is emptied first. The Reset socket is never
  // in the list. Perks the player hasn't unlocked are refused by Bungie.
  async function applyArtifact(want, charId, failed, notes){
    const art = artifactsOf(charId).find(x => x.hash === want.hash), name = (DB.items[want.hash] || {}).n || "its artifact";
    if (!art){ notes.push("Your " + ownerLabel(charId) + " doesn't have " + name + "."); return; }
    if (!art.equipped){
      await post("EquipItem", { itemId: art.id, characterId: charId });
      patchSubclass(charId, art.id, isArtifact); remember([["art:" + charId, { id: art.id }]]);
    }
    const wants = {};
    for (const k in want.sockets) wants[k] = want.sockets[k];
    const cur = plugsOf(art.id);
    for (let j = 0; j < cur.length; j++){
      const h = cur[j];
      if (!h || wants[j] === h || isEmptyPlug(h)) continue;
      if (Object.keys(wants).some(k => +k !== j && wants[k] === h)) await setSockets(art.id, charId, { [j]: EMPTY_ARTIFACT_PERK }, failed, true);
    }
    await setSockets(art.id, charId, wants, failed);
  }

  // Everything past the gear: equip the loadout's subclass and set its
  // choices, put shaders/ornaments on each slot, then the armor mods.
  // Returns a sentence for the toast.
  async function applyExtras(lo, charId){
    const notes = [], failed = [];
    if (lo.subclass){
      const sc = subclassesOf(charId).find(x => x.hash === lo.subclass.hash), name = (DB.items[lo.subclass.hash] || {}).n || "its subclass";
      if (!sc) notes.push("Your " + ownerLabel(charId) + " doesn't have " + name + ".");
      else {
        if (!sc.equipped){
          await post("EquipItem", { itemId: sc.id, characterId: charId });
          patchSubclass(charId, sc.id); remember([["sc:" + charId, { id: sc.id }]]);
        }
        const wants = {};
        for (const k in lo.subclass.sockets) wants[k] = lo.subclass.sockets[k];
        await setSockets(sc.id, charId, wants, failed);
      }
    }
    if (lo.artifact) await applyArtifact(lo.artifact, charId, failed, notes);
    const worn = BUCKETS.map(b => ITEMS.find(i => i.owner === charId && i.equipped && i.def.b === b.hash)).filter(Boolean);
    for (const bucket in lo.cosmetics || {}){
      const item = worn.find(i => String(i.def.b) === bucket);
      if (!item) continue;
      const cur = plugsOf(item.id), wants = {};
      for (const h of lo.cosmetics[bucket]){
        const k = cur.findIndex(c => DB.items[h] && (DB.items[h].o ? isOrnamentPlug(c) : DB.items[h].sh && DB.items[c] && DB.items[c].sh));
        if (k >= 0) wants[k] = h;
      }
      const before = failed.length;
      await setSockets(item.id, charId, wants, failed);
      const orn = Object.values(wants).find(isOrnamentPlug);
      if (orn && failed.length === before){ item.ornament = isOrnament(orn) ? orn : 0; rememberItems([item]); }
    }
    if (lo.mods && lo.mods.length){
      const unplaced = await applyMods(worn.filter(i => i.def.t === 2), lo.mods, charId, failed);
      if (unplaced.length) notes.push(unplaced.length + " mod" + (unplaced.length === 1 ? " had" : "s had") + " no matching socket.");
    }
    if (failed.length){
      const names = [...new Set(failed.map(f => (DB.items[f.h] || {}).n).filter(Boolean))];
      notes.push("Bungie refused " + failed.length + (failed.length === 1 ? " change" : " changes") + (names.length ? " (" + names.slice(0, 3).join(", ") + (names.length > 3 ? "…" : "") + ")" : "") +
        ": not unlocked, or not enough armor energy.");
    }
    return notes.join(" ");
  }

  // How much of a loadout's subclass and mods a character has on now.
  function extrasStatus(lo, charId){
    const out = [];
    if (lo.subclass){
      const sc = subclassesOf(charId).find(x => x.hash === lo.subclass.hash);
      const ok = sc && sc.equipped && Object.keys(lo.subclass.sockets).every(k => plugsOf(sc.id).includes(lo.subclass.sockets[k]));
      out.push({ ok: !!ok, text: "subclass " + (ok ? "set" : sc ? "not set" : "missing") });
    }
    if (lo.artifact){
      const art = artifactsOf(charId).find(x => x.hash === lo.artifact.hash);
      const ok = art && art.equipped && Object.keys(lo.artifact.sockets).every(k => plugsOf(art.id).includes(lo.artifact.sockets[k]));
      out.push({ ok: !!ok, text: "artifact " + (ok ? "set" : art ? "not set" : "missing") });
    }
    if (lo.mods && lo.mods.length){
      const have = [];
      for (const b of BUCKETS){ const i = ITEMS.find(x => x.owner === charId && x.equipped && x.def.b === b.hash && x.def.t === 2); if (i) have.push(...plugsOf(i.id)); }
      let n = 0;
      for (const h of lo.mods){ const k = have.indexOf(h); if (k >= 0){ n++; have.splice(k, 1); } }
      out.push({ ok: n === lo.mods.length, text: "mods " + n + " of " + lo.mods.length });
    }
    return out;
  }

  // What a character wears now, as a loadout: gear plus its subclass
  // choices, armor mods and each slot's shader/ornament (as DIM saves).
  function snapshot(charId){
    const items = equippedOn(charId);
    const sc = subclassesOf(charId).find(x => x.equipped);
    const sockets = {};
    if (sc) plugsOf(sc.id).forEach((h, k) => { if (h && DB.items[h]) sockets[k] = h; });
    const mods = [], cosmetics = {};
    for (const i of items){
      for (const h of plugsOf(i.id)){
        if (i.def.t === 2 && kindOf(h) && !isEmptyPlug(h) && !isPlaceholderMod(h)) mods.push(h);
        if (DB.items[h] && (DB.items[h].o || DB.items[h].sh)) (cosmetics[i.def.b] = cosmetics[i.def.b] || []).push(h);
      }
    }
    const art = artifactsOf(charId).find(x => x.equipped), perks = {};
    if (art) plugsOf(art.id).forEach((h, k) => { if (DB.items[h] && DB.items[h].y === "Artifact Perk") perks[k] = h; });
    return { items: items.map(i => ({ id: i.id, hash: i.hash })), subclass: sc ? { hash: sc.hash, sockets } : null, mods, cosmetics,
      artifact: art ? { hash: art.hash, sockets: perks } : null };
  }

  // Choosing your copies. An imported loadout (or a saved one whose item
  // is gone) names items you may not have exactly: DIM greys those out.
  // Instead, before saving, ask which of your copies goes in each slot,
  // showing each copy's perks (weapons) or stats (armor). With no copy of
  // that item, offer others of the same type in that slot, or leave it empty.
  let loReview = null; // { lo, isNew, slots: [{ k, want, cands, similar, pick }] }
  let loRenaming = null; // id of the saved loadout whose name box is open
  const fitsClass = (i, cls) => cls === 3 || i.def.t !== 2 || i.def.c === 3 || i.def.c === cls;
  const rollRank = (a, b) => ((b.roll && b.roll.full) - (a.roll && a.roll.full)) || ((b.roll ? b.roll.matched : 0) - (a.roll ? a.roll.matched : 0)) || b.power - a.power;
  function startReview(lo, isNew){
    const slots = [];
    lo.items.forEach((want, k) => {
      if (want.id && ITEMS.some(i => i.id === want.id)) return;
      const d = DB.items[want.hash] || {};
      let cands = ITEMS.filter(i => i.hash === want.hash && fitsClass(i, lo.cls)).sort(rollRank), similar = false;
      if (!cands.length && d.b){
        cands = ITEMS.filter(i => i.def.b === d.b && (i.def.y || "") === (d.y || "") && fitsClass(i, lo.cls)).sort(rollRank).slice(0, 8);
        similar = true;
      }
      // Your best copy is picked to start with; a different item never is.
      slots.push({ k, want, cands, similar, pick: !similar && cands[0] ? cands[0].id : "" });
    });
    if (!slots.length) return false;
    loReview = { lo, isNew, slots };
    return true;
  }
  function pickHtml(slot, i, attr = "pick"){
    const on = slot.pick === i.id;
    let detail;
    if (i.def.t === 3){
      const perks = i.plugs.filter(h => showPlug(h) && !isMod(DB.items[h]));
      detail = '<span class="pick-perks">' + perks.map(h => { const p = DB.items[h]; return '<span class="pick-perk' + (i.roll && i.roll.weapon.perkHashes.includes(h) ? " ours" : "") + '">' + (p.i ? '<img src="' + esc(img(p.i)) + '" alt="" width="18" height="18" loading="lazy">' : "") + esc(p.n) + "</span>"; }).join("") + "</span>";
    } else {
      const st = ARMOR_STATS.map(h => (i.stats[h] || {}).value || 0), total = st.reduce((a, b) => a + b, 0);
      detail = '<span class="pick-perks"><span class="pick-perk">Stats ' + total + "</span>" + ARMOR_STATS.map((h, k) => st[k] ? '<span class="pick-perk">' + esc(STAT_SHORT[DB.stats[h]] || DB.stats[h] || "") + " " + st[k] + "</span>" : "").join("") + "</span>";
    }
    const roll = i.roll ? (i.roll.full ? " · ★ our God Roll" : " · " + i.roll.matched + "/" + i.roll.total + " God Roll perks") : "";
    return '<button type="button" class="pick' + (on ? " on" : "") + '" data-' + attr + '-slot="' + slot.k + '" data-' + attr + '="' + i.id + '" aria-pressed="' + on + '">' +
      '<img class="pick-icon" src="' + esc(img(iconOf(i))) + '" alt="" width="40" height="40" loading="lazy">' +
      '<span class="pick-main"><b>' + esc(i.def.n) + (on ? ' <span class="pick-chosen">Chosen</span>' : "") + "</b><small>" + i.power + " · " + esc(ownerLabel(i.owner)) + (i.equipped ? ", equipped" : "") + (i.tier ? " · tier " + i.tier : "") + esc(roll) + "</small>" + detail + "</span></button>";
  }
  function reviewHtml(){
    const r = loReview, lo = r.lo;
    return '<section class="lo-review panel-card" aria-labelledby="lo-h-review"><h2 class="lo-review-title" id="lo-h-review" tabindex="-1">Choose your copies for ' + esc(lo.name) + "</h2>" +
      '<p class="muted lo-help">' + (lo.share ? "Someone shared this loadout with you. " : lo.dim ? "This loadout names items that aren't in your inventory. " : "Some of this loadout's items are gone. ") + "Pick which of yours goes in each slot. Perks are shown so you can compare rolls.</p>" +
      r.slots.map(slot => {
        const d = DB.items[slot.want.hash] || {}, label = d.n || "Unknown item";
        return '<div class="pick-slot" role="group" aria-labelledby="pick-h-' + slot.k + '"><h3 class="pick-head" id="pick-h-' + slot.k + '">' + esc(d.y || "Item") + ": " + esc(label) + "</h3>" +
          (slot.similar ? '<p class="pick-note">' + (slot.cands.length ? "You don't have " + esc(label) + ". Use another " + esc(d.y || "item") + ", or leave it empty." : "You don't have " + esc(label) + " or anything like it. It'll be left empty.") + "</p>"
            : slot.cands.length > 1 ? '<p class="pick-note">You have ' + slot.cands.length + " copies.</p>" : "") +
          (slot.cands.length ? '<div class="pick-list">' + slot.cands.map(i => pickHtml(slot, i)).join("") + "</div>" : "") +
            '<button type="button" class="pick pick-empty' + (slot.pick === "" ? " on" : "") + '" data-pick-slot="' + slot.k + '" data-pick="" aria-pressed="' + (slot.pick === "") + '">Leave this slot empty' + (slot.pick === "" ? ' <span class="pick-chosen">Chosen</span>' : "") + "</button></div>";
      }).join("") +
      '<div class="act-row"><button type="button" class="act-btn" id="lo-review-save">Save loadout</button><button type="button" class="act-btn" id="lo-review-cancel">' + (r.isNew ? "Don't import" : "Cancel") + "</button></div></section>";
  }
  function finishReview(){
    const r = loReview, lo = r.lo, byK = new Map(r.slots.map(x => [x.k, x]));
    const items = [];
    lo.items.forEach((x, k) => {
      const slot = byK.get(k);
      if (!slot) return items.push(x);
      const i = slot.pick && ITEMS.find(y => y.id === slot.pick);
      if (i) items.push({ id: i.id, hash: i.hash });
    });
    const saved = Object.assign({}, lo, { items });
    const all = readLoadouts(), at = all.findIndex(x => x.id === saved.id);
    if (at >= 0) all[at] = saved; else all.push(saved);
    writeLoadouts(all);
    loReview = null; loOpen = "r-" + saved.id;
    const empty = lo.items.length - items.length;
    return saved.name + " saved" + (empty ? " with " + empty + " empty slot" + (empty === 1 ? "" : "s") : "") + ".";
  }

  // The Loadouts tab (like DIM's): loadouts saved in this browser, grouped
  // by class, then Destiny's in-game loadouts, then max Power.
  // Editing a saved loadout (like DIM's loadout editor): swap or clear the
  // item in each slot, take the subclass, artifact, mods or shaders and
  // ornaments from what a character wears now, remove or add single mods.
  // Changes stay in a draft until Save.
  let loEditing = null; // { id, draft, slot (bucket hash with its picker open), q }
  const bucketOfHash = h => (DB.items[h] || {}).b;
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
  function armorModOptions(){
    const owned = ownedPlugs(), seen = new Set(), byKind = {};
    for (const h of Object.keys(DB.items).map(Number)){
      const m = DB.items[h];
      if (!m.k || isEmptyPlug(h) || isPlaceholderMod(h) || (owned && !owned.has(h)) || seen.has(m.k + m.n)) continue;
      seen.add(m.k + m.n); (byKind[m.k] = byKind[m.k] || []).push(h);
    }
    return Object.keys(byKind).sort().map(k => '<optgroup label="' + esc(k) + '">' + byKind[k].sort((a, b) => DB.items[a].n.localeCompare(DB.items[b].n)).map(h => '<option value="' + h + '">' + esc(DB.items[h].n) + "</option>").join("") + "</optgroup>").join("");
  }
  function editPicks(){
    const ed = loEditing, cur = ed.draft.items.find(x => bucketOfHash(x.hash) === ed.slot), q = ed.q.trim().toLowerCase();
    const list = ITEMS.filter(i => i.def.b === ed.slot && fitsClass(i, ed.draft.cls) && (!q || i.text.includes(q) || (NOTES[i.id] || "").toLowerCase().includes(q)))
      .sort((a, b) => (b.equipped - a.equipped) || rollRank(a, b) || a.def.n.localeCompare(b.def.n));
    const shown = list.slice(0, 24);
    return (shown.length ? shown.map(i => pickHtml({ k: ed.slot, pick: cur ? cur.id : "" }, i, "ed-pick")).join("") : '<p class="muted">Nothing here matches.</p>') +
      (list.length > shown.length ? '<p class="muted ed-more">' + (list.length - shown.length) + " more: type to narrow it down.</p>" : "");
  }
  function editorHtml(){
    const ed = loEditing, lo = ed.draft;
    const owners = OWNERS.filter(o => lo.cls === 3 || o.cls === lo.cls);
    const useBtns = what => owners.map(o => '<button type="button" class="act-btn" data-ed-use="' + what + '" data-to="' + o.id + '">Use your ' + esc(o.name) + "'s</button>").join("");
    const slots = BUCKETS.map(b => {
      const x = lo.items.find(y => bucketOfHash(y.hash) === b.hash), i = x && loItem(x), d = x && (DB.items[x.hash] || {});
      const open = ed.slot === b.hash;
      return '<div class="ed-slot"><span class="ed-label">' + esc(b.label.replace(/ Weapons$/, "")) + "</span>" +
        '<span class="ed-item">' + (x ? '<img src="' + esc(img(i ? iconOf(i) : d.i)) + '" alt="" width="36" height="36" loading="lazy"><span><b>' + esc(d.n || "Unknown item") + "</b><small>" + (i ? i.power + " · " + esc(ownerLabel(i.owner)) : "You don't have it") + "</small></span>" : '<span class="muted">Empty</span>') + "</span>" +
        '<span class="ed-btns"><button type="button" class="act-btn" data-ed-slot="' + b.hash + '" aria-expanded="' + open + '">' + (x ? "Change" : "Add") + '<span class="sr-only"> ' + esc(b.label) + "</span></button>" +
        (x ? '<button type="button" class="act-btn" data-ed-clear="' + b.hash + '">Clear<span class="sr-only"> ' + esc(b.label) + "</span></button>" : "") + "</span>" +
        (open ? '<div class="ed-picker"><label class="lo-name"><span>Filter</span><input type="text" id="ed-q" value="' + esc(ed.q) + '" placeholder="Name or perk…" autocomplete="off" spellcheck="false"></label>' +
          '<div class="pick-list" id="ed-pick-list">' + editPicks() + "</div></div>" : "") + "</div>";
    }).join("");
    const nm = h => (DB.items[h] || {}).n || "Unknown";
    const cos = Object.values(lo.cosmetics || {}).reduce((n, l) => n + l.length, 0);
    const row = (label, value, what, removable) => '<div class="ed-extra"><span class="ed-label">' + label + '</span><span class="ed-value">' + value + '</span><span class="ed-btns">' + useBtns(what) +
      (removable ? '<button type="button" class="act-btn" data-ed-drop="' + what + '">Remove<span class="sr-only"> ' + label + "</span></button>" : "") + "</span></div>";
    const mods = (lo.mods || []).map((h, k) => '<span class="ed-mod">' + (DB.items[h] && DB.items[h].i ? '<img src="' + esc(img(DB.items[h].i)) + '" alt="" width="20" height="20" loading="lazy">' : "") + esc(nm(h)) +
      '<button type="button" class="ed-x" data-ed-mod-del="' + k + '" aria-label="Remove ' + esc(nm(h)) + '">×</button></span>').join("");
    return '<section class="lo-edit" aria-labelledby="lo-edit-h"><h3 class="lo-edit-title" id="lo-edit-h" tabindex="-1">Edit ' + esc(lo.name) + "</h3>" +
      '<div class="ed-slots">' + slots + "</div>" +
      row("Subclass", lo.subclass ? esc(nm(lo.subclass.hash)) + " with " + plural(Object.keys(lo.subclass.sockets || {}).length, "choice") : '<span class="muted">None</span>', "subclass", !!lo.subclass) +
      row("Artifact", lo.artifact ? esc(nm(lo.artifact.hash)) + " with " + plural(Object.keys(lo.artifact.sockets || {}).length, "perk") : '<span class="muted">None</span>', "artifact", !!lo.artifact) +
      row("Shaders &amp; ornaments", cos ? (cos === 1 ? "1 shader or ornament" : cos + " shaders and ornaments") : '<span class="muted">None</span>', "cosmetics", cos > 0) +
      row("Armor mods", (lo.mods || []).length ? plural(lo.mods.length, "mod") : '<span class="muted">None</span>', "mods", (lo.mods || []).length > 0) +
      ((lo.mods || []).length ? '<div class="ed-mods">' + mods + "</div>" : "") +
      '<div class="ed-add"><label class="lo-name"><span>Add mod</span><select id="ed-mod-add" class="chip chip-select">' + armorModOptions() + "</select></label>" +
        '<button type="button" class="act-btn" id="ed-mod-go">Add</button></div>' +
      '<div class="act-row"><button type="button" class="act-btn" id="ed-save">Save changes</button><button type="button" class="act-btn" id="ed-cancel">Cancel</button></div></section>';
  }
  // Wire the open editor (called from renderLoadouts).
  function wireEditor(box){
    const ed = loEditing, lo = ed.draft;
    const again = sel => { renderLoadouts(); const t = box.querySelector(sel); if (t) t.focus(); };
    const close = () => { const id = ed.id; loEditing = null; again('[data-lo-edit="' + id + '"]'); };
    box.querySelector(".lo-edit").addEventListener("keydown", e => { if (e.key === "Escape" && e.target.id !== "ed-q"){ e.preventDefault(); close(); } });
    box.querySelectorAll("[data-ed-slot]").forEach(b => b.addEventListener("click", () => {
      const h = +b.dataset.edSlot; ed.slot = ed.slot === h ? null : h; ed.q = "";
      again(ed.slot ? "#ed-q" : '[data-ed-slot="' + h + '"]');
    }));
    const q = $("ed-q");
    if (q){
      q.addEventListener("input", () => { ed.q = q.value; $("ed-pick-list").innerHTML = editPicks(); wirePicks(); });
      q.addEventListener("keydown", e => { if (e.key === "Escape"){ e.preventDefault(); const h = ed.slot; ed.slot = null; again('[data-ed-slot="' + h + '"]'); } });
    }
    const wirePicks = () => box.querySelectorAll("[data-ed-pick]").forEach(b => b.addEventListener("click", () => {
      const i = ITEMS.find(x => x.id === b.dataset.edPick), h = ed.slot;
      lo.items = lo.items.filter(x => bucketOfHash(x.hash) !== h).concat([{ id: i.id, hash: i.hash }]);
      lo.items.sort((a, c) => BUCKETS.findIndex(x => x.hash === bucketOfHash(a.hash)) - BUCKETS.findIndex(x => x.hash === bucketOfHash(c.hash)));
      ed.slot = null; again('[data-ed-slot="' + h + '"]');
    }));
    wirePicks();
    box.querySelectorAll("[data-ed-clear]").forEach(b => b.addEventListener("click", () => {
      const h = +b.dataset.edClear; lo.items = lo.items.filter(x => bucketOfHash(x.hash) !== h); if (ed.slot === h) ed.slot = null;
      again('[data-ed-slot="' + h + '"]');
    }));
    box.querySelectorAll("[data-ed-use]").forEach(b => b.addEventListener("click", () => {
      const what = b.dataset.edUse, snap = snapshot(b.dataset.to);
      lo[what] = snap[what];
      again('[data-ed-use="' + what + '"][data-to="' + b.dataset.to + '"]');
      toast("Took " + (what === "cosmetics" ? "the shaders and ornaments" : what === "mods" ? "the armor mods" : "the " + what) + " your " + ownerLabel(b.dataset.to) + " wears now.", "ok");
    }));
    box.querySelectorAll("[data-ed-drop]").forEach(b => b.addEventListener("click", () => {
      const what = b.dataset.edDrop;
      lo[what] = what === "mods" ? [] : what === "cosmetics" ? {} : null;
      again('[data-ed-use="' + what + '"], #ed-save');
    }));
    box.querySelectorAll("[data-ed-mod-del]").forEach(b => b.addEventListener("click", () => {
      lo.mods = lo.mods.filter((x, k) => k !== +b.dataset.edModDel);
      again(lo.mods.length ? '[data-ed-mod-del="' + Math.min(+b.dataset.edModDel, lo.mods.length - 1) + '"]' : "#ed-mod-add");
    }));
    $("ed-mod-go").addEventListener("click", () => {
      const h = +$("ed-mod-add").value; if (!h) return;
      lo.mods = (lo.mods || []).concat([h]);
      again("#ed-mod-go");
      toast("Added " + DB.items[h].n + ". Equipping the loadout puts it on a piece with a free socket for it.", "ok");
    });
    $("ed-cancel").addEventListener("click", close);
    $("ed-save").addEventListener("click", () => {
      const all = readLoadouts(), at = all.findIndex(x => x.id === ed.id);
      if (at >= 0) all[at] = lo; else all.push(lo);
      writeLoadouts(all);
      loEditing = null; renderLoadoutCount();
      again('[data-lo-edit="' + lo.id + '"]');
      toast("Saved your changes to " + lo.name + ".", "ok");
    });
  }

  const loadoutsShown = () => !$("view-loadouts").hidden;
  // "Delete my share links", and the note that says what that means before it happens.
  function sharesHtml(){
    if (!syncOn()) return "";
    countShares();
    const n = SHARES.count;
    if (!n) return "";
    const links = n + " share link" + (n === 1 ? "" : "s");
    if (!SHARES.confirm) return '<div class="lo-erase"><button type="button" class="act-btn" id="lo-shares-del">Delete my share links</button><span class="muted">You\'ve made ' + links + ".</span></div>";
    return '<div class="lo-confirm panel-card" role="group" aria-labelledby="lo-h-shares"><h3 id="lo-h-shares" tabindex="-1">Delete your ' + links + "?</h3>" +
      "<ul>" +
        "<li>Every link you've shared stops working, for everyone you sent it to. Opening one will say it was deleted.</li>" +
        "<li>Loadouts people already imported from your links stay in their Locker. Deleting can't take those back.</li>" +
        "<li>Your own saved loadouts, tags and in-game loadouts aren't touched.</li>" +
        "<li>This can't be undone. To share a loadout again, press Share on it for a new link.</li>" +
      "</ul>" +
      '<div class="act-row"><button type="button" class="act-btn" id="lo-shares-go">Delete ' + links + '</button><button type="button" class="act-btn" id="lo-shares-keep">Keep them</button></div></div>';
  }
  function renderLoadoutCount(){ const n = readLoadouts().length; $("lo-count").textContent = n ? String(n) : ""; }
  function renderLoadouts(){
    const box = $("view-loadouts"), list = readLoadouts();
    // A redraw replaces the buttons: keep keyboard focus on the same control.
    const was = box.contains(document.activeElement) ? document.activeElement : null;
    const refocus = was && ["data-lo-max", "data-lo-equip", "data-lo-save", "data-game-lo", "data-lo-pick", "data-lo-rename", "data-game-edit", "data-game-snap", "data-lo-share", "data-lo-copy", "data-lo-edit"].map(a => was.hasAttribute(a) ? "[" + a + '="' + was.getAttribute(a) + '"]' + (was.dataset.to ? '[data-to="' + was.dataset.to + '"]' : "") : "").find(Boolean)
      || (was && was.id ? "#" + was.id : null);
    const typed = { name: ($("lo-name") || {}).value || "", dim: ($("lo-dim") || {}).value || "", rename: $("lo-rename-input") ? $("lo-rename-input").value : null };
    const byId = new Map(ITEMS.map(i => [i.id, i]));
    const mini = (hash, have, item) => { const d = item ? { i: iconOf(item) } : DB.items[hash] || {}; return '<span class="lo-mini' + (have ? "" : " gone") + '">' + (d.i ? '<img src="' + esc(img(d.i)) + '" alt="" width="32" height="32" loading="lazy">' : "") + "</span>"; };
    const maxRows = OWNERS.map(o => {
      const plan = maxPowerPlan(o.id), now = gearPower(equippedOn(o.id));
      const done = plan.items.every(i => i.owner === o.id && i.equipped);
      return '<div class="lo-row"><div class="lo-main"><b>' + esc(o.name) + "</b> " +
          '<span class="muted">Gear now ' + fmtPower(now) + " · max " + fmtPower(plan.power) + "</span></div>" +
        '<button type="button" class="act-btn" data-lo-max="' + o.id + '"' + (done ? ' aria-disabled="true"' : "") + ">" +
          (done ? "At max Power" : 'Equip max Power<span class="sr-only"> on your ' + esc(o.name) + "</span>") + "</button></div>";
    }).join("");
    const entry = lo => {
      const owners = OWNERS.filter(o => lo.cls === 3 || o.cls === lo.cls);
      const found = lo.items.map(x => loItem(x)), gone = found.filter(i => !i).length;
      const copies = lo.items.filter((x, k) => found[k] && found[k].id !== x.id).length;
      const first = DB.items[(lo.items[0] || {}).hash] || {};
      // What it carries besides gear (older saves and imports only had gear).
      const gearOnly = !("mods" in lo);
      const carries = gearOnly ? (lo.dim ? "Import it again to bring its subclass and mods too." : "Gear only (saved before loadouts kept subclass and mods).")
        : [lo.subclass ? ((DB.items[lo.subclass.hash] || {}).n || "Subclass") + " with " + Object.keys(lo.subclass.sockets).length + " choices" : "",
           lo.artifact ? ((DB.items[lo.artifact.hash] || {}).n || "Artifact") + " with " + Object.keys(lo.artifact.sockets).length + " perks" : "",
           lo.mods && lo.mods.length ? lo.mods.length + " mods" : ""].filter(Boolean).join(", ");
      const from = lo.dim ? 'From DIM' + (lo.dim.id ? ' (<a href="https://dim.gg/' + esc(lo.dim.id) + '/" target="_blank" rel="noopener">dim.gg/' + esc(lo.dim.id) + '<span class="sr-only"> (opens in a new tab)</span></a>)' : "") + ". " : lo.share ? "From a share link. " : "";
      // Share: the link appears here, copied, with what it shows.
      const made = SHARES.made && SHARES.made.lo === lo.id ? SHARES.made.url : "";
      const share = made ? '<div class="lo-share"><label class="lo-name"><span>Share link</span><input type="text" id="lo-share-url" readonly value="' + esc(made) + '" autocomplete="off" spellcheck="false"></label>' +
          '<div class="act-row"><button type="button" class="act-btn" data-lo-copy="' + lo.id + '">Copy link</button></div>' +
          '<p class="muted lo-help">Anyone with this link can see this loadout and import it into their own Locker. It doesn\'t show your name or account. Changes you make later aren\'t in it; press Share again for a new link.</p></div>' : "";
      // DIM imports from before artifacts were kept: say how to get it.
      const noArtifact = lo.dim && !gearOnly && !("artifact" in lo) ? (carries ? ". " : "") + "Import it again to bring its artifact too." : "";
      const note = from || carries || noArtifact ? '<p class="lo-status muted">' + from + esc(carries) + esc(noArtifact) + "</p>" : "";
      // Is it on? Gear equipped on the matching character, plus subclass/mods.
      const who = owners[0];
      const worn = who ? found.filter(i => i && i.owner === who.id && i.equipped).length : 0;
      const extra = who ? extrasStatus(lo, who.id) : [];
      const on = !!who && !gone && worn === lo.items.length && extra.every(x => x.ok);
      const status = who ? '<p class="lo-status">On your ' + esc(who.name) + ": equipped " + worn + " of " + lo.items.length + extra.map(x => " · " + esc(x.text)).join("") + "</p>" : "";
      if (loEditing && loEditing.id === lo.id) return { key: "r-" + lo.id, name: lo.name, gone, on, badge: loBadge(first.i, ""), detail: editorHtml() };
      return { key: "r-" + lo.id, name: lo.name, gone, on, badge: loBadge(first.i, ""),
        detail: (loRenaming === lo.id
            ? '<form class="lo-rename" data-lo-rename-form="' + lo.id + '"><label class="lo-name"><span>Name</span><input type="text" id="lo-rename-input" maxlength="40" value="' + esc(lo.name) + '" autocomplete="off" spellcheck="false"></label>' +
              '<div class="act-row"><button type="submit" class="act-btn">Save name</button><button type="button" class="act-btn" data-lo-rename-cancel>Cancel</button></div></form>'
            : "") +
          '<div class="lo-main"><b>' + esc(lo.name) + '</b> <span class="muted">' + esc(lo.cls === 3 ? "Any class" : CLASS_NAMES[lo.cls] || "") +
          (gone ? " · " + gone + " item" + (gone === 1 ? "" : "s") + (lo.dim ? " you don't have" : " no longer found") : "") +
          (copies ? " · " + copies + " from your own copies" : "") + "</span></div>" +
        '<div class="lo-items" aria-hidden="true">' + lo.items.map((x, k) => mini(x.hash, !!found[k], found[k])).join("") + "</div>" + status + note +
        '<div class="act-row">' + owners.map(o => '<button type="button" class="act-btn" data-lo-equip="' + lo.id + '" data-to="' + o.id + '">Equip on ' + esc(o.name) + '<span class="sr-only"> (' + esc(lo.name) + ")</span></button>").join("") +
          (gone || copies ? '<button type="button" class="act-btn" data-lo-review="' + lo.id + '">Choose copies<span class="sr-only"> for ' + esc(lo.name) + "</span></button>" : "") +
          '<button type="button" class="act-btn" data-lo-edit="' + lo.id + '">Edit<span class="sr-only"> ' + esc(lo.name) + "</span></button>" +
          (loRenaming === lo.id ? "" : '<button type="button" class="act-btn" data-lo-rename="' + lo.id + '">Rename<span class="sr-only"> ' + esc(lo.name) + "</span></button>") +
          '<button type="button" class="act-btn" data-lo-share="' + lo.id + '">Share<span class="sr-only"> ' + esc(lo.name) + "</span></button>" +
          '<button type="button" class="act-btn" data-lo-del="' + lo.id + '">Delete<span class="sr-only"> ' + esc(lo.name) + "</span></button></div>" + share };
    };
    // Grouped by class like DIM: your characters' classes first, then any class.
    const classes = [...new Set(OWNERS.map(o => o.cls).concat([0, 1, 2, 3]))];
    const saved = list.length ? classes.map(c => {
      const mine = list.filter(lo => lo.cls === c);
      return mine.length ? '<h3 class="lo-owner">' + esc(c === 3 ? "Any class" : CLASS_NAMES[c] || "Other") + "</h3>" + loGrid("r" + c, mine.map(entry)) : "";
    }).join("") : '<p class="muted">Nothing saved yet. Save what a character wears now, or import a DIM link.</p>';
    box.innerHTML = (loReview ? reviewHtml() : "") +
      '<section class="lo-section" aria-labelledby="lo-h-saved"><h2 class="dlg-label" id="lo-h-saved">Saved in this browser</h2>' +
        '<p class="muted lo-help">Gear, subclass, artifact perks, mods, shaders and ornaments. ' + (DEMO ? "" : "Saved in this browser and to Rally Flag's sync service under your Bungie account, so they're on any device where you sign in. ") +
          '<span id="lo-sync" role="status">' + esc(syncText()) + "</span></p>" +
        '<div class="lo-tools">' +
          '<div class="lo-tool"><label class="lo-name"><span>Name</span><input type="text" id="lo-name" maxlength="40" placeholder="e.g. Raid DPS" autocomplete="off"></label>' +
            '<div class="act-row">' + OWNERS.map(o => '<button type="button" class="act-btn" data-lo-save="' + o.id + '">Save ' + esc(o.name) + "'s loadout</button>").join("") + "</div></div>" +
          '<div class="lo-tool"><label class="lo-name"><span>DIM link</span><input type="url" id="lo-dim" placeholder="https://dim.gg/…" autocomplete="off" inputmode="url" spellcheck="false"></label>' +
            '<div class="act-row"><button type="button" class="act-btn" id="lo-dim-go">Import</button></div></div>' +
        "</div>" + saved +
        (list.length || Object.keys(TAGS).length ? '<div class="lo-erase"><button type="button" class="act-btn" id="lo-erase">Delete my saved loadouts and tags</button>' +
          '<span class="muted">' + (syncOn() ? "From this browser and Rally Flag's sync service. Your other devices clear theirs the next time they sync. Share links stay until you delete them." : "From this browser.") + "</span></div>" : "") +
        sharesHtml() +
        "</section>" +
      '<section class="lo-section" aria-labelledby="lo-h-game"><h2 class="dlg-label" id="lo-h-game">In-game loadouts</h2><p class="muted lo-help">The loadouts saved in Destiny, with their subclass and mods. Rally Flag brings any missing items over first. Empty slots can save what a character wears now.</p>' + gameSection() + "</section>" +
      '<section class="lo-section" aria-labelledby="lo-h-max"><h2 class="dlg-label" id="lo-h-max">Max Power</h2><p class="muted lo-help">Your highest-Power weapons and armor for each character, from anywhere, with one Exotic weapon and one Exotic armor piece.</p>' + maxRows + "</section>";
    $("lo-name").value = typed.name; $("lo-dim").value = typed.dim;
    if (typed.rename != null && $("lo-rename-input")) $("lo-rename-input").value = typed.rename;
    if (was) { const t = refocus && box.querySelector(refocus); if (t) t.focus(); }
    box.querySelectorAll("[data-lo-pick]").forEach(b => b.addEventListener("click", () => {
      loOpen = loOpen === b.dataset.loPick ? null : b.dataset.loPick;
      renderLoadouts();
    }));
    box.querySelectorAll("[data-lo-max]").forEach(b => b.addEventListener("click", () => {
      if (b.getAttribute("aria-disabled") === "true" || busyNotice()) return;
      const o = ownerOf(b.dataset.loMax), plan = maxPowerPlan(o.id);
      run("Equipping max Power on your " + o.name, "Your " + o.name + " is at max gear Power (" + fmtPower(plan.power) + ").", () => equipSet(plan.items, o.id));
    }));
    box.querySelectorAll("[data-lo-equip]").forEach(b => b.addEventListener("click", () => {
      if (busyNotice()) return;
      const lo = readLoadouts().find(x => x.id === b.dataset.loEquip), o = ownerOf(b.dataset.to);
      if (!lo || !o) return;
      const items = lo.items.map(x => loItem(x, o.id)).filter(i => i && classOk(i, o.id));
      const missing = lo.items.length - items.length;
      let extra = "";
      run("Equipping " + lo.name + " on your " + o.name,
        () => "Equipped " + lo.name + " on your " + o.name + "." + (missing ? " " + missing + " item" + (missing === 1 ? " was" : "s were") + " missing and skipped." : "") + (extra ? " " + extra : ""),
        async () => { await equipSet(items, o.id); extra = await applyExtras(lo, o.id); });
    }));
    // In-game loadout name, icon and colour.
    box.querySelectorAll("[data-game-edit]").forEach(b => b.addEventListener("click", () => {
      const [charId, ix] = b.dataset.gameEdit.split(":"), lo = gameLoadouts(charId).find(x => x.index === +ix);
      if (!lo) return;
      gameEditing = { key: b.dataset.gameEdit, charId, index: +ix, nameHash: lo.nameHash, iconHash: lo.iconHash, colorHash: lo.colorHash };
      renderLoadouts(); const n = $("ge-name"); if (n) n.focus();
    }));
    const geForm = box.querySelector("[data-ge-form]");
    if (geForm){
      const ed = gameEditing, close = () => { gameEditing = null; renderLoadouts(); const b = box.querySelector('[data-game-edit="' + ed.key + '"]'); if (b) b.focus(); };
      $("ge-name").addEventListener("change", e => { ed.nameHash = +e.target.value; renderLoadouts(); $("ge-name").focus(); });
      geForm.querySelectorAll("[data-ge-icons], [data-ge-colors]").forEach(b => b.addEventListener("click", () => {
        const kind = b.dataset.geIcons ? "icons" : "colors";
        ed[kind === "icons" ? "iconHash" : "colorHash"] = +(b.dataset.geIcons || b.dataset.geColors);
        renderLoadouts();
        const again = box.querySelector("[data-ge-" + kind + '="' + (b.dataset.geIcons || b.dataset.geColors) + '"]'); if (again) again.focus();
      }));
      geForm.querySelector("[data-ge-cancel]").addEventListener("click", () => {
        // Cancel on an empty slot closes the slot itself.
        if (ed.mode === "snapshot"){ gameEditing = null; loOpen = null; renderLoadouts(); const t = box.querySelector('[data-lo-pick="g-' + ed.charId + "-" + ed.index + '"]'); if (t) t.focus(); }
        else close();
      });
      geForm.addEventListener("keydown", e => { if (e.key === "Escape"){ e.preventDefault(); close(); } });
      geForm.addEventListener("submit", e => {
        e.preventDefault();
        if (busyNotice()) return;
        const o = ownerOf(ed.charId), ids = { nameHash: ed.nameHash, iconHash: ed.iconHash, colorHash: ed.colorHash }, name = DB.loadouts.names[ed.nameHash] || "the loadout";
        if (ed.mode === "snapshot") run("Saving your " + o.name + "'s gear as " + name, "Saved your " + o.name + "'s current gear as " + name + " in Destiny.", async () => { await snapshotGameLoadout(ed.charId, ed.index, ids); gameEditing = null; });
        else run("Saving " + name + " in Destiny", "Saved " + name + " on your " + o.name + " in Destiny.", async () => { await updateGameIdentifiers(ed.charId, ed.index, ids); gameEditing = null; });
      });
    }
    // Replace with current gear / Clear slot: two taps, like Delete.
    const twoTap = (b, label) => { if (b.dataset.confirm === "1") return true; b.dataset.confirm = "1"; b.firstChild.textContent = label; return false; };
    box.querySelectorAll("[data-game-snap]").forEach(b => b.addEventListener("click", () => {
      if (busyNotice() || !twoTap(b, "Tap again to replace")) return;
      const [charId, ix] = b.dataset.gameSnap.split(":"), o = ownerOf(charId), lo = gameLoadouts(charId).find(x => x.index === +ix);
      run("Saving your " + o.name + "'s gear to " + lo.name, "Replaced " + lo.name + " with your " + o.name + "'s current gear.", () => snapshotGameLoadout(charId, +ix, { nameHash: lo.nameHash, iconHash: lo.iconHash, colorHash: lo.colorHash }));
    }));
    box.querySelectorAll("[data-game-clear]").forEach(b => b.addEventListener("click", () => {
      if (busyNotice() || !twoTap(b, "Tap again to clear")) return;
      const [charId, ix] = b.dataset.gameClear.split(":"), o = ownerOf(charId), lo = gameLoadouts(charId).find(x => x.index === +ix);
      run("Clearing " + lo.name, "Cleared " + lo.name + " from your " + o.name + ".", async () => { await clearGameLoadout(charId, +ix); loOpen = null; });
    }));
    box.querySelectorAll("[data-game-lo]").forEach(b => b.addEventListener("click", () => {
      if (busyNotice()) return;
      const o = ownerOf(b.dataset.to), lo = gameLoadouts(o.id).find(x => x.index === +b.dataset.gameLo);
      if (!lo) return;
      run("Equipping " + lo.name + " on your " + o.name, "Equipped " + lo.name + " on your " + o.name + "." + (lo.missing ? " " + lo.missing + " item" + (lo.missing === 1 ? " wasn't" : "s weren't") + " found." : ""), () => equipGameLoadout(o.id, lo));
    }));
    // Rename: the name box opens in the loadout's details; Enter saves,
    // Escape or Cancel closes it. A new name syncs like any other change.
    box.querySelectorAll("[data-lo-rename]").forEach(b => b.addEventListener("click", () => {
      loRenaming = b.dataset.loRename; renderLoadouts();
      const input = $("lo-rename-input"); if (input){ input.focus(); input.select(); }
    }));
    const renameForm = box.querySelector("[data-lo-rename-form]");
    if (renameForm){
      const id = renameForm.dataset.loRenameForm, input = $("lo-rename-input");
      const close = () => { loRenaming = null; renderLoadouts(); const b = box.querySelector('[data-lo-rename="' + id + '"]'); if (b) b.focus(); };
      renameForm.addEventListener("submit", e => {
        e.preventDefault();
        const name = input.value.trim();
        if (!name){ toast("Give the loadout a name first.", "error"); input.focus(); return; }
        const all = readLoadouts(), lo = all.find(x => x.id === id);
        if (lo && lo.name !== name){ const old = lo.name; lo.name = name.slice(0, 40); writeLoadouts(all); toast("Renamed " + old + " to " + lo.name + ".", "ok"); }
        close();
      });
      renameForm.querySelector("[data-lo-rename-cancel]").addEventListener("click", close);
      input.addEventListener("keydown", e => { if (e.key === "Escape"){ e.preventDefault(); close(); } });
    }
    box.querySelectorAll("[data-lo-del]").forEach(b => b.addEventListener("click", () => {
      // Two taps: the first asks, the second deletes.
      if (b.dataset.confirm !== "1"){ b.dataset.confirm = "1"; b.firstChild.textContent = "Tap again to delete"; return; }
      writeLoadouts(readLoadouts().filter(x => x.id !== b.dataset.loDel));
      renderLoadoutCount(); renderLoadouts(); toast("Loadout deleted.", "ok");
    }));
    box.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => {
      const slot = loReview.slots.find(x => x.k === +b.dataset.pickSlot);
      slot.pick = b.dataset.pick;
      renderLoadouts();
      box.querySelector('[data-pick-slot="' + slot.k + '"][data-pick="' + slot.pick + '"]').focus();
    }));
    if (loReview){
      $("lo-review-save").addEventListener("click", () => {
        const msg = finishReview();
        renderLoadoutCount(); renderLoadouts(); toast(msg, "ok");
        const tile = box.querySelector('[data-lo-pick="' + loOpen + '"]');
        if (tile){ tile.focus(); tile.scrollIntoView({ block: "nearest" }); }
      });
      $("lo-review-cancel").addEventListener("click", () => { loReview = null; renderLoadouts(); $("lo-dim").focus(); });
    }
    box.querySelectorAll("[data-lo-review]").forEach(b => b.addEventListener("click", () => {
      const lo = readLoadouts().find(x => x.id === b.dataset.loReview);
      if (!lo || !startReview(lo, false)) return;
      renderLoadouts();
      const h = $("lo-h-review"); h.scrollIntoView({ block: "start" }); h.focus();
    }));
    box.querySelectorAll("[data-lo-edit]").forEach(b => b.addEventListener("click", () => {
      const lo = readLoadouts().find(x => x.id === b.dataset.loEdit);
      if (!lo) return;
      loEditing = { id: lo.id, draft: JSON.parse(JSON.stringify(Object.assign({ mods: [], cosmetics: {}, subclass: null, artifact: null }, lo))), slot: null, q: "" };
      loRenaming = null; loOpen = "r-" + lo.id;
      renderLoadouts(); $("lo-edit-h").focus();
    }));
    if (loEditing && box.querySelector(".lo-edit")) wireEditor(box);
    box.querySelectorAll("[data-lo-share]").forEach(b => b.addEventListener("click", async () => {
      const lo = readLoadouts().find(x => x.id === b.dataset.loShare);
      if (!lo || b.getAttribute("aria-disabled") === "true") return;
      if (!syncOn()) return toast(DEMO ? "Sample loadouts can't be shared. Sign in to share your own." : "Sign in to share loadouts.", "error");
      b.setAttribute("aria-disabled", "true"); b.firstChild.textContent = "Sharing…";
      try {
        const url = await makeShare(lo);
        SHARES.made = { lo: lo.id, url };
        let copied = false;
        try { await navigator.clipboard.writeText(url); copied = true; } catch (e){}
        renderLoadouts();
        const input = $("lo-share-url");
        if (!copied && input){ input.focus(); input.select(); }
        toast(copied ? "Link copied. Anyone with it can see " + lo.name + " and import it." : "Here's the link to " + lo.name + ". Copy it from the box.", "ok");
      } catch (e){
        toast((e && e.message) || "Couldn't make a share link.", "error");
        b.removeAttribute("aria-disabled"); b.firstChild.textContent = "Share";
      }
    }));
    box.querySelectorAll("[data-lo-copy]").forEach(b => b.addEventListener("click", async () => {
      const input = $("lo-share-url");
      try { await navigator.clipboard.writeText(input.value); toast("Link copied.", "ok"); }
      catch (e){ input.focus(); input.select(); toast("Copy it from the box (it's selected).", "error"); }
    }));
    const sharesDel = $("lo-shares-del");
    if (sharesDel) sharesDel.addEventListener("click", () => { SHARES.confirm = true; renderLoadouts(); $("lo-h-shares").focus(); });
    const sharesBox = box.querySelector(".lo-confirm");
    if (sharesBox){
      const keep = () => { SHARES.confirm = false; renderLoadouts(); const b = $("lo-shares-del"); if (b) b.focus(); };
      $("lo-shares-keep").addEventListener("click", keep);
      sharesBox.addEventListener("keydown", e => { if (e.key === "Escape"){ e.preventDefault(); keep(); } });
      const go = $("lo-shares-go");
      go.addEventListener("click", async () => {
        if (go.getAttribute("aria-disabled") === "true") return;
        go.setAttribute("aria-disabled", "true"); go.textContent = "Deleting…";
        try {
          const n = await deleteShares();
          renderLoadouts();
          toast("Deleted " + n + " share link" + (n === 1 ? "" : "s") + ". They no longer open for anyone.", "ok");
          $("lo-name").focus();
        } catch (e){
          toast((e && e.message) || "Couldn't delete them. Your links still work.", "error");
          go.removeAttribute("aria-disabled"); go.textContent = "Try again";
        }
      });
    }
    const erase = $("lo-erase");
    if (erase) erase.addEventListener("click", async () => {
      // Two taps: the first asks, the second deletes.
      const nTags = Object.keys(TAGS).length, plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
      if (erase.dataset.confirm !== "1"){ erase.dataset.confirm = "1"; erase.textContent = "Tap again to delete " + plural(list.length, "loadout") + " and " + plural(nTags, "tag"); return; }
      erase.setAttribute("aria-disabled", "true"); erase.textContent = "Deleting…";
      try {
        await eraseLoadouts();
        render(); setSync(syncOn() ? "ok" : SYNC.state);
        toast("Deleted your saved loadouts and tags" + (syncOn() ? ", here and on Rally Flag's sync service." : "."), "ok");
        $("lo-name").focus();
      } catch (e){
        toast((e && e.message) || "Couldn't delete them. Nothing was changed.", "error");
        erase.removeAttribute("aria-disabled"); erase.dataset.confirm = ""; erase.textContent = "Delete my saved loadouts and tags";
      }
    });
    const dimGo = $("lo-dim-go"), dimIn = $("lo-dim");
    const importDim = async () => {
      if (!dimIn.value.trim() || dimGo.getAttribute("aria-disabled") === "true") return;
      dimGo.setAttribute("aria-disabled", "true"); dimGo.textContent = "Importing…";
      try {
        const lo = await readDimLoadout(dimIn.value);
        if (!lo.items.length) throw new Error("That loadout has no weapons or armor.");
        $("lo-dim").value = "";
        // Items you don't have exactly: choose your copies first. Importing
        // the same link again replaces the earlier copy.
        if (startReview(lo, true)){
          renderLoadouts();
          const h = $("lo-h-review"); h.scrollIntoView({ block: "start" }); h.focus();
          toast("Imported " + lo.name + ". Choose your copies, then save.", "ok");
          return;
        }
        const all = readLoadouts().filter(x => x.id !== lo.id);
        all.push(lo); writeLoadouts(all);
        loOpen = "r-" + lo.id;
        renderLoadoutCount(); renderLoadouts();
        toast("Imported " + lo.name + ": you have all " + lo.items.length + " items.", "ok");
        const tile = box.querySelector('[data-lo-pick="r-' + lo.id + '"]');
        if (tile){ tile.focus(); tile.scrollIntoView({ block: "nearest" }); }
      } catch (e){
        toast((e && e.message) || "Couldn't import that link.", "error");
        dimGo.removeAttribute("aria-disabled"); dimGo.textContent = "Import";
      }
    };
    dimGo.addEventListener("click", importDim);
    dimIn.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); importDim(); } });
    box.querySelectorAll("[data-lo-save]").forEach(b => b.addEventListener("click", () => {
      const o = ownerOf(b.dataset.loSave), snap = snapshot(o.id);
      if (!snap.items.length) return toast("Your " + o.name + " has nothing equipped to save.", "error");
      const all = readLoadouts(), typed = $("lo-name").value.trim();
      const name = typed || o.name + " loadout " + (all.filter(x => x.cls === o.cls).length + 1);
      const lo = Object.assign({ id: Date.now().toString(36), name, cls: o.cls }, snap);
      all.push(lo); writeLoadouts(all);
      loOpen = "r-" + lo.id; $("lo-name").value = "";
      renderLoadoutCount(); renderLoadouts(); toast("Saved " + name + ".", "ok");
      const tile = box.querySelector('[data-lo-pick="r-' + lo.id + '"]');
      if (tile) tile.focus();
    }));
  }

  function renderJunk(){
    const row = $("junk-row");
    renderToolsBtn();
    if (!row) return;
    const n = ITEMS.filter(i => i.owner === "vault" && TAGS[i.id] === "junk").length;
    // The character played most recently first: that's usually who's online.
    const byPlayed = OWNERS.slice().sort((a, b) => b.played - a.played);
    row.innerHTML = '<span class="farm-label">Junk cleanup</span>' +
      (n ? '<span class="farm-note">' + n + " junk in the vault. Send to:</span>" +
        byPlayed.map((o, k) => '<button type="button" class="farm-btn junk-btn" data-junk-to="' + o.id + '">' + ICON_TRASH + esc(o.name) + (k === 0 && byPlayed.length > 1 ? " · last played" : "") + "</button>").join("")
      : '<span class="farm-note">No junk in the vault. Tag items as Junk (trash icon) to send them to a character for dismantling.</span>');
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
  // Farming and Junk cleanup sit behind the Tools button (open state
  // remembered); the button says when farming is on or junk is waiting.
  const TOOLS_KEY = "rallyflag_locker_tools";
  function renderToolsBtn(){
    const b = $("tools-btn");
    if (!b) return;
    const junk = ITEMS.filter(i => i.owner === "vault" && TAGS[i.id] === "junk").length;
    b.textContent = "Tools" + (farming.size ? " · farming on" : "") + (junk ? " · " + junk + " junk" : "");
  }
  function setTools(open){
    $("tools-panel").hidden = !open; $("tools-btn").setAttribute("aria-expanded", String(open));
    try { localStorage.setItem(TOOLS_KEY, open ? "1" : ""); } catch (e){}
  }
  function renderFarm(){
    const row = $("farm-row");
    renderToolsBtn();
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
        moves.push(...inv.sort(spareFirst).slice(0, extra));
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

  // Short status for a set row. Only an equipped bonus counts as active;
  // owning the pieces is "ready". The next goal names the missing slot
  // when only one is left.
  const SLOT_NAMES = ["helmet", "arms", "chest", "legs", "class item"];
  const missingSlots = p => ARMOR_SLOTS.map((s, k) => p.slots.has(s) ? "" : SLOT_NAMES[k]).filter(Boolean);
  // Non-breaking hyphens keep "4-piece" on one line.
  function setStatus(p){
    const n = p.slots.size, miss = missingSlots(p);
    if (n >= 4) return { active: p.equipped.size >= 4, text: "4‑piece " + (p.equipped.size >= 4 ? "active" : "ready") };
    if (n < 2) return { active: false, text: "need 1 more for 2‑piece" };
    const two = "2‑piece " + (p.equipped.size >= 2 ? "active" : "ready") + " · ";
    return { active: p.equipped.size >= 2, text: two + (n === 3 ? "need " + miss[0] : "need 2 more") + " for 4‑piece" };
  }
  // The Locker is shared on its own (no site menu), so its links go to the
  // public site in a new tab rather than around the dev site.
  const PUBLIC_SITE = "https://rallyflag.gg/";
  const NEW_TAB = ' target="_blank" rel="noopener"';
  const NEW_TAB_NOTE = '<span class="sr-only"> (opens rallyflag.gg in a new tab)</span>';
  function setHref(p){ return p.set.ours ? PUBLIC_SITE + "armor-set-bonuses.html?highlight=" + p.set.ours.slug : null; }

  // Armor Sets: one compact row per set, grouped by class, then by
  // progress (sets with a bonus first; single pieces folded away). Five
  // slot icons show which pieces you have; tapping a row lists them and
  // where they are.
  const SLOT_ICONS = [
    '<path d="M5 15a7 7 0 0 1 14 0v4H5z"/>',
    '<path d="M8 21v-7L5 10l2-2 3 3V4h2v6V3h2v7V5h2v9l-2 7z"/>',
    '<path d="M4 7l4-3h8l4 3-2 4v9H6v-9z"/>',
    '<path d="M7 3h10l-1 18h-3l-1-10-1 10H8z"/>',
    '<path d="M7 3h10v18l-5-4-5 4z"/>'
  ];
  let setOpen = null, setsShowStarted = false;
  function renderSets(){
    // Sets follow the chosen character's class (every class for the vault).
    const chosen = isWide() ? [] : OWNERS.filter(o => o.id === state.focus);
    const list = chosen.length ? SETS.filter(p => chosen.some(o => o.cls === p.cls)) : SETS;
    $("sets-count").textContent = list.length;
    $("sets-hint").textContent = list.length
      ? "Armor sets you own pieces of" + (chosen.length ? " for your " + chosen.map(o => o.name).join(" and ") : ", per class") + ". Pieces in your vault count too. Tap a set to see its pieces."
      : "You don't own any set pieces for " + (chosen.length > 1 ? "these characters" : "this character") + " yet.";
    const keyOf = p => p.set.hash + ":" + p.cls;
    const row = p => {
      const key = keyOf(p), open = setOpen === key, st = setStatus(p), href = setHref(p), id = "set-more-" + p.set.hash + "-" + p.cls;
      const name = p.set.ours ? p.set.ours.name : p.set.name;
      const slots = ARMOR_SLOTS.map((s, k) => '<svg class="set-slot' + (p.slots.has(s) ? " on" : "") + '" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' + SLOT_ICONS[k] + "</svg>").join("");
      const owned = SLOT_NAMES.filter((n, k) => p.slots.has(ARMOR_SLOTS[k]));
      let more = "";
      if (open){
        const pieces = ITEMS.filter(i => i.setProgress === p)
          .sort((a, b) => ARMOR_SLOTS.indexOf(a.def.b) - ARMOR_SLOTS.indexOf(b.def.b) || b.power - a.power);
        more = '<ul class="set-pieces">' + pieces.map(i => '<li><button type="button" class="set-piece" data-id="' + i.id + '">' +
            '<img src="' + esc(img(iconOf(i))) + '" alt="" width="32" height="32" loading="lazy"><span><b>' + esc(i.def.n) + "</b><small>" + esc(i.def.y || "") + " · " + esc(ownerLabel(i.owner)) + (i.equipped ? ", equipped" : "") + " · " + i.power + "</small></span></button></li>").join("") + "</ul>" +
          (missingSlots(p).length ? '<p class="set-missing">Missing: ' + esc(missingSlots(p).join(", ")) + "</p>" : "") +
          (href ? '<a class="set-link" href="' + href + '"' + NEW_TAB + ">Set bonuses →" + NEW_TAB_NOTE + "</a>" : "");
      }
      return '<li class="set-row' + (st.active ? " active" : "") + (open ? " open" : "") + '">' +
        '<button type="button" class="set-row-btn" data-set="' + key + '" aria-expanded="' + open + '" aria-controls="' + id + '">' +
          '<span class="set-name">' + esc(name) + '</span><span class="set-slots">' + slots + "</span>" +
          '<span class="set-state">' + esc(st.text) + "</span>" +
          '<span class="sr-only">. Have ' + esc(owned.join(", ")) + ".</span></button>" +
        '<div class="set-more" id="' + id + '"' + (open ? "" : " hidden") + ">" + more + "</div></li>";
    };
    const classes = [...new Set(OWNERS.map(o => o.cls).concat([0, 1, 2]))].filter(c => list.some(p => p.cls === c));
    let started = 0;
    const groups = classes.map(c => {
      const mine = list.filter(p => p.cls === c), bonus = mine.filter(p => p.slots.size >= 2), single = mine.filter(p => p.slots.size < 2);
      started += single.length;
      // One class on a phone: the hint names it, so no heading (and the
      // "started" heading moves up a level).
      const titled = classes.length > 1 || !chosen.length, sub = titled ? "h3" : "h2";
      return '<section class="set-class" aria-label="' + esc(CLASS_NAMES[c] || "") + ' sets">' + (titled ? '<h2 class="set-class-name">' + esc(CLASS_NAMES[c] || "") + "</h2>" : "") +
        (bonus.length ? '<ul class="set-rows">' + bonus.map(row).join("") + "</ul>" : '<p class="set-none">No set bonuses yet.</p>') +
        (single.length && setsShowStarted ? '<' + sub + ' class="set-sub">Started (one piece)</' + sub + '><ul class="set-rows">' + single.map(row).join("") + "</ul>" : "") + "</section>";
    }).join("");
    $("set-grid").innerHTML = groups + (started ? '<button type="button" class="fold-all set-started" id="set-started" aria-expanded="' + setsShowStarted + '">' +
      (setsShowStarted ? "Hide" : "Show") + " " + started + " started set" + (started === 1 ? "" : "s") + " (one piece)</button>" : "");
  }

  // Owner, type and chip filters decide which tiles get built; the search
  // text doesn't (applySearch hides and shows built tiles instead).
  // Sort order for tiles (DIM's sort menu): the equipped item first and
  // Junk last as always, then Power, name, rarity, newest (instance ids
  // grow over time) or armor stat total. Remembered in this browser.
  const SORT_KEY = "rallyflag_locker_sort";
  const statTotal = i => i.def.t === 2 ? ARMOR_STATS.reduce((t, h) => t + ((i.stats[h] || {}).value || 0), 0) : -1;
  const newerFirst = (x, y) => (y.id.length - x.id.length) || (y.id > x.id ? 1 : y.id < x.id ? -1 : 0);
  function tileOrder(x, y){
    const base = (y.equipped - x.equipped) || ((TAGS[x.id] === "junk") - (TAGS[y.id] === "junk"));
    if (base) return base;
    const byName = x.def.n.localeCompare(y.def.n);
    switch (state.sort){
      case "name": return byName || (y.power - x.power);
      case "rarity": return ((y.def.r === 6) - (x.def.r === 6)) || (y.power - x.power) || byName;
      case "newest": return newerFirst(x, y);
      case "stats": return (statTotal(y) - statTotal(x)) || (y.power - x.power) || byName;
      default: return (y.power - x.power) || byName;
    }
  }
  // Copies of the same item you own (weapons and armor), for the
  // Duplicates filter and the compare view.
  const copiesOf = item => ITEMS.filter(i => i.hash === item.hash).sort((a, b) => b.power - a.power || (b.equipped - a.equipped));
  let dupeCount = null;
  function matches(item){
    if (state.flags.has("dupes")){
      if (!dupeCount){ dupeCount = new Map(); for (const i of ITEMS) dupeCount.set(i.hash, (dupeCount.get(i.hash) || 0) + 1); }
      if (dupeCount.get(item.hash) < 2) return false;
    }
    if (!isWide() && item.owner !== state.focus) return false;
    const bucket = BUCKET_BY_HASH.get(item.def.b);
    if (state.type && bucket.kind !== state.type) return false;
    if (state.flags.has("exotic") && item.def.r !== 6) return false;
    if (state.flags.has("godroll") && !(item.roll && item.roll.full)) return false;
    if (state.flags.has("set") && !item.set) return false;
    if (state.flags.has("equipped") && !item.equipped) return false;
    if (state.tag === "pve" || state.tag === "pvp"){ if (!hasUse(item.id, state.tag)) return false; }
    else if (state.tag === "wish"){ const w = wishMatch(item); if (!w || !w.full) return false; }
    else if (state.tag === "any" ? !TAGS[item.id] : state.tag === "note" ? !NOTES[item.id] : state.tag && TAGS[item.id] !== state.tag) return false;
    return true;
  }

  // ---------------- search filters (like DIM's) ----------------
  // Plain words match name, type, perks and notes. Filters: is:/not:,
  // in:, tag:, class:, slot:, type:, name:, perk:, note:, power:, tier:,
  // stat:<name|total>:. Terms are ANDed; "or", "-"/"not" and brackets
  // work too. Unknown filters are ignored and named under the box.
  const RARITY = { exotic: 6, legendary: 5, rare: 4, uncommon: 3, common: 2 };
  const SLOT_WORDS = { kinetic: 1498876634, energy: 2465295065, power: 953998645, heavy: 953998645, helmet: 3448274439, gauntlets: 3551918588, arms: 3551918588, chest: 14239492, legs: 20886954, leg: 20886954, classitem: 1585787867, class: 1585787867, mark: 1585787867, bond: 1585787867, cloak: 1585787867 };
  const CLASS_WORDS = { titan: 0, hunter: 1, warlock: 2 };
  const STATE_CRAFTED = 8;
  const squash = t => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Every perk an item has or can switch to (perk: matches either).
  const perkNames = item => item.perkText || (item.perkText = [...new Set(item.plugs.concat(...Object.values(item.alts).map(a => a.map(x => x.plugItemHash))))]
    .map(h => DB.items[h] && showPlug(h) && !isMod(DB.items[h]) ? DB.items[h].n.toLowerCase() : "").filter(Boolean).join("|"));
  function numTest(text){
    const m = /^(>=|<=|>|<|=)?(\d+(?:\.\d+)?)$/.exec(text);
    if (!m) return null;
    const n = +m[2];
    return { ">=": v => v >= n, "<=": v => v <= n, ">": v => v > n, "<": v => v < n }[m[1]] || (v => v === n);
  }
  function statValue(item, name){
    if (name === "total") return item.def.t === 2 ? statTotal(item) : null;
    for (const st of Object.values(item.stats)){ const n = DB.stats[st.statHash]; if (n && squash(n) === name) return st.value; }
    return null;
  }
  // One term -> predicate, or a string naming what's wrong with it.
  function termTest(raw, ctx){
    const unq = v => v.replace(/^"|"$/g, "");
    const m = /^([a-z]+):(.*)$/.exec(raw);
    if (!m){ const w = unq(raw); return item => item.text.includes(w) || (NOTES[item.id] || "").toLowerCase().includes(w); }
    const key = m[1], val = unq(m[2]);
    if (key === "not") { const t = termTest("is:" + val, ctx); return typeof t === "string" ? t : item => !t(item); }
    if (key === "is"){
      if (val in RARITY) return item => item.def.r === RARITY[val];
      if (CLASS_WORDS[val] != null) return item => item.def.t === 2 && item.def.c === CLASS_WORDS[val];
      const dmg = Object.keys(DB.damage).find(h => squash(DB.damage[h].n) === val);
      if (dmg) return item => item.def.t === 3 && String(item.damage) === dmg;
      const tags = TAG_LIST.map(t => t[0]);
      if (tags.includes(val)) return item => TAGS[item.id] === val;
      const use = { pve: "pve", vanguard: "pve", pvp: "pvp", crucible: "pvp" }[val];
      if (use) return item => hasUse(item.id, use);
      const is = {
        weapon: i => i.def.t === 3, armor: i => i.def.t === 2,
        equipped: i => i.equipped, unequipped: i => !i.equipped,
        locked: i => !!(i.state & STATE_LOCKED), unlocked: i => !(i.state & STATE_LOCKED),
        masterwork: i => !!(i.state & STATE_MASTERWORK), masterworked: i => !!(i.state & STATE_MASTERWORK),
        crafted: i => !!(i.state & STATE_CRAFTED),
        dupe: i => ctx.dupes().get(i.hash) > 1, godroll: i => !!(i.roll && i.roll.full),
        set: i => !!i.set, tagged: i => !!TAGS[i.id], hasnote: i => !!NOTES[i.id],
        inloadout: i => ctx.inLoadout().has(i.id), wishlist: i => { const w = wishMatch(i); return !!(w && w.full); }, haswishlist: i => !!wishOf(i), invault: i => i.owner === "vault", ornamented: i => !!i.ornament
      };
      return is[val] || ("is:" + val);
    }
    if (key === "in"){
      if (val === "vault") return i => i.owner === "vault";
      if (CLASS_WORDS[val] != null) return i => i.owner !== "vault" && (ownerOf(i.owner) || {}).cls === CLASS_WORDS[val];
      return "in:" + val;
    }
    if (key === "tag"){
      if (val === "none") return i => !TAGS[i.id];
      if (val === "any") return i => !!TAGS[i.id];
      return TAG_LIST.some(t => t[0] === val) ? i => TAGS[i.id] === val : "tag:" + val;
    }
    if (key === "class") return CLASS_WORDS[val] != null ? i => i.def.t === 2 && i.def.c === CLASS_WORDS[val] : val === "any" ? i => i.def.t === 2 && i.def.c === 3 : "class:" + val;
    if (key === "slot") return SLOT_WORDS[squash(val)] ? i => i.def.b === SLOT_WORDS[squash(val)] : "slot:" + val;
    if (key === "type"){ const w = squash(val); return w ? i => squash(i.def.y || "").includes(w) : "type:"; }
    if (key === "name") return val ? i => i.def.n.toLowerCase().includes(val) : "name:";
    if (key === "perk") return val ? i => perkNames(i).includes(val) : "perk:";
    if (key === "note") return val ? i => (NOTES[i.id] || "").toLowerCase().includes(val) : "note:";
    if (key === "power" || key === "tier"){ const t = numTest(val); return t ? i => t(key === "power" ? i.power : i.tier) : key + ":" + val; }
    if (key === "wish"){ const t = numTest(val); return t ? i => { const w = wishMatch(i); return !!w && t(w.n); } : "wish:" + val; }
    if (key === "stat"){
      const sm = /^([a-z0-9]+):(.+)$/.exec(val), t = sm && numTest(sm[2]);
      return t ? i => { const v = statValue(i, sm[1]); return v != null && t(v); } : "stat:" + val;
    }
    return key + ":";
  }
  // "kill clip", perk:"kill clip", -is:junk, ( ), or, not
  const TOKEN = /-?[a-z]+:"[^"]*"?|-?"[^"]*"?|[()]|[^\s()]+/g;
  function compileSearch(q){
    const tokens = (q.toLowerCase().match(TOKEN) || []).filter(t => t !== "and");
    const bad = [];
    let dupes = null, loIds = null;
    const ctx = {
      dupes: () => dupes || (dupes = ITEMS.reduce((m, i) => m.set(i.hash, (m.get(i.hash) || 0) + 1), new Map())),
      inLoadout: () => loIds || (loIds = new Set(readLoadouts().flatMap(lo => lo.items.map(x => x.id)).concat(OWNERS.flatMap(o => gameLoadouts(o.id).flatMap(g => g.ids || [])))))
    };
    let k = 0;
    const any = () => true;
    function orExpr(){
      const parts = [andExpr()];
      while (tokens[k] === "or"){ k++; parts.push(andExpr()); }
      return parts.length === 1 ? parts[0] : i => parts.some(f => f(i));
    }
    function andExpr(){
      const parts = [];
      while (k < tokens.length && tokens[k] !== ")" && tokens[k] !== "or") parts.push(unary());
      return parts.length === 1 ? parts[0] : parts.length ? i => parts.every(f => f(i)) : any;
    }
    function unary(){
      const t = tokens[k++];
      if (t === "not" && k < tokens.length){ const f = unary(); return i => !f(i); }
      if (t === "("){ const f = orExpr(); if (tokens[k] === ")") k++; return f; }
      if (t.charAt(0) === "-" && t.length > 1){ const f = term(t.slice(1)); return i => !f(i); }
      return term(t);
    }
    function term(t){ const f = termTest(t, ctx); if (typeof f === "string"){ bad.push(f); return any; } return f; }
    let test = any;
    while (k < tokens.length){ const f = orExpr(); const prev = test; test = prev === any ? f : i => prev(i) && f(i); if (tokens[k] === ")") k++; }
    return { test, bad, empty: !tokens.length };
  }

  // Suggestions while typing: filter words, then perk names and item types.
  const FILTER_WORDS = ["is:weapon", "is:armor", "is:exotic", "is:legendary", "is:equipped", "is:locked", "is:unlocked", "is:masterwork", "is:crafted",
    "is:dupe", "is:godroll", "is:set", "is:tagged", "is:hasnote", "is:inloadout", "is:ornamented", "is:kinetic", "is:solar", "is:arc", "is:void", "is:stasis", "is:strand",
    "is:favorite", "is:keep", "is:junk", "is:infuse", "is:archive", "is:pve", "is:pvp", "is:wishlist", "is:haswishlist", "wish:>=", "tag:none", "tag:any",
    "in:vault", "in:titan", "in:hunter", "in:warlock", "class:titan", "class:hunter", "class:warlock", "class:any",
    "slot:kinetic", "slot:energy", "slot:power", "slot:helmet", "slot:gauntlets", "slot:chest", "slot:legs", "slot:classitem",
    "power:>", "power:<", "tier:>=", "tier:5", "stat:total:>=", "stat:weapons:>", "stat:health:>", "stat:class:>", "stat:grenade:>", "stat:super:>", "stat:melee:>",
    "perk:", "type:", "name:", "note:", "not:", "or"];
  function suggestionsFor(q){
    const tail = (q.match(/(?:^|\s|\()(-?[^\s()]*)$/) || [, ""])[1].toLowerCase().replace(/^-/, "");
    if (tail.length < 2 && !tail.includes(":")) return [];
    const out = FILTER_WORDS.filter(w => w.startsWith(tail) && w !== tail);
    const pm = /^(perk|type):"?(.*)$/.exec(tail);
    if (pm && pm[2].length >= 2){
      const names = new Set();
      for (const i of ITEMS){
        if (pm[1] === "type"){ if (i.def.y) names.add(i.def.y); continue; }
        for (const n of perkNames(i).split("|")) if (n) names.add(n);
      }
      [...names].filter(n => n.toLowerCase().includes(pm[2])).sort((a, b) => a.localeCompare(b)).slice(0, 8)
        .forEach(n => out.push(pm[1] + ":" + (/\s/.test(n) ? '"' + n.toLowerCase() + '"' : n.toLowerCase())));
    }
    return out.slice(0, 8);
  }
  const SEARCH_EXAMPLES = [
    ["is:dupe -is:godroll", "Duplicates that aren't our God Roll"],
    ["is:weapon is:junk", "Weapons you tagged Junk"],
    ["is:pvp -is:pve", "Gear you marked PvP only"],
    ["is:haswishlist -is:wishlist", "Copies of wish-listed weapons that miss the roll"],
    ['perk:"kill clip" type:"hand cannon"', "Hand cannons that have or can switch to Kill Clip"],
    ["is:armor stat:total:>=65", "Armor with a stat total of 65 or more"],
    ["in:vault is:exotic is:dupe", "Exotics you have more than one of, in the vault"],
    ["is:legendary -is:locked -is:inloadout -is:tagged", "Unlocked, untagged legendaries no loadout uses"],
    ["(is:solar or is:void) slot:energy", "Solar or Void energy weapons"],
    ["power:>=450 tier:5", "Tier 5 gear at 450 Power or more"]
  ];
  function searchHelpHtml(){
    return '<div class="search-help panel-card" id="search-help" hidden><h2 class="dlg-label">Search filters</h2>' +
      '<p class="muted">Combine terms with spaces (all must match), <b>or</b>, brackets, and <b>-</b> or <b>not</b> to exclude. Put names with spaces in quotes.</p>' +
      '<ul class="search-examples">' + SEARCH_EXAMPLES.map(([q, what]) => '<li><button type="button" class="act-btn" data-search="' + esc(q) + '"><code translate="no">' + esc(q) + "</code></button><span>" + esc(what) + "</span></li>").join("") + "</ul>" +
      '<p class="muted search-words"><b>is:</b> weapon, armor, exotic, legendary, equipped, locked, unlocked, masterwork, crafted, dupe, godroll, set, tagged, hasnote, inloadout, ornamented, a damage type (solar, arc, void, stasis, strand, kinetic), a tag (favorite, keep, junk, infuse, archive), pve, pvp, wishlist (matches your wish list), haswishlist · <b>wish:</b> how many wish-list picks a copy has (wish:>=4) · ' +
        "<b>in:</b> vault, titan, hunter, warlock · <b>tag:</b> a tag, none, any · <b>class:</b> titan, hunter, warlock, any · <b>slot:</b> kinetic, energy, power, helmet, gauntlets, chest, legs, classitem · " +
        "<b>type:</b>, <b>name:</b>, <b>perk:</b>, <b>note:</b> text · <b>power:</b>, <b>tier:</b> a number with &gt;, &lt;, &gt;=, &lt;= · <b>stat:</b>total, weapons, health, class, grenade, super, melee or a weapon stat, then a number (stat:range:&gt;60)</p></div>";
  }

  // Bulk actions on what's shown (DIM's "act on search results"): tag,
  // lock, unlock, move. Equipped items aren't moved. More than 5 items
  // asks for a second tap.
  function renderBulk(){
    const row = $("bulk-row");
    if (!row) return;
    const active = !!state.q.trim() || !!(state.type || state.flags.size || state.tag);
    if (!active || !SHOWN.length){ row.hidden = true; row.innerHTML = ""; return; }
    const was = row.contains(document.activeElement) ? document.activeElement.id : null;
    const keep = { tag: ($("bulk-tag") || {}).value, move: ($("bulk-move") || {}).value };
    const n = SHOWN.length, unlocked = SHOWN.filter(i => !(i.state & STATE_LOCKED)).length;
    const items = n + " item" + (n === 1 ? "" : "s");
    row.hidden = false;
    row.innerHTML = '<span class="bulk-count">' + items + " shown:</span>" +
      '<span class="bulk-group"><label class="bulk-field" for="bulk-tag">Tag as</label><select class="chip chip-select" id="bulk-tag">' +
        '<optgroup label="Tag">' + TAG_LIST.map(([t, name]) => '<option value="' + t + '">' + esc(name) + "</option>").join("") + '<option value="">No tag</option></optgroup>' +
        '<optgroup label="Use for"><option value="use:pve">PvE</option><option value="use:pvp">PvP</option><option value="use:both">PvE and PvP</option><option value="use:">Neither PvE nor PvP</option></optgroup></select>' +
        '<button type="button" class="act-btn" id="bulk-tag-go">Tag ' + items + "</button></span>" +
      '<span class="bulk-group"><button type="button" class="act-btn" id="bulk-lock"' + (unlocked ? "" : ' aria-disabled="true"') + ">Lock " + unlocked + "</button>" +
        '<button type="button" class="act-btn" id="bulk-unlock"' + (n - unlocked ? "" : ' aria-disabled="true"') + ">Unlock " + (n - unlocked) + "</button></span>" +
      '<span class="bulk-group"><label class="bulk-field" for="bulk-move">Move to</label><select class="chip chip-select" id="bulk-move">' +
        OWNERS.map(o => '<option value="' + o.id + '">' + esc(o.name) + "</option>").join("") + '<option value="vault">Vault</option></select>' +
        '<button type="button" class="act-btn" id="bulk-move-go">Move</button></span>';
    if (keep.tag != null) $("bulk-tag").value = keep.tag;
    if (keep.move) $("bulk-move").value = keep.move;
    if (was && $(was)) $(was).focus();
  }
  // Second tap for big batches: the button says what will happen.
  function bulkConfirm(b, n, label){
    if (n <= 5 || b.dataset.confirm === "1") return true;
    b.dataset.confirm = "1"; b.textContent = "Tap again: " + label;
    return false;
  }
  function bulkClick(e){
    const b = e.target.closest("button");
    if (!b || b.getAttribute("aria-disabled") === "true") return;
    const list = SHOWN.slice(), n = list.length;
    if (b.id === "bulk-tag-go"){
      const tag = $("bulk-tag").value, name = tag ? (TAG_LIST.find(t => t[0] === tag) || [, tag])[1] : "";
      if (tag.startsWith("use:")){
        const u = tag.slice(4), what = u === "both" ? "PvE and PvP" : u === "pve" ? "PvE" : u === "pvp" ? "PvP" : "";
        if (!bulkConfirm(b, n, what ? "mark " + n + " " + what : "clear PvE/PvP on " + n)) return;
        const now = Date.now();
        for (const i of list){ u ? (USE[i.id] = u) : delete USE[i.id]; TAG_AT[i.id] = now; }
        saveTags(); tagsChanged(); renderItems();
        toast(what ? "Marked " + n + " item" + (n === 1 ? "" : "s") + " " + what + "." : "Cleared PvE/PvP on " + n + " item" + (n === 1 ? "" : "s") + ".", "ok");
        return;
      }
      if (!bulkConfirm(b, n, tag ? "tag " + n + " as " + name : "remove tags from " + n)) return;
      const now = Date.now();
      for (const i of list){ tag ? (TAGS[i.id] = tag) : delete TAGS[i.id]; TAG_AT[i.id] = now; }
      saveTags(); tagsChanged(); renderItems();
      toast(tag ? "Tagged " + n + " item" + (n === 1 ? "" : "s") + " " + name + "." : "Removed tags from " + n + " item" + (n === 1 ? "" : "s") + ".", "ok");
      return;
    }
    if (b.id === "bulk-lock" || b.id === "bulk-unlock"){
      const lock = b.id === "bulk-lock", todo = list.filter(i => !!(i.state & STATE_LOCKED) !== lock);
      if (busyNotice() || !bulkConfirm(b, todo.length, (lock ? "lock " : "unlock ") + todo.length)) return;
      let k = 0;
      run((lock ? "Locking " : "Unlocking ") + todo.length + " items", () => (lock ? "Locked " : "Unlocked ") + k + " item" + (k === 1 ? "" : "s") + ".",
        async () => { for (const i of todo){ await setLock(i, lock); k++; toast((lock ? "Locking " : "Unlocking ") + k + " of " + todo.length + "…", "busy"); } });
      return;
    }
    if (b.id === "bulk-move-go"){
      const dest = $("bulk-move").value, where = dest === "vault" ? "the vault" : "your " + ownerLabel(dest);
      const todo = list.filter(i => i.owner !== dest && !i.equipped), equipped = list.filter(i => i.owner !== dest && i.equipped).length;
      if (!todo.length) return toast("Nothing to move" + (equipped ? ": equipped items stay where they are." : ": they're all there already."), "ok");
      if (busyNotice() || !bulkConfirm(b, todo.length, "move " + todo.length + " to " + (dest === "vault" ? "vault" : ownerLabel(dest)))) return;
      let moved = 0;
      const skipped = [];
      run("Moving " + todo.length + " items to " + where,
        () => "Moved " + moved + " item" + (moved === 1 ? "" : "s") + " to " + where + "." + (skipped.length ? " " + skipped.length + " didn't fit or couldn't move." : "") + (equipped ? " Equipped items stay where they are." : ""),
        async () => {
          for (const i of todo){
            // A character holds 9 per slot: stop filling a slot that's full.
            if (dest !== "vault" && ITEMS.filter(x => x.owner === dest && !x.equipped && x.def.b === i.def.b).length >= INVENTORY_CAP){ skipped.push(i); continue; }
            try { await moveTo(i, dest); moved++; }
            catch (err){ if (FATAL.test(err.status || "")) throw err; skipped.push(i); }
            toast("Moving " + (moved + skipped.length) + " of " + todo.length + "…", "busy");
          }
        });
    }
  }

  // Search hides and shows the tiles already on the page instead of
  // rebuilding them (a rebuild of ~1,250 tiles took 200-290ms per keystroke
  // in Firefox). Slots and class rows left empty hide too, the counts follow
  // what's visible, and vault previews open up so no match stays clipped.
  function applySearch(){
    const root = $("buckets"), search = compileSearch(state.q), words = search.empty ? [] : [state.q];
    const byId = new Map(ITEMS.map(i => [i.id, i]));
    let shown = 0;
    SHOWN = [];
    root.querySelectorAll(".item-tile[data-id]").forEach(t => {
      const item = byId.get(t.dataset.id);
      const hit = !!item && (!words.length || search.test(item));
      if (hit) SHOWN.push(item);
      if (t.hidden === hit) t.hidden = !hit; // touch only tiles that change
      if (hit) shown++;
    });
    root.classList.toggle("searching", words.length > 0);
    const visible = el => el.querySelectorAll(".item-tile[data-id]:not([hidden])").length;
    root.querySelectorAll(".vault-class").forEach(r => { r.hidden = words.length > 0 && !visible(r); });
    root.querySelectorAll(".bucket:not(.postmaster)").forEach(sec => {
      sec.hidden = words.length > 0 && !visible(sec);
      sec.querySelectorAll(".vis-count").forEach(c => { c.textContent = visible(c.closest(".owner-group") || sec); });
    });
    const empty = $("search-empty");
    if (empty) empty.hidden = !(words.length && !shown);
    $("locker-count").textContent = "Showing " + shown + " of " + $("locker-count").dataset.total + " items";
    const hint = $("search-hint");
    if (hint){ hint.textContent = search.bad.length ? "Not a filter: " + search.bad.join(", ") + ". Ignored; see Filters for the list." : ""; hint.hidden = !search.bad.length; }
    renderBulk();
  }

  function tileHtml(item){
    const d = item.def, dmg = DB.damage[item.damage];
    const mw = item.state & STATE_MASTERWORK;
    const orn = item.ornament && DB.items[item.ornament];
    const wish = wishMatch(item);
    const label = [d.n, d.y, orn ? "ornament " + orn.n : "", item.power ? "power " + item.power : "", item.tier ? "tier " + item.tier : "", mw ? "masterworked" : "", ownerLabel(item.owner) + (item.equipped ? ", equipped" : ""),
      item.roll && item.roll.full ? "matches our God Roll" : "", item.set ? "part of a set" : "",
      wish ? (wish.full ? "matches your wish list" : "has " + wish.n + " of " + wish.total + " wish-list picks") : "", TAGS[item.id] ? "tagged " + TAGS[item.id] : "", USE[item.id] ? "for " + useText(item.id) : "", NOTES[item.id] ? "note: " + NOTES[item.id] : ""].filter(Boolean).join(", ");
    const tag = TAGS[item.id], use = USE[item.id];
    return '<button type="button" class="item-tile ' + tierClass(d) + (mw ? " mw" : "") + (item.equipped ? " equipped" : "") + (tag ? " tag-" + tag : "") + '" data-id="' + item.id + '" draggable="true" aria-label="' + esc(label) + '">' +
      '<img class="icon" src="' + esc(img(iconOf(item))) + '" alt="" loading="lazy" width="64" height="64">' +
      (d.w ? '<img class="wm" src="' + esc(img(d.w)) + '" alt="" loading="lazy" width="64" height="64">' : "") +
      (mw ? '<img class="ov" src="' + esc(img(MW_OVERLAY[d.r === 6 ? 6 : 5])) + '" alt="" loading="lazy" width="64" height="64">' : "") +
      (item.tier >= 1 && item.tier <= 5 ? tierPips(item.tier) : "") +
      (use ? '<span class="tile-use" aria-hidden="true">' + (hasUse(item.id, "pve") ? '<span class="tile-badge use-pve">' + ICON_PVE + "</span>" : "") + (hasUse(item.id, "pvp") ? '<span class="tile-badge use-pvp">' + ICON_PVP + "</span>" : "") + "</span>" : "") +
      // Wish list: a bar along the top edge, as full as the match (green = all of it).
      (wish && wish.n ? '<span class="tile-wish' + (wish.full ? " full" : "") + '" style="--w:' + Math.round(wish.n / wish.total * 100) + '%" aria-hidden="true"></span>' : "") +
      (NOTES[item.id] ? '<span class="tile-note" aria-hidden="true"></span>' : "") +
      (item.roll && item.roll.full || tag ? '<span class="tile-badges" aria-hidden="true">' + (item.roll && item.roll.full ? '<span class="tile-badge">★</span>' : "") +
        (tag === "favorite" ? '<span class="tile-badge fav">♥</span>' : tag ? '<span class="tile-badge tag-' + tag + '">' + (TAG_LIST.find(t => t[0] === tag) || [, , ""])[2] + "</span>" : "") + "</span>" : "") +
      '<span class="tile-power">' + (dmg && dmg.i && d.t === 3 ? '<img src="' + esc(img(dmg.i)) + '" alt="" width="12" height="12">' : "") + (item.power || "") + "</span>" +
    "</button>";
  }

  // Wide screens show everyone at once, like DIM on desktop; narrower ones
  // one owner at a time, like DIM on a phone.
  const WIDE = window.matchMedia("(min-width: 1100px)");
  const isWide = () => WIDE.matches;
  function renderItems(){ isWide() ? renderAll() : renderOne(); }
  // The vault in labelled rows, as DIM does, each keeping the list's order
  // (highest Power first). Armor: one row per class, any class first, then
  // your characters' classes, then any other class you hold (once each).
  // Weapons: one row per weapon type (Auto Rifle, Bow, …), A to Z.
  function vaultRows(list, kind){
    if (kind === "armor"){
      const order = [...new Set([3].concat(OWNERS.map(o => o.cls), [0, 1, 2]))];
      return order.map(c => ({ label: c === 3 ? "Any class" : CLASS_NAMES[c] || "", list: list.filter(i => i.def.c === c) })).filter(g => g.list.length);
    }
    const type = i => i.def.y || "Other";
    return [...new Set(list.map(type))].sort((a, b) => a.localeCompare(b)).map(t => ({ label: t, list: list.filter(i => type(i) === t) }));
  }
  const vaultRowHtml = g => '<div class="vault-class"><span class="vault-class-label">' + esc(g.label) + "</span>" +
    '<div class="item-grid">' + g.list.map(tileHtml).join("") + "</div></div>";
  const PHONE_ROW_PREVIEW = 10; // tiles per vault row before "Show all" (CSS clips at 10)
  const SEARCH_EMPTY = '<p class="locker-empty" id="search-empty" hidden>Nothing matches this search.</p>';

  // Everyone (DIM desktop): per slot, a row of character cells lined up
  // under their cards (equipped item, then inventory), then that slot's
  // vault items full width, armor split by class. Nothing is clipped.
  function renderAll(){
    const shown = ITEMS.filter(matches);
    const byPower = tileOrder;
    const filtering = !!(state.type || state.flags.size || state.tag);
    const slot = b => {
      const items = shown.filter(i => i.def.b === b.hash).sort(byPower);
      if (filtering && !items.length) return "";
      const cells = OWNERS.map(o => {
        const eq = items.filter(i => i.owner === o.id && i.equipped), inv = items.filter(i => i.owner === o.id && !i.equipped);
        const invTotal = ITEMS.filter(i => i.owner === o.id && !i.equipped && i.def.b === b.hash).length;
        const full = invTotal >= INVENTORY_CAP;
        return '<div class="owner-group char-slot" data-owner="' + o.id + '" role="group" aria-label="' + esc(o.name + ", " + invTotal + " of " + INVENTORY_CAP + " in inventory" + (full ? ", full" : "")) + '">' +
          // n/9 sits under the equipped item (where DIM has its "+"), so the
          // inventory lines up with the equipped item's top.
          '<div class="slot-equipped">' + (eq.length ? eq.map(tileHtml).join("") : '<span class="tile-empty" aria-hidden="true"></span>') +
          '<div class="cell-count' + (full ? " full" : "") + '" aria-hidden="true">' + invTotal + "/" + INVENTORY_CAP + "</div></div>" +
          '<div class="item-grid slot-inv">' + inv.map(tileHtml).join("") + "</div></div>";
      }).join("");
      const vault = items.filter(i => i.owner === "vault");
      // Armor in the vault: one row per class (any class first), as DIM does.
      const groups = vaultRows(vault, b.kind);
      const vaultHtml = '<div class="owner-group vault vault-all" data-owner="vault"><div class="group-label">Vault · <span class="vis-count">' + vault.length + "</span></div>" +
        (vault.length ? groups.map(vaultRowHtml).join("") : '<div class="group-empty">Nothing here.</div>') + "</div>";
      const folded = folds.slots.has(b.hash);
      return '<section class="bucket" aria-labelledby="b-' + b.hash + '">' +
        '<h2 id="b-' + b.hash + '"><button type="button" class="bucket-toggle" data-slot="' + b.hash + '" aria-expanded="' + !folded + '" aria-controls="bb-' + b.hash + '">' +
          '<span class="chev" aria-hidden="true"></span>' + b.label + ' <span class="vis-count">' + items.length + "</span></button></h2>" +
        '<div class="slot-body" id="bb-' + b.hash + '"' + (folded ? " hidden" : "") + '><div class="all-chars" style="--n:' + OWNERS.length + '">' + cells + "</div>" + vaultHtml + "</div></section>";
    };
    const html = BUCKETS.filter(b => !state.type || state.type === b.kind).map(slot).join("");
    $("buckets").innerHTML = postmasterHtml() + (html || '<p class="locker-empty">Nothing matches these filters.</p>') + SEARCH_EMPTY;
    $("locker-count").dataset.total = ITEMS.length;
    applySearch();
    $("fold-all").textContent = BUCKETS.every(b => folds.slots.has(b.hash)) ? "Expand all" : "Collapse all";
  }

  // One owner at a time (DIM on a phone). A character's slot: the equipped
  // item on the left, the inventory beside it, n/9 in the heading. The vault
  // is one grid per slot (long lists show a preview). Between phone and
  // desktop widths, weapons and armor sit side by side.
  function renderOne(){
    const shown = ITEMS.filter(matches), owner = state.focus, vault = owner === "vault";
    const byPower = tileOrder;
    // Long vault lists show a preview, but never while searching or
    // filtering, so a match can't end up hidden.
    const filtering = !!(state.type || state.flags.size || state.tag);
    const slot = b => {
      const items = shown.filter(i => i.def.b === b.hash).sort(byPower);
      if (filtering && !items.length) return "";
      let count, full = false, body;
      if (vault){
        const rows = vaultRows(items, b.kind);
        // "Show all" only when a row actually has more than its preview shows.
        const long = !filtering && rows.some(g => g.list.length > PHONE_ROW_PREVIEW), open = folds.vaults.has(b.hash);
        count = '<span class="vis-count">' + items.length + "</span>";
        body = '<div class="owner-group vault' + (long && !open ? " clipped" : "") + '" data-owner="vault">' +
          // One row per class (armor) or weapon type, highest Power first;
          // previews clip each row.
          (!items.length ? '<div class="group-empty">Nothing here.</div>'
            : '<div id="vg-' + b.hash + '">' + rows.map(vaultRowHtml).join("") + "</div>") +
          (long ? '<button type="button" class="vault-more" data-slot="' + b.hash + '" aria-expanded="' + open + '" aria-controls="vg-' + b.hash + '">' + (open ? "Show less" : "Show all " + items.length) + "</button>" : "") + "</div>";
      } else {
        const eq = items.filter(i => i.equipped), inv = items.filter(i => !i.equipped);
        const invTotal = ITEMS.filter(i => i.owner === owner && !i.equipped && i.def.b === b.hash).length; // filters don't change how full it is
        count = invTotal + "/" + INVENTORY_CAP; full = invTotal >= INVENTORY_CAP;
        body = '<div class="owner-group char-slot" data-owner="' + owner + '">' +
          '<div class="slot-equipped">' + (eq.length ? eq.map(tileHtml).join("") : '<span class="tile-empty" aria-hidden="true"></span>') + "</div>" +
          '<div class="item-grid slot-inv">' + inv.map(tileHtml).join("") + "</div></div>";
      }
      const folded = folds.slots.has(b.hash);
      return '<section class="bucket' + (folded ? " folded" : "") + '" aria-labelledby="b-' + b.hash + '">' +
        '<h2 id="b-' + b.hash + '"><button type="button" class="bucket-toggle" data-slot="' + b.hash + '" aria-expanded="' + !folded + '" aria-controls="bb-' + b.hash + '">' +
          '<span class="chev" aria-hidden="true"></span>' + b.label + ' <span class="slot-count' + (full ? " full" : "") + '">' + count + (vault ? "" : '<span class="sr-only"> in inventory</span>') + "</span></button></h2>" +
        '<div class="slot-body" id="bb-' + b.hash + '"' + (folded ? " hidden" : "") + ">" + body + "</div></section>";
    };
    const cols = ["weapons", "armor"].filter(k => !state.type || state.type === k)
      .map(k => BUCKETS.filter(b => b.kind === k).map(slot).join("")).filter(Boolean)
      .map(h => '<div class="slot-col">' + h + "</div>").join("");
    $("buckets").innerHTML = postmasterHtml() + (cols ? '<div class="slot-cols">' + cols + "</div>" : '<p class="locker-empty">Nothing matches these filters.</p>') + SEARCH_EMPTY;
    $("locker-count").dataset.total = ITEMS.filter(i => i.owner === owner).length;
    applySearch();
    $("fold-all").textContent = BUCKETS.every(b => folds.slots.has(b.hash)) ? "Expand all" : "Collapse all";
  }

  // Postmaster: a slim foldable bar (closed by default) with a count and
  // "Pull all" per character, red as it nears Bungie's 21-item limit
  // (after that, new items are lost). Open, it shows small tiles.
  function postmasterHtml(){
    const groups = OWNERS.map(o => ({ o, items: POSTMASTER.filter(p => p.owner === o.id) })).filter(g => g.items.length);
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

  function render(){ dupeCount = null; renderOwners(); renderSets(); renderItems(); }
  WIDE.addEventListener("change", () => { if (ITEMS.length) render(); });

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
    SystemDisabled: "Bungie's servers are down for maintenance. Your gear will be here again when Bungie finishes.",
    DestinyCannotPerformActionAtThisLocation: "Bungie only allows this while that character is in orbit or a social space.",
    DestinyCharacterNotInTower: "Bungie only allows this while that character is in orbit or a social space.",
    DestinyItemNotTransferrable: "Bungie doesn't allow this item to be moved.",
    DestinyItemNotFound: "Bungie couldn't find this item where we expected it. Try Refresh.",
    AccessNotPermittedByApplicationScope: "Bungie says your sign-in doesn't include permission to move gear. Bungie adds that permission when you sign in, so sign in again (once the site's app has \"Move or equip Destiny gear\" turned on)."
  };
  async function post(endpoint, body){
    if (DEMO){ await sleep(250); return; }
    // "TransferItem" etc. live under Actions/Items/; "Loadouts/EquipLoadout" names its own section.
    const res = await RallyFlagAuth.authedFetch((endpoint.includes("/") ? "/Platform/Destiny2/Actions/" : ACTIONS) + endpoint + "/", {
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
      toast(typeof done === "function" ? done() : done, "ok");
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
  // After fresh data: redraw an open item popup, keeping the open perk/mod
  // (and its list) and focus; close it if the item is gone.
  function refreshDialog(){
    const dlg = $("item-dialog");
    if (dlg.open && dlg.dataset.view === "compare" && cmpState){
      if (!ITEMS.some(i => i.id === cmpState.fromId)) return dlg.close();
      const act = document.activeElement, sel = act && dlg.contains(act) ? ["cmpScope", "cmpSort", "cmpOpen", "cmpLock", "cmpMove"].map(k => act.dataset[k] != null ? "[data-" + k.replace(/[A-Z]/g, c => "-" + c.toLowerCase()) + '="' + act.dataset[k] + '"]' : "").join("") + (act.dataset.cmpId ? '[data-cmp-id="' + act.dataset.cmpId + '"]' + (act.dataset.cmpTag ? '[data-cmp-tag="' + act.dataset.cmpTag + '"]' : "") + (act.dataset.cmpUse ? '[data-cmp-use="' + act.dataset.cmpUse + '"]' : "") : "") : "";
      openCompare(cmpState.fromId, { keep: true, focus: sel || null });
      return;
    }
    if (dlg.open && dlg.dataset.item){
      if (!ITEMS.some(i => i.id === dlg.dataset.item)) dlg.close();
      else {
        // Redraw with fresh data but keep the open perk/mod (and its list) and focus.
        const pressed = dlg.querySelector('[data-plug][aria-pressed="true"]'), act = document.activeElement;
        const key = el => el && el.dataset && ["socket", "modPick", "act", "tag", "use"].map(k => el.dataset[k] != null ? "[data-" + k.replace(/[A-Z]/g, c => "-" + c.toLowerCase()) + '="' + el.dataset[k] + '"]' : "").join("") + (el.dataset.plug ? '[data-plug="' + el.dataset.plug + '"]' : "") + (el.dataset.to ? '[data-to="' + el.dataset.to + '"]' : "");
        const pk = pressed && key(pressed), ak = act && dlg.contains(act) ? (act.id ? "#" + act.id : key(act)) : null;
        openItem(dlg.dataset.item);
        const again = pk && dlg.querySelector(pk); if (again) again.click();
        const f = ak && dlg.querySelector(ak); if (f) f.focus();
      }
    }
  }
  let syncTimer = 0;
  function scheduleSync(){ clearTimeout(syncTimer); syncTimer = setTimeout(sync, 1500); }
  async function sync(){
    if (isBusy()) return scheduleSync();
    document.body.classList.add("locker-busy"); // actions wait for the fresh model
    try {
      PROFILE = await loadProfile(); buildModel(); render(); resolvePostmasterNames();
      const dlg = $("item-dialog");
      refreshDialog();
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
  // Mods the player has unlocked (Bungie's plug sets, sent with sockets);
  // null when unknown (sample data), and then every mod of the kind is offered.
  let OWNED_PLUGS = null, OWNED_FOR = null;
  function ownedPlugs(){
    if (OWNED_FOR === PROFILE) return OWNED_PLUGS;
    const set = new Set(), add = sets => { for (const k in sets || {}) for (const p of sets[k]) if (p.canInsert !== false && p.enabled !== false) set.add(p.plugItemHash); };
    add(PROFILE.profilePlugSets && PROFILE.profilePlugSets.data && PROFILE.profilePlugSets.data.plugs);
    const cps = (PROFILE.characterPlugSets && PROFILE.characterPlugSets.data) || {};
    for (const c in cps) add(cps[c].plugs);
    OWNED_FOR = PROFILE; OWNED_PLUGS = set.size ? set : null;
    return OWNED_PLUGS;
  }
  // What can go in a mod socket: armor mods of the socket's kind you've
  // unlocked (plus emptying it), or the socket's own list (weapon mods).
  function modChoices(item, idx){
    const cur = item.plugs[idx], kind = kindOf(cur);
    let list;
    if (kind){
      const owned = ownedPlugs(), seen = new Set();
      list = Object.keys(DB.items).map(Number).filter(h => DB.items[h].k === kind && !isEmptyPlug(h) && !isPlaceholderMod(h) && (!owned || owned.has(h)))
        .sort((a, b) => DB.items[a].n.localeCompare(DB.items[b].n))
        .filter(h => !seen.has(DB.items[h].n) && seen.add(DB.items[h].n));
      if (emptyPlug(kind) && !isEmptyPlug(cur)) list.push(emptyPlug(kind));
    } else list = (item.alts[idx] || []).filter(a => a.canInsert !== false).map(a => a.plugItemHash).filter(h => DB.items[h]);
    return list.filter(h => h !== cur);
  }
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

  function dotHtml(hash, cls, ours, socket){
    const p = DB.items[hash];
    return '<button type="button" class="perk-dot ' + cls + '" data-plug="' + hash + '" data-socket="' + socket + '" aria-pressed="false" title="' + esc(p.n) + '" aria-label="' +
      esc(p.n + (cls === "sel" ? " (on this copy)" : " (can swap to)") + (ours ? ", in our God Roll" : "")) + '">' +
      (p.i ? '<img src="' + esc(img(p.i)) + '" alt="" width="44" height="44">' : "") + (ours ? '<span class="ours" aria-hidden="true"></span>' : "") + "</button>";
  }

  // Compare (like DIM's): your copies of an item side by side, or similar
  // items (same frame, same type; armor: same slot). Click a row name to
  // sort the columns best first (again: worst first); every number row is
  // shaded worst to best. Each column can be locked, tagged Junk/Keep,
  // marked PvE/PvP or moved without leaving. Perks show as icons with the
  // other option in each column; perks every copy shares are dimmed, so
  // what differs stands out.
  const LOWER_IS_BETTER = /charge time|draw time/i;
  const CMP_MAX = 40;
  let cmpState = null; // { fromId, scope, sort: { key, dir } }
  const frameOf = i => { for (const h of i.plugs){ const p = DB.items[h]; if (p && isIntrinsic(p)) return p.n; } return ""; };
  function compareScopes(from){
    const d = from.def, list = [["same", d.n, copiesOf(from)]];
    if (d.t === 3){
      const frame = frameOf(from);
      if (frame) list.push(["frame", frame + " " + (d.y || ""), ITEMS.filter(i => i.def.t === 3 && i.def.y === d.y && frameOf(i) === frame)]);
      list.push(["type", "All " + (d.y || "weapons"), ITEMS.filter(i => i.def.t === 3 && i.def.y === d.y)]);
    } else {
      list.push(["slot", (d.c === 3 ? "" : (CLASS_NAMES[d.c] || "") + " ") + (d.y || "armor"), ITEMS.filter(i => i.def.t === 2 && i.def.b === d.b && i.def.c === d.c)]);
      if (from.set) list.push(["set", from.set.name, ITEMS.filter(i => i.set && i.set.hash === from.set.hash)]);
    }
    // Drop scopes that add nothing over the one before.
    return list.filter((s, k) => k === 0 || s[2].length > list[k - 1][2].length);
  }
  const statOf = (i, name) => { for (const st of Object.values(i.stats)) if (DB.stats[st.statHash] === name) return st.value; return null; };
  const rollScore = i => i.roll ? (i.roll.full ? 1000 : 0) + i.roll.matched : -1;
  function openCompare(fromId, opts){
    const from = ITEMS.find(i => i.id === fromId);
    if (!from) return;
    if (!cmpState || cmpState.fromId !== fromId || !opts) cmpState = { fromId, scope: "same", sort: null };
    const dlg = $("item-dialog");
    const keep = opts && opts.keep ? { x: (dlg.querySelector(".cmp-scroll") || {}).scrollLeft || 0, y: (dlg.querySelector(".dlg-body") || {}).scrollTop || 0, focus: opts.focus } : null;
    const scopes = compareScopes(from), scope = scopes.find(s => s[0] === cmpState.scope) || scopes[0];
    const d = from.def, weapon = d.t === 3;
    let copies = scope[2].slice();
    // Rows: [key, label, value(item) -> number|null, lowerIsBetter]
    let names;
    if (weapon){
      names = [...new Set(copies.flatMap(i => Object.values(i.stats).map(st => DB.stats[st.statHash]).filter(n => n && n !== "Power")))]
        .sort((a, b) => { const ia = STAT_ORDER.indexOf(a), ib = STAT_ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); });
    } else names = ARMOR_STATS.map(h => DB.stats[h]).filter(Boolean);
    const numRows = [["power", "Power", i => i.power, false]]
      .concat(copies.some(i => i.roll) ? [["roll", "God Roll", i => i.roll ? i.roll.matched : null, false]] : [])
      .concat(copies.some(i => wishOf(i)) ? [["wish", "Wish list", i => { const w = wishMatch(i); return w ? w.n : null; }, false]] : [])
      .concat(names.map(n => ["stat:" + n, STAT_SHORT[n] || n, i => statOf(i, n), LOWER_IS_BETTER.test(n)]))
      .concat(weapon ? [] : [["total", "Total", i => statTotal(i), false]]);
    // Sort: the item you opened first by default, then Power.
    const sortRow = cmpState.sort && numRows.find(r => r[0] === cmpState.sort.key);
    copies.sort((a, b) => {
      if (sortRow){
        const va = sortRow[0] === "roll" ? rollScore(a) : sortRow[2](a), vb = sortRow[0] === "roll" ? rollScore(b) : sortRow[2](b);
        if (va == null || vb == null) return (va == null) - (vb == null);
        const diff = (sortRow[3] ? va - vb : vb - va) * cmpState.sort.dir;
        if (diff) return diff;
      }
      return (b.id === fromId) - (a.id === fromId) || b.power - a.power;
    });
    const total = copies.length;
    copies = copies.slice(0, CMP_MAX);
    // Shading against the usual value in the row (the most common one,
    // left plain): better is q3, the best q4; worse is q1, the worst q0.
    // Stats where more isn't better (RPM, zoom, recoil) aren't shaded.
    const NO_SHADE = /rounds per minute|zoom|recoil direction/i;
    const shade = (vals, lower) => {
      const nums = vals.filter(v => v != null);
      if (nums.length < 2) return vals.map(() => null);
      const lo = Math.min(...nums), hi = Math.max(...nums);
      if (lo === hi) return vals.map(() => null);
      // The usual value: the one most copies share; with no clear one, the middle.
      const freq = [...nums.reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
      const sorted = nums.slice().sort((a, b) => a - b), mid = sorted.length / 2;
      const usual = freq[0][1] > 1 && (freq.length === 1 || freq[0][1] > freq[1][1]) ? freq[0][0] : sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
      const best = lower ? lo : hi, worst = lower ? hi : lo, better = v => lower ? v < usual : v > usual;
      return vals.map(v => v == null || v === usual ? null : v === best ? 4 : v === worst ? 0 : better(v) ? 3 : 1);
    };
    const RANK = ["worst", "low", "", "high", "best"];
    const cell = (text, q) => '<td' + (q != null ? ' class="q' + q + '"' : "") + ">" + text + (q === 4 ? '<span class="sr-only"> (best)</span>' : q === 0 ? '<span class="sr-only"> (worst)</span>' : "") + "</td>";
    const head = (key, label) => {
      if (!key) return '<th scope="row">' + esc(label) + "</th>";
      const on = cmpState.sort && cmpState.sort.key === key;
      return '<th scope="row"' + (on ? ' aria-sort="' + (cmpState.sort.dir > 0 ? "descending" : "ascending") + '"' : "") + '><button type="button" class="cmp-sort" data-cmp-sort="' + esc(key) + '">' + esc(label) +
        '<span class="cmp-arrow" aria-hidden="true">' + (on ? (cmpState.sort.dir > 0 ? " ▼" : " ▲") : "") + '</span><span class="sr-only">' + (on ? ", sorted " + (cmpState.sort.dir > 0 ? "best first" : "worst first") : ", sort by this") + "</span></button></th>";
    };
    const numRow = r => {
      const vals = copies.map(r[2]), qs = NO_SHADE.test(r[0]) ? vals.map(() => null) : shade(vals, r[3]);
      const text = (v, i) => {
        if (v == null) return "–";
        if (r[0] === "roll") return (i.roll.full ? "★ " : "") + v + "/" + i.roll.total;
        if (r[0] === "wish"){ const w = wishMatch(i); return (w.full ? "✓ " : "") + v + "/" + w.total; }
        return String(v);
      };
      return "<tr>" + head(r[0], r[1]) + vals.map((v, k) => cell(text(v, copies[k]), qs[k])).join("") + "</tr>";
    };
    const textRow = (label, cells) => "<tr>" + head(null, label) + cells.map(c => "<td>" + c + "</td>").join("") + "</tr>";
    // Perks: per socket, the plug on it (and the one it can switch to).
    const perkSockets = i => i.plugs.map((h, k) => ({ h, k })).filter(x => showPlug(x.h) && !isMod(DB.items[x.h]) && !isIntrinsic(DB.items[x.h]));
    const onEvery = new Set();
    if (copies.length > 1){
      const counts = new Map();
      for (const i of copies) for (const h of new Set(perkSockets(i).map(x => x.h))) counts.set(h, (counts.get(h) || 0) + 1);
      for (const [h, n] of counts) if (n === copies.length) onEvery.add(h);
    }
    const perkIcons = i => {
      const ours = new Set(i.roll ? i.roll.weapon.perkHashes : []);
      const icon = (h, alt) => { const p = DB.items[h]; return '<span class="cmp-perk-ico' + (alt ? " alt" : "") + (ours.has(h) ? " ours" : "") + (!alt && onEvery.has(h) ? " common" : "") + '" title="' + esc(p.n + (alt ? " (can switch to)" : "") + (ours.has(h) ? " · our God Roll" : "")) + '">' +
        (p.i ? '<img src="' + esc(img(p.i)) + '" alt="" width="28" height="28" loading="lazy">' : "") + '<span class="sr-only">' + esc(p.n) + (alt ? " (can switch to)" : "") + (ours.has(h) ? " (our God Roll)" : "") + (!alt && onEvery.has(h) ? " (on every copy)" : "") + "</span></span>"; };
      return '<div class="cmp-perks">' + perkSockets(i).map(x => '<div class="cmp-perk-col">' + icon(x.h, false) +
        (i.alts[x.k] || []).map(a => a.plugItemHash).filter(a => a !== x.h && showPlug(a)).map(a => icon(a, true)).join("") + "</div>").join("") + "</div>";
    };
    const mods = i => i.plugs.filter(h => DB.items[h] && isMod(DB.items[h]) && !isEmptyPlug(h) && !isPlaceholderMod(h))
      .map(h => '<span class="cmp-mod" title="' + esc(DB.items[h].n) + '">' + (DB.items[h].i ? '<img src="' + esc(img(DB.items[h].i)) + '" alt="" width="22" height="22" loading="lazy">' : "") + '<span class="sr-only">' + esc(DB.items[h].n) + "</span></span>").join("") || "–";
    // Column heads: icon, name (when items differ), where, and the actions.
    const target = (OWNERS.slice().sort((a, b) => b.played - a.played)[0] || {});
    const mixed = copies.some(i => i.hash !== from.hash);
    const colHead = i => {
      const locked = !!(i.state & STATE_LOCKED), label = esc(i.def.n) + ", " + i.power + ", " + esc(ownerLabel(i.owner));
      const tagBtn = (t, text) => '<button type="button" class="cmp-act' + (TAGS[i.id] === t ? " on" : "") + '" data-cmp-tag="' + t + '" data-cmp-id="' + i.id + '" aria-pressed="' + (TAGS[i.id] === t) + '" aria-label="' + text + ": " + label + '" title="' + text + '">' + (t === "junk" ? ICON_TRASH : ICON_KEEP) + "</button>";
      const useBtn = (u, text, ico) => '<button type="button" class="cmp-act' + (hasUse(i.id, u) ? " on" : "") + '" data-cmp-use="' + u + '" data-cmp-id="' + i.id + '" aria-pressed="' + hasUse(i.id, u) + '" aria-label="' + text + ": " + label + '" title="' + text + '">' + ico + "</button>";
      const moveTo = i.owner === "vault" ? target : { id: "vault", name: "Vault" };
      return '<th scope="col"><div class="cmp-head"><img src="' + esc(img(iconOf(i))) + '" alt="" width="48" height="48">' +
        '<span class="cmp-name">' + (i.id === fromId ? "This one" : mixed ? esc(i.def.n) : "Copy") + "</span>" +
        '<span class="cmp-acts">' +
          '<button type="button" class="cmp-act' + (locked ? " on" : "") + '" data-cmp-lock="' + i.id + '" aria-pressed="' + locked + '" aria-label="Locked: ' + label + '" title="' + (locked ? "Unlock" : "Lock") + '">' + (locked ? ICON_LOCK : ICON_UNLOCK) + "</button>" +
          tagBtn("junk", "Junk") + tagBtn("keep", "Keep") + useBtn("pve", "PvE", ICON_PVE) + useBtn("pvp", "PvP", ICON_PVP) +
        "</span>" +
        '<span class="cmp-acts"><button type="button" class="act-btn" data-cmp-open="' + i.id + '">Open<span class="sr-only"> ' + label + "</span></button>" +
          (moveTo.id && !i.equipped ? '<button type="button" class="act-btn" data-cmp-move="' + i.id + '" data-to="' + moveTo.id + '">To ' + esc(moveTo.name) + '<span class="sr-only"> (' + label + ")</span></button>" : "") + "</span></div></th>";
    };
    const body = [numRow(numRows[0])].concat(
      textRow("Where", copies.map(i => esc(ownerLabel(i.owner)) + (i.equipped ? ", equipped" : ""))),
      textRow("Tier", copies.map(i => i.tier ? String(i.tier) : "–")),
      textRow("Masterwork", copies.map(i => {
        const plug = i.plugs.map(h => (DB.items[h] || {}).n || "").find(n => MW_PLUG.test(n));
        if (!plug) return i.state & STATE_MASTERWORK ? "Yes" : "–";
        const t = /^tier (\d+)/i.exec(plug);
        return esc(MW_PLUG.exec(plug)[1]) + (t ? " (tier " + t[1] + ")" : " (full)");
      })),
      textRow("Tag", copies.map(i => [TAGS[i.id] ? esc((TAG_LIST.find(t => t[0] === TAGS[i.id]) || [, TAGS[i.id]])[1]) : "", useText(i.id)].filter(Boolean).join(" · ") || "–")),
      weapon ? textRow("Frame", copies.map(i => esc(frameOf(i)) || "–")) : "",
      numRows.filter(r => r[0] === "roll" || r[0] === "wish").map(numRow),
      textRow("Perks", copies.map(perkIcons)),
      textRow("Mods", copies.map(mods)),
      numRows.filter(r => r[0] !== "power" && r[0] !== "roll" && r[0] !== "wish").map(numRow)
    ).join("");
    const chips = scopes.length > 1 ? '<div class="cmp-scopes" role="group" aria-label="Compare with">' + scopes.map(s => '<button type="button" class="chip" data-cmp-scope="' + s[0] + '" aria-pressed="' + (s[0] === scope[0]) + '">' + esc(s[1]) + " (" + s[2].length + ")</button>").join("") + "</div>" : "";
    dlg.dataset.item = ""; dlg.dataset.view = "compare";
    dlg.style.setProperty("--copies", copies.length);
    redrawDialog(dlg,
      '<div class="dlg-head ' + tierClass(d) + '"><div class="dlg-title"><div class="dlg-eyebrow">Compare · ' + (scope[0] === "same" ? total + " copies" : total + " items") + "</div><h2 class=\"dlg-name\" id=\"dlg-name\">" + esc(scope[0] === "same" ? d.n : scope[1]) + "</h2></div>" +
        '<button type="button" class="dlg-close" aria-label="Close">×</button></div>' +
      '<div class="dlg-body">' + chips +
        '<p class="muted cmp-help">Click a row name to sort, best first. Green and blue are better than most copies, orange and red worse. Dimmed perks are on every copy; gold rings are our God Roll.' + (total > CMP_MAX ? " Showing the first " + CMP_MAX + " of " + total + "." : "") + "</p>" +
        '<div class="cmp-scroll" tabindex="0" role="region" aria-label="Side by side"><table class="cmp"><caption class="sr-only">' + esc(scope[1]) + ", side by side</caption>" +
        "<thead><tr><td></td>" + copies.map(colHead).join("") + "</tr></thead><tbody>" + body + "</tbody></table></div></div>");
    dlg.querySelector(".dlg-close").addEventListener("click", () => dlg.close());
    const again = sel => openCompare(fromId, { keep: true, focus: sel });
    dlg.querySelectorAll("[data-cmp-scope]").forEach(b => b.addEventListener("click", () => { cmpState.scope = b.dataset.cmpScope; again('[data-cmp-scope="' + b.dataset.cmpScope + '"]'); }));
    dlg.querySelectorAll("[data-cmp-sort]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.cmpSort, cur = cmpState.sort;
      cmpState.sort = cur && cur.key === k ? { key: k, dir: -cur.dir } : { key: k, dir: 1 };
      again('[data-cmp-sort="' + k + '"]');
      const sc = dlg.querySelector(".cmp-scroll"); if (sc) sc.scrollLeft = 0;
    }));
    dlg.querySelectorAll("[data-cmp-open]").forEach(b => b.addEventListener("click", () => openItem(b.dataset.cmpOpen)));
    const itemOf = b => ITEMS.find(i => i.id === b.dataset.cmpId);
    dlg.querySelectorAll("[data-cmp-tag]").forEach(b => b.addEventListener("click", () => {
      const i = itemOf(b); toggleTag(i.id, b.dataset.cmpTag); renderItems(); renderJunk();
      again('[data-cmp-tag="' + b.dataset.cmpTag + '"][data-cmp-id="' + i.id + '"]');
    }));
    dlg.querySelectorAll("[data-cmp-use]").forEach(b => b.addEventListener("click", () => {
      const i = itemOf(b); toggleUse(i.id, b.dataset.cmpUse); renderItems();
      again('[data-cmp-use="' + b.dataset.cmpUse + '"][data-cmp-id="' + i.id + '"]');
    }));
    const back = sel => () => { if (dlg.open && dlg.dataset.view === "compare") again(sel); };
    dlg.querySelectorAll("[data-cmp-lock]").forEach(b => b.addEventListener("click", () => {
      if (busyNotice()) return;
      const i = ITEMS.find(x => x.id === b.dataset.cmpLock), lock = !(i.state & STATE_LOCKED);
      run((lock ? "Locking " : "Unlocking ") + i.def.n, (lock ? "Locked " : "Unlocked ") + i.def.n + ".", () => setLock(i, lock), back('[data-cmp-lock="' + i.id + '"]'), i);
    }));
    dlg.querySelectorAll("[data-cmp-move]").forEach(b => b.addEventListener("click", () => {
      if (busyNotice()) return;
      const i = ITEMS.find(x => x.id === b.dataset.cmpMove), to = b.dataset.to, where = to === "vault" ? "the vault" : "your " + ownerLabel(to);
      run("Moving " + i.def.n + " to " + where, "Moved " + i.def.n + " to " + where + ".", () => moveTo(i, to), back('[data-cmp-move="' + i.id + '"]'), i);
    }));
    if (!dlg.open) dlg.showModal();
    if (keep){
      const sc = dlg.querySelector(".cmp-scroll"), bd = dlg.querySelector(".dlg-body");
      if (sc) sc.scrollLeft = keep.x; if (bd) bd.scrollTop = keep.y;
      const f = keep.focus && dlg.querySelector(keep.focus); if (f) f.focus({ preventScroll: true });
    } else {
      const focusBtn = dlg.querySelector('[data-cmp-open="' + fromId + '"]'); if (focusBtn) focusBtn.focus();
    }
  }

  // The popup's Wish list block: the rolls you want for this weapon, with
  // whether this copy has each, and the wanted perks ringed in the columns.
  // Picking happens on a generic copy of the weapon (openWishView).
  function wishHtml(item){
    const name = wishName(item), rolls = WISHES[name] || [], have = wishHave(item);
    const list = rolls.map((r, k) => {
      const n = r.groups.filter(g => g.some(x => have.has(x.toLowerCase()))).length, full = n === r.groups.length;
      return '<div class="wish-roll"><span class="wish-status' + (full ? " ok" : "") + '">' + (full ? ICON_WISH + " This copy has it" : "Has " + n + " of " + r.groups.length) + "</span>" +
        '<span class="wish-perks">' + r.groups.map(g => g.map(x => '<span class="' + (have.has(x.toLowerCase()) ? "got" : "") + '">' + esc(x) + "</span>").join(" or ")).join(" · ") + "</span>" +
        '<span class="wish-btns"><button type="button" class="act-btn" data-wish-edit="' + k + '">Edit<span class="sr-only"> roll ' + (k + 1) + "</span></button>" +
        '<button type="button" class="act-btn" data-wish-del="' + k + '">Delete<span class="sr-only"> roll ' + (k + 1) + "</span></button></span></div>";
    }).join("");
    return '<div class="dlg-label">Wish list</div>' + list + '<div class="act-row"><button type="button" class="act-btn" id="wish-add">' + (rolls.length ? "Add another roll" : "Pick the perks you want") + "</button></div>";
  }
  // The popup's Masterwork line: stat and tier, ringed when a wish-list roll wants that stat.
  function mwHtml(item){
    const h = item.def.t === 3 && item.plugs.find(x => MW_PLUG.test((DB.items[x] || {}).n || ""));
    if (!h) return "";
    const p = DB.items[h], stat = MW_PLUG.exec(p.n)[1], tier = /^tier (\d+)/i.exec(p.n);
    const wanted = (WISHES[wishName(item)] || []).some(r => r.groups.some(g => g.some(x => x.toLowerCase() === "masterwork: " + stat.toLowerCase())));
    return '<div class="dlg-label">Masterwork</div><div class="intrinsic mw-row' + (wanted ? " wished" : "") + '">' + (p.i ? '<img src="' + esc(img(p.i)) + '" alt="" width="42" height="42">' : "") +
      "<div><b>" + esc(stat) + "</b><small>" + (tier ? "Tier " + tier[1] + " of 10" : "Fully masterworked") + (wanted ? " · on your wish list" : "") + "</small></div></div>";
  }
  function wireWish(dlg, item){
    const name = wishName(item), rolls = WISHES[name] || [];
    const add = $("wish-add");
    if (add) add.addEventListener("click", () => openWishView(item.id, -1));
    dlg.querySelectorAll("[data-wish-edit]").forEach(b => b.addEventListener("click", () => openWishView(item.id, +b.dataset.wishEdit)));
    dlg.querySelectorAll("[data-wish-del]").forEach(b => b.addEventListener("click", () => {
      if (b.dataset.confirm !== "1"){ b.dataset.confirm = "1"; b.firstChild.textContent = "Tap again to delete"; return; }
      saveWish(name, rolls.filter((r, k) => k !== +b.dataset.wishDel));
      renderItems(); openItem(item.id); $("wish-add").focus(); toast("Wish-list roll deleted.", "ok");
    }));
    const wanted = new Set(rolls.flatMap(r => r.groups.flat()).map(x => x.toLowerCase()));
    dlg.querySelectorAll(".perk-dot").forEach(b => b.classList.toggle("wished", wanted.has(((DB.items[+b.dataset.plug] || {}).n || "").toLowerCase())));
  }

  // Every perk a weapon can roll, per column, from Bungie's item and plug
  // set definitions (a few small requests, kept for the visit). Retired
  // perks are left out; enhanced versions fold into their perk by name.
  const PERK_POOLS = new Map();
  function perkPool(hash){
    if (!PERK_POOLS.has(hash)) PERK_POOLS.set(hash, (async () => {
      const get = async (kind, h) => {
        const res = await fetch(BUNGIE + "/Platform/Destiny2/Manifest/" + kind + "/" + h + "/", { headers: { "X-API-Key": window.RallyFlagAPI.BUNGIE_API_KEY } });
        const j = await res.json().catch(() => ({}));
        if (!j.Response) throw new Error(j.ErrorStatus === "SystemDisabled" ? FRIENDLY.SystemDisabled : (j.Message || "HTTP " + res.status));
        return j.Response;
      };
      const def = await get("DestinyInventoryItemDefinition", hash);
      // A socket's choices are in a plug set, or (origin traits) listed on the socket itself.
      const entries = (def.sockets && def.sockets.socketEntries) || [];
      const defs = await Promise.all(entries.map(e => {
        const h = e.randomizedPlugSetHash || e.reusablePlugSetHash;
        return h ? get("DestinyPlugSetDefinition", h).catch(() => null) : (e.reusablePlugItems || []).length ? { reusablePlugItems: e.reusablePlugItems } : null;
      }));
      // Columns: { label, perks: [{ h, n (name matched and stored), show }] }.
      const cols = [];
      for (const set of defs){
        if (!set) continue;
        const seen = new Set(), perks = [], mw = new Map();
        for (const p of set.reusablePlugItems || []){
          const d = DB.items[p.plugItemHash];
          if (p.currentlyCanRoll === false || !d) continue;
          // The masterwork socket: one choice per stat (the fully masterworked plug's icon).
          const m = MW_PLUG.exec(d.n);
          if (m){ if (!mw.has(m[1]) || /^masterworked/i.test(d.n)) mw.set(m[1], p.plugItemHash); continue; }
          if (!showPlug(p.plugItemHash) || isMod(d) || isIntrinsic(d) || seen.has(d.n)) continue;
          seen.add(d.n); perks.push({ h: p.plugItemHash, n: d.n });
        }
        if (perks.length) cols.push({ label: colLabel(perks[0].h), perks });
        if (mw.size) cols.push({ label: "Masterwork", perks: [...mw].map(([stat, h]) => ({ h, n: "Masterwork: " + stat, show: stat })) });
      }
      if (!cols.length) throw new Error("Bungie lists no perk choices for it.");
      return cols;
    })().catch(e => { PERK_POOLS.delete(hash); throw e; }));
    return PERK_POOLS.get(hash);
  }
  const colLabel = h => { const y = (DB.items[h] || {}).y || "Perk"; return /trait/i.test(y) && !/origin/i.test(y) ? "Trait" : y.replace(/^Enhanced /, ""); };
  // A generic copy of the weapon with every perk it can roll: tap the ones
  // you want (several in a column = any of them), then Save roll. Shows how
  // many of your copies have that roll as you pick.
  let wishView = null; // { fromId, name, k, cols, picks: [Set(names) per column], keep: [groups not in the pool] }
  async function openWishView(fromId, k){
    const item = ITEMS.find(i => i.id === fromId);
    if (!item) return;
    const d = item.def, name = wishName(item), dlg = $("item-dialog");
    dlg.dataset.item = ""; dlg.dataset.view = "wish";
    const head = '<div class="dlg-head ' + tierClass(d) + '"><div class="dlg-icon"><img src="' + esc(img(d.i)) + '" alt="" width="56" height="56">' + (d.w ? '<img src="' + esc(img(d.w)) + '" alt="" width="56" height="56">' : "") + "</div>" +
      '<div class="dlg-title"><div class="dlg-eyebrow">Wish list · ' + esc(d.y || "Weapon") + '</div><h2 class="dlg-name" id="dlg-name" tabindex="-1">' + esc(d.n) + "</h2></div>" +
      '<button type="button" class="dlg-close" aria-label="Close">×</button></div>';
    redrawDialog(dlg, head + '<div class="dlg-body"><p class="wish-help" role="status">Loading every perk ' + esc(d.n) + " can roll…</p></div>");
    dlg.querySelector(".dlg-close").addEventListener("click", () => dlg.close());
    let cols, fallback = "";
    try { cols = await perkPool(item.hash); }
    catch (e){
      // Bungie's definitions didn't come: offer what this copy has.
      fallback = "Couldn't load every perk (" + e.message + "), so these are the perks on this copy and the ones it can switch to.";
      cols = item.plugs.map((h, idx) => [h].concat((item.alts[idx] || []).map(a => a.plugItemHash))).filter(c => showPlug(c[0]) && !isMod(DB.items[c[0]]) && !isIntrinsic(DB.items[c[0]]))
        .map(c => ({ label: colLabel(c[0]), perks: [...new Map(c.filter(h => DB.items[h] && showPlug(h)).map(h => [DB.items[h].n, { h, n: DB.items[h].n }])).values()] }));
      const mw = mwStatOf(item), mwPlug = item.plugs.find(h => MW_PLUG.test((DB.items[h] || {}).n || ""));
      if (mw) cols.push({ label: "Masterwork", perks: [{ h: mwPlug, n: "Masterwork: " + mw, show: mw }] });
    }
    if (!dlg.open || dlg.dataset.view !== "wish") return; // closed while loading
    // Masterwork last, with only the stats this weapon has (the plug set is shared by every weapon type).
    const statNames = new Set(Object.values(item.stats).map(st => DB.stats[st.statHash]).filter(Boolean));
    cols = cols.map(c => c.label === "Masterwork" ? { label: c.label, perks: c.perks.filter(e => statNames.has(e.show)) } : c).filter(c => c.perks.length)
      .sort((a, b) => (a.label === "Masterwork") - (b.label === "Masterwork"));
    const roll = k >= 0 && WISHES[name] ? WISHES[name][k] : null;
    const picks = cols.map(() => new Set()), keep = [];
    for (const g of roll ? roll.groups : []){
      const lower = g.map(x => x.toLowerCase());
      const c = cols.findIndex(col => col.perks.some(e => lower.includes(e.n.toLowerCase())));
      if (c >= 0) g.forEach(x => { const e = cols[c].perks.find(y => y.n.toLowerCase() === x.toLowerCase()); if (e) picks[c].add(e.n); }); else keep.push(g);
    }
    wishView = { fromId, name, k, cols, picks, keep };
    dlg.style.setProperty("--wish-cols", cols.length);
    const ours = new Set(item.roll ? item.roll.weapon.perkHashes.map(h => (DB.items[h] || {}).n) : []);
    const owned = ITEMS.filter(i => i.def.t === 3 && wishName(i) === name);
    const onCopies = new Set(owned.flatMap(i => [...wishHave(i)]));
    const colsHtml = cols.map((col, c) => '<div class="wish-col" role="group" aria-labelledby="wc-' + c + '"><div class="wish-col-h" id="wc-' + c + '">' + esc(col.label) + "</div>" +
      col.perks.map(e => { const p = DB.items[e.h] || {}, on = picks[c].has(e.n);
        return '<button type="button" class="wish-perk' + (on ? " on" : "") + (ours.has(e.n) ? " ours" : "") + '" data-wish-col="' + c + '" data-wish-perk="' + esc(e.n) + '" aria-pressed="' + on + '" title="' + esc(e.show ? "Masterwork on " + e.show + " (any tier)" : p.x || e.n) + '">' +
          (p.i ? '<img src="' + esc(img(p.i)) + '" alt="" width="28" height="28" loading="lazy">' : '<span class="wish-noicon"></span>') + "<span>" + esc(e.show || e.n) + (e.show ? '<span class="sr-only"> masterwork</span>' : "") +
          (ours.has(e.n) ? '<small>our God Roll</small>' : onCopies.has(e.n.toLowerCase()) ? "<small>on a copy you own</small>" : "") + "</span></button>"; }).join("") + "</div>").join("");
    redrawDialog(dlg, head + '<div class="dlg-body">' +
      (fallback ? '<p class="wish-help">' + esc(fallback) + "</p>" : "") +
      '<p class="wish-help">Tap the perks you want, and the masterwork stat if it matters. Pick several in one column if any of them will do. Columns you leave empty don\'t matter.</p>' +
      '<p class="wish-count" id="wish-count" role="status"></p>' +
      '<div class="wish-cols">' + colsHtml + "</div>" +
      '<div class="act-row wish-actions"><button type="button" class="act-btn" id="wish-save">Save roll</button><button type="button" class="act-btn" id="wish-cancel">Cancel</button></div></div>');
    dlg.querySelector(".dlg-close").addEventListener("click", () => dlg.close());
    const groups = () => wishView.picks.filter(x => x.size).map(x => [...x]).concat(wishView.keep);
    const count = () => {
      const g = groups();
      if (!g.length) return $("wish-count").textContent = "Nothing picked yet. You have " + owned.length + " " + (owned.length === 1 ? "copy" : "copies") + ".";
      const n = owned.filter(i => { const have = wishHave(i); return g.every(x => x.some(y => have.has(y.toLowerCase()))); }).length;
      $("wish-count").textContent = n + " of your " + owned.length + " " + (owned.length === 1 ? "copy has" : "copies have") + " this roll.";
    };
    count();
    dlg.querySelectorAll("[data-wish-perk]").forEach(b => b.addEventListener("click", () => {
      const set = wishView.picks[+b.dataset.wishCol], n = b.dataset.wishPerk;
      set.has(n) ? set.delete(n) : set.add(n);
      b.classList.toggle("on", set.has(n)); b.setAttribute("aria-pressed", String(set.has(n)));
      count();
    }));
    const back = sel => { wishView = null; openItem(fromId); const t = $(sel) || $("wish-add"); if (t) t.focus(); };
    $("wish-cancel").addEventListener("click", () => back("wish-add"));
    $("wish-save").addEventListener("click", () => {
      const g = groups();
      if (!g.length) return toast("Tap at least one perk first.", "error");
      const next = (WISHES[name] || []).slice();
      k >= 0 && next[k] ? (next[k] = { groups: g }) : next.push({ groups: g });
      saveWish(name, next);
      renderItems();
      const matches = owned.filter(i => (wishMatch(i) || {}).full).length;
      back("wish-add");
      toast("Wish-list roll saved. " + (matches ? matches + " of your copies " + (matches === 1 ? "has" : "have") + " it." : "None of your copies has it yet."), "ok");
    });
    $("dlg-name").focus();
  }

  function openItem(id){
    const item = ITEMS.find(i => i.id === id);
    if (!item) return;
    const d = item.def, dmg = DB.damage[item.damage];
    const ourPerks = new Set(item.roll ? item.roll.weapon.perkHashes : []);
    const eyebrow = (d.r === 6 ? "Exotic" : "Legendary") + " · " + (d.y || "");
    const sub = (d.t === 3 && dmg ? "<span>" + (dmg.i ? '<img src="' + esc(img(dmg.i)) + '" alt="" width="14" height="14">' : "") + esc(dmg.n) + "</span>" : "") +
      "<span>" + esc(ownerLabel(item.owner)) + (item.equipped ? " · equipped" : "") + "</span>" +
      (item.tier ? '<span class="flag">Tier ' + item.tier + "</span>" : "") +
      (item.state & STATE_MASTERWORK ? '<span class="flag">Masterworked</span>' : "") +
      (item.state & STATE_LOCKED ? '<span class="flag">Locked</span>' : "");

    // Rally Flag's own notes first: our God Roll and armor set progress.
    let notes = "";
    if (item.roll){
      const r = item.roll;
      notes += '<div class="callout godroll"><span><strong>' + (r.full ? "Our God Roll" : r.matched + " of " + r.total + " God Roll perks") + "</strong>" +
        ' <span class="muted">(gold diamonds below)</span></span><a href="' + PUBLIC_SITE + "god-rolls.html#weapon-" + esc(r.weapon.slug) + '"' + NEW_TAB + ">See our roll →" + NEW_TAB_NOTE + "</a></div>";
    }
    if (item.set){
      const p = item.setProgress, ours = item.set.ours;
      notes += '<div class="callout"><span><strong>' + esc(ours ? ours.name : item.set.name) + "</strong> " + p.slots.size + '/5 · <span class="muted">' + esc(setStatus(p).text) + "</span></span>" +
        (ours ? '<a href="' + setHref(p) + '"' + NEW_TAB + ">Set bonuses →" + NEW_TAB_NOTE + "</a>" : "") + "</div>";
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
      // An empty armor mod socket shows as a square to fill.
      if (kindOf(h) && isEmptyPlug(h) && DB.items[h]){
        mods.push('<button type="button" class="mod-sq empty" data-plug="' + h + '" data-socket="' + idx + '" aria-pressed="false" title="' + esc(DB.items[h].n) + '" aria-label="' + esc(DB.items[h].n) + '"><span aria-hidden="true">+</span></button>');
        return;
      }
      if (!showPlug(h)) return;
      const p = DB.items[h];
      if (isIntrinsic(p) && !intrinsic){
        const rpm = statRows.find(st => st.name === "Rounds Per Minute"), impact = statRows.find(st => st.name === "Impact");
        const detail = rpm && impact ? rpm.value + " rpm / " + impact.value + " impact" : (p.y || "");
        intrinsic = '<div class="intrinsic">' + (p.i ? '<img src="' + esc(img(p.i)) + '" alt="" width="42" height="42">' : "") + "<div><b>" + esc(p.n) + "</b><small>" + esc(detail) + "</small></div></div>";
      } else if (isMod(p)){
        // Mod slots list every mod you own as an option; show only the one in it.
        mods.push('<button type="button" class="mod-sq" data-plug="' + h + '" data-socket="' + idx + '" aria-pressed="false" title="' + esc(p.n) + '" aria-label="' + esc(p.n) + '">' +
          (p.i ? '<img src="' + esc(img(p.i)) + '" alt="" width="44" height="44">' : "") + "</button>");
      } else {
        const alts = (item.alts[idx] || []).map(a => a.plugItemHash).filter(a => a !== h && showPlug(a));
        cols.push('<div class="perk-col">' + dotHtml(h, "sel", ourPerks.has(h), idx) + alts.map(a => dotHtml(a, "alt", ourPerks.has(a), idx)).join("") + "</div>");
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
      '<div class="act-row"><span class="act-label">Compare</span><button type="button" class="act-btn" id="open-compare">' + (copiesOf(item).length > 1 ? "Compare " + copiesOf(item).length + " copies" : "Compare with similar") + "</button></div>" +
      '<div class="act-row"><span class="act-label">Tag</span>' +
        TAG_LIST.map(([t, name, ico]) => '<button type="button" class="act-btn tag" data-tag="' + t + '" aria-pressed="' + (TAGS[item.id] === t) + '">' + (ico.charAt(0) === "<" ? ico : ico + " ") + name + "</button>").join("") + "</div>" +
      '<div class="act-row"><span class="act-label">Mode</span>' +
        USE_LIST.map(([u, name, ico, what]) => '<button type="button" class="act-btn tag use-' + u + '" data-use="' + u + '" aria-pressed="' + hasUse(item.id, u) + '" title="' + what + '">' + ico + name + '<span class="sr-only"> (' + what + ")</span></button>").join("") + "</div>" +
      '<form class="act-row note-row" id="note-form"><label class="act-label" for="item-note">Note</label>' +
        '<input type="text" id="item-note" maxlength="120" value="' + esc(NOTES[item.id] || "") + '" placeholder="e.g. PvE roll, keep for Onslaught" autocomplete="off">' +
        '<button type="submit" class="act-btn">Save note</button></form></div>';
    const orn = item.ornament && DB.items[item.ornament];
    const blocks = [
      notes ? '<div class="rf-notes">' + notes + "</div>" : "",
      label("Ornament") + (orn ? '<div class="orn-row">' + (orn.i ? '<img src="' + esc(img(orn.i)) + '" alt="" width="42" height="42">' : "") + "<div><b>" + esc(orn.n) + "</b><small>" + esc(orn.y || "Ornament") + "</small></div></div>"
        : item.ornament ? '<p class="muted orn-none">An ornament Rally Flag doesn\'t know yet</p>' : '<p class="muted orn-none">None (default look)</p>'),
      stats ? label("Stats") + stats : "",
      intrinsic ? label(d.t === 3 ? "Frame" : "Archetype") + intrinsic : "",
      cols.length ? label("Perks") + '<div class="perk-cols" role="group" aria-label="Perks">' + cols.join("") + "</div>" : "",
      mwHtml(item),
      cols.length && d.t === 3 ? wishHtml(item) : "",
      mods.length ? label("Mods") + '<div class="mod-row" role="group" aria-label="Mods">' + mods.join("") + "</div>" : ""
    ].filter(Boolean).map(b => '<div class="dlg-block">' + b + "</div>");
    const hasPlugs = cols.length || mods.length;

    const dlg = $("item-dialog");
    dlg.dataset.item = item.id; dlg.dataset.view = "item";
    redrawDialog(dlg,
      '<div class="dlg-head ' + tierClass(d) + '"><div class="dlg-icon"><img src="' + esc(img(iconOf(item))) + '" alt="" width="56" height="56">' + (d.w ? '<img src="' + esc(img(d.w)) + '" alt="" width="56" height="56">' : "") + "</div>" +
        '<div class="dlg-title"><div class="dlg-eyebrow">' + esc(eyebrow) + '</div><h2 class="dlg-name" id="dlg-name">' + esc(d.n) + '</h2><div class="dlg-sub">' + sub + "</div></div>" +
        (item.power ? '<div class="dlg-power"><small>Power</small><b>' + item.power + "</b></div>" : "") +
        '<button type="button" class="dlg-close" aria-label="Close">×</button></div>' +
      actions +
      '<div class="dlg-body">' + blocks.join("") +
        (hasPlugs ? '<div class="plug-info" id="plug-info" aria-live="polite">Tap a perk or mod to see what it does' + (d.t === 3 ? ", or to switch to it" : "") + ".</div>" +
          '<div class="plug-change" id="plug-change"></div>' : "") + "</div>");
    dlg.querySelector(".dlg-close").addEventListener("click", () => dlg.close());
    // Switching perks and mods (DIM's popup): a perk you can switch to
    // gets "Use this perk"; a mod socket lists the mods you can put there.
    // Bungie only changes gear a character holds, so a vault item moves to
    // your last-played character first.
    const reopenItem = () => { if (dlg.open && dlg.dataset.item === item.id) openItem(item.id); };
    const holder = item.owner !== "vault" ? item.owner : (OWNERS.slice().sort((a, b) => b.played - a.played)[0] || {}).id;
    const vaultNote = item.owner === "vault" ? '<p class="muted plug-note">It\'s in the vault, so it moves to your ' + esc(ownerLabel(holder)) + " first.</p>" : "";
    const changePlug = (idx, hash) => {
      if (busyNotice()) return;
      const p = DB.items[hash] || { n: "that" };
      const what = isEmptyPlug(hash) ? "Emptying the socket on " + d.n : "Putting " + p.n + " on " + d.n;
      run(what, isEmptyPlug(hash) ? "Emptied that socket on " + d.n + "." : p.n + " is on " + d.n + ".", async () => {
        if (item.owner === "vault") await moveTo(item, holder);
        await insertPlug(item.id, item.owner, idx, hash);
        item.perkText = null;
      }, () => { reopenItem(); const again = dlg.querySelector('[data-socket="' + idx + '"][data-plug="' + hash + '"]'); if (again) again.focus(); }, item);
    };
    wireWish(dlg, item);
    dlg.querySelectorAll("[data-plug]").forEach(b => b.addEventListener("click", () => {
      dlg.querySelectorAll("[data-plug]").forEach(o => o.setAttribute("aria-pressed", String(o === b)));
      const h = +b.dataset.plug, idx = +b.dataset.socket, p = DB.items[h];
      $("plug-info").innerHTML = "<b>" + esc(p.n) + "</b>" + (p.y ? " · " + esc(p.y) : "") + (ourPerks.has(h) ? " · in our God Roll" : "") +
        (p.x ? "<br>" + esc(p.x) : "");
      const box = $("plug-change");
      box.innerHTML = "";
      if (b.classList.contains("alt")){
        const alt = (item.alts[idx] || []).find(a => a.plugItemHash === h);
        box.innerHTML = alt && alt.canInsert === false ? '<p class="muted plug-note">This one isn\'t unlocked on this copy yet.</p>'
          : '<div class="act-row"><button type="button" class="act-btn" id="plug-use">Use ' + esc(p.n) + "</button></div>" + vaultNote;
        const use = $("plug-use"); if (use) use.addEventListener("click", () => changePlug(idx, h));
      } else if (b.classList.contains("mod-sq")){
        const choices = modChoices(item, idx);
        if (!choices.length) return;
        box.innerHTML = '<div class="dlg-label" id="mod-pick-h">Swap ' + esc(p.n) + " for</div>" +
          '<div class="mod-pick" role="group" aria-labelledby="mod-pick-h">' + choices.map(c => {
            const m = DB.items[c];
            return '<button type="button" class="mod-choice" data-mod-pick="' + c + '">' + (m.i ? '<img src="' + esc(img(m.i)) + '" alt="" width="32" height="32" loading="lazy">' : "") + "<span>" + esc(isEmptyPlug(c) ? "Empty the socket" : m.n) + "</span></button>";
          }).join("") + "</div>" + vaultNote;
        box.querySelectorAll("[data-mod-pick]").forEach(x => x.addEventListener("click", () => changePlug(idx, +x.dataset.modPick)));
        box.scrollIntoView({ block: "nearest" });
      }
    }));
    // Tags are local (no Bungie call), so they apply instantly: redraw just
    // that tile (rebuilding a 1,000+ item vault froze the page ~0.7s). With
    // a Favorites/Junk filter on, the tile may need to come or go: rebuild.
    // With a tag filter on, the tile may need to come or go: rebuild.
    const redrawTile = () => {
      const old = document.querySelectorAll('#buckets .item-tile[data-id="' + item.id + '"]');
      if (state.tag || !old.length) renderItems();
      else {
        old.forEach(t => { const hidden = t.hidden; t.outerHTML = tileHtml(item); if (hidden) document.querySelector('#buckets .item-tile[data-id="' + item.id + '"]:not([hidden])').hidden = true; });
        if (state.q) applySearch(); // a search like is:pvp may now match or not
      }
    };
    dlg.querySelectorAll("[data-tag]").forEach(b => b.addEventListener("click", () => {
      toggleTag(item.id, b.dataset.tag);
      redrawTile(); renderJunk();
      openItem(item.id);
      const again = dlg.querySelector('[data-tag="' + b.dataset.tag + '"]');
      if (again) again.focus();
    }));
    dlg.querySelectorAll("[data-use]").forEach(b => b.addEventListener("click", () => {
      toggleUse(item.id, b.dataset.use);
      redrawTile();
      openItem(item.id);
      const again = dlg.querySelector('[data-use="' + b.dataset.use + '"]');
      if (again) again.focus();
    }));
    const cmp = $("open-compare");
    if (cmp) cmp.addEventListener("click", () => openCompare(item.id));
    $("note-form").addEventListener("submit", e => {
      e.preventDefault();
      const text = $("item-note").value;
      if (setNote(item.id, text)){ redrawTile(); toast(text.trim() ? "Note saved." : "Note removed.", "ok"); }
      openItem(item.id);
      const again = $("item-note"); if (again) again.focus();
    });
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
    dlg.dataset.item = ""; dlg.dataset.view = "postmaster";
    redrawDialog(dlg,
      '<div class="dlg-head ' + (p.gear ? tierClass(d) : "") + '"><div class="dlg-icon">' + (d.i ? '<img src="' + esc(img(d.i)) + '" alt="" width="56" height="56">' : "") + "</div>" +
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
      if (isWide()) return; // everyone is already shown
      state.focus = b.dataset.owner;
      try { localStorage.setItem(FOCUS_KEY, state.focus); } catch (e){}
      render();
    });
    $("tag-filter").addEventListener("change", e => { state.tag = e.target.value; renderItems(); });
    $("sort-by").value = state.sort;
    $("sort-by").addEventListener("change", e => { state.sort = e.target.value; try { localStorage.setItem(SORT_KEY, state.sort); } catch (err){} renderItems(); });
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
    // Search box: a combobox with filter suggestions (arrows + Enter pick
    // one, Escape closes), a Filters help panel, and the bulk-action bar.
    const box = $("locker-search"), list = $("search-suggest");
    let t = 0, sugg = [], active = -1;
    const runSearch = () => { state.q = box.value.trim(); applySearch(); };
    const closeSugg = () => { sugg = []; active = -1; list.hidden = true; list.innerHTML = ""; box.setAttribute("aria-expanded", "false"); box.removeAttribute("aria-activedescendant"); };
    const showSugg = () => {
      sugg = suggestionsFor(box.value); active = -1;
      if (!sugg.length || document.activeElement !== box) return closeSugg();
      list.innerHTML = sugg.map((w, k) => '<li role="option" id="sg-' + k + '" aria-selected="false" data-k="' + k + '" translate="no">' + esc(w) + "</li>").join("");
      list.hidden = false; box.setAttribute("aria-expanded", "true"); box.removeAttribute("aria-activedescendant");
      place();
    };
    // Fixed under the box (the pinned header clips anything inside it).
    const place = () => {
      if (list.hidden) return;
      const r = box.getBoundingClientRect();
      list.style.top = (r.bottom + 4) + "px"; list.style.left = r.left + "px"; list.style.width = Math.min(r.width, 520) + "px";
    };
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    const mark = k => {
      active = k;
      list.querySelectorAll("[role=option]").forEach((o, j) => o.setAttribute("aria-selected", String(j === k)));
      box.setAttribute("aria-activedescendant", "sg-" + k);
    };
    const pickSugg = k => {
      const w = sugg[k], open = /[:<>=]$/.test(w);
      box.value = box.value.replace(/(^|[\s(])(-?)[^\s()]*$/, (m, pre, neg) => pre + neg + w) + (open ? "" : " ");
      closeSugg(); box.focus(); runSearch();
      if (open) showSugg();
    };
    box.addEventListener("input", () => { clearTimeout(t); t = setTimeout(runSearch, 120); showSugg(); });
    box.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp"){
        if (!sugg.length) return showSugg();
        e.preventDefault();
        mark(e.key === "ArrowDown" ? (active + 1) % sugg.length : (active <= 0 ? sugg.length : active) - 1);
      } else if (e.key === "Enter" && active >= 0){ e.preventDefault(); pickSugg(active); }
      else if (e.key === "Escape" && sugg.length){ e.preventDefault(); closeSugg(); }
    });
    box.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== box) closeSugg(); }, 150));
    list.addEventListener("mousedown", e => e.preventDefault()); // keep focus in the box
    list.addEventListener("click", e => { const o = e.target.closest("[data-k]"); if (o) pickSugg(+o.dataset.k); });
    $("search-help-slot").innerHTML = searchHelpHtml();
    const helpBtn = $("search-help-btn");
    helpBtn.addEventListener("click", () => {
      const open = $("search-help").hidden;
      $("search-help").hidden = !open; helpBtn.setAttribute("aria-expanded", String(open));
      if (open && !$("view-gear").hidden) $("search-help").scrollIntoView({ block: "nearest" });
    });
    $("search-help").addEventListener("click", e => {
      const b = e.target.closest("[data-search]");
      if (!b) return;
      box.value = b.dataset.search; runSearch();
      toast("Showing " + SHOWN.length + " for " + b.dataset.search, "ok");
    });
    $("bulk-row").addEventListener("click", bulkClick);
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
    // Drag a tile onto a character or vault card, or onto the "Move to" bar
    // pinned to the top of the screen while dragging, to move it there
    // (pointer devices; the popup's Move buttons do the same everywhere).
    let dragId = null;
    const dropOn = e => {
      const t = e.target.closest("[data-drop], .owner-card[data-owner], .owner-group[data-owner]");
      const item = dragId && ITEMS.find(i => i.id === dragId);
      const to = t && (t.dataset.drop || t.dataset.owner);
      return t && item && to !== item.owner ? { t, item, to } : null;
    };
    const clearDrop = () => document.querySelectorAll(".drop-target").forEach(x => x.classList.remove("drop-target"));
    $("buckets").addEventListener("dragstart", e => {
      const tile = e.target.closest(".item-tile[data-id]");
      if (!tile){ e.preventDefault(); return; }
      dragId = tile.dataset.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragId);
      const from = (ITEMS.find(i => i.id === dragId) || {}).owner;
      // Shown a tick later: changing the page inside dragstart can cancel the drag.
      setTimeout(() => {
        if (!dragId) return;
        $("drop-bar").innerHTML = '<span class="drop-label">Move to</span>' + OWNERS.map(o => o.id).concat("vault").filter(id => id !== from)
          .map(id => '<div class="drop-slot" data-drop="' + id + '">' + esc(ownerLabel(id)) + "</div>").join("");
        $("drop-bar").hidden = false;
      });
    });
    document.addEventListener("dragover", e => {
      const d = dropOn(e);
      if (!d) return;
      e.preventDefault();
      if (!d.t.classList.contains("drop-target")){ clearDrop(); d.t.classList.add("drop-target"); }
    });
    document.addEventListener("dragleave", e => { const t = e.target.closest && e.target.closest(".drop-target"); if (t && !t.contains(e.relatedTarget)) t.classList.remove("drop-target"); });
    document.addEventListener("dragend", () => { dragId = null; clearDrop(); $("drop-bar").hidden = true; });
    document.addEventListener("drop", e => {
      const d = dropOn(e);
      if (!d) return;
      e.preventDefault();
      clearDrop();
      $("drop-bar").hidden = true;
      const item = d.item, to = d.to, where = to === "vault" ? "the vault" : "your " + ownerLabel(to);
      if (!busyNotice()) run("Moving " + item.def.n + " to " + where, "Moved " + item.def.n + " to " + where + ".", () => moveTo(item, to), null, item);
    });
    $("tools-btn").addEventListener("click", () => setTools($("tools-panel").hidden));
    try { if (localStorage.getItem(TOOLS_KEY) === "1") setTools(true); } catch (e){}
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
    $("junk-row").addEventListener("click", e => {
      const b = e.target.closest("[data-junk-to]");
      if (!b || busyNotice()) return;
      const charId = b.dataset.junkTo, who = ownerLabel(charId), { moves, left } = junkPlan(charId);
      if (!moves.length) return toast("Your " + who + " has no free inventory space in those slots. Dismantle or move a few things first.", "error");
      // Farming would send them straight back to the vault.
      const paused = farming.delete(charId);
      if (paused){ farmNote = ""; saveFarm(); setFarmTimer(); }
      const locked = moves.filter(i => i.state & STATE_LOCKED).length;
      const done = "Sent " + moves.length + " junk to your " + who + "." +
        (left ? " " + left + " more didn't fit: dismantle these, then send again." : "") +
        (locked ? " " + locked + (locked === 1 ? " is" : " are") + " locked: unlock before dismantling." : "") +
        (paused ? " Farming on your " + who + " is off so it doesn't send them back." : "");
      run("Sending " + moves.length + " junk to your " + who, done, async () => { for (const i of moves) await moveTo(i, charId); });
    });
    // Coming back to the tab: catch up once.
    document.addEventListener("visibilitychange", () => { if (!document.hidden && farming.size) farmTick(); });
    $("locker-refresh").addEventListener("click", async () => {
      if (busyNotice()) return;
      toast("Refreshing from Bungie…", "busy");
      try {
        PROFILE = await loadProfile(); buildModel(); render(); resolvePostmasterNames(); refreshDialog();
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
    $("set-grid").addEventListener("click", e => {
      const piece = e.target.closest(".set-piece");
      if (piece) return openItem(piece.dataset.id);
      const rowBtn = e.target.closest("[data-set]");
      if (rowBtn){
        setOpen = setOpen === rowBtn.dataset.set ? null : rowBtn.dataset.set;
        renderSets();
        $("set-grid").querySelector('[data-set="' + rowBtn.dataset.set + '"]').focus();
        return;
      }
      if (e.target.closest("#set-started")){ setsShowStarted = !setsShowStarted; renderSets(); $("set-started").focus(); }
    });
    document.querySelector(".view-tabs").addEventListener("click", e => {
      const t = e.target.closest(".view-tab");
      if (t) showView(t.id.slice(4));
    });
    // Arrow keys move between the two tabs (WAI-ARIA tabs pattern).
    document.querySelector(".view-tabs").addEventListener("keydown", e => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      const cur = VIEWS.findIndex(v => $("tab-" + v).getAttribute("aria-selected") === "true");
      const next = e.key === "Home" ? 0 : e.key === "End" ? VIEWS.length - 1 : (cur + (e.key === "ArrowRight" ? 1 : VIEWS.length - 1)) % VIEWS.length;
      showView(VIEWS[next], true);
    });
    // Click on the backdrop closes the dialog.
    $("item-dialog").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
    $("item-dialog").addEventListener("close", () => { document.body.appendChild($("locker-toast")); wishView = null; });
  }

  async function init(){
    if (!DEMO && !RallyFlagAuth.isSignedIn()){ if (SHARE_ID) showSharePreview(); else showSignedOut(); return; }
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
      pullLoadouts();
      if (location.hash.length > 1) showView(location.hash.slice(1));
      window.addEventListener("hashchange", () => showView(location.hash.slice(1)));
      openShare();
    } catch (e){
      showError(e.message || String(e));
    }
  }
  init();
})();
