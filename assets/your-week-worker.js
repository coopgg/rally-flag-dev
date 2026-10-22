/* ============================================================
   Your Week (your-week.html): Bungie's definitions the page needs,
   downloaded once per game update and kept in IndexedDB.
   Message in:  { apiKey }
   Messages out: { type:"progress", step } … then { type:"done", db } or { type:"error", message }
   db: { schema, version,
     objectives: hash -> progress description,
     milestones: hash -> { n, d, i },
     seasons: hash -> { n, num, passes: [{ h, start, end }] }, passes: hash -> { n, r, p } (reward / prestige progression),
     seals: node hash -> { n, i, title },
     pursuits: item hash -> { n, i, y, x, t } (bounties, quests, quest steps),
     activities: hash -> name (raids and dungeons only) }
   ============================================================ */
const BUNGIE = "https://www.bungie.net";
const DB_NAME = "rallyflag-your-week", STORE = "defs", KEY = "defs";
// Bump when the stored shape changes, so cached copies are rebuilt.
const SCHEMA = 1;
const RAID_TYPE = 2043403989, DUNGEON_TYPE = 608898761;

function idb(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(){
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  } catch (e){ return null; } // private browsing etc.: just don't cache
}
async function idbPut(value){
  try {
    const db = await idb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve;
    });
  } catch (e){}
}
async function getJson(url, headers){
  const res = await fetch(url, { headers });
  if (res.status === 503) throw new Error("Bungie's servers are down for maintenance. Try again when Bungie finishes.");
  if (!res.ok) throw new Error("HTTP " + res.status + " from Bungie");
  return res.json();
}

self.onmessage = async (msg) => {
  const headers = { "X-API-Key": msg.data.apiKey };
  try {
    const manifest = (await getJson(BUNGIE + "/Platform/Destiny2/Manifest/", headers)).Response;
    const version = manifest.version;
    const cached = await idbGet();
    if (cached && cached.version === version && cached.schema === SCHEMA){ self.postMessage({ type: "done", db: cached }); return; }
    const paths = manifest.jsonWorldComponentContentPaths.en;
    self.postMessage({ type: "progress", step: "Downloading Bungie's definitions (first visit or after a game update, about 5MB)…" });
    const [objDefs, msDefs, seasonDefs, passDefs, nodeDefs, recDefs, actDefs, lite] = await Promise.all([
      "DestinyObjectiveDefinition", "DestinyMilestoneDefinition", "DestinySeasonDefinition", "DestinySeasonPassDefinition",
      "DestinyPresentationNodeDefinition", "DestinyRecordDefinition", "DestinyActivityDefinition", "DestinyInventoryItemLiteDefinition"
    ].map(k => getJson(BUNGIE + paths[k])));
    const objectives = {};
    for (const h in objDefs){ const d = objDefs[h].progressDescription; if (d) objectives[h] = d; }
    const milestones = {};
    for (const h in msDefs){ const dp = msDefs[h].displayProperties || {}; milestones[h] = { n: dp.name || "", d: (dp.description || "").slice(0, 200), i: dp.icon || "" }; }
    const seasons = {};
    for (const h in seasonDefs){
      const s = seasonDefs[h];
      seasons[h] = { n: (s.displayProperties || {}).name || "", num: s.seasonNumber || 0,
        passes: (s.seasonPassList || []).map(p => ({ h: p.seasonPassHash, start: p.seasonPassStartDate, end: p.seasonPassEndDate })).concat(s.seasonPassHash ? [{ h: s.seasonPassHash, start: s.startDate, end: s.endDate }] : []) };
    }
    const passes = {};
    for (const h in passDefs) passes[h] = { n: (passDefs[h].displayProperties || {}).name || "", r: passDefs[h].rewardProgressionHash, p: passDefs[h].prestigeProgressionHash };
    const seals = {};
    for (const h in nodeDefs){
      const n = nodeDefs[h];
      if (!n.completionRecordHash || n.redacted) continue;
      const rec = recDefs[n.completionRecordHash] || {}, t = rec.titleInfo && rec.titleInfo.hasTitle && rec.titleInfo.titlesByGender ? (rec.titleInfo.titlesByGender.Male || Object.values(rec.titleInfo.titlesByGender)[0]) : "";
      seals[h] = { n: (n.displayProperties || {}).name || "", i: (n.displayProperties || {}).icon || "", title: t || "" };
    }
    const activities = {};
    for (const h in actDefs){
      const a = actDefs[h];
      if ((a.activityTypeHash === RAID_TYPE || a.activityTypeHash === DUNGEON_TYPE) && a.displayProperties && a.displayProperties.name) activities[h] = a.displayProperties.name;
    }
    const pursuits = {};
    for (const h in lite){
      const v = lite[h], dp = v.displayProperties;
      if (!dp || !dp.name || ![12, 13, 15, 26].includes(v.itemType)) continue;
      pursuits[h] = { n: dp.name, i: dp.icon || "", y: v.itemTypeDisplayName || "", x: (dp.description || "").slice(0, 160), t: v.itemType };
    }
    const db = { schema: SCHEMA, version, objectives, milestones, seasons, passes, seals, pursuits, activities };
    await idbPut(db);
    self.postMessage({ type: "done", db });
  } catch (e){
    self.postMessage({ type: "error", message: (e && e.message) || String(e) });
  }
};
