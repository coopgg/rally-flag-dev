const { loadWindowModule } = require("./loadWindowModule");

// Same ?highlight=/#set- pattern distortion.js and the site's own pages
// use for armor-set-bonuses.html.
function armorSetLink(slug, setsBySlug){
  const set = setsBySlug[slug];
  const name = set ? set.name : slug;
  return `[${name}](https://rallyflag.gg/armor-set-bonuses.html?highlight=${slug}#set-${slug})`;
}

function describeEntries(slugs, list, hrefBase, alwaysFeaturedSlug, setsBySlug){
  const bySlug = {};
  list.forEach(item => { bySlug[item.slug] = item; });

  return slugs.map(slug => {
    const item = bySlug[slug];
    if (!item) return slug; // rotation slug didn't match raids-data.js/dungeons-data.js — surface the raw slug rather than hiding the mismatch

    const titleLink = `[${item.name}](https://rallyflag.gg/${hrefBase}?slug=${slug})`;
    const armorLinks = (item.armorSlugs || []).map(s => armorSetLink(s, setsBySlug));
    const armorSuffix = armorLinks.length ? ` (${armorLinks.join(", ")})` : "";
    const alwaysSuffix = slug === alwaysFeaturedSlug ? " — Always Featured" : "";

    return `${titleLink}${armorSuffix}${alwaysSuffix}`;
  });
}

function getFeaturedUpdate(now = Date.now()){
  const FeaturedRotationData = loadWindowModule("featured-rotation-data.js", "FeaturedRotationData");
  const RaidsData = loadWindowModule("raids-data.js", "RaidsData");
  const DungeonsData = loadWindowModule("dungeons-data.js", "DungeonsData");
  const ArmorSetsData = loadWindowModule("sets-data.js", "ArmorSetsData");

  const setsBySlug = {};
  (ArmorSetsData.SETS || []).forEach(s => { setsBySlug[s.slug] = s; });

  const weekIndex = FeaturedRotationData.currentWeekIndex(now);
  const thisWeek = FeaturedRotationData.featuredForWeek(weekIndex);
  const nextWeek = FeaturedRotationData.featuredForWeek(weekIndex + 1);

  return {
    weekIndex,
    thisWeek: {
      raids: describeEntries(thisWeek.raids, RaidsData.RAIDS, "raid-guide.html", FeaturedRotationData.ALWAYS_FEATURED_RAID_SLUG, setsBySlug),
      dungeons: describeEntries(thisWeek.dungeons, DungeonsData.DUNGEONS, "dungeon-guide.html", FeaturedRotationData.ALWAYS_FEATURED_DUNGEON_SLUG, setsBySlug)
    },
    nextWeek: {
      raids: describeEntries(nextWeek.raids, RaidsData.RAIDS, "raid-guide.html", FeaturedRotationData.ALWAYS_FEATURED_RAID_SLUG, setsBySlug),
      dungeons: describeEntries(nextWeek.dungeons, DungeonsData.DUNGEONS, "dungeon-guide.html", FeaturedRotationData.ALWAYS_FEATURED_DUNGEON_SLUG, setsBySlug)
    }
  };
}

function formatFeaturedMessage({ thisWeek, nextWeek }){
  const lines = [
    "**Featured This Week**",
    "Raids:",
    ...thisWeek.raids.map(r => `• ${r}`),
    "Dungeons:",
    ...thisWeek.dungeons.map(d => `• ${d}`),
    "",
    "**Next Week (Predicted)**",
    "Raids:",
    ...nextWeek.raids.map(r => `• ${r}`),
    "Dungeons:",
    ...nextWeek.dungeons.map(d => `• ${d}`)
  ];
  return lines.join("\n");
}

module.exports = { getFeaturedUpdate, formatFeaturedMessage };
