/* ============================================================
   Distortion rotation data — single source of truth.
   Both distortions.html and rotation.html read from this file,
   so recalibrating the anchor only ever needs to happen in one place.
   `art` is the destination's official image (pgcrImage of its patrol /
   free-roam activity in Bungie's DestinyActivityDefinition).
   ============================================================ */
window.DistortionData = (function(){

  const ROTATION = [
    { name: "Cosmodrome",              loot: "Seventh Seraph", slug: "seventh-seraph", art: "/img/destiny_content/pgcr/cosmodrome-explore.jpg" },
    { name: "EDZ",                     loot: "Wildwood",       slug: "wildwood", art: "/img/destiny_content/pgcr/patrol_edz.jpg" },
    { name: "Dreaming City",           loot: "Reverie Dawn",   slug: "reverie-dawn", art: "/img/destiny_content/pgcr/free_roam_dreaming_city.jpg" },
    { name: "Savath\u00fbn's Throne World", loot: "Veritas",   slug: "veritas", art: "/img/destiny_content/pgcr/throneworld_freeroam.jpg" },
    { name: "Moon",                    loot: "Dreambane",      slug: "dreambane", art: "/img/destiny_content/pgcr/patrol_moon.jpg" },
    { name: "Europa",                  loot: "Crystocrene",    slug: "crystocrene", art: "/img/destiny_content/pgcr/europa-mission-club.jpg" },
    { name: "Nessus",                  loot: "Exodus Down",    slug: "exodus-down", art: "/img/destiny_content/pgcr/patrol_nessus.jpg" }
  ];

  // Anchor point: a UTC hour boundary confirmed live in-game, paired with
  // the matching index above. Recalibrate this any time the rotation drifts
  // from what you see in your Destinations screen.
  //
  // Confirmed: Moon was active with a shift at 2:00 PM Eastern (America/New_York),
  // i.e. the Moon hour ran 1:00 PM - 2:00 PM Eastern = 17:00-18:00 UTC.
  const ROTATION_ANCHOR = Date.UTC(2026, 6, 29, 17, 0, 0); // July 29, 2026, 17:00 UTC
  const ROTATION_ANCHOR_INDEX = 4; // Moon

  function indexForHourStart(hourStartMs){
    const hoursSinceAnchor = Math.round((hourStartMs - ROTATION_ANCHOR) / 3600000);
    const idx = (((hoursSinceAnchor + ROTATION_ANCHOR_INDEX) % ROTATION.length) + ROTATION.length) % ROTATION.length;
    return idx;
  }

  function currentHourStart(now){
    return Math.floor(now.getTime() / 3600000) * 3600000;
  }

  function fmtTime(ms){
    return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function fmtDay(ms){
    return new Date(ms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }

  function destinationAt(hourStart){
    return ROTATION[indexForHourStart(hourStart)];
  }

  return { ROTATION, indexForHourStart, currentHourStart, fmtTime, fmtDay, destinationAt };
})();
