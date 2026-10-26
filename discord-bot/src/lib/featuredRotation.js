const { loadWindowModule } = require("./loadWindowModule");

// Same ?highlight=/#set- pattern distortion.js and the site's own pages
// use for armor-set-bonuses.html.
function armorSetLink(slug, setsBySlug){
  const set = setsBySlug[slug];
  const name = set ? set.name : slug;
  return `[${name}](https://rallyflag.gg/armor-set-bonuses.html?highlight=${slug}#set-${slug})`;
}

function describeEntries(slugs, list, guideKind, alwaysFeaturedSlug, setsBySlug, surges){
  const bySlug = {};
  list.forEach(item => { bySlug[item.slug] = item; });

  return slugs.map(slug => {
    const item = bySlug[slug];
    if (!item) return slug; // rotation slug didn't match raids-data.js/dungeons-data.js — surface the raw slug rather than hiding the mismatch

    // One static page per raid/dungeon (tools/build-guide-pages.js), so the
    // link preview shows that activity's name, summary and art.
    const title = `[${item.name}](https://rallyflag.gg/${guideKind}-${slug}.html)`;
    const armorNames = (item.armorSlugs || []).map(s => armorSetLink(s, setsBySlug));
    const armorSuffix = armorNames.length ? ` (${armorNames.join(", ")})` : "";
    const alwaysSuffix = slug === alwaysFeaturedSlug ? " — Always Featured" : "";
    const els = surges && surges.bySlug[slug];
    const surgeSuffix = els && els.length ? ` — Master surges: ${els.map(e => surges.names[e]).join(", ")}` : "";

    return `${title}${armorSuffix}${alwaysSuffix}${surgeSuffix}`;
  });
}

// Same anchor as this-week.html's Iron Banner banner: confirmed active
// 8/25-9/1/2026, returning 9/22/2026 — a clean 4-week cadence (week
// index 2 mod 4), tracked off the same RESET_EPOCH_UTC as the raid/
// dungeon rotation rather than a live API signal.
const IRON_BANNER_WEEK_MOD = 2;
const IRON_BANNER_CYCLE_WEEKS = 4;
const IRON_BANNER_ARMOR_SLUGS = ["iron-battalion-set", "iron-panoply-set"];

// This week's Master raid surges from Bungie's public milestones, through the
// site's own assets/master-surges.js (same Master/surge tables as Home and
// This Week). Uses BUNGIE_API_KEY from .env if set, else the site's
// rallyflag.gg key (Bungie accepts it from a server). Gives up after
// timeoutMs (a slash command must answer within 3s): null means "post
// without surges".
async function getMasterSurges(timeoutMs = 2500){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const FeaturedRotationData = loadWindowModule("featured-rotation-data.js", "FeaturedRotationData");
    const RallyFlagAPI = process.env.BUNGIE_API_KEY ? { BUNGIE_API_KEY: process.env.BUNGIE_API_KEY }
      : loadWindowModule("api-keys.js", "RallyFlagAPI", { window: { location: { hostname: "rallyflag.gg" } } });
    const Surges = loadWindowModule("master-surges.js", "RallyFlagSurges", {
      window: { FeaturedRotationData, RallyFlagAPI },
      globals: { fetch: (url, opts) => fetch(url, Object.assign({}, opts, { signal: ctrl.signal })) }
    });
    return { bySlug: await Surges.load(), names: Surges.NAMES };
  } catch (e){
    console.warn("Master surges unavailable:", e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function getFeaturedUpdate(now = Date.now(), surges = null){
  const FeaturedRotationData = loadWindowModule("featured-rotation-data.js", "FeaturedRotationData");
  const RaidsData = loadWindowModule("raids-data.js", "RaidsData");
  const DungeonsData = loadWindowModule("dungeons-data.js", "DungeonsData");
  const ArmorSetsData = loadWindowModule("sets-data.js", "ArmorSetsData");

  const setsBySlug = {};
  (ArmorSetsData.SETS || []).forEach(s => { setsBySlug[s.slug] = s; });

  const weekIndex = FeaturedRotationData.currentWeekIndex(now);
  const thisWeek = FeaturedRotationData.featuredForWeek(weekIndex);
  const ironBannerActive = FeaturedRotationData.mod(weekIndex, IRON_BANNER_CYCLE_WEEKS) === IRON_BANNER_WEEK_MOD;

  return {
    weekIndex,
    ironBannerActive,
    ironBannerArmor: IRON_BANNER_ARMOR_SLUGS.map(slug => armorSetLink(slug, setsBySlug)),
    thisWeek: {
      raids: describeEntries(thisWeek.raids, RaidsData.RAIDS, "raid", FeaturedRotationData.ALWAYS_FEATURED_RAID_SLUG, setsBySlug, surges),
      dungeons: describeEntries(thisWeek.dungeons, DungeonsData.DUNGEONS, "dungeon", FeaturedRotationData.ALWAYS_FEATURED_DUNGEON_SLUG, setsBySlug)
    }
  };
}

function formatThisWeekMessage({ thisWeek, ironBannerActive, ironBannerArmor }){
  const ironBannerLine = ironBannerActive
    ? `**Iron Banner is active this week** (${ironBannerArmor.join(", ")})\n\n`
    : "";
  return ironBannerLine + [
    "**Featured This Week**",
    "Raids:",
    ...thisWeek.raids.map(r => `• ${r}`),
    "Dungeons:",
    ...thisWeek.dungeons.map(d => `• ${d}`)
  ].join("\n");
}

module.exports = { getFeaturedUpdate, getMasterSurges, formatThisWeekMessage };
