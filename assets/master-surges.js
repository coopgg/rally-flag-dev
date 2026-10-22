/* ============================================================
   This week's Master raid surges (Home and This Week).

   Bungie's public milestones (GetPublicMilestones, API key only, no
   sign-in) list each raid's activities for the week with their
   modifier hashes; a Master raid's include its two element surges.
   The hashes below come from DestinyActivityDefinition ("<raid>:
   Master") and DestinyActivityModifierDefinition ("<Element> Surge").
   A new Master raid or surge would need adding here.

   Needs assets/api-keys.js and assets/featured-rotation-data.js first.
   ============================================================ */
window.RallyFlagSurges = (function(){
  const MASTER = {
    "kings-fall": [3257594522, 2964135793],
    "crotas-end": [1507509200],
    "vow-of-the-disciple": [3889634515, 4217492330],
    "vault-of-glass": [3022541210, 1681562271],
    "root-of-nightmares": [2918919505],
    "salvations-edge": [4129614942]
  };
  const SURGES = { 426976067: "solar", 2691200658: "arc", 3196075844: "void", 3809788899: "stasis", 2983647439: "stasis", 3810297122: "strand" };
  const NAMES = { solar: "Solar", arc: "Arc", void: "Void", stasis: "Stasis", strand: "Strand" };
  const ICONS = {
    solar: "1f27bdc178bf645944119d6481f33656", arc: "226a64add0dbb3919e3f34ae778fd9b8", void: "382ae8c952160e4272ffb0b852f55142",
    stasis: "d542fb1a1171b0270cd83b5aa79f3e0d", strand: "e8ab8ba72b54125d2750e943ba6c824d"
  };
  const CACHE_KEY = "rallyflag_master_surges";
  const iconUrl = el => "https://www.bungie.net/common/destiny2_content/icons/" + ICONS[el] + ".png";
  const hasMaster = slug => !!MASTER[slug];

  // { slug: ["void", "strand"] } for raids whose Master version Bungie
  // lists this week. Kept for the session, per weekly reset.
  let job = null;
  function load(){
    if (job) return job;
    const week = window.FeaturedRotationData.currentWeekIndex();
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (c && c.week === week) return (job = Promise.resolve(c.bySlug));
    } catch (e){}
    job = fetch("https://www.bungie.net/Platform/Destiny2/Milestones/", { headers: { "X-API-Key": window.RallyFlagAPI.BUNGIE_API_KEY } })
      .then(r => r.json())
      .then(d => {
        if (!d || d.ErrorCode !== 1) throw new Error((d && d.Message) || "Bungie didn't answer");
        const slugOf = {};
        for (const slug in MASTER) for (const h of MASTER[slug]) slugOf[h] = slug;
        const bySlug = {};
        for (const m of Object.values(d.Response || {})) for (const a of m.activities || []){
          const slug = slugOf[a.activityHash];
          if (!slug) continue;
          const els = (a.modifierHashes || []).map(h => SURGES[h]).filter(Boolean);
          if (els.length) bySlug[slug] = [...new Set((bySlug[slug] || []).concat(els))];
        }
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ week, bySlug })); } catch (e){}
        return bySlug;
      })
      .catch(e => { job = null; throw e; });
    return job;
  }

  // Element pills (icon + name); iconsOnly for tight spots, still named for screen readers.
  function chipsHtml(els, iconsOnly){
    return els.map(el => '<span class="surge-chip surge-' + el + (iconsOnly ? " icon-only" : "") + '"><img src="' + iconUrl(el) + '" alt="" width="16" height="16">' +
      (iconsOnly ? '<span class="sr-only">' + NAMES[el] + " surge</span>" : NAMES[el]) + "</span>").join("");
  }

  // Fill every [data-surges="<slug>"] slot on the page (laid out already,
  // so nothing moves when Bungie answers).
  function fill(root){
    const slots = (root || document).querySelectorAll("[data-surges]");
    if (!slots.length) return;
    load().then(bySlug => slots.forEach(s => {
      const els = bySlug[s.dataset.surges], icons = s.hasAttribute("data-icons-only");
      s.innerHTML = els ? (icons ? '<span class="sr-only">Master surges: </span>' : "") + chipsHtml(els, icons) : (icons ? "" : '<span class="surge-note">Not listed by Bungie this week</span>');
      s.setAttribute("aria-busy", "false");
    })).catch(() => slots.forEach(s => {
      s.innerHTML = s.hasAttribute("data-icons-only") ? "" : '<span class="surge-note">Couldn\'t load from Bungie</span>';
      s.setAttribute("aria-busy", "false");
    }));
  }

  return { hasMaster, load, fill, chipsHtml, NAMES };
})();
