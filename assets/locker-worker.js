/* ============================================================
   Locker item database (dev-only, used by locker.html).

   Downloads Bungie's DestinyInventoryItemLiteDefinition (~3MB over the
   wire, ~61MB of JSON) plus the small stat, damage-type, armor-set and
   inventory-bucket tables, keeps only what the Locker shows (~6MB) and stores that in
   IndexedDB under the manifest version. Later visits make one small
   request to check the version and read the rest from IndexedDB.
   Runs in a Worker so parsing 61MB of JSON never blocks the page.

   Message in:  { apiKey }
   Messages out: { type:"progress", step } … then
                 { type:"done", db:{ schema, version, items, stats, statIcons, damage, sets, buckets } }
                 or { type:"error", message }
   items: hash -> { n name, i icon, w watermark, t itemType, s subType,
     r tierType, b bucketHash, c classType, d damageTypeHash,
     y itemTypeDisplayName, x description (plugs) }; currencies keep n, i.
   buckets: hash -> { n name, c capacity } (vault space in the banner).
   ============================================================ */
const BUNGIE = "https://www.bungie.net";
const DB_NAME = "rallyflag-locker", STORE = "manifest", KEY = "lite";
// Bump when the stored shape changes, so cached copies are rebuilt.
const SCHEMA = 2;

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
  if (!res.ok) throw new Error("HTTP " + res.status + " from Bungie");
  return res.json();
}

// Weapons, armor, the plugs (perks, mods, intrinsics) they carry, and
// currencies (Glimmer, Bright Dust, Silver) for the vault card.
const KEEP_TYPES = new Set([0, 1, 2, 3, 19]);
function trimItems(lite){
  const out = {};
  for (const hash in lite){
    const v = lite[hash];
    const dp = v.displayProperties;
    if (!dp || !dp.name || !KEEP_TYPES.has(v.itemType)) continue;
    const e = { n: dp.name };
    if (dp.icon) e.i = dp.icon;
    if (v.itemType === 2 || v.itemType === 3){
      const inv = v.inventory || {};
      e.t = v.itemType; e.s = v.itemSubType; e.r = inv.tierType; e.b = inv.bucketTypeHash;
      e.c = v.classType; e.y = v.itemTypeDisplayName;
      if (v.defaultDamageTypeHash) e.d = v.defaultDamageTypeHash;
      if (v.iconWatermark) e.w = v.iconWatermark;
    } else {
      e.y = v.itemTypeDisplayName || "";
      if (dp.description) e.x = dp.description.slice(0, 300);
    }
    out[hash] = e;
  }
  return out;
}

self.onmessage = async (msg) => {
  const headers = { "X-API-Key": msg.data.apiKey };
  try {
    self.postMessage({ type: "progress", step: "Checking Bungie's item database…" });
    const manifest = (await getJson(BUNGIE + "/Platform/Destiny2/Manifest/", headers)).Response;
    const version = manifest.version;
    const cached = await idbGet();
    if (cached && cached.version === version && cached.schema === SCHEMA){ self.postMessage({ type: "done", db: cached, cached: true }); return; }

    const paths = manifest.jsonWorldComponentContentPaths.en;
    self.postMessage({ type: "progress", step: "Downloading Bungie's item database (first visit or after a game update, about 3MB)…" });
    const [lite, statDefs, damageDefs, setDefs, bucketDefs] = await Promise.all([
      getJson(BUNGIE + paths.DestinyInventoryItemLiteDefinition),
      getJson(BUNGIE + paths.DestinyStatDefinition),
      getJson(BUNGIE + paths.DestinyDamageTypeDefinition),
      getJson(BUNGIE + paths.DestinyEquipableItemSetDefinition),
      getJson(BUNGIE + paths.DestinyInventoryBucketDefinition)
    ]);
    self.postMessage({ type: "progress", step: "Preparing the item database…" });
    const stats = {}, statIcons = {};
    for (const h in statDefs){
      const dp = statDefs[h].displayProperties || {};
      if (dp.name) stats[h] = dp.name;
      if (dp.icon) statIcons[h] = dp.icon;
    }
    const buckets = {};
    for (const h in bucketDefs){ const b = bucketDefs[h]; if (b.itemCount) buckets[h] = { n: (b.displayProperties && b.displayProperties.name) || "", c: b.itemCount }; }
    const damage = {};
    for (const h in damageDefs){ const dp = damageDefs[h].displayProperties || {}; if (dp.name) damage[h] = { n: dp.name, i: dp.icon || "" }; }
    const sets = {};
    for (const h in setDefs){ const s = setDefs[h]; if (s.setItems && s.setItems.length) sets[h] = { n: (s.displayProperties && s.displayProperties.name) || "", items: s.setItems }; }
    const db = { schema: SCHEMA, version, items: trimItems(lite), stats, statIcons, damage, sets, buckets };
    await idbPut(db);
    self.postMessage({ type: "done", db, cached: false });
  } catch (e){
    self.postMessage({ type: "error", message: (e && e.message) || String(e) });
  }
};
