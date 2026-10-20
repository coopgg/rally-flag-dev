/* ============================================================
   Locker item database (dev-only, used by locker.html).

   Downloads Bungie's DestinyInventoryItemLiteDefinition (~3MB over the
   wire, ~61MB of JSON) plus the small stat, damage-type, armor-set,
   inventory-bucket and in-game loadout (name/icon/colour) tables, keeps only what the Locker shows (~6MB) and stores that in
   IndexedDB under the manifest version. Later visits make one small
   request to check the version and read the rest from IndexedDB.
   Runs in a Worker so parsing 61MB of JSON never blocks the page.

   Message in:  { apiKey }
   Messages out: { type:"progress", step } … then
                 { type:"done", db:{ schema, version, items, stats, statIcons, damage, sets, buckets, loadouts } }
                 or { type:"error", message }
   items: hash -> { n name, i icon, w watermark, t itemType, s subType,
     r tierType, b bucketHash, c classType, d damageTypeHash,
     y itemTypeDisplayName, x description (plugs), o 1 = ornament, sh 1 = shader,
     k armor mod kind }; currencies keep n, i.
   buckets: hash -> { n name, c capacity } (vault space in the banner).
   loadouts: { names: hash -> name, icons: hash -> path, colors: hash -> path }.
   ============================================================ */
const BUNGIE = "https://www.bungie.net";
const DB_NAME = "rallyflag-locker", STORE = "manifest", KEY = "lite";
// Bump when the stored shape changes, so cached copies are rebuilt.
const SCHEMA = 5;

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

// Weapons, armor, the plugs (perks, mods, intrinsics) they carry,
// currencies (Glimmer, Bright Dust, Silver) for the vault card, and
// subclasses (shown in in-game loadouts), and ornaments (item sub type 21,
// a few of them filed as dummies, type 20), flagged o.
const KEEP_TYPES = new Set([0, 1, 2, 3, 16, 19]);
function trimItems(lite){
  const out = {};
  for (const hash in lite){
    const v = lite[hash];
    const dp = v.displayProperties;
    if (!dp || !dp.name || !(KEEP_TYPES.has(v.itemType) || v.itemSubType === 21)) continue;
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
      if (v.itemSubType === 21) e.o = 1;
      if (v.itemSubType === 20) e.sh = 1;
      // Armor mod kind (k): the socket kind a mod fits. Slot mods and their
      // empty sockets share a type name ("Helmet Armor Mod"); tuning mods
      // and their socket call themselves "General Armor Mod" but lack the
      // armor-mod category (4104513227), so they get their own kind.
      const cats = v.itemCategoryHashes || [];
      if (cats.includes(4104513227)) e.k = e.y || "General Armor Mod";
      else if (cats.includes(59) && e.y === "General Armor Mod") e.k = "Tuning";
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
    const [lite, statDefs, damageDefs, setDefs, bucketDefs, loNames, loIcons, loColors] = await Promise.all([
      getJson(BUNGIE + paths.DestinyInventoryItemLiteDefinition),
      getJson(BUNGIE + paths.DestinyStatDefinition),
      getJson(BUNGIE + paths.DestinyDamageTypeDefinition),
      getJson(BUNGIE + paths.DestinyEquipableItemSetDefinition),
      getJson(BUNGIE + paths.DestinyInventoryBucketDefinition),
      getJson(BUNGIE + paths.DestinyLoadoutNameDefinition),
      getJson(BUNGIE + paths.DestinyLoadoutIconDefinition),
      getJson(BUNGIE + paths.DestinyLoadoutColorDefinition)
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
    const pickField = (defs, field) => { const out = {}; for (const h in defs) if (defs[h][field]) out[h] = defs[h][field]; return out; };
    const loadouts = { names: pickField(loNames, "name"), icons: pickField(loIcons, "iconImagePath"), colors: pickField(loColors, "colorImagePath") };
    const db = { schema: SCHEMA, version, items: trimItems(lite), stats, statIcons, damage, sets, buckets, loadouts };
    await idbPut(db);
    self.postMessage({ type: "done", db, cached: false });
  } catch (e){
    self.postMessage({ type: "error", message: (e && e.message) || String(e) });
  }
};
