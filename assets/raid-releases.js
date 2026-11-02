/* ============================================================
   Day One / Contest / Week One badges for the Raid & Dungeon Report
   (assets/report.js), copied rule for rule from raid.report's and
   dungeon.report's own code (their launchTime and
   worldFirstBadgeConfiguration, read 2026-11-02), so a card shows the
   same badge there and here.

   How they work: each raid/dungeon has one ordered list of rules; the
   card gets the FIRST rule that matches, and only that one.
     [label, hours, hash, record]
     hours:  the player's first clear has to END (start + duration) within
             this many hours of `start`.
     hash:   only clears of this activity count (the Contest version);
             0 = the earliest clear of any version.
     record: a triumph that also earns the badge (Contest clears whose
             runs Bungie no longer lists, etc.).
   Week One's hours run to the first weekly reset, so they differ.

   Dungeon races (Contest mode) only happened for Vesper's Host,
   Sundered Doctrine and Equilibrium (48 hours; PCGamesN and Dexerto for
   Sundered Doctrine: "Contest Mode will be live for the first 48
   hours", 9am PT / 17:00 UTC 7 Feb 2025). Every other dungeon has only
   Day One and Week One. Raid Contest windows likewise: Vault of Glass,
   King's Fall and Crota's End show "Challenge" (their Contest-era
   versions), Garden / Deep Stone Crypt / Last Wish only Day One.
   New raid or dungeon: copy its rules from raid.report / dungeon.report
   (their main.*.chunk.js) when they add it.
   ============================================================ */
window.RaidReleases = {
  "last-wish": { start: "2018-09-14T17:00:00Z", badges: [["Day One", 24], ["Week One", 96]] },
  "garden-of-salvation": { start: "2019-10-05T17:00:00Z", badges: [["Day One", 24], ["Week One", 72]] },
  "deep-stone-crypt": { start: "2020-11-21T18:00:00Z", badges: [["Day One", 24, 0, 2699580344], ["Week One", 71]] },
  "vault-of-glass": { start: "2021-05-22T17:00:00Z", badges: [["Challenge Day One", 24, 1485585878, 2384429092], ["Day One", 24], ["Week One", 72]] },
  "vow-of-the-disciple": { start: "2022-03-05T18:00:00Z", badges: [["Day One", 24, 0, 922211732], ["Contest", 48], ["Week One", 71]] },
  "kings-fall": { start: "2022-08-26T17:00:00Z", badges: [["Challenge Day One", 24, 1063970578, 2579096068], ["Day One", 24], ["Week One", 96]] },
  "root-of-nightmares": { start: "2023-03-10T17:00:00Z", badges: [["Day One", 24], ["Contest", 48, 0, 3025362184], ["Week One", 96]] },
  "crotas-end": { start: "2023-09-01T17:00:00Z", badges: [["Challenge Day One", 24, 156253568], ["Challenge", 48, 156253568, 1417273794], ["Day One", 24], ["Contest", 48], ["Week One", 96]] },
  "salvations-edge": { start: "2024-06-07T17:00:00Z", badges: [["Day One", 24], ["Contest", 48, 0, 3975049489], ["Week One", 96]] },
  "the-desert-perpetual": { start: "2025-07-19T17:00:00Z", badges: [["Contest Day One", 24, 3896382790], ["Contest", 48, 3896382790], ["Day One", 24], ["Week One", 72]] },
  "shattered-throne": { start: "2018-09-25T17:00:00Z", badges: [["Day One", 24], ["Week One", 168]] },
  "pit-of-heresy": { start: "2019-10-29T17:00:00Z", badges: [["Day One", 24], ["Week One", 168]] },
  "prophecy": { start: "2020-06-10T00:00:00Z", badges: [["Day One", 24], ["Week One", 161]] },
  "grasp-of-avarice": { start: "2021-12-07T17:00:00Z", badges: [["Day One", 24], ["Week One", 168]] },
  "duality": { start: "2022-05-27T17:00:00Z", badges: [["Day One", 24], ["Week One", 96]] },
  "spire-of-the-watcher": { start: "2022-12-09T17:00:00Z", badges: [["Day One", 24], ["Week One", 96]] },
  "ghosts-of-the-deep": { start: "2023-05-26T17:00:00Z", badges: [["Day One", 24], ["Week One", 96]] },
  "warlords-ruin": { start: "2023-12-01T17:00:00Z", badges: [["Day One", 24], ["Week One", 96]] },
  "vespers-host": { start: "2024-10-11T17:00:00Z", badges: [["Contest Day One", 24, 1915770060], ["Contest", 48, 1915770060, 1136171205], ["Day One", 24], ["Week One", 96]] },
  "sundered-doctrine": { start: "2025-02-07T17:00:00Z", badges: [["Contest Day One", 24, 247869137], ["Contest", 48, 247869137, 781401026], ["Day One", 24], ["Week One", 96]] },
  "equilibrium": { start: "2025-12-13T17:00:00Z", badges: [["Contest Day One", 24, 1754635208], ["Contest", 48, 1754635208, 1519202867], ["Day One", 24], ["Week One", 72]] }
};
