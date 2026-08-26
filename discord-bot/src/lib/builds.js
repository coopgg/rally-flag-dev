const { loadWindowModule } = require("./loadWindowModule");

function allBuilds(){
  return loadWindowModule("builds-data.js", "BuildsData").BUILDS;
}

function findBuild(query){
  const builds = allBuilds();
  const q = (query || "").trim().toLowerCase();
  return builds.find(b => b.slug === q)
    || builds.find(b => b.title.toLowerCase() === q)
    || builds.find(b => b.title.toLowerCase().includes(q));
}

function searchBuilds(query){
  const q = (query || "").trim().toLowerCase();
  return allBuilds().filter(b => b.title.toLowerCase().includes(q));
}

function formatBuildMessage(build){
  const lines = [
    `**${build.title}** — ${build.class} ${build.subclass}`,
    build.tagline,
    `Exotic Armor: ${build.exoticArmor.name} (${build.exoticArmor.slot})`,
    `Exotic Weapon: ${build.exoticWeapon.name} (${build.exoticWeapon.weaponType})`,
    `Armor Set: ${build.armorSet.name}`,
    `Artifact: ${build.artifact.name}`
  ];
  if (build.tags && build.tags.length) lines.push(`Tags: ${build.tags.join(", ")}`);
  lines.push(`Full breakdown: https://rallyflag.gg/builds.html#build-${build.slug}`);
  return lines.join("\n");
}

module.exports = { findBuild, searchBuilds, formatBuildMessage };
