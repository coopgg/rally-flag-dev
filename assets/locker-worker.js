/* ============================================================
   Locker item database (dev-only, used by locker.html).

   Downloads Bungie's DestinyInventoryItemLiteDefinition (~3MB over the
   wire, ~61MB of JSON) plus the small stat, damage-type, armor-set,
   inventory-bucket and in-game loadout (name/icon/colour/constants) tables, keeps only what the Locker shows (~6MB) and stores that in
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
     q infusion category (weapons, armor),
     k armor mod kind }; currencies keep n, i.
   buckets: hash -> { n name, c capacity } (vault space in the banner).
   loadouts: { names: hash -> name, icons: hash -> path, colors: hash -> path,
     order: { names, icons, colors: [hash] } (the choices, in Destiny's order) }.
   ============================================================ */
const BUNGIE = "https://www.bungie.net";
const DB_NAME = "rallyflag-locker", STORE = "manifest", KEY = "lite";
// Bump when the stored shape changes, so cached copies are rebuilt.
const SCHEMA = 8;

function idb(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key = KEY){
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  } catch (e){ return null; } // private browsing etc.: just don't cache
}
async function idbPut(value, key = KEY){
  try {
    const db = await idb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
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
const CONSUMABLES = 1469714392;
function trimItems(lite){
  const out = {};
  for (const hash in lite){
    const v = lite[hash];
    const dp = v.displayProperties;
    // Stackable materials (Enhancement Cores, Ascendant Shards, …) for the Materials panel.
    const material = !!(v.inventory && v.inventory.bucketTypeHash === CONSUMABLES && v.inventory.maxStackSize > 1);
    if (!dp || !dp.name || !(KEEP_TYPES.has(v.itemType) || v.itemSubType === 21 || material)) continue;
    const e = { n: dp.name };
    if (dp.icon) e.i = dp.icon;
    if (v.itemType === 2 || v.itemType === 3){
      const inv = v.inventory || {};
      e.t = v.itemType; e.s = v.itemSubType; e.r = inv.tierType; e.b = inv.bucketTypeHash;
      e.c = v.classType; e.y = v.itemTypeDisplayName;
      if (v.defaultDamageTypeHash) e.d = v.defaultDamageTypeHash;
      if (v.iconWatermark) e.w = v.iconWatermark;
      // Infusion: an item takes Power from another of the same category.
      if (v.quality && v.quality.infusionCategoryHash) e.q = v.quality.infusionCategoryHash;
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

// Community wish lists in DIM's format (message { kind: "wishlist", url,
// hashes }): download the list (Voltron is ~28MB) and keep only the rolls
// for weapons the player owns. Lines look like
//   dimwishlist:item=<hash>&perks=<hash>,<hash>…#notes:<text>
// item=-69420 means any item; other negative items are "trash" rolls
// (skipped). A //notes: line applies to the lines after it. Kept in
// IndexedDB ("community") for a week, or until a weapon it hasn't read
// appears; each note is stored once (rolls point at it by number).
async function loadWishlist(url, hashes, force){
  const want = new Set(hashes.map(String));
  const cached = await idbGet("community");
  if (!force && cached && cached.url === url && Date.now() - cached.at < 7 * 864e5 && [...want].every(h => cached.hashes.includes(h))) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " fetching the wish list");
  const text = await res.text();
  const rolls = {}, any = [], notes = [], noteIx = new Map();
  let note = "", count = 0;
  const ix = n => { if (!n) return -1; if (!noteIx.has(n)){ noteIx.set(n, notes.length); notes.push(n); } return noteIx.get(n); };
  for (const raw of text.split("\n")){
    const line = raw.trim();
    if (!line){ note = ""; continue; }
    if (line.startsWith("//notes:")){ note = line.slice(8).trim(); continue; }
    if (!line.startsWith("dimwishlist:")) continue;
    const m = /item=(-?\d+)&perks=([\d,]+)(?:#notes:(.*))?/.exec(line);
    if (!m) continue;
    const item = m[1], roll = { p: m[2].split(",").map(Number).filter(Boolean), n: ix(((m[3] || note) || "").slice(0, 240)) };
    if (item === "-69420") any.push(roll);
    else if (item.charAt(0) !== "-" && want.has(item)){ (rolls[item] = rolls[item] || []).push(roll); count++; }
  }
  const out = { rolls, any, notes, count, at: Date.now(), url, hashes: [...want] };
  await idbPut(out, "community");
  return out;
}

// Clarity's community perk descriptions (d2clarity.com; their usage rules
// are in HANDOFF item 65). Their versions.json is checked on every load
// and descriptions/dim.json downloaded again whenever its number changes,
// so only their latest text is ever shown. English only, otherwise as
// published (never edited). Kept in IndexedDB ("clarity").
const CLARITY = "https://raw.githubusercontent.com/Database-Clarity/Live-Clarity-Database/live/";
async function loadClarity(){
  const cached = await idbGet("clarity");
  let version;
  try {
    const v = await fetch(CLARITY + "versions.json", { cache: "no-store" });
    if (!v.ok) throw new Error("HTTP " + v.status + " checking Clarity's version");
    version = (await v.json()).descriptions;
  } catch (e){ if (cached) return cached; throw e; } // offline: the newest copy we have
  if (cached && cached.version === version) return cached;
  const res = await fetch(CLARITY + "descriptions/dim.json", { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status + " fetching Clarity's descriptions");
  const all = await res.json(), perks = {};
  for (const h in all){ const en = all[h].descriptions && all[h].descriptions.en; if (en && en.length) perks[h] = en; }
  const out = { version, at: Date.now(), perks };
  await idbPut(out, "clarity");
  return out;
}

self.onmessage = async (msg) => {
  const headers = { "X-API-Key": msg.data.apiKey };
  if (msg.data.kind === "clarity"){
    try { self.postMessage({ type: "done", db: await loadClarity() }); }
    catch (e){ self.postMessage({ type: "error", message: (e && e.message) || String(e) }); }
    return;
  }
  if (msg.data.kind === "wishlist"){
    try { self.postMessage({ type: "done", db: await loadWishlist(msg.data.url, msg.data.hashes || [], msg.data.force) }); }
    catch (e){ self.postMessage({ type: "error", message: (e && e.message) || String(e) }); }
    return;
  }
  try {
    self.postMessage({ type: "progress", step: "Checking Bungie's item database…" });
    const manifest = (await getJson(BUNGIE + "/Platform/Destiny2/Manifest/", headers)).Response;
    const version = manifest.version;
    const cached = await idbGet();
    if (cached && cached.version === version && cached.schema === SCHEMA){ self.postMessage({ type: "done", db: cached, cached: true }); return; }

    const paths = manifest.jsonWorldComponentContentPaths.en;
    self.postMessage({ type: "progress", step: "Downloading Bungie's item database (first visit or after a game update, about 3MB)…" });
    const [lite, statDefs, damageDefs, setDefs, bucketDefs, loNames, loIcons, loColors, loConsts] = await Promise.all([
      getJson(BUNGIE + paths.DestinyInventoryItemLiteDefinition),
      getJson(BUNGIE + paths.DestinyStatDefinition),
      getJson(BUNGIE + paths.DestinyDamageTypeDefinition),
      getJson(BUNGIE + paths.DestinyEquipableItemSetDefinition),
      getJson(BUNGIE + paths.DestinyInventoryBucketDefinition),
      getJson(BUNGIE + paths.DestinyLoadoutNameDefinition),
      getJson(BUNGIE + paths.DestinyLoadoutIconDefinition),
      getJson(BUNGIE + paths.DestinyLoadoutColorDefinition),
      getJson(BUNGIE + paths.DestinyLoadoutConstantsDefinition)
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
    // The constants list the choices Destiny offers, in its own order.
    const c = Object.values(loConsts)[0] || {};
    const loadouts = { names: pickField(loNames, "name"), icons: pickField(loIcons, "iconImagePath"), colors: pickField(loColors, "colorImagePath"),
      order: { names: c.loadoutNameHashes || [], icons: c.loadoutIconHashes || [], colors: c.loadoutColorHashes || [] } };
    const db = { schema: SCHEMA, version, items: trimItems(lite), stats, statIcons, damage, sets, buckets, loadouts };
    await idbPut(db);
    self.postMessage({ type: "done", db, cached: false });
  } catch (e){
    self.postMessage({ type: "error", message: (e && e.message) || String(e) });
  }
};
