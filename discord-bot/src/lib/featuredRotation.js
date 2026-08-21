const { loadWindowModule } = require("./loadWindowModule");

function namesForSlugs(slugs, list, alwaysFeaturedSlug){
  const bySlug = {};
  list.forEach(item => { bySlug[item.slug] = item; });
  return slugs.map(slug => {
    const item = bySlug[slug];
    const name = item ? item.name : slug;
    return slug === alwaysFeaturedSlug ? `${name} (Always Featured)` : name;
  });
}

function getFeaturedUpdate(now = Date.now()){
  const FeaturedRotationData = loadWindowModule("featured-rotation-data.js", "FeaturedRotationData");
  const RaidsData = loadWindowModule("raids-data.js", "RaidsData");
  const DungeonsData = loadWindowModule("dungeons-data.js", "DungeonsData");

  const weekIndex = FeaturedRotationData.currentWeekIndex(now);
  const thisWeek = FeaturedRotationData.featuredForWeek(weekIndex);
  const nextWeek = FeaturedRotationData.featuredForWeek(weekIndex + 1);

  return {
    weekIndex,
    thisWeek: {
      raids: namesForSlugs(thisWeek.raids, RaidsData.RAIDS, FeaturedRotationData.ALWAYS_FEATURED_RAID_SLUG),
      dungeons: namesForSlugs(thisWeek.dungeons, DungeonsData.DUNGEONS, FeaturedRotationData.ALWAYS_FEATURED_DUNGEON_SLUG)
    },
    nextWeek: {
      raids: namesForSlugs(nextWeek.raids, RaidsData.RAIDS, FeaturedRotationData.ALWAYS_FEATURED_RAID_SLUG),
      dungeons: namesForSlugs(nextWeek.dungeons, DungeonsData.DUNGEONS, FeaturedRotationData.ALWAYS_FEATURED_DUNGEON_SLUG)
    }
  };
}

function formatFeaturedMessage({ thisWeek, nextWeek }){
  const lines = [
    "**Featured This Week**",
    `Raids: ${thisWeek.raids.join(", ")}`,
    `Dungeons: ${thisWeek.dungeons.join(", ")}`,
    "",
    "**Next Week (Predicted)**",
    `Raids: ${nextWeek.raids.join(", ")}`,
    `Dungeons: ${nextWeek.dungeons.join(", ")}`
  ];
  return lines.join("\n");
}

module.exports = { getFeaturedUpdate, formatFeaturedMessage };
