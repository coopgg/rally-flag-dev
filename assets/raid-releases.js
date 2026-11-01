/* ============================================================
   When each raid and dungeon opened, for the Raid & Dungeon Report's
   Day One / Contest / Week One badges (assets/report.js). Hand-kept:
   add a new raid or dungeon's start (UTC) when it opens.
   contest: hours its first clears count as Contest (raids from Vault of
     Glass on ran Contest mode for 48 hours); dayOne: raids before that
     get "Day One" for the first 24 hours instead.
   The Desert Perpetual (19 July 2025, 10:00 PT) and Equilibrium (13 Dec
   2025, 9:00 PT), confirmed by the owner (2026-11-01); both ran Contest
   mode for 48 hours and also have Bungie "Contest" versions.
   epic: an Epic version's own start (The Desert Perpetual's Epic raid,
     27 Sept 2025, 10:00 PT); its runs count Contest / Week One from then.
   ============================================================ */
window.RaidReleases = {
  "last-wish": { start: "2018-09-14T17:00:00Z", dayOne: 24 },
  "garden-of-salvation": { start: "2019-10-05T17:00:00Z", dayOne: 24 },
  "deep-stone-crypt": { start: "2020-11-21T18:00:00Z", dayOne: 24 },
  "vault-of-glass": { start: "2021-05-22T17:00:00Z", contest: 48 },
  "vow-of-the-disciple": { start: "2022-03-05T18:00:00Z", contest: 48 },
  "kings-fall": { start: "2022-08-26T17:00:00Z", contest: 48 },
  "root-of-nightmares": { start: "2023-03-10T18:00:00Z", contest: 48 },
  "crotas-end": { start: "2023-09-01T17:00:00Z", contest: 48 },
  "salvations-edge": { start: "2024-06-07T17:00:00Z", contest: 48 },
  "the-desert-perpetual": { start: "2025-07-19T17:00:00Z", contest: 48, epic: { start: "2025-09-27T17:00:00Z", contest: 48 } },
  "shattered-throne": { start: "2018-09-25T17:00:00Z" },
  "pit-of-heresy": { start: "2019-10-29T17:00:00Z" },
  "prophecy": { start: "2020-06-09T17:00:00Z" },
  "grasp-of-avarice": { start: "2021-12-07T17:00:00Z" },
  "duality": { start: "2022-05-27T17:00:00Z" },
  "spire-of-the-watcher": { start: "2022-12-09T17:00:00Z" },
  "ghosts-of-the-deep": { start: "2023-05-26T17:00:00Z" },
  "warlords-ruin": { start: "2023-12-01T17:00:00Z" },
  "vespers-host": { start: "2024-10-11T17:00:00Z" },
  "sundered-doctrine": { start: "2025-02-07T17:00:00Z" },
  "equilibrium": { start: "2025-12-13T17:00:00Z", contest: 48 }
};
