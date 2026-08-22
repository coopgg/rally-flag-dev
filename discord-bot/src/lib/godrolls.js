const { loadWindowModule } = require("./loadWindowModule");

function allWeapons(){
  return loadWindowModule("god-rolls-data.js", "GodRollsData").WEAPONS;
}

// Exact slug match first, then exact name match, then substring — same
// tolerant-lookup pattern whether the caller picked an autocomplete
// suggestion (passes the slug) or just typed a name by hand.
function findWeapon(query){
  const weapons = allWeapons();
  const q = (query || "").trim().toLowerCase();
  return weapons.find(w => w.slug === q)
    || weapons.find(w => w.name.toLowerCase() === q)
    || weapons.find(w => w.name.toLowerCase().includes(q));
}

function searchWeapons(query){
  const q = (query || "").trim().toLowerCase();
  return allWeapons().filter(w => w.name.toLowerCase().includes(q));
}

function formatWeaponMessage(weapon){
  const RaidsData = loadWindowModule("raids-data.js", "RaidsData");
  const DungeonsData = loadWindowModule("dungeons-data.js", "DungeonsData");

  const lines = [`**${weapon.name}**`];
  if (weapon.note) lines.push(weapon.note);

  const from = [];
  if (weapon.raidSlug){
    const raid = RaidsData.RAIDS.find(r => r.slug === weapon.raidSlug);
    if (raid) from.push(raid.name);
  }
  if (weapon.dungeonSlug){
    const dungeon = DungeonsData.DUNGEONS.find(d => d.slug === weapon.dungeonSlug);
    if (dungeon) from.push(dungeon.name);
  }
  if (from.length) lines.push(`From: ${from.join(", ")}`);
  if (weapon.buildTags && weapon.buildTags.length) lines.push(`Builds: ${weapon.buildTags.join(", ")}`);

  lines.push(`Full roll & perks: https://rallyflag.gg/god-rolls.html#weapon-${weapon.slug}`);
  return lines.join("\n");
}

module.exports = { findWeapon, searchWeapons, formatWeaponMessage };
