/* ============================================================
   Seals & Triumphs (seals.html): every seal a player has, how far along
   it is, gildings, and the triumphs each one still needs.

   Public profile components (no sign-in needed): 100 profile, 200
   characters, 700 presentation nodes (each seal's progress), 900 records
   (profile and per character). Definitions come from Your Week's worker
   (assets/your-week-worker.js, cached in IndexedDB): seals with their
   triumphs and title/gilding records, the Titles / Legacy Titles lists,
   and the triumphs' names, descriptions and objectives.
   Finding a player: the same Bungie name search as the Raid & Dungeon
   Report; signed in, it opens on you. URL: seals.html?p=<type>-<id>.
   ============================================================ */
(function(){
  const BUNGIE = "https://www.bungie.net";
  const API_KEY = window.RallyFlagAPI.BUNGIE_API_KEY;
  // Record state bits (DestinyRecordState).
  const NOT_DONE = 4, OBSCURED = 16, INVISIBLE = 32;
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

  // ---------------- definitions (Your Week's worker) ----------------
  let DEFS = null;
  function loadDefs(){
    return new Promise((resolve, reject) => {
      const w = new Worker("assets/your-week-worker.js");
      w.onmessage = e => { if (e.data.type === "progress") status(e.data.step); else if (e.data.type === "done"){ w.terminate(); resolve(e.data.db); } else { w.terminate(); reject(new Error(e.data.message)); } };
      w.onerror = e => { w.terminate(); reject(new Error(e.message || "Bungie's definitions didn't load")); };
      w.postMessage({ apiKey: API_KEY });
    });
  }
  const status = (t, error) => { $("sl-out").innerHTML = t ? '<p class="sl-status' + (error ? " error" : "") + '" role="status">' + esc(t) + "</p>" : ""; };

  // ---------------- finding a player (as on the Raid & Dungeon Report) ----------------
  const pick = list => list.find(m => m.crossSaveOverride && m.crossSaveOverride === m.membershipType) || list.find(m => !m.crossSaveOverride) || list[0];
  let suggestJob = 0;
  async function suggest(text){
    const job = ++suggestJob, box = $("sl-suggest"), prefix = text.trim().replace(/#.*$/, "");
    if (prefix.length < 2 || /#\d{1,4}$/.test(text.trim())){ box.hidden = true; box.innerHTML = ""; return; }
    let found = [];
    try { found = ((await api("/User/Search/GlobalName/0/", { displayNamePrefix: prefix })).searchResults || []).filter(x => (x.destinyMemberships || []).length).slice(0, 8); } catch (e){}
    if (job !== suggestJob) return;
    box.innerHTML = found.map(x => { const m = pick(x.destinyMemberships), name = x.bungieGlobalDisplayName + "#" + String(x.bungieGlobalDisplayNameCode).padStart(4, "0");
      return '<li><button type="button" class="sl-chip" data-p="' + m.membershipType + "-" + m.membershipId + '" data-name="' + esc(name) + '">' + esc(name) + "</button></li>"; }).join("");
    box.hidden = !found.length;
  }
  async function submit(e){
    e.preventDefault();
    const text = $("sl-q").value.trim(), m = /^(.+)#(\d{1,4})$/.exec(text);
    if (!m){ suggest(text); status("Add the 4-digit code after the name (Name#1234), or pick a match below the box."); return; }
    try {
      const list = await api("/Destiny2/SearchDestinyPlayerByBungieName/-1/", { displayName: m[1].trim(), displayNameCode: +m[2] });
      if (!list || !list.length) return status("No Destiny player called " + text + ". Check the name and the code.", true);
      const p = pick(list); show(p.membershipType + "-" + p.membershipId, true);
    } catch (err){ status("The search didn't work (" + err.message + ").", true); }
  }
  async function mine(){
    try {
      const res = await RallyFlagAuth.authedFetch("/Platform/User/GetMembershipsForCurrentUser/"), j = await res.json();
      const list = (j.Response && j.Response.destinyMemberships) || [], me = list.find(x => x.membershipId === j.Response.primaryMembershipId) || pick(list);
      if (me) show(me.membershipType + "-" + me.membershipId, true);
    } catch (e){ status("Couldn't find your account (" + e.message + ").", true); }
  }

  // ---------------- a player's seals ----------------
  let loading = 0, filter = "progress", open = null, VIEW = null;
  // A record for this player: profile-wide, or the best of their characters.
  function recordOf(P, h){
    const prof = ((P.profileRecords || {}).data || {}).records || {};
    if (prof[h]) return prof[h];
    let best = null;
    for (const c of Object.values(((P.characterRecords || {}).data) || {})){
      const r = (c.records || {})[h];
      if (r && (!best || (best.state & NOT_DONE) && !(r.state & NOT_DONE))) best = r;
    }
    return best;
  }
  const done = r => !!r && !(r.state & NOT_DONE);
  function sealOf(P, h){
    const s = DEFS.seals[h], node = (((P.profilePresentationNodes || {}).data || {}).nodes || {})[h] || {};
    const visible = s.recs.filter(r => { const x = recordOf(P, r); return !x || !(x.state & INVISIBLE); });
    const got = visible.filter(r => done(recordOf(P, r))).length;
    const c = node.completionValue || visible.length, p = node.completionValue ? node.progressValue || 0 : got;
    const title = recordOf(P, s.rec), gild = s.gild ? recordOf(P, s.gild) : null;
    return { h, s, p: Math.min(p, c), c, done: done(title) || (c > 0 && p >= c), gilded: gild ? gild.completedCount || 0 : 0, recs: visible };
  }
  function cardHtml(x){
    // A seal whose title you hold reads full, even when Bungie later retired some of its triumphs.
    const pct = x.done ? 100 : x.c ? Math.round(x.p / x.c * 100) : 0, isOpen = open === String(x.h);
    return '<li class="sl-card panel-card' + (x.done ? " done" : "") + '">' +
      '<button type="button" class="sl-head" data-seal="' + x.h + '" aria-expanded="' + isOpen + '" aria-controls="sl-more-' + x.h + '">' +
        (x.s.i ? '<img src="' + esc(img(x.s.i)) + '" alt="" width="52" height="52" loading="lazy">' : '<span class="sl-noicon"></span>') +
        '<span class="sl-text"><b>' + esc(x.s.n) + "</b>" + (x.s.title && x.s.title !== x.s.n ? '<small>Title: ' + esc(x.s.title) + "</small>" : "") +
          '<span class="sl-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' +
          '<span class="sl-prog">' + (x.done ? "Done" : x.p + " of " + x.c + " triumphs") + (x.gilded ? ' · <span class="sl-gild">Gilded' + (x.gilded > 1 ? " ×" + x.gilded : "") + "</span>" : "") + "</span></span></button>" +
      '<div class="sl-more" id="sl-more-' + x.h + '"' + (isOpen ? "" : " hidden") + ">" + (isOpen ? triumphsHtml(x) : "") + "</div></li>";
  }
  function triumphsHtml(x){
    const rows = x.recs.map(r => ({ r, d: DEFS.records[r] || { n: "Triumph", d: "", obj: [] }, rec: recordOf(VIEW.P, r) }))
      .sort((a, b) => done(a.rec) - done(b.rec));
    return '<ul class="sl-triumphs">' + rows.map(({ d, rec }) => {
      const ok = done(rec), secret = rec && (rec.state & OBSCURED) && !ok;
      const objs = ((rec && (rec.objectives || rec.intervalObjectives)) || []).filter(o => o.completionValue > 1 && !ok);
      return '<li class="' + (ok ? "ok" : "") + '"><span class="sl-tick" aria-hidden="true">' + (ok ? "✓" : "") + "</span><div><b>" + esc(secret ? "Secret triumph" : d.n) + (ok ? '<span class="sr-only"> (done)</span>' : "") + "</b>" +
        (!secret && d.d ? "<small>" + esc(d.d) + "</small>" : "") +
        objs.map(o => '<span class="sl-obj"><span class="sl-bar small" aria-hidden="true"><i style="width:' + Math.min(100, Math.round(o.progress / o.completionValue * 100)) + '%"></i></span>' +
          esc((DEFS.objectives[o.objectiveHash] || "Progress") + " " + Math.min(o.progress, o.completionValue).toLocaleString() + "/" + o.completionValue.toLocaleString()) + "</span>").join("") + "</div></li>";
    }).join("") + "</ul>";
  }
  function draw(){
    const { P, name, p, current, legacy } = VIEW;
    const shown = list => list.filter(x => filter === "all" || (filter === "done" ? x.done : !x.done))
      .sort((a, b) => filter === "progress" ? b.p / (b.c || 1) - a.p / (a.c || 1) : 0);
    const cur = shown(current), leg = shown(legacy);
    const d = (P.profileRecords || {}).data || {};
    $("sl-out").innerHTML =
      '<section class="sl-player panel-card" aria-labelledby="sl-name"><div><h2 id="sl-name" tabindex="-1">' + esc(name) + "</h2>" +
        '<p class="sl-sub">' + current.filter(x => x.done).length + " of " + current.length + " seals done" + (legacy.length ? " · " + legacy.filter(x => x.done).length + " of " + legacy.length + " legacy" : "") + "</p>" +
        '<p class="sl-sub"><a class="sl-link" href="report.html?p=' + esc(p) + '">Their raid &amp; dungeon report →</a></p></div>' +
        '<dl class="sl-totals"><div><dt>Triumph score</dt><dd>' + (d.activeScore || 0).toLocaleString() + "</dd></div><div><dt>Lifetime</dt><dd>" + (d.lifetimeScore || 0).toLocaleString() + "</dd></div></dl></section>" +
      '<div class="sl-filters" role="group" aria-label="Show">' + [["progress", "In progress"], ["done", "Done"], ["all", "All"]].map(([k, t]) => '<button type="button" class="sl-chip" data-filter="' + k + '" aria-pressed="' + (filter === k) + '">' + t + "</button>").join("") + "</div>" +
      '<h2 class="sl-h">Seals</h2>' + (cur.length ? '<ul class="sl-grid">' + cur.map(cardHtml).join("") + "</ul>" : '<p class="sl-none">None here.</p>') +
      (legacy.length ? '<h2 class="sl-h">Legacy seals</h2>' + (leg.length ? '<ul class="sl-grid">' + leg.map(cardHtml).join("") + "</ul>" : '<p class="sl-none">None here.</p>') : "");
  }
  async function show(p, push){
    const m = /^(\d+)-(\d+)$/.exec(p || "");
    if (!m) return;
    const job = ++loading;
    suggestJob++; $("sl-suggest").hidden = true;
    if (push) history.pushState({ p }, "", "?p=" + p);
    try {
      if (!DEFS){ DEFS = await loadDefs(); }
      status("Reading seals and triumphs…");
      const P = await api("/Destiny2/" + m[1] + "/Profile/" + m[2] + "/?components=100,200,700,900");
      if (job !== loading) return;
      const ud = (P.profile && P.profile.data && P.profile.data.userInfo) || {};
      const name = ud.bungieGlobalDisplayName ? ud.bungieGlobalDisplayName + "#" + String(ud.bungieGlobalDisplayNameCode || 0).padStart(4, "0") : ud.displayName || "Guardian";
      const root = ((P.profileRecords || {}).data || {}).recordSealsRootNodeHash;
      const list = hs => (hs || []).filter(h => DEFS.seals[h] && DEFS.seals[h].recs.length).map(h => sealOf(P, h)).filter(x => x.c > 0);
      VIEW = { P, name, p, current: list(DEFS.kids[root]), legacy: list(DEFS.kids[DEFS.legacyTitles]) };
      open = null;
      document.title = name + " - Seals & Triumphs - Rally Flag";
      draw();
      if (push){ const h = $("sl-name"); if (h) h.focus(); }
    } catch (e){ if (job === loading) status("Couldn't load this player (" + e.message + ").", true); }
  }

  function start(){
    const signedIn = window.RallyFlagAuth && RallyFlagAuth.isSignedIn();
    $("sl-mine").hidden = !signedIn;
    $("sl-form").addEventListener("submit", submit);
    let t = 0;
    $("sl-q").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => suggest(e.target.value), 300); });
    $("sl-mine").addEventListener("click", mine);
    document.addEventListener("click", e => {
      const chip = e.target.closest(".sl-chip[data-p]");
      if (chip){ $("sl-q").value = chip.dataset.name; return show(chip.dataset.p, true); }
      const f = e.target.closest("[data-filter]");
      if (f && VIEW){ filter = f.dataset.filter; open = null; draw();
        // The filter rides along in the link (?p=…&f=done|all; in progress is the default).
        const u = new URLSearchParams(location.search); filter === "progress" ? u.delete("f") : u.set("f", filter); history.replaceState(history.state, "", "?" + u.toString()); $("sl-out").querySelector('[data-filter="' + filter + '"]').focus(); return; }
      const head = e.target.closest("[data-seal]");
      if (head && VIEW){ open = open === head.dataset.seal ? null : head.dataset.seal; draw(); $("sl-out").querySelector('[data-seal="' + head.dataset.seal + '"]').focus(); }
    });
    window.addEventListener("popstate", () => { const p = new URLSearchParams(location.search).get("p"); if (p) show(p, false); });
    const p = new URLSearchParams(location.search).get("p"), f = new URLSearchParams(location.search).get("f");
    if (f === "done" || f === "all") filter = f;
    if (p) show(p, false);
    else if (signedIn) mine();
  }
  start();
})();
