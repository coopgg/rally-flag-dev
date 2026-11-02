/* ============================================================
   Crucible & Trials (pvp.html), the PvP section: any player's Crucible
   and Trials of Osiris numbers, from Bungie's public stats (no sign-in).
   The search, recent lookups and player banner work as on the Raid &
   Dungeon Report (assets/report.js); the PvP stays off that page.

   Two calls per player:
   - Profile components 100,200 (name, characters, emblem) and 1100
     (metrics: Bungie's own counters, e.g. Trials wins since Season 10,
     flawless tickets, gold medals);
   - Account/{id}/Character/0/Stats/?modes=… (all characters merged,
     deleted ones too): matches, wins, K/D, KDA, kills, time per playlist.
   Bungie's Trials match stats (mode 84) cover only part of most players'
   history (the owner: 63 wins there, 867 in the Wins metric), so Trials
   leads with the metrics and labels the match stats as partial; the
   full match history is on trials.report and crucible.report (linked).
   Flawless = Flawless Tickets (Season 10 to Episode 2) + Flawless
   Lighthouse Passages (Episode 3 on), Bungie's two counters.
   URL: pvp.html?p=<membershipType>-<membershipId>.
   ============================================================ */
(function(){
  const BUNGIE = "https://www.bungie.net";
  const API_KEY = window.RallyFlagAPI.BUNGIE_API_KEY;
  const RECENT_KEY = "rallyflag_pvp_recent";
  const CLASSES = ["Titan", "Hunter", "Warlock"];
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const img = p => p ? (p.charAt(0) === "/" ? BUNGIE + p : p) : "";
  const num = n => (n || 0).toLocaleString();
  // Hours and minutes; past 100 hours just hours, so it fits a card's column. Rounded once, so never "60m".
  const fmtHours = s => { const t = Math.round(s / 60), h = Math.floor(t / 60), m = t % 60; return h >= 100 ? Math.round(s / 3600).toLocaleString() + "h" : h ? h + "h " + m + "m" : m + "m"; };
  const ICON = h => "/common/destiny2_content/icons/DestinyActivityModeDefinition_" + h + ".png";

  // The playlists shown, in order: Bungie's stats key, mode number, name, icon.
  const MODES = [
    ["allPvP", 5, "All Crucible", ICON("fb3e9149c43f7a2e8f8b66cbea7845fe")],
    ["pvpCompetitive", 69, "Competitive", ICON("fb3e9149c43f7a2e8f8b66cbea7845fe")],
    ["pvpQuickplay", 70, "Quickplay", ICON("fb3e9149c43f7a2e8f8b66cbea7845fe")],
    ["control", 10, "Control", ICON("922ae83203f6134bae00937d12eab3a2")],
    ["ironBanner", 19, "Iron Banner", ICON("fe57052d7cf971f7502daa75a2ca2437")],
    ["clash", 12, "Clash", ICON("fb3e9149c43f7a2e8f8b66cbea7845fe")],
    ["rumble", 48, "Rumble", ICON("5b371fef4ecafe733ad487a8fae3b9f5")]
  ];
  const TRIALS_MODE = ["trials_of_osiris", 84, "Trials of Osiris", ICON("e35792b49b249ca5dcdb1e7657ca42b6")];
  // Bungie metric hashes (DestinyMetricDefinition).
  const M = {
    trialsWins: 1365664208, trialsWinsSeason: 2367472811, trialsDefeats: 2082314848,
    flawlessTickets: 1765255052, flawlessPassages: 3273582723, flawlessGildings: 4112712479,
    trialsStreakSeason: 957196641, trialsShutoutSeason: 3364207969, flawlessStreak: 1076064058,
    goldMedals: 3157801630, undefeated: 3212106215, annihilation: 2573000632, gloryStreak: 1289569072,
    crucibleGildings: 1250683514, ironGold: 1196938828, crucibleDefeats: 811894228
  };

  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function api(path, body){
    for (let tries = 0; ; tries++){
      const res = await fetch(BUNGIE + "/Platform" + path, body ? { method: "POST", headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) } : { headers: { "X-API-Key": API_KEY } });
      const j = await res.json().catch(() => ({}));
      if (j.ErrorStatus === "SystemDisabled") throw new Error("Bungie's servers are down for maintenance");
      if ((res.status === 429 || j.ThrottleSeconds > 0) && tries < 4){ await wait(Math.max(1, j.ThrottleSeconds || 2) * 1000 * (tries + 1)); continue; }
      if (j.ErrorCode !== 1) throw new Error(j.Message || "HTTP " + res.status);
      return j.Response;
    }
  }
  // A status message in place of the stats, also read out by #rr-live.
  function say(html){
    $("rr-out").innerHTML = html;
    const live = $("rr-live"); if (live){ live.textContent = ""; setTimeout(() => { live.textContent = $("rr-out").textContent; }, 50); }
  }

  // ---------------- finding a player (as the Raid & Dungeon Report) ----------------
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
    if (prefix.length < 2 || /#\d{1,4}$/.test(text.trim())){ box.hidden = true; box.innerHTML = ""; return; }
    let found = [];
    try { found = ((await api("/User/Search/GlobalName/0/", { displayNamePrefix: prefix })).searchResults || []).filter(x => (x.destinyMemberships || []).length).slice(0, 8); }
    catch (e){ found = []; }
    if (job !== suggestJob) return;
    box.innerHTML = found.map(x => { const m = pick(x.destinyMemberships), name = x.bungieGlobalDisplayName + "#" + String(x.bungieGlobalDisplayNameCode).padStart(4, "0");
      return '<li><button type="button" class="rr-chip" data-p="' + m.membershipType + "-" + m.membershipId + '" data-name="' + esc(name) + '">' + esc(name) + "</button></li>"; }).join("");
    box.hidden = !found.length;
  }

  // ---------------- a player's PvP ----------------
  async function load(type, id){
    const modes = MODES.concat([TRIALS_MODE]).map(m => m[1]).join(",");
    const [profile, stats] = await Promise.all([
      api("/Destiny2/" + type + "/Profile/" + id + "/?components=100,200,1100"),
      api("/Destiny2/" + type + "/Account/" + id + "/Character/0/Stats/?modes=" + modes + "&periodType=AllTime")
    ]);
    return { profile, stats };
  }
  const metricsOf = profile => ((profile.metrics && profile.metrics.data) || {}).metrics || {};
  // A metric's count, or null when Bungie has none for this player.
  const metric = (ms, h) => { const x = ms[h]; return x && x.objectiveProgress ? x.objectiveProgress.progress || 0 : null; };
  // One playlist's numbers from Bungie's stats.
  function mode(stats, key){
    const a = (stats[key] || {}).allTime;
    if (!a) return null;
    const v = k => ((a[k] || {}).basic || {}).value || 0, d = k => ((a[k] || {}).basic || {}).displayValue;
    const matches = v("activitiesEntered"), won = v("activitiesWon");
    return { matches, won, rate: matches ? won / matches * 100 : 0, kd: v("killsDeathsRatio"), kda: v("killsDeathsAssists"), kills: v("kills"), deaths: v("deaths"), best: v("bestSingleGameKills"), spree: v("longestKillSpree"), seconds: v("secondsPlayed"), kdText: d("killsDeathsRatio") };
  }
  // In the reader's number format (1.26 / 1,26; 53.6% / 53,6 %).
  const RATIO = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PCT = new Intl.NumberFormat(undefined, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const ratio = x => RATIO.format(x);
  const pct = x => PCT.format(x / 100);

  // Rumble is free-for-all: a "win" there is first place.
  function card(name, icon, s, winLabel = "Win rate"){
    const none = !s || !s.matches;
    return '<li class="pv-card panel-card' + (none ? " none" : "") + '"><h3 class="pv-mode"><img src="' + esc(img(icon)) + '" alt="" width="28" height="28" loading="lazy">' + esc(name) + "</h3>" +
      (none ? '<p class="pv-big">No matches yet</p>'
        : '<p class="pv-big"><b>' + ratio(s.kd) + "</b> K/D</p>" +
          '<dl class="pv-stats"><div><dt>Matches</dt><dd>' + num(s.matches) + "</dd></div><div><dt>" + winLabel + "</dt><dd>" + pct(s.rate) + "</dd></div><div><dt>KDA</dt><dd>" + ratio(s.kda) + "</dd></div>" +
          "<div><dt>Kills</dt><dd>" + num(s.kills) + "</dd></div><div><dt>Best game</dt><dd>" + num(s.best) + " kills</dd></div><div><dt>Time played</dt><dd>" + fmtHours(s.seconds) + "</dd></div></dl>") + "</li>";
  }
  // A number tile; null shows a dash (Bungie has no count for this player).
  // A note sits under the label, so every tile's number stays at the bottom, in line.
  const tile = (label, n, note) => '<div class="panel-card"><dt>' + esc(label) + (note ? '<span class="pv-note">' + esc(note) + "</span>" : "") + "</dt><dd>" + (n == null ? "–" : num(n)) + "</dd></div>";

  function render(r, type, id){
    const ud = (r.profile.profile && r.profile.profile.data && r.profile.profile.data.userInfo) || {};
    const name = ud.bungieGlobalDisplayName ? ud.bungieGlobalDisplayName + "#" + String(ud.bungieGlobalDisplayNameCode || 0).padStart(4, "0") : ud.displayName || "Guardian";
    const chars = Object.values((r.profile.characters && r.profile.characters.data) || {}).sort((a, b) => Date.parse(b.dateLastPlayed) - Date.parse(a.dateLastPlayed));
    const ms = metricsOf(r.profile), all = mode(r.stats, "allPvP") || { matches: 0, rate: 0, kd: 0 }, trials = mode(r.stats, TRIALS_MODE[0]);
    const tickets = metric(ms, M.flawlessTickets), passages = metric(ms, M.flawlessPassages);
    const flawless = tickets == null && passages == null ? null : (tickets || 0) + (passages || 0);
    remember(name, type + "-" + id);
    document.title = name + " - Crucible & Trials - Rally Flag";
    const ext = (host, label) => '<a href="https://' + host + "/report/" + type + "/" + id + '" target="_blank" rel="noopener">' + label + '<span class="sr-only"> (opens in a new tab)</span></a>';
    $("rr-out").innerHTML =
      '<section class="rr-player panel-card" aria-labelledby="rr-name">' + (chars[0] && chars[0].emblemBackgroundPath ? '<img class="rr-emblem" src="' + esc(img(chars[0].emblemBackgroundPath)) + '" alt="">' : "") +
        '<div class="rr-who"><h2 id="rr-name" tabindex="-1">' + esc(name) + "</h2>" +
          '<p class="rr-chars">' + chars.map(c => esc(CLASSES[c.classType] || "Guardian") + " " + c.light).join(" · ") + "</p>" +
          '<p class="rr-links">Match history on ' + ext("trials.report", "trials.report") + " · " + ext("crucible.report", "crucible.report") +
          ' · <a href="report.html?p=' + type + "-" + id + '">Their raids &amp; dungeons →</a></p></div>' +
        '<dl class="rr-totals"><div><dt>Crucible matches</dt><dd>' + num(all.matches) + "</dd></div><div><dt>K/D</dt><dd>" + ratio(all.kd) + "</dd></div>" +
          "<div><dt>Win rate</dt><dd>" + pct(all.rate) + "</dd></div><div><dt>Flawless</dt><dd>" + (flawless == null ? "–" : num(flawless)) + "</dd></div></dl>" +
        '<button type="button" class="rr-btn rr-copy" id="rr-copy">Copy link</button></section>' +
      '<h2 class="rr-h">Crucible</h2><p class="pv-sub">Every match on every character, deleted ones too.</p>' +
      '<ul class="pv-grid">' + MODES.map(m => card(m[2], m[3], mode(r.stats, m[0]), m[1] === 48 ? "First place" : undefined)).join("") + "</ul>" +
      '<h3 class="pv-h3">Crucible records</h3><dl class="pv-tiles">' +
        tile("Opponents defeated", metric(ms, M.crucibleDefeats)) + tile("Gold medals", metric(ms, M.goldMedals)) + tile("Undefeated matches", metric(ms, M.undefeated)) +
        tile("Annihilations", metric(ms, M.annihilation)) + tile("Longest Glory win streak", metric(ms, M.gloryStreak)) + tile("Iron Banner gold medals", metric(ms, M.ironGold)) +
        tile("Crucible title gildings", metric(ms, M.crucibleGildings)) + "</dl>" +
      '<h2 class="rr-h">Trials of Osiris</h2><p class="pv-sub">Bungie\'s Trials counters, which run from Season 10.</p>' +
      '<dl class="pv-tiles">' + tile("Flawless", flawless, "Flawless tickets and passages") + tile("Wins", metric(ms, M.trialsWins)) + tile("Opponents defeated", metric(ms, M.trialsDefeats)) +
        tile("Flawless title gildings", metric(ms, M.flawlessGildings)) + tile("Best flawless win streak", metric(ms, M.flawlessStreak), "From Episode 3") + "</dl>" +
      '<h3 class="pv-h3">This season</h3><dl class="pv-tiles">' + tile("Wins", metric(ms, M.trialsWinsSeason)) + tile("Best win streak", metric(ms, M.trialsStreakSeason)) + tile("Best shutout streak", metric(ms, M.trialsShutoutSeason)) + "</dl>" +
      '<h3 class="pv-h3">Match stats</h3><ul class="pv-grid">' + card(TRIALS_MODE[2], TRIALS_MODE[3], trials) + "</ul>" +
      '<p class="rr-note">All numbers are Bungie\'s own. Bungie\'s Trials match stats (the card above) cover only part of most players\' history, so they can show far fewer wins than the Wins counter; ' +
        'trials.report and crucible.report keep the complete match history. Win rate is matches won out of matches played.</p>';
    const live = $("rr-live"); if (live) live.textContent = name + "'s Crucible and Trials stats are ready.";
    $("rr-copy").addEventListener("click", () => {
      const url = location.origin + location.pathname + "?p=" + type + "-" + id;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => { $("rr-copy").textContent = "Link copied"; }, () => { $("rr-copy").textContent = url; });
    });
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
    $("rr-recent").innerHTML = list.length ? '<span class="rr-recent-label">Recent</span>' + list.map(x => '<button type="button" class="rr-chip" data-p="' + esc(x.p) + '" data-name="' + esc(x.name) + '">' + esc(x.name) + "</button>").join("") +
      '<button type="button" class="rr-clear" id="rr-recent-clear">Clear<span class="sr-only"> recent searches</span></button>' : "";
  }

  // ---------------- flow ----------------
  let loading = 0;
  async function show(p, push){
    const m = /^(\d+)-(\d+)$/.exec(p || "");
    if (!m) return;
    const job = ++loading;
    suggestJob++;
    $("rr-suggest").hidden = true;
    say('<p class="rr-status">Reading Crucible and Trials stats…</p>');
    if (push) history.pushState({ p }, "", "?p=" + p);
    try {
      const r = await load(m[1], m[2]);
      if (job !== loading) return;
      render(r, m[1], m[2]);
      const h = $("rr-name"); if (h && push) h.focus();
    } catch (e){
      if (job === loading) say('<p class="rr-status error">Couldn\'t load this player (' + esc(e.message) + ").</p>");
    }
  }
  async function submit(e){
    e.preventDefault();
    const text = $("rr-q").value.trim();
    if (!text) return;
    if (!/#\d{1,4}$/.test(text)){ suggest(text); say('<p class="rr-status">Add the 4-digit code after the name (Name#1234), or pick a match below the box.</p>'); return; }
    say('<p class="rr-status">Looking for ' + esc(text) + "…</p>");
    try {
      const m = await findExact(text);
      if (!m) { say('<p class="rr-status error">No Destiny player called ' + esc(text) + ". Check the name and the code.</p>"); return; }
      show(m.membershipType + "-" + m.membershipId, true);
    } catch (err){ say('<p class="rr-status error">The search didn\'t work (' + esc(err.message) + ").</p>"); }
  }
  async function mine(){
    try {
      const res = await RallyFlagAuth.authedFetch("/Platform/User/GetMembershipsForCurrentUser/"), j = await res.json();
      const list = (j.Response && j.Response.destinyMemberships) || [];
      const me = list.find(x => x.membershipId === j.Response.primaryMembershipId) || pick(list);
      if (me) show(me.membershipType + "-" + me.membershipId, true);
    } catch (e){ say('<p class="rr-status error">Couldn\'t find your account (' + esc(e.message) + ").</p>"); }
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
      if (e.target.closest("#rr-recent-clear")){
        try { localStorage.removeItem(RECENT_KEY); } catch (err){}
        renderRecent(); $("rr-q").focus();
        return;
      }
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
