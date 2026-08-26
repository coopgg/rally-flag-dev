/* ============================================================
   Featured raid/dungeon rotation data — single source of truth.
   Both this-week.html and the RallyBot Discord bot (discord-bot/)
   read from this file, so recalibrating the anchor only ever needs
   to happen in one place.

   Bungie's public API doesn't give a clean "these 2 are featured"
   signal — checked GetPublicMilestones directly and every raid gets
   an identically-shaped weekly challenge simultaneously (King's Fall,
   Crota's End, etc. all live at once, same date range, no distinguishing
   field), and dungeons don't appear in Milestones at all.

   Reverse-engineered instead from D2RAD's rotation-history tracking
   (d2rad.com/rotation-history — ~10 weeks of Bungie API-verified
   history). Real mechanism: two independent slots per category, each
   stepping forward exactly one position through the SAME canonical
   sequence every reset, permanently offset from each other. Anchored
   to the confirmed week of Aug 11, 2026: raid slots on Last Wish
   (position 1) + Vow of the Disciple (position 5); dungeon slots on
   Grasp of Avarice (position 4) + Sundered Doctrine (position 10) —
   this exactly matched what was previously hand-maintained here too.
   The Desert Perpetual and Equilibrium (the two newest raid/dungeon)
   aren't in D2RAD's tracked cycle at all — not because they're missing
   data, but because Bungie always features the newest raid/dungeon of
   the season permanently, on top of the 2 rotating slots. Since this is
   the final content update, that pair is never going to change, so
   they're added back in below as permanently-featured entries rather
   than rotation candidates.
   ============================================================ */
window.FeaturedRotationData = (function(){

  const ALWAYS_FEATURED_RAID_SLUG = "the-desert-perpetual";
  const ALWAYS_FEATURED_DUNGEON_SLUG = "equilibrium";
  const RAID_ROTATION_SLUGS = [
    "last-wish", "garden-of-salvation", "deep-stone-crypt", "vault-of-glass",
    "vow-of-the-disciple", "kings-fall", "root-of-nightmares", "crotas-end",
    "salvations-edge"
  ];
  const DUNGEON_ROTATION_SLUGS = [
    "shattered-throne", "pit-of-heresy", "prophecy", "grasp-of-avarice",
    "duality", "spire-of-the-watcher", "ghosts-of-the-deep", "warlords-ruin",
    "vespers-host", "sundered-doctrine"
  ];
  const RAID_SLOT_OFFSETS = [0, 4];    // Last Wish, Vow of the Disciple @ anchor week
  const DUNGEON_SLOT_OFFSETS = [3, 9]; // Grasp of Avarice, Sundered Doctrine @ anchor week
  const RESET_EPOCH_UTC = Date.UTC(2026, 7, 11, 17, 0, 0); // confirmed reset week — this is week 0
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

  function currentWeekIndex(now){
    return Math.floor(((now || Date.now()) - RESET_EPOCH_UTC) / MS_PER_WEEK);
  }

  function mod(n, m){
    return ((n % m) + m) % m;
  }

  function slotRotationPick(slugs, slotOffsets, week){
    return slotOffsets.map(offset => slugs[mod(offset + week, slugs.length)]);
  }

  function featuredForWeek(week){
    return {
      raids: [ALWAYS_FEATURED_RAID_SLUG, ...slotRotationPick(RAID_ROTATION_SLUGS, RAID_SLOT_OFFSETS, week)],
      dungeons: [ALWAYS_FEATURED_DUNGEON_SLUG, ...slotRotationPick(DUNGEON_ROTATION_SLUGS, DUNGEON_SLOT_OFFSETS, week)]
    };
  }

  function msUntilNextReset(now){
    now = now || Date.now();
    const currentWeekStart = RESET_EPOCH_UTC + Math.floor((now - RESET_EPOCH_UTC) / MS_PER_WEEK) * MS_PER_WEEK;
    return (currentWeekStart + MS_PER_WEEK) - now;
  }

  return {
    ALWAYS_FEATURED_RAID_SLUG, ALWAYS_FEATURED_DUNGEON_SLUG,
    RAID_ROTATION_SLUGS, DUNGEON_ROTATION_SLUGS,
    RAID_SLOT_OFFSETS, DUNGEON_SLOT_OFFSETS,
    RESET_EPOCH_UTC, MS_PER_WEEK,
    currentWeekIndex, mod, slotRotationPick, featuredForWeek, msUntilNextReset
  };
})();
