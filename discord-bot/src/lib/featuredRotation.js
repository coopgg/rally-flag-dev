const { loadWindowModule } = require("./loadWindowModule");

// Same ?highlight=/#set- pattern distortion.js and the site's own pages
// use for armor-set-bonuses.html.
function armorSetLink(slug, setsBySlug){
  const set = setsBySlug[slug];
  const name = set ? set.name : slug;
  return `[${name}](https://rallyflag.gg/armor-set-bonuses.html?highlight=${slug}#set-${slug})`;
}

// withLinks is on for This Week (actionable right now) and off for Next
// Week (just a prediction) — same info either way, just plain text there
// instead of clickable.
function describeEntries(slugs, list, hrefBase, alwaysFeaturedSlug, setsBySlug, withLinks){
  const bySlug = {};
  list.forEach(item => { bySlug[item.slug] = item; });

  return slugs.map(slug => {
    const item = bySlug[slug];
    if (!item) return slug; // rotation slug didn't match raids-data.js/dungeons-data.js — surface the raw slug rather than hiding the mismatch

    const title = withLinks
      ? `[${item.name}](https://rallyflag.gg/${hrefBase}?slug=${slug})`
      : item.name;
    const armorNames = (item.armorSlugs || []).map(s => withLinks
      ? armorSetLink(s, setsBySlug)
      : (setsBySlug[s] ? setsBySlug[s].name : s));
    const armorSuffix = armorNames.length ? ` (${armorNames.join(", ")})` : "";
    const alwaysSuffix = slug === alwaysFeaturedSlug ? " — Always Featured" : "";

    return `${title}${armorSuffix}${alwaysSuffix}`;
  });
}

// Same anchor as this-week.html's Iron Banner banner: confirmed active
// 8/25-9/1/2026, returning 9/22/2026 — a clean 4-week cadence (week
// index 2 mod 4), tracked off the same RESET_EPOCH_UTC as the raid/
// dungeon rotation rather than a live API signal.
const IRON_BANNER_WEEK_MOD = 2;
const IRON_BANNER_CYCLE_WEEKS = 4;
const IRON_BANNER_ARMOR_SLUGS = ["iron-battalion-set", "iron-panoply-set"];

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
  const ironBannerActive = FeaturedRotationData.mod(weekIndex, IRON_BANNER_CYCLE_WEEKS) === IRON_BANNER_WEEK_MOD;

  return {
    weekIndex,
    ironBannerActive,
    ironBannerArmor: IRON_BANNER_ARMOR_SLUGS.map(slug => armorSetLink(slug, setsBySlug)),
    thisWeek: {
      raids: describeEntries(thisWeek.raids, RaidsData.RAIDS, "raid-guide.html", FeaturedRotationData.ALWAYS_FEATURED_RAID_SLUG, setsBySlug, true),
      dungeons: describeEntries(thisWeek.dungeons, DungeonsData.DUNGEONS, "dungeon-guide.html", FeaturedRotationData.ALWAYS_FEATURED_DUNGEON_SLUG, setsBySlug, true)
    },
    nextWeek: {
      raids: describeEntries(nextWeek.raids, RaidsData.RAIDS, "raid-guide.html", FeaturedRotationData.ALWAYS_FEATURED_RAID_SLUG, setsBySlug, false),
      dungeons: describeEntries(nextWeek.dungeons, DungeonsData.DUNGEONS, "dungeon-guide.html", FeaturedRotationData.ALWAYS_FEATURED_DUNGEON_SLUG, setsBySlug, false)
    }
  };
}

// Split into two messages rather than one — with title + armor-set links
// on every entry, the combined text runs well past Discord's 2000-char
// message limit.
function formatSection(title, entries){
  return [
    `**${title}**`,
    "Raids:",
    ...entries.raids.map(r => `• ${r}`),
    "Dungeons:",
    ...entries.dungeons.map(d => `• ${d}`)
  ].join("\n");
}

function formatThisWeekMessage({ thisWeek, ironBannerActive, ironBannerArmor }){
  const ironBannerLine = ironBannerActive
    ? `**Iron Banner is active this week** (${ironBannerArmor.join(", ")})\n\n`
    : "";
  return ironBannerLine + formatSection("Featured This Week", thisWeek);
}

function formatNextWeekMessage({ nextWeek }){
  return formatSection("Next Week (Predicted)", nextWeek);
}

module.exports = { getFeaturedUpdate, formatThisWeekMessage, formatNextWeekMessage };
