/* ============================================================
   Raid & Dungeon Report (report.html): any player's raid and dungeon
   clears, fastest times and time played, per activity, on the same art
   cards as the Raids and Dungeons pages.

   Bungie's public stats, no sign-in needed: find the player by Bungie
   name (User/Search/GlobalName for suggestions, SearchDestinyPlayer-
   ByBungieName for an exact Name#1234), their characters (deleted ones
   too: Account/Stats), and each character's AggregateActivityStats.
   assets/raid-activities.js (tools/build-raid-activities.js) says which
   activity hashes are which raid or dungeon and which version.
   Clears are Bungie's completion count (checkpoint runs included) and
   "fastest" is Bungie's fastest completion, which can be a checkpoint
   run; the page says so.
   URL: report.html?p=<membershipType>-<membershipId>.
   ============================================================ */
(function(){
  const BUNGIE = "https://www.bungie.net";
  const API_KEY = window.RallyFlagAPI.BUNGIE_API_KEY;
  const RECENT_KEY = "rallyflag_report_recent";
  const CLASSES = ["Titan", "Hunter", "Warlock"];
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const img = p => p ? (p.charAt(0) === "/" ? BUNGIE + p : p) : "";

  async function api(path, body){
    const res = await fetch(BUNGIE + "/Platform" + path, body ? { method: "POST", headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) } : { headers: { "X-API-Key": API_KEY } });
    const j = await res.json().catch(() => ({}));
    if (j.ErrorStatus === "SystemDisabled") throw new Error("Bungie's servers are down for maintenance");
    if (j.ErrorCode !== 1) throw new Error(j.Message || "HTTP " + res.status);
    return j.Response;
  }
  // A few requests at a time.
  async function pool(list, n, fn){
    const out = new Array(list.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length){ const k = i++; out[k] = await fn(list[k]); } }));
    return out;
  }

  // ---------------- finding a player ----------------
  // The membership that holds the account (cross save's primary, else the first).
  const pick = list => list.find(m => m.crossSaveOverride && m.crossSaveOverride === m.membershipType) || list.find(m => !m.crossSaveOverride) || list[0];
  async function findExact(text){
    const m = /^(.+)#(\d{1,4})$/.exec(text.trim());
    if (!m) return null;
    const list = await api("/Destiny2/SearchDestinyPlayerByBungieName/-1/", { displayName: m[1].trim(), displayNameCode: +m[2] });
    return list && list.length ? pick(list) : null;
  }
  let suggestJob = 0;
  async function suggest(text){
    const job = ++suggestJob, box = $("rr-suggest");
    const prefix = text.trim().replace(/#.*$/, "");
    // A full Name#1234 is looked up, not suggested.
    if (prefix.length < 2 || /#\d{1,4}$/.test(text.trim())){ box.hidden = true; box.innerHTML = ""; return; }
    let found = [];
    try { found = ((await api("/User/Search/GlobalName/0/", { displayNamePrefix: prefix })).searchResults || []).filter(x => (x.destinyMemberships || []).length).slice(0, 8); }
    catch (e){ found = []; }
    if (job !== suggestJob) return;
    box.innerHTML = found.map(x => { const m = pick(x.destinyMemberships), name = x.bungieGlobalDisplayName + "#" + String(x.bungieGlobalDisplayNameCode).padStart(4, "0");
      return '<li><button type="button" class="rr-chip" data-p="' + m.membershipType + "-" + m.membershipId + '" data-name="' + esc(name) + '">' + esc(name) + "</button></li>"; }).join("");
    box.hidden = !found.length;
  }

  // ---------------- a player's report ----------------
  async function report(type, id){
    const [profile, account] = await Promise.all([
      api("/Destiny2/" + type + "/Profile/" + id + "/?components=100,200"),
      api("/Destiny2/" + type + "/Account/" + id + "/Stats/?groups=1")
    ]);
    const chars = (account.characters || []).map(c => c.characterId);
    const aggs = await pool(chars, 4, c => api("/Destiny2/" + type + "/Account/" + id + "/Character/" + c + "/Stats/AggregateActivityStats/").catch(() => ({ activities: [] })));
    // Per activity (guide slug, or the name for retired ones): clears, by version, fastest ms, seconds played.
    const by = new Map(), MAP = window.RaidActivities || {};
    for (const a of aggs) for (const x of a.activities || []){
      const m = MAP[x.activityHash];
      if (!m) continue;
      const v = x.values || {}, n = k => ((v[k] || {}).basic || {}).value || 0;
      const k = m[0] || m[3];
      let e = by.get(k);
      if (!e){ e = { key: k, slug: m[0], kind: m[1], name: m[3], clears: 0, versions: {}, fastest: 0, seconds: 0, kills: 0, deaths: 0 }; by.set(k, e); }
      const c = n("activityCompletions");
      e.clears += c; e.seconds += n("activitySecondsPlayed"); e.kills += n("activityKills"); e.deaths += n("activityDeaths");
      if (c) e.versions[m[2]] = (e.versions[m[2]] || 0) + c;
      const f = n("fastestCompletionMsForActivity");
      if (c && f > 0 && (!e.fastest || f < e.fastest)) e.fastest = f;
    }
    return { profile, by, deleted: (account.characters || []).filter(c => c.deleted).length };
  }

  // ---------------- drawing ----------------
  const fmtTime = ms => { const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60; return h ? h + "h " + String(m).padStart(2, "0") + "m" : m + ":" + String(sec).padStart(2, "0"); };
  const fmtHours = s => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? h.toLocaleString() + "h " + m + "m" : m + "m"; };
  // Normal first, then the rest by how many clears.
  const versionsText = v => Object.entries(v).sort((a, b) => (b[0] === "Normal") - (a[0] === "Normal") || b[1] - a[1]).map(([k, n]) => esc(k) + " " + n.toLocaleString()).join(" · ");
  function card(item, kind, e){
    const none = !e || !e.clears;
    return '<a class="activity-card panel-card rr-card' + (none ? " none" : "") + '" href="' + window.rallyFlagGuideHref(kind, item.slug) + '">' + window.rallyFlagArtThumb(item) +
      '<div class="activity-name">' + esc(item.name) + "</div>" +
      '<div class="rr-clears"><b>' + (none ? 0 : e.clears.toLocaleString()) + "</b> " + ((e && e.clears) === 1 ? "clear" : "clears") + "</div>" +
      (none ? '<p class="rr-line">' + (e && e.seconds ? "Played " + fmtHours(e.seconds) + ", no clear yet" : "No clears yet") + "</p>"
        : '<dl class="rr-meta"><div><dt>Fastest</dt><dd>' + (e.fastest ? fmtTime(e.fastest) : "–") + "</dd></div><div><dt>Time played</dt><dd>" + fmtHours(e.seconds) + "</dd></div></dl>" +
          '<p class="rr-line">' + versionsText(e.versions) + "</p>") +
      '<div class="rr-badges" data-badges="' + esc(item.slug) + '"></div>' +
      '<div class="activity-arrow">View guide →</div></a>';
  }
  function render(r, type, id){
    const idx = window.ActivityIndex, ud = (r.profile.profile && r.profile.profile.data && r.profile.profile.data.userInfo) || {};
    const name = ud.bungieGlobalDisplayName ? ud.bungieGlobalDisplayName + "#" + String(ud.bungieGlobalDisplayNameCode || 0).padStart(4, "0") : ud.displayName || "Guardian";
    const chars = Object.values((r.profile.characters && r.profile.characters.data) || {}).sort((a, b) => Date.parse(b.dateLastPlayed) - Date.parse(a.dateLastPlayed));
    const sum = kind => [...r.by.values()].filter(e => e.kind === kind).reduce((t, e) => ({ clears: t.clears + e.clears, seconds: t.seconds + e.seconds }), { clears: 0, seconds: 0 });
    const raids = sum("raid"), dungeons = sum("dungeon");
    const grid = (list, kind) => '<div class="activity-grid">' + list.map(item => card(item, kind, r.by.get(item.slug))).join("") + "</div>";
    const retired = [...r.by.values()].filter(e => !e.slug && e.clears).sort((a, b) => b.clears - a.clears);
    remember(name, type + "-" + id);
    document.title = name + " - Raid & Dungeon Report - Rally Flag";
    $("rr-out").innerHTML =
      '<section class="rr-player panel-card" aria-labelledby="rr-name">' + (chars[0] && chars[0].emblemBackgroundPath ? '<img class="rr-emblem" src="' + esc(img(chars[0].emblemBackgroundPath)) + '" alt="">' : "") +
        '<div class="rr-who"><h2 id="rr-name" tabindex="-1">' + esc(name) + "</h2>" +
          '<p class="rr-chars">' + chars.map(c => esc(CLASSES[c.classType] || "Guardian") + " " + c.light).join(" · ") + (r.deleted ? " · " + r.deleted + " deleted" : "") + "</p></div>" +
        '<dl class="rr-totals"><div><dt>Raid clears</dt><dd>' + raids.clears.toLocaleString() + "</dd></div><div><dt>Dungeon clears</dt><dd>" + dungeons.clears.toLocaleString() + "</dd></div>" +
          "<div><dt>Time in both</dt><dd>" + fmtHours(raids.seconds + dungeons.seconds) + "</dd></div></dl>" +
        '<button type="button" class="rr-btn rr-copy" id="rr-copy">Copy link</button></section>' +
      '<p class="rr-progress" id="rr-progress" role="status"></p>' +
      '<h2 class="rr-h">Raids</h2>' + grid(idx.raids, "raid") +
      '<h2 class="rr-h">Dungeons</h2>' + grid(idx.dungeons, "dungeon") +
      (retired.length ? '<h2 class="rr-h">Retired raids</h2><ul class="rr-retired">' + retired.map(e => "<li><b>" + esc(e.name) + "</b> " + e.clears.toLocaleString() + (e.clears === 1 ? " clear" : " clears") + (e.fastest ? " · fastest " + fmtTime(e.fastest) : "") + "</li>").join("") + "</ul>" : "") +
      '<p class="rr-note">Clears and times are Bungie\'s own numbers, across every character (deleted ones too). Clears count runs started from a checkpoint, and the fastest time can be one of those.</p>';
    $("rr-copy").addEventListener("click", () => {
      const url = location.origin + location.pathname + "?p=" + type + "-" + id;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => { $("rr-copy").textContent = "Link copied"; }, () => { $("rr-copy").textContent = url; });
    });
  }

  // ---------------- badges ----------------
  // From the player's run history (raid mode 4, dungeon mode 82, every
  // character): Contest / Day One / Week One by date (raid-releases.js) or
  // Bungie's "Contest" versions. Solo, duo, trio and flawless need each
  // run's carnage report (who was in it, any deaths, started from the
  // beginning), fetched only for completed runs that could count (this
  // player didn't die, or three players or fewer; two for dungeons, whose
  // fireteam is three, so Trio is a raid badge only) and kept in IndexedDB,
  // since a finished run's report never changes.
  const STATS = "https://stats.bungie.net/Platform";
  const BADGE_ORDER = ["Solo Flawless", "Solo", "Duo Flawless", "Duo", "Trio Flawless", "Trio", "Flawless", "Day One", "Contest", "Week One"];
  function store(){
    return new Promise((resolve, reject) => {
      // Version 2: the "fresh" rule changed, so summaries saved before it are dropped.
      const req = indexedDB.open("rallyflag-report", 2);
      req.onupgradeneeded = () => { const d = req.result; if (d.objectStoreNames.contains("pgcr")) d.deleteObjectStore("pgcr"); d.createObjectStore("pgcr"); };
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
  }
  let dbJob = null;
  const db = () => dbJob || (dbJob = store().catch(() => null));
  async function cacheGet(id){ const d = await db(); if (!d) return null; return new Promise(r => { const q = d.transaction("pgcr").objectStore("pgcr").get(id); q.onsuccess = () => r(q.result || null); q.onerror = () => r(null); }); }
  async function cachePut(id, v){ const d = await db(); if (!d) return; try { d.transaction("pgcr", "readwrite").objectStore("pgcr").put(v, id); } catch (e){} }
  // A run, boiled down: { fresh, players, flawless }.
  async function runOf(id){
    const hit = await cacheGet(id);
    if (hit) return hit;
    const res = await fetch(STATS + "/Destiny2/Stats/PostGameCarnageReport/" + id + "/", { headers: { "X-API-Key": API_KEY } });
    const j = await res.json().catch(() => ({}));
    if (!j.Response) throw new Error(j.Message || "HTTP " + res.status);
    const r = j.Response, entries = r.entries || [];
    // Bungie's own flag when the report has it; the starting phase only for
    // old reports without it (a checkpoint run can still say phase 0).
    const fresh = typeof r.activityWasStartedFromBeginning === "boolean" ? r.activityWasStartedFromBeginning : r.startingPhaseIndex === 0;
    const players = new Set(entries.map(e => e.player && e.player.destinyUserInfo && e.player.destinyUserInfo.membershipId)).size;
    const v = { fresh, players, flawless: fresh && entries.every(e => !((e.values.deaths || {}).basic || {}).value) };
    cachePut(id, v);
    return v;
  }
  async function runHistory(type, id, c, mode){
    const out = [];
    for (let page = 0; page < 40; page++){
      const r = await api("/Destiny2/" + type + "/Account/" + id + "/Character/" + c + "/Stats/Activities/?mode=" + mode + "&count=250&page=" + page).catch(() => ({}));
      const list = r.activities || [];
      out.push(...list);
      if (list.length < 250) break;
    }
    return out;
  }
  function showBadges(found){
    document.querySelectorAll("[data-badges]").forEach(el => {
      const set = found.get(el.dataset.badges);
      // A low-man badge hides when a smaller (or same) team did it at least as
      // cleanly: Solo hides Duo and Trio, Duo Flawless hides Trio Flawless and
      // Duo, but Trio Flawless stays next to a plain Duo. Plain Flawless hides
      // behind any low-man flawless.
      const SIZES = ["Solo", "Duo", "Trio"], rank = b => [SIZES.indexOf(b.replace(" Flawless", "")), / Flawless$/.test(b)];
      const beaten = b => { const [n, f] = rank(b); return n >= 0 && [...set].some(o => { const [m, g] = rank(o); return o !== b && m >= 0 && m <= n && (g || !f); }); };
      // Week One hides behind Contest or Day One (those clears were in week one too), as raid.report does.
      const shown = set ? BADGE_ORDER.filter(b => set.has(b) && !beaten(b) && !(b === "Flawless" && SIZES.some(x => set.has(x + " Flawless"))) &&
        !(b === "Week One" && (set.has("Contest") || set.has("Day One")))) : [];
      el.innerHTML = shown.map(b => '<span class="rr-badge' + (/flawless/i.test(b) ? " gold" : "") + '">' + b + "</span>").join("");
    });
  }
  async function badges(type, id, job){
    const MAP = window.RaidActivities || {}, REL = window.RaidReleases || {};
    const progress = t => { const el = $("rr-progress"); if (el && job === loading) el.textContent = t; };
    progress("Reading every run for badges…");
    const account = await api("/Destiny2/" + type + "/Account/" + id + "/Stats/?groups=1").catch(() => ({ characters: [] }));
    const lists = await pool((account.characters || []).flatMap(c => [[c.characterId, 4], [c.characterId, 82]]), 4, ([c, mode]) => runHistory(type, id, c, mode));
    if (job !== loading) return;
    const found = new Map(), add = (slug, b) => { if (!found.has(slug)) found.set(slug, new Set()); found.get(slug).add(b); };
    const candidates = [], seen = new Set();
    for (const a of lists.flat()){
      const d = a.activityDetails || {}, m = MAP[d.referenceId] || MAP[d.directorActivityHash], v = a.values || {}, n = k => ((v[k] || {}).basic || {}).value || 0;
      if (!m || !m[0] || n("completed") !== 1 || n("completionReason") !== 0 || seen.has(d.instanceId)) continue;
      seen.add(d.instanceId);
      const slug = m[0], rel = REL[slug], t = Date.parse(a.period);
      if (/contest/i.test(m[2])) add(slug, "Contest");
      if (rel){
        const hours = (t - Date.parse(rel.start)) / 36e5;
        if (hours >= 0 && hours < (rel.dayOne || 0)) add(slug, "Day One");
        if (hours >= 0 && hours < (rel.contest || 0)) add(slug, "Contest");
        if (hours >= 0 && hours < 168) add(slug, "Week One");
      }
      // Dungeons are three-player activities, so only solo and duo count as low-man there.
      const most = m[1] === "dungeon" ? 2 : 3;
      if (n("deaths") === 0 || n("playerCount") <= most) candidates.push({ id: d.instanceId, slug, most });
    }
    showBadges(found);
    let done = 0;
    progress("Checking " + candidates.length.toLocaleString() + " runs for solo, duo, trio and flawless clears… 0%");
    await pool(candidates, 6, async c => {
      if (job !== loading) return;
      try {
        const r = await runOf(c.id);
        if (r.flawless) add(c.slug, "Flawless");
        if (r.fresh && r.players >= 1 && r.players <= c.most){
          const size = ["Solo", "Duo", "Trio"][r.players - 1];
          add(c.slug, size + (r.flawless ? " Flawless" : ""));
        }
      } catch (e){}
      done++;
      if (done % 10 === 0 || done === candidates.length){ showBadges(found); progress("Checking " + candidates.length.toLocaleString() + " runs for solo, duo, trio and flawless clears… " + Math.round(done / candidates.length * 100) + "%"); }
    });
    if (job !== loading) return;
    showBadges(found);
    progress("Badges from " + seen.size.toLocaleString() + " clears. Solo, duo, trio and flawless count only runs started from the beginning.");
  }

  // ---------------- recent lookups ----------------
  function recent(){ try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch (e){ return []; } }
  function remember(name, p){
    const list = [{ name, p }].concat(recent().filter(x => x.p !== p)).slice(0, 6);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e){}
    renderRecent();
  }
  function renderRecent(){
    const list = recent();
    $("rr-recent").innerHTML = list.length ? '<span class="rr-recent-label">Recent</span>' + list.map(x => '<button type="button" class="rr-chip" data-p="' + esc(x.p) + '" data-name="' + esc(x.name) + '">' + esc(x.name) + "</button>").join("") : "";
  }

  // ---------------- flow ----------------
  let loading = 0;
  async function show(p, push){
    const m = /^(\d+)-(\d+)$/.exec(p || "");
    if (!m) return;
    const job = ++loading;
    suggestJob++; // a suggestion search still running doesn't reopen the list
    $("rr-suggest").hidden = true;
    $("rr-out").innerHTML = '<p class="rr-status" role="status">Adding up clears across every character…</p>';
    if (push) history.pushState({ p }, "", "?p=" + p);
    try {
      const r = await report(m[1], m[2]);
      if (job !== loading) return;
      render(r, m[1], m[2]);
      badges(m[1], m[2], job);
      const h = $("rr-name"); if (h && push) h.focus();
    } catch (e){
      if (job === loading) $("rr-out").innerHTML = '<p class="rr-status error" role="status">Couldn\'t load this player (' + esc(e.message) + ").</p>";
    }
  }
  async function submit(e){
    e.preventDefault();
    const text = $("rr-q").value.trim();
    if (!text) return;
    if (!/#\d{1,4}$/.test(text)){ suggest(text); $("rr-out").innerHTML = '<p class="rr-status" role="status">Add the 4-digit code after the name (Name#1234), or pick a match below the box.</p>'; return; }
    $("rr-out").innerHTML = '<p class="rr-status" role="status">Looking for ' + esc(text) + "…</p>";
    try {
      const m = await findExact(text);
      if (!m) { $("rr-out").innerHTML = '<p class="rr-status error" role="status">No Destiny player called ' + esc(text) + ". Check the name and the code.</p>"; return; }
      show(m.membershipType + "-" + m.membershipId, true);
    } catch (err){ $("rr-out").innerHTML = '<p class="rr-status error" role="status">The search didn\'t work (' + esc(err.message) + ").</p>"; }
  }
  async function mine(){
    try {
      const res = await RallyFlagAuth.authedFetch("/Platform/User/GetMembershipsForCurrentUser/"), j = await res.json();
      const list = (j.Response && j.Response.destinyMemberships) || [];
      const me = list.find(x => x.membershipId === j.Response.primaryMembershipId) || pick(list);
      if (me) show(me.membershipType + "-" + me.membershipId, true);
    } catch (e){ $("rr-out").innerHTML = '<p class="rr-status error" role="status">Couldn\'t find your account (' + esc(e.message) + ").</p>"; }
  }

  function start(){
    renderRecent();
    const signedIn = window.RallyFlagAuth && RallyFlagAuth.isSignedIn();
    $("rr-mine").hidden = !signedIn;
    $("rr-form").addEventListener("submit", submit);
    let t = 0;
    $("rr-q").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => suggest(e.target.value), 300); });
    $("rr-mine").addEventListener("click", mine);
    document.addEventListener("click", e => {
      const b = e.target.closest(".rr-chip[data-p]");
      if (!b) return;
      $("rr-q").value = b.dataset.name;
      show(b.dataset.p, true);
    });
    window.addEventListener("popstate", () => { const p = new URLSearchParams(location.search).get("p"); if (p) show(p, false); else $("rr-out").innerHTML = ""; });
    const p = new URLSearchParams(location.search).get("p");
    if (p) show(p, false);
    else if (signedIn) mine();
  }
  start();
})();
