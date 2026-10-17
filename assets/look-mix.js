/* ============================================================
   DEV-ONLY design preview (item 8): "A + Cosmic". Loaded by nav.js
   only on the dev host after ?look=mix (styles: look-mix.css).
   Adds official activity art (pgcrImage from Bungie's
   DestinyActivityDefinition) to raid/dungeon cards, This Week's
   featured cards, the guide headers, and a "featured this week"
   banner on the home page. If the look is adopted, the ART map
   moves into raids-data.js / dungeons-data.js.
   ============================================================ */
(function(){
  const ART = {
    "last-wish":"raid_beanstalk", "garden-of-salvation":"raid_garden_of_salvation",
    "deep-stone-crypt":"europa-raid-deep-stone-crypt", "vault-of-glass":"vault_of_glass",
    "vow-of-the-disciple":"raid_nemesis", "kings-fall":"raid_kings_fall",
    "root-of-nightmares":"raid_root_of_nightmares", "crotas-end":"raid_crotas_end",
    "salvations-edge":"raid_splinter", "the-desert-perpetual":"raid_gateways",
    "shattered-throne":"mission_labyrinth", "pit-of-heresy":"dungeon_pit_of_heresy",
    "prophecy":"dungeon_prophecy", "grasp-of-avarice":"30th-anniversary-grasp-of-avarice",
    "duality":"dungeon_duality", "spire-of-the-watcher":"dungeon_spire_of_the_watcher",
    "ghosts-of-the-deep":"dungeon_ghosts_of_the_deep", "warlords-ruin":"dungeon_ridgeline",
    "vespers-host":"vespers_host", "sundered-doctrine":"dungeon_delver",
    "equilibrium":"dungeon_equilibrium"
  };
  const artUrl = slug => ART[slug] ? "https://www.bungie.net/img/destiny_content/pgcr/" + ART[slug] + ".jpg" : "";
  const slugOf = href => { const m = /[?&]slug=([^&#]+)/.exec(href || ""); return m ? decodeURIComponent(m[1]) : ""; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" })[c]);

  function artBlock(slug, name){
    const url = artUrl(slug);
    const div = document.createElement("div");
    div.className = "look-art";
    if (url) div.innerHTML = '<img src="' + url + '" alt="" loading="lazy">';
    else div.innerHTML = '<div class="look-art-fallback" aria-hidden="true">' + esc((name || slug).replace(/^The /, "").split(/\s+/).map(w => w[0]).join("").slice(0, 2)) + '</div>';
    return div;
  }

  // Cards are rendered by each page's own script, possibly after this
  // runs, so decorate is idempotent and re-runs on DOM changes.
  function decorate(){
    document.querySelectorAll(".activity-card:not(.look-has-art)").forEach(card => {
      const slug = slugOf(card.getAttribute("href"));
      if (!slug) return;
      const name = card.querySelector(".activity-name");
      card.classList.add("look-has-art");
      card.insertBefore(artBlock(slug, name && name.textContent), card.firstChild);
    });
    document.querySelectorAll(".featured-card:not(.look-has-art)").forEach(card => {
      const link = card.querySelector('a[href*="slug="]');
      if (!link) return;
      const name = card.querySelector(".featured-name");
      card.classList.add("look-has-art");
      card.insertBefore(artBlock(slugOf(link.getAttribute("href")), name && name.textContent), card.firstChild);
    });
  }

  function guideBanner(){
    const hero = document.getElementById("hero");
    const slug = slugOf(location.search);
    if (!hero || !slug || !/(raid|dungeon)-guide\.html$/.test(location.pathname) || hero.classList.contains("look-banner")) return;
    const url = artUrl(slug);
    if (!url) return;
    hero.classList.add("look-banner");
    const art = document.createElement("div");
    art.className = "look-banner-art";
    art.innerHTML = '<img src="' + url + '" alt="" fetchpriority="high">';
    hero.insertBefore(art, hero.firstChild);
  }

  function loadScript(src){
    return new Promise((resolve, reject) => {
      const s = document.createElement("script"); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }

  function homeFeature(){
    const isHome = /\/(index\.html)?$/.test(location.pathname);
    const hero = document.querySelector("main .hero");
    if (!isHome || !hero || document.querySelector(".look-feature")) return;
    const need = [];
    if (!window.RaidsData) need.push(loadScript("assets/raids-data.js"));
    if (!window.DungeonsData) need.push(loadScript("assets/dungeons-data.js"));
    if (!window.FeaturedRotationData) need.push(loadScript("assets/featured-rotation-data.js"));
    Promise.all(need).then(() => {
      const F = window.FeaturedRotationData, RAIDS = window.RaidsData.RAIDS, DUNGEONS = window.DungeonsData.DUNGEONS;
      const featured = F.featuredForWeek(F.currentWeekIndex());
      const raid = RAIDS.find(r => r.slug === featured.raids[1]) || RAIDS[0];
      const tiles = [
        ...featured.raids.filter(s => s !== raid.slug).map(s => ["Featured raid", RAIDS.find(r => r.slug === s), "raid-guide.html?slug="]),
        ...featured.dungeons.slice(0, 2).map(s => ["Featured dungeon", DUNGEONS.find(d => d.slug === s), "dungeon-guide.html?slug="])
      ].filter(t => t[1]);
      const ms = F.msUntilNextReset(), d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24;
      const box = document.createElement("section");
      box.className = "look-feature";
      box.setAttribute("aria-label", "Featured this week");
      box.innerHTML =
        '<a class="look-feature-main" href="raid-guide.html?slug=' + raid.slug + '">' +
          '<div class="look-feature-art"><img src="' + artUrl(raid.slug) + '" alt=""></div>' +
          '<div class="look-feature-body"><div class="look-kicker">Featured raid this week</div>' +
          '<div class="look-feature-name">' + esc(raid.name) + '</div>' +
          '<div class="look-feature-meta">' + raid.encounters.length + ' encounters · rotates in ' + d + 'd ' + h + 'h</div>' +
          '<span class="look-feature-cta">Open the guide&nbsp;<span aria-hidden="true">→</span></span></div></a>' +
        '<div class="look-feature-tiles">' + tiles.map(([kind, a, base]) =>
          '<a class="look-tile" href="' + base + a.slug + '">' + (artUrl(a.slug) ? '<img src="' + artUrl(a.slug) + '" alt="" loading="lazy">' : '') +
          '<span><span class="look-tile-kind">' + kind + '</span><span class="look-tile-name">' + esc(a.name) + '</span></span></a>').join("") +
        '</div>';
      hero.insertAdjacentElement("afterend", box);
    }).catch(() => {});
  }

  function pill(){
    if (document.querySelector(".look-pill")) return;
    const p = document.createElement("aside");
    p.className = "look-pill";
    p.setAttribute("aria-label", "Design preview");
    const off = new URL(location.href); off.searchParams.set("look", "off");
    p.innerHTML = '<span>Preview: A + Cosmic</span><a href="' + esc(off.pathname + off.search + off.hash) + '">Turn off</a>';
    document.body.appendChild(p);
  }

  function run(){ decorate(); guideBanner(); homeFeature(); pill(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
  const main = document.getElementById("main-content") || document.body;
  new MutationObserver(() => decorate()).observe(main, { childList:true, subtree:true });
})();
