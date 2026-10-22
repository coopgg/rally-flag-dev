/* ============================================================
   Your Week (your-week.html, dev-only preview): the signed-in player's
   week against Rally Flag's rotation. This week's featured raids and
   dungeons (assets/featured-rotation-data.js) with each character's clears
   since the weekly reset (activity history), the season pass, milestones,
   bounties and quests (finished and expiring-before-reset first) and seals
   (linked to our guide where there is one).
   Data: one GetProfile (components 100,104,200,201,202,300,301,700) and
   each character's raid/dungeon activity history; names and objective
   texts from assets/your-week-worker.js (cached per game update).
   your-week.html?demo uses assets/your-week-demo.json
   (tools/build-your-week-demo.js).
   ============================================================ */
(function(){
  const $ = id => document.getElementById(id);
  const BUNGIE = "https://www.bungie.net";
  const DEMO = new URLSearchParams(location.search).has("demo");
  const CLASS_NAMES = ["Titan", "Hunter", "Warlock"];
  const COMPONENTS = "100,104,200,201,202,300,301,700", PURSUITS_BUCKET = 1345459588;
  const RAID_MODE = 4, DUNGEON_MODE = 82;
  const MAINTENANCE = "Bungie's servers are down for maintenance. Your progress will be here again when Bungie finishes.";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const img = p => p ? (p.charAt(0) === "/" ? BUNGIE + p : p) : "";
  const R = window.FeaturedRotationData;

  let DEFS = null, DATA = null, OWNERS = [], loadedAt = 0, loading = false, focus = null, sealsAll = false;

  // ---------------- loading ----------------
  function loadDefs(){
    return new Promise((resolve, reject) => {
      const w = new Worker("assets/your-week-worker.js");
      w.onmessage = e => {
        const m = e.data;
        if (m.type === "progress"){ const n = $("yw-note"); if (n) n.textContent = m.step; }
        else if (m.type === "done"){ w.terminate(); resolve(m.db); }
        else if (m.type === "error"){ w.terminate(); reject(new Error(m.message)); }
      };
      w.onerror = e => reject(new Error(e.message || "definitions worker failed"));
      w.postMessage({ apiKey: window.RallyFlagAPI.BUNGIE_API_KEY });
    });
  }
  async function authedGet(path){
    const res = await RallyFlagAuth.authedFetch(path, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (data && data.ErrorStatus === "SystemDisabled") throw new Error(MAINTENANCE);
    if (!res.ok || data.ErrorCode !== 1) throw new Error((data && data.Message) || ("HTTP " + res.status));
    return data.Response;
  }
  async function loadData(){
    if (DEMO){
      const res = await fetch("assets/your-week-demo.json");
      if (!res.ok) throw new Error("sample data missing (HTTP " + res.status + ")");
      const d = await res.json();
      // Times are stored relative so the sample always reads as this week.
      for (const c of Object.values(d.progress.characterInventories.data))
        for (const it of c.items) if (it._hours) it.expirationDate = new Date(Date.now() + it._hours * 3600e3).toISOString();
      for (const list of Object.values(d.activityHistory)) for (const a of list) a.period = new Date(Date.now() - a._hoursAgo * 3600e3).toISOString();
      return { progress: d.progress, history: d.activityHistory };
    }
    const m = await authedGet("/Platform/User/GetMembershipsForCurrentUser/");
    const list = m.destinyMemberships || [];
    if (!list.length) throw new Error("this Bungie account has no linked Destiny 2 platform.");
    const p = list.find(x => x.membershipId === m.primaryMembershipId) || list[0];
    const base = "/Platform/Destiny2/" + p.membershipType;
    const progress = await authedGet(base + "/Profile/" + p.membershipId + "/?components=" + COMPONENTS);
    // Raid and dungeon clears per character (the newest 25 of each is plenty for a week).
    const history = {}, ids = Object.keys((progress.characters && progress.characters.data) || {});
    await Promise.all(ids.map(async c => {
      const get = mode => authedGet(base + "/Account/" + p.membershipId + "/Character/" + c + "/Stats/Activities/?mode=" + mode + "&count=25").then(r => r.activities || []).catch(() => null);
      const [raids, dungeons] = await Promise.all([get(RAID_MODE), get(DUNGEON_MODE)]);
      history[c] = raids == null && dungeons == null ? null : (raids || []).concat(dungeons || []);
    }));
    return { progress, history };
  }
  async function load(force){
    if (loading) return;
    if (DATA && !force && Date.now() - loadedAt < 120000) return draw();
    loading = true;
    if (!DATA) showStatus('<p>Loading your week from Bungie.net… <span id="yw-note"></span></p>');
    else draw();
    try {
      const [defs, data] = await Promise.all([DEFS || loadDefs(), loadData()]);
      DEFS = defs; DATA = data; loadedAt = Date.now();
      const chars = (DATA.progress.characters && DATA.progress.characters.data) || {};
      const order = (DATA.progress.profile && DATA.progress.profile.data && DATA.progress.profile.data.characterIds) || Object.keys(chars);
      OWNERS = order.filter(id => chars[id]).map(id => ({ id, name: CLASS_NAMES[chars[id].classType] || "Guardian", played: Date.parse(chars[id].dateLastPlayed) || 0 }));
      showStatus("");
      $("yw-app").hidden = false;
    } catch (e){
      if (!DATA){ showStatus("<p>Couldn't load your week: " + esc((e && e.message) || e) + '</p><div class="yw-actions"><button type="button" class="yw-btn" id="yw-retry">Try again</button></div>'); $("yw-retry").addEventListener("click", () => load(true)); }
    }
    loading = false;
    if (DATA) draw();
  }
  function showStatus(html){ $("yw-status").innerHTML = html ? '<div class="yw-panel panel-card">' + html + "</div>" : ""; }
  function showSignedOut(){
    showStatus("<p>Sign in with Bungie.net to see your week: which of this week's featured raids and dungeons each character has cleared, your milestones, bounties and quests, and your season pass. Rally Flag only reads your progress; nothing is stored.</p>" +
      '<div class="yw-actions"><button class="yw-btn" type="button" id="yw-signin">Sign in with Bungie.net</button><a class="yw-btn ghost" href="your-week.html?demo">Try it with sample data</a></div>');
    $("yw-signin").addEventListener("click", () => RallyFlagAuth.signIn());
  }

  // ---------------- drawing ----------------
  const pct = (a, b) => b ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : 0;
  const barHtml = (a, b, done) => '<span class="pg-bar' + (done ? " done" : "") + '" aria-hidden="true"><i style="width:' + pct(a, b) + '%"></i></span>';
  const nextReset = () => Date.now() + R.msUntilNextReset();
  const lastReset = () => nextReset() - 7 * 864e5;
  function untilText(iso){
    const ms = Date.parse(iso) - Date.now();
    if (!(ms > 0)) return "Expired";
    const h = Math.round(ms / 3600e3);
    return h < 1 ? "Expires within the hour" : h < 48 ? "Expires in " + h + "h" : "Expires in " + Math.round(h / 24) + " days";
  }
  function objectiveRow(o){
    const desc = (DEFS.objectives || {})[o.objectiveHash] || "Progress", c = o.completionValue || 1;
    // Most objectives count to a number; one-step ones read as done/not done.
    const val = c === 1 ? (o.complete ? "Done" : "Not yet") : Math.min(o.progress || 0, c).toLocaleString() + " / " + c.toLocaleString();
    return '<div class="pg-obj' + (o.complete ? " done" : "") + '"><span class="pg-obj-d">' + esc(desc) + '</span><span class="pg-obj-v">' + val + "</span>" + barHtml(o.progress || 0, c, o.complete) + "</div>";
  }
  // This week's featured raids and dungeons, with each character's clears since reset.
  function featuredHtml(){
    const wk = R.featuredForWeek(R.currentWeekIndex()), idx = window.ActivityIndex || { raids: [], dungeons: [] };
    const since = lastReset();
    const cleared = item => {
      const out = {};
      for (const o of OWNERS){
        const list = DATA.history[o.id];
        if (list == null){ out[o.id] = null; continue; }
        out[o.id] = list.some(a => {
          const name = (DEFS.activities[(a.activityDetails || {}).referenceId] || DEFS.activities[(a.activityDetails || {}).directorActivityHash] || "").toLowerCase();
          const v = a.values || {};
          return name.startsWith(item.name.toLowerCase()) && Date.parse(a.period) >= since && ((v.completed || {}).basic || {}).value === 1 && !(((v.completionReason || {}).basic || {}).value > 0);
        });
      }
      return out;
    };
    const group = (label, kind, slugs, list, always) => {
      const by = new Map(list.map(x => [x.slug, x]));
      const cards = slugs.map(s => by.get(s)).filter(Boolean).map(item => {
        const c = cleared(item);
        return '<div class="featured-card panel-card">' + window.rallyFlagArtThumb(item) +
          '<div class="featured-kind">' + kind + (item.slug === always ? '<span class="featured-always-badge">Always Featured</span>' : "") + "</div>" +
          '<div class="featured-name">' + esc(item.name) + "</div>" +
          '<div class="yw-chars">' + OWNERS.map(o => '<span class="yw-char' + (c[o.id] ? " done" : "") + '">' + esc(o.name) + " " + (c[o.id] == null ? "?" : c[o.id] ? "✓ cleared" : "not yet") + "</span>").join("") + "</div>" +
          '<a class="featured-link" href="' + window.rallyFlagGuideHref(kind === "Raid" ? "raid" : "dungeon", item.slug) + '">View the guide →<span class="sr-only"> for ' + esc(item.name) + "</span></a></div>";
      }).join("");
      return '<div class="tw-subsection-label">' + label + "</div>" + (cards ? '<div class="featured-grid">' + cards + "</div>" : '<p class="muted">Nothing featured.</p>');
    };
    const missing = OWNERS.some(o => DATA.history[o.id] == null);
    return '<section class="pg-section" aria-labelledby="yw-h-featured"><h2 class="dlg-label" id="yw-h-featured">Featured this week</h2>' +
      group("Raids", "Raid", wk.raids, idx.raids, R.ALWAYS_FEATURED_RAID_SLUG) + group("Dungeons", "Dungeon", wk.dungeons, idx.dungeons, R.ALWAYS_FEATURED_DUNGEON_SLUG) +
      '<p class="yw-note">Clears since the weekly reset, from each character\'s activity history.' + (missing ? " Bungie didn't share some characters' history (a privacy setting can hide it), shown as ?." : "") + "</p></section>";
  }
  function draw(){
    const box = $("yw-app"), P = DATA.progress;
    const was = box.contains(document.activeElement) ? document.activeElement : null;
    const refocus = was && (was.id ? "#" + was.id : was.dataset.ywOwner ? '[data-yw-owner="' + was.dataset.ywOwner + '"]' : null);
    const cps = (P.characterProgressions && P.characterProgressions.data) || {};
    // Season pass (account-wide; any character's copy).
    let season = "";
    const sh = P.profile && P.profile.data && P.profile.data.currentSeasonHash, sdef = DEFS.seasons[sh], now = Date.now();
    const pass = sdef && (sdef.passes.find(p => Date.parse(p.start) <= now && now < Date.parse(p.end)) || sdef.passes[sdef.passes.length - 1]);
    const pdef = pass && DEFS.passes[pass.h], anyCp = Object.values(cps)[0];
    if (pdef && anyCp){
      const rp = anyCp.progressions[pdef.r] || {}, pp = anyCp.progressions[pdef.p] || {};
      const capped = rp.levelCap > 0 && rp.level >= rp.levelCap, cur = capped ? pp : rp;
      const rank = (rp.level || 0) + (pp.level || 0), days = Math.max(0, Math.ceil((Date.parse(pass.end) - now) / 864e5));
      const art = P.profileProgression && P.profileProgression.data && P.profileProgression.data.seasonalArtifact;
      season = '<section class="pg-section pg-season panel-card" aria-labelledby="yw-h-season"><h2 class="dlg-label" id="yw-h-season">Season pass</h2>' +
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
        const def = DEFS.milestones[h] || {}, quest = (m[h].availableQuests || [])[0];
        const name = def.n || (quest && (DEFS.pursuits[quest.questItemHash] || {}).n) || "";
        if (!name) continue;
        if (!ms.has(h)) ms.set(h, { name, d: def.d, per: {} });
        ms.get(h).per[o.id] = { done: objs.filter(x => x.complete).length, total: objs.length };
      }
    }
    const allDone = r => Object.values(r.per).every(p => p.done === p.total);
    const msRows = [...ms.values()].sort((a, b) => allDone(a) - allDone(b) || a.name.localeCompare(b.name));
    const milestones = '<section class="pg-section" aria-labelledby="yw-h-ms"><h2 class="dlg-label" id="yw-h-ms">Milestones</h2>' +
      (msRows.length ? '<div class="pg-ms">' + msRows.map(r => '<div class="pg-ms-row"><div class="pg-ms-name"><b>' + esc(r.name) + "</b>" + (r.d ? "<small>" + esc(r.d) + "</small>" : "") + "</div>" +
        '<div class="pg-ms-chars">' + OWNERS.map(o => { const p = r.per[o.id]; return '<span class="pg-ms-char' + (p && p.done === p.total ? " done" : "") + '">' + esc(o.name) + " " + (!p ? "–" : p.done === p.total ? "✓" : p.done + "/" + p.total) + "</span>"; }).join("") + "</div></div>").join("") + "</div>"
        : '<p class="muted">No milestones with objectives this week.</p>') + "</section>";
    // Bounties and quests for one character: finished first, then ones that expire before the reset.
    if (!focus || !OWNERS.some(o => o.id === focus)) focus = (OWNERS.slice().sort((a, b) => b.played - a.played)[0] || {}).id;
    const objData = (P.itemComponents && P.itemComponents.objectives && P.itemComponents.objectives.data) || {};
    const inv = (((P.characterInventories || {}).data || {})[focus] || {}).items || [];
    const reset = nextReset();
    const pursuits = inv.filter(it => it.bucketHash === PURSUITS_BUCKET && DEFS.pursuits[it.itemHash]).map(it => {
      const def = DEFS.pursuits[it.itemHash];
      const objs = ((it.itemInstanceId && objData[it.itemInstanceId] && objData[it.itemInstanceId].objectives) || ((cps[focus] || {}).uninstancedItemObjectives || {})[it.itemHash] || []).filter(o => o.visible !== false);
      const soon = !!it.expirationDate && Date.parse(it.expirationDate) <= reset;
      return { it, def, objs, soon, done: objs.length > 0 && objs.every(o => o.complete), share: objs.length ? objs.reduce((n, o) => n + Math.min(1, (o.progress || 0) / (o.completionValue || 1)), 0) / objs.length : 0 };
    }).sort((a, b) => b.done - a.done || b.soon - a.soon || b.share - a.share);
    const card = p => '<div class="pg-card' + (p.done ? " done" : "") + '"><div class="pg-card-head">' + (p.def.i ? '<img src="' + esc(img(p.def.i)) + '" alt="" width="40" height="40" loading="lazy">' : "") +
      '<div><b>' + esc(p.def.n) + '</b><small>' + esc(p.def.y) + (p.done ? ' · <span class="pg-ready">Ready to turn in</span>' : "") + (p.it.expirationDate ? " · " + untilText(p.it.expirationDate) : "") +
        (p.soon && !p.done ? ' <span class="pg-tag">Before reset</span>' : "") + "</small></div></div>" +
      (p.objs.length ? p.objs.map(objectiveRow).join("") : p.def.x ? '<p class="pg-sub">' + esc(p.def.x) + "</p>" : "") + "</div>";
    const bounties = pursuits.filter(p => p.def.t === 26), quests = pursuits.filter(p => p.def.t !== 26);
    const group = (label, list, empty) => '<h3 class="pg-h3">' + label + " <span>" + list.length + "</span></h3>" + (list.length ? '<div class="pg-cards">' + list.map(card).join("") + "</div>" : '<p class="muted">' + empty + "</p>");
    const pursuitsHtml = '<section class="pg-section" aria-labelledby="yw-h-pursuits"><h2 class="dlg-label" id="yw-h-pursuits">Bounties &amp; quests</h2>' +
      '<div class="pg-owners" role="group" aria-label="Whose bounties and quests">' + OWNERS.map(o => '<button type="button" class="chip" data-yw-owner="' + o.id + '" aria-pressed="' + (o.id === focus) + '">' + esc(o.name) + "</button>").join("") + "</div>" +
      group("Bounties", bounties, "No bounties.") + group("Quests", quests, "No quests.") + "</section>";
    // Seals: closest to done first, linked to our guide when there is one.
    const nodes = (P.profilePresentationNodes && P.profilePresentationNodes.data && P.profilePresentationNodes.data.nodes) || {};
    const idx = window.ActivityIndex || { raids: [], dungeons: [] };
    const guideFor = name => {
      const n = name.toLowerCase().replace(/^dungeon: /, "");
      const r = idx.raids.find(x => x.name.toLowerCase() === n), d = idx.dungeons.find(x => x.name.toLowerCase() === n);
      return r ? window.rallyFlagGuideHref("raid", r.slug) : d ? window.rallyFlagGuideHref("dungeon", d.slug) : "";
    };
    const sealList = Object.keys(DEFS.seals).filter(h => nodes[h] && nodes[h].completionValue > 0).map(h => Object.assign({ h, p: nodes[h].progressValue || 0, c: nodes[h].completionValue }, DEFS.seals[h]));
    const open = sealList.filter(s => s.p < s.c).sort((a, b) => b.p / b.c - a.p / a.c), done = sealList.filter(s => s.p >= s.c);
    const SHOWN = 4, shownSeals = sealsAll ? open : open.slice(0, SHOWN);
    const sealsHtml = '<section class="pg-section" aria-labelledby="yw-h-seals"><h2 class="dlg-label" id="yw-h-seals">Seals</h2>' +
      (open.length ? '<div class="pg-seals" id="yw-seal-list">' + shownSeals.map(s => { const g = guideFor(s.n); return '<div class="pg-seal">' + (s.i ? '<img src="' + esc(img(s.i)) + '" alt="" width="40" height="40" loading="lazy">' : "") +
        '<div><b>' + esc(s.n) + "</b>" + (s.title && s.title !== s.n ? '<small>Title: ' + esc(s.title) + "</small>" : "") + '<span class="pg-sub">' + s.p + " of " + s.c + " triumphs · " + pct(s.p, s.c) + "%</span>" + barHtml(s.p, s.c) +
        (g ? '<a class="featured-link" href="' + g + '">Our guide →<span class="sr-only"> for ' + esc(s.n) + "</span></a>" : "") + "</div></div>"; }).join("") + "</div>" +
        (open.length > SHOWN ? '<button type="button" class="act-btn" id="yw-seals-more" aria-expanded="' + sealsAll + '" aria-controls="yw-seal-list">' + (sealsAll ? "Show fewer" : "Show all " + open.length + " seals in progress") + "</button>" : "")
        : '<p class="muted">No seals in progress.</p>') +
      (done.length ? '<p class="pg-sub pg-done-seals">Done: ' + done.map(s => esc(s.title || s.n)).join(", ") + "</p>" : "") + "</section>";
    box.innerHTML = (DEMO ? '<div class="yw-panel panel-card" style="margin:0 auto"><p style="margin:0">You\'re looking at <strong>sample data</strong>, not a real account.</p></div>' : "") +
      '<div class="pg-top"><span class="pg-sub">' + (loading ? "Refreshing…" : "Updated " + new Date(loadedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })) + '</span><button type="button" class="act-btn" id="yw-refresh">Refresh</button></div>' +
      featuredHtml() + season + milestones + pursuitsHtml + sealsHtml;
    $("yw-refresh").addEventListener("click", () => load(true));
    box.querySelectorAll("[data-yw-owner]").forEach(b => b.addEventListener("click", () => { focus = b.dataset.ywOwner; draw(); box.querySelector('[data-yw-owner="' + focus + '"]').focus(); }));
    const more = $("yw-seals-more"); if (more) more.addEventListener("click", () => { sealsAll = !sealsAll; draw(); $("yw-seals-more").focus(); });
    if (refocus){ const t = box.querySelector(refocus); if (t) t.focus(); }
  }

  if (!DEMO && !(window.RallyFlagAuth && RallyFlagAuth.isSignedIn())) showSignedOut();
  else load();
  // Coming back to the tab after a while: fresh progress.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && DATA && Date.now() - loadedAt > 120000) load(true); });
})();
