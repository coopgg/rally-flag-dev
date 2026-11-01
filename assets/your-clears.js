/* ============================================================
   "Your clears" on the raid and dungeon guide pages (raid-<slug>.html,
   dungeon-<slug>.html): signed in, a line under the guide's header with
   your clears of that activity, fastest, time played and clears per
   version, linking to your full Raid & Dungeon Report (badges, sherpas).

   Signed out it does nothing and loads nothing. Signed in, a placeholder
   goes in at once (before the page is shown, so nothing moves), then it
   loads api-keys.js, oauth.js and raid-activities.js and reads Bungie's
   AggregateActivityStats for every character (deleted ones too, as the
   report does). Kept in sessionStorage for 10 minutes, so moving between
   guides doesn't ask Bungie again.
   ============================================================ */
(function(){
  const AUTH_KEY = "rallyflag_bungie_auth", CACHE_KEY = "rallyflag_your_clears";
  let signedIn = false;
  try { const a = JSON.parse(sessionStorage.getItem(AUTH_KEY) || "null"); signedIn = !!(a && a.access_token && a.access_expires_at > Date.now()); } catch (e){}
  const slug = window.GUIDE_SLUG, kind = /(^|\/)dungeon-/.test(location.pathname) ? "dungeon" : "raid";
  const hero = document.getElementById("hero");
  if (!signedIn || !slug || !hero) return;

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const box = document.createElement("section");
  box.className = "your-clears panel-card"; box.setAttribute("aria-label", "Your clears"); box.setAttribute("aria-live", "polite");
  box.innerHTML = '<p class="yc-line">Loading your clears…</p>';
  hero.insertAdjacentElement("afterend", box);

  const load = src => new Promise((resolve, reject) => { const s = document.createElement("script"); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); });
  const fmtTime = ms => { const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60; return h ? h + "h " + String(m).padStart(2, "0") + "m" : m + ":" + String(sec).padStart(2, "0"); };
  const fmtHours = s => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? h.toLocaleString() + "h " + m + "m" : m + "m"; };

  async function api(path, authed){
    const res = authed ? await RallyFlagAuth.authedFetch(path) : await fetch("https://www.bungie.net" + path, { headers: { "X-API-Key": window.RallyFlagAPI.BUNGIE_API_KEY } });
    const j = await res.json().catch(() => ({}));
    if (j.ErrorCode !== 1) throw new Error(j.Message || "HTTP " + res.status);
    return j.Response;
  }
  // { p: "type-id", by: { slug: { clears, fastest, seconds, versions } } }, cached 10 minutes.
  async function stats(){
    try { const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null"); if (c && Date.now() - c.at < 600000) return c; } catch (e){}
    const m = await api("/Platform/User/GetMembershipsForCurrentUser/", true);
    const list = m.destinyMemberships || [];
    const me = list.find(x => x.membershipId === m.primaryMembershipId) || list.find(x => x.crossSaveOverride && x.crossSaveOverride === x.membershipType) || list[0];
    if (!me) throw new Error("no Destiny account on this Bungie account");
    const base = "/Platform/Destiny2/" + me.membershipType + "/Account/" + me.membershipId;
    const chars = ((await api(base + "/Stats/?groups=1")).characters || []).map(c => c.characterId);
    const aggs = await Promise.all(chars.map(c => api(base + "/Character/" + c + "/Stats/AggregateActivityStats/").catch(() => ({ activities: [] }))));
    const MAP = window.RaidActivities || {}, by = {};
    for (const a of aggs) for (const x of a.activities || []){
      const hit = MAP[x.activityHash];
      if (!hit || !hit[0]) continue;
      const v = x.values || {}, n = k => ((v[k] || {}).basic || {}).value || 0, c = n("activityCompletions"), f = n("fastestCompletionMsForActivity");
      const e = by[hit[0]] || (by[hit[0]] = { clears: 0, fastest: 0, seconds: 0, versions: {} });
      e.clears += c; e.seconds += n("activitySecondsPlayed");
      if (c) e.versions[hit[2]] = (e.versions[hit[2]] || 0) + c;
      if (c && f > 0 && (!e.fastest || f < e.fastest)) e.fastest = f;
    }
    const out = { at: Date.now(), p: me.membershipType + "-" + me.membershipId, by };
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(out)); } catch (e){}
    return out;
  }

  (async () => {
    try {
      if (!window.RallyFlagAPI) await load("assets/api-keys.js");
      if (!window.RallyFlagAuth) await load("assets/oauth.js");
      if (!window.RaidActivities) await load("assets/raid-activities.js");
      const s = await stats(), e = s.by[slug];
      const report = '<a class="yc-link" href="report.html?p=' + esc(s.p) + '">Your full report, with badges →</a>';
      if (!e || !e.clears){
        box.innerHTML = '<p class="yc-line"><b>Your clears:</b> none yet' + (e && e.seconds ? " (" + fmtHours(e.seconds) + " played)" : "") + ". " + report + "</p>";
        return;
      }
      const versions = Object.entries(e.versions).sort((a, b) => (b[0] === "Normal") - (a[0] === "Normal") || b[1] - a[1]).map(([k, n]) => esc(k) + " " + n.toLocaleString()).join(" · ");
      box.innerHTML = '<p class="yc-line"><b>Your clears:</b> <span class="yc-n">' + e.clears.toLocaleString() + "</span>" +
        '<span class="yc-dot">·</span>fastest ' + (e.fastest ? fmtTime(e.fastest) : "–") + '<span class="yc-dot">·</span>' + fmtHours(e.seconds) + " played" +
        (Object.keys(e.versions).length > 1 ? '<span class="yc-dot">·</span>' + versions : "") + "</p>" + report;
    } catch (err){
      box.innerHTML = '<p class="yc-line">Your clears didn\'t load (' + esc(err.message) + ").</p>";
    }
  })();
})();
