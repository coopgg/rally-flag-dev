#!/usr/bin/env node
/* ============================================================
   Builds assets/locker-demo.json: a sample Destiny 2 profile for the
   Locker's "Try with sample data" mode (locker.html?demo) and the site
   checks. Shaped like a real GetProfile response (components 100, 102,
   200, 201, 205, 300, 304, 305, 310), using real item, perk and armor
   set hashes from Bungie's manifest, so the page renders exactly as it
   would for a signed-in account. Nothing in it is anyone's real data.

   Contents: three characters (Titan, Hunter, Warlock); every God Rolls
   weapon (about half rolled to match our roll, the rest partial); a
   seeded random spread of other legendary/exotic weapons and armor;
   armor from several real sets per class, some complete enough for the
   2- and 4-piece bonuses.

   Needs the full (not Lite) DestinyInventoryItemDefinition, plus
   DestinyPlugSetDefinition, DestinyEquipableItemSetDefinition,
   DestinyStatDefinition and DestinyLoadoutConstantsDefinition (in-game
   loadout names/icons/colours), as JSON files in one folder:
     node --max-old-space-size=4096 tools/build-locker-demo.js <dir>
   (download them from the paths in /Platform/Destiny2/Manifest/,
   jsonWorldComponentContentPaths.en). Seeded, so re-running with the
   same manifest gives the same file.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const dir = process.argv[2];
if (!dir) { console.error("usage: node tools/build-locker-demo.js <manifest-json-dir>"); process.exit(1); }
const load = name => JSON.parse(fs.readFileSync(path.join(dir, name + ".json"), "utf8"));
const ITEMS = load("DestinyInventoryItemDefinition");
const PLUGSETS = load("DestinyPlugSetDefinition");
const ITEMSETS = load("DestinyEquipableItemSetDefinition");
const STATS = load("DestinyStatDefinition");

function siteData(file, globalName){
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "assets", file), "utf8"), sandbox);
  return sandbox.window[globalName];
}
const GOD_ROLLS = siteData("god-rolls-data.js", "GodRollsData").WEAPONS;
const OUR_SETS = siteData("sets-data.js", "ArmorSetsData").SETS;

// Small seeded PRNG (mulberry32) so the file is reproducible.
let seed = 20261019;
function rand(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const pick = arr => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
function sample(arr, n){ const a = arr.slice(); const out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(rand() * a.length), 1)[0]); return out; }

const BUCKET = { kinetic: 1498876634, energy: 2465295065, power: 953998645, helmet: 3448274439, arms: 3551918588, chest: 14239492, legs: 20886954, classItem: 1585787867, vault: 138197802 };
const WEAPON_BUCKETS = [BUCKET.kinetic, BUCKET.energy, BUCKET.power];
const ARMOR_BUCKETS = [BUCKET.helmet, BUCKET.arms, BUCKET.chest, BUCKET.legs, BUCKET.classItem];
const POWER_STAT = 1935470627;
const ARMOR_STATS = ["Weapons", "Health", "Class", "Grenade", "Super", "Melee"]
  .map(n => Object.values(STATS).find(s => s.displayProperties && s.displayProperties.name === n && s.statCategory !== undefined))
  .filter(Boolean).map(s => s.hash);

const def = h => ITEMS[String(h)];
const bucketOf = d => d.inventory && d.inventory.bucketTypeHash;
const obtainable = d => d && d.collectibleHash && !d.redacted && d.displayProperties && d.displayProperties.name && d.displayProperties.icon;

const characters = [
  { classType: 0, id: "2305843009300000001" },
  { classType: 1, id: "2305843009300000002" },
  { classType: 2, id: "2305843009300000003" }
];
const emblems = Object.values(ITEMS).filter(d => d.itemType === 14 && d.secondaryIcon && d.collectibleHash && d.inventory && d.inventory.tierType >= 5);
for (const c of characters){ const e = pick(emblems); c.emblemPath = e.displayProperties.icon; c.emblemBackgroundPath = e.secondaryIcon; c.emblemHash = e.hash; }

let nextInstance = 6917529900000000000n;
const instances = {}, stats = {}, sockets = {}, reusablePlugs = {};
const vaultItems = [], invItems = {}, equipItems = {};
for (const c of characters){ invItems[c.id] = []; equipItems[c.id] = []; }

// Sockets: the fixed plug where there is one, else a random plug from the
// socket's random-roll set. `want` (god-roll perks) wins where the socket
// can roll it. reusablePlugs lists the selected plug plus a couple of
// alternatives, as the game does for multi-option columns.
function rollSockets(d, want){
  const out = [], pools = {};
  const entries = (d.sockets && d.sockets.socketEntries) || [];
  entries.forEach((e, i) => {
    const setHash = e.randomizedPlugSetHash || e.reusablePlugSetHash;
    const pool = setHash && PLUGSETS[String(setHash)] ? PLUGSETS[String(setHash)].reusablePlugItems.map(p => p.plugItemHash).filter(h => def(h)) : [];
    let plug = e.singleInitialItemHash || 0;
    const wanted = want.find(h => pool.includes(h));
    if (wanted) plug = wanted;
    else if (e.randomizedPlugSetHash && pool.length) plug = pick(pool);
    // Armor mod sockets start empty in the definitions; real armor has mods.
    else if (d.itemType === 2 && pool.length && /^Empty Mod Socket$/.test((def(plug) || {}).displayProperties?.name || "") && rand() < 0.7){
      const mods = pool.filter(h => !/^Empty/.test(def(h).displayProperties.name) && (def(h).itemTypeDisplayName || "").endsWith("Armor Mod"));
      if (mods.length) plug = pick(mods);
    }
    // Weapon mod sockets: a real mod in it and, as on real accounts, every
    // owned mod listed as a free swap (the Locker must not show those).
    let modPool = null;
    if (d.itemType === 3 && pool.length && /Weapon Mod$/.test((def(pool[0]) || {}).itemTypeDisplayName || "")){
      modPool = pool.filter(h => /Weapon Mod$/.test(def(h).itemTypeDisplayName || "") && !/^Empty/.test(def(h).displayProperties.name));
      if (modPool.length) plug = pick(modPool);
    }
    out.push({ plugHash: plug || undefined, isEnabled: true, isVisible: !!plug });
    if (modPool && modPool.length > 1) pools[i] = modPool.map(h => ({ plugItemHash: h, canInsert: true, enabled: true }));
    if (e.randomizedPlugSetHash && pool.length > 1){
      const alts = sample(pool.filter(h => h !== plug), between(1, 2));
      pools[i] = [plug, ...alts].filter(Boolean).map(h => ({ plugItemHash: h, canInsert: true, enabled: true }));
    }
  });
  return { out, pools };
}

function addItem(itemHash, ownerId, opts = {}){
  const d = def(itemHash);
  if (!d) return null;
  const id = String(nextInstance++);
  const isWeapon = d.itemType === 3;
  const power = opts.power || between(438, 452);
  instances[id] = { damageTypeHash: d.defaultDamageTypeHash || undefined, primaryStat: { statHash: POWER_STAT, value: power }, itemLevel: Math.floor(power / 10), quality: 0, isEquipped: !!opts.equipped, canEquip: true, equipRequiredLevel: 0 };
  // Gear tier 1-5 (0 = older, untiered gear), from the instance id rather
  // than rand() so adding it left the rest of the sample unchanged.
  const tier = Number(id.slice(-6)) * 7 % 6;
  if (tier) instances[id].gearTier = tier;
  if (isWeapon){
    const s = {};
    for (const st of Object.values((d.stats && d.stats.stats) || {})){ if (st.value && STATS[String(st.statHash)] && STATS[String(st.statHash)].displayProperties.name) s[st.statHash] = { statHash: st.statHash, value: st.value }; }
    stats[id] = { stats: s };
  } else {
    const s = {};
    for (const h of ARMOR_STATS) s[h] = { statHash: h, value: pick([0, 0, 5, 10, 10, 15, 20, 25, 30]) };
    stats[id] = { stats: s };
  }
  const rolled = rollSockets(d, opts.want || []);
  sockets[id] = { sockets: rolled.out };
  if (Object.keys(rolled.pools).length) reusablePlugs[id] = { plugs: rolled.pools };
  const state = (rand() < 0.35 ? 4 : 0) | (rand() < 0.4 ? 1 : 0); // masterworked / locked
  const item = { itemHash: d.hash, itemInstanceId: id, quantity: 1, bindStatus: 0, location: ownerId ? 1 : 2, bucketHash: ownerId ? bucketOf(d) : BUCKET.vault, transferStatus: 0, lockable: true, state };
  if (!ownerId) vaultItems.push(item);
  else if (opts.equipped) equipItems[ownerId].push(item);
  else invItems[ownerId].push(item);
  return item;
}

// Every God Rolls weapon. About half get the full roll; the rest keep 2-4
// of the 5 perks so the "x/5" partial matches show too.
GOD_ROLLS.forEach((w, i) => {
  const hash = w.craftedItemHash || w.itemHash;
  if (!def(hash)) return;
  const full = i % 2 === 0;
  const want = full ? w.perkHashes : sample(w.perkHashes, between(2, 4));
  const owner = rand() < 0.6 ? null : pick(characters).id;
  addItem(hash, owner, { want });
});

// Other weapons: real, obtainable legendaries and exotics.
const weaponPool = Object.values(ITEMS).filter(d => d.itemType === 3 && obtainable(d) && [5, 6].includes(d.inventory.tierType) && WEAPON_BUCKETS.includes(bucketOf(d)) && d.sockets);
const legendaryWeapons = weaponPool.filter(d => d.inventory.tierType === 5);
const exoticWeapons = weaponPool.filter(d => d.inventory.tierType === 6);
for (const d of sample(legendaryWeapons, 70)) addItem(d.hash, rand() < 0.7 ? null : pick(characters).id);
for (const d of sample(exoticWeapons, 14)) addItem(d.hash, rand() < 0.6 ? null : pick(characters).id);

// Equipped weapons: one per slot per character (an exotic in one slot).
for (const c of characters){
  WEAPON_BUCKETS.forEach((b, i) => {
    const pool = (i === 1 ? exoticWeapons : legendaryWeapons).filter(d => bucketOf(d) === b);
    addItem(pick(pool).hash, c.id, { equipped: true, power: between(448, 455) });
  });
}

// Armor: real sets from Bungie's set table, preferring sets this site
// covers. Per class: one set at 4+ pieces, two at 2-3, a stray piece.
// Same join as locker.js: Bungie's set name matches ours, or its slug does
// (Bungie's "Kentarch 3" is our "Righteousness", slug kentarch-3).
const slugify = s => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const ourKeys = new Set(OUR_SETS.flatMap(s => [slugify(s.name), s.slug]));
const setDefs = Object.values(ITEMSETS).filter(s => s.setItems && s.setItems.length);
const covered = setDefs.filter(s => ourKeys.has(slugify(s.displayProperties.name)));
for (const c of characters){
  const classSets = sample(covered, 4);
  const plan = [between(4, 5), between(2, 3), between(2, 3), 1];
  const equippedFrom = classSets[0];
  classSets.forEach((set, si) => {
    const pieces = set.setItems.map(def).filter(d => d && d.classType === c.classType && obtainable(d));
    const bySlot = new Map();
    for (const d of pieces) if (!bySlot.has(bucketOf(d))) bySlot.set(bucketOf(d), d);
    sample([...bySlot.values()], plan[si]).forEach(d => {
      const equip = set === equippedFrom && !equipItems[c.id].some(it => bucketOf(def(it.itemHash)) === bucketOf(d));
      addItem(d.hash, equip ? c.id : (rand() < 0.5 ? null : c.id), { equipped: equip, power: equip ? between(448, 455) : undefined });
    });
  });
  // Fill empty equipped armor slots and add some loose armor + an exotic.
  const classArmor = Object.values(ITEMS).filter(d => d.itemType === 2 && obtainable(d) && d.classType === c.classType && ARMOR_BUCKETS.includes(bucketOf(d)) && [5, 6].includes(d.inventory.tierType) && d.sockets);
  for (const b of ARMOR_BUCKETS){
    if (!equipItems[c.id].some(it => bucketOf(def(it.itemHash)) === b)) addItem(pick(classArmor.filter(d => bucketOf(d) === b && d.inventory.tierType === 5)).hash, c.id, { equipped: true, power: between(448, 455) });
  }
  for (const d of sample(classArmor.filter(d => d.inventory.tierType === 5), 14)) addItem(d.hash, rand() < 0.6 ? null : c.id);
  for (const d of sample(classArmor.filter(d => d.inventory.tierType === 6), 3)) addItem(d.hash, rand() < 0.5 ? null : c.id);
}

// Postmaster (stage 2): a few things waiting on the Titan, including an
// engram and a material stack, which aren't weapons or armor.
{
  const titan = characters[0].id, POSTMASTER = 215593132;
  const toPostmaster = it => { it.bucketHash = POSTMASTER; it.location = 4; };
  for (const d of sample(legendaryWeapons, 2)){ const it = addItem(d.hash, titan); if (it) toPostmaster(it); }
  const armor = Object.values(ITEMS).filter(d => d.itemType === 2 && obtainable(d) && d.classType === 0 && d.inventory.tierType === 5 && d.sockets);
  { const it = addItem(pick(armor).hash, titan); if (it) toPostmaster(it); }
  const engram = Object.values(ITEMS).find(d => d.itemType === 8 && d.displayProperties && d.displayProperties.icon && /engram/i.test(d.displayProperties.name));
  const material = Object.values(ITEMS).find(d => d.itemType === 0 && d.inventory && d.inventory.maxStackSize > 100 && d.displayProperties && d.displayProperties.icon && /glimmer|shard|core|alloy|prism/i.test(d.displayProperties.name));
  for (const [d, qty] of [[engram, 1], [material, 25]]){
    if (d) invItems[titan].push({ itemHash: d.hash, quantity: qty, bindStatus: 0, location: 4, bucketHash: POSTMASTER, transferStatus: 0, lockable: false, state: 0 });
  }
}

const charData = {};
for (const c of characters){
  const eq = equipItems[c.id].map(it => instances[it.itemInstanceId].primaryStat.value);
  charData[c.id] = { membershipId: "4611686018400000000", membershipType: 3, characterId: c.id, dateLastPlayed: "2026-10-18T21:00:00Z", light: Math.floor(eq.reduce((a, b) => a + b, 0) / eq.length), classType: c.classType, raceType: c.classType, genderType: c.classType % 2, emblemPath: c.emblemPath, emblemBackgroundPath: c.emblemBackgroundPath, emblemHash: c.emblemHash,
    // Armor stat totals (Weapons, Health, Class, Grenade, Super, Melee), fixed so rand() isn't consumed.
    stats: Object.fromEntries([2996146975, 392767087, 1943323491, 1735777505, 144602215, 4244567218].map((h, k) => [h, [[105, 70, 110, 55, 90, 30], [116, 66, 91, 101, 66, 56], [38, 29, 63, 160, 57, 150]][c.classType][k]])) };
}

// Ornaments: about a third of the armor wears a universal ornament for its
// class and slot (plug category armor_skins_<class>_<slot>), shown as the
// item's overrideStyleItemHash and in its ornament socket, as Bungie does.
// Picked from the instance id, so no rand() calls and the rest of the
// sample is unchanged.
const SLOT_NAME = { [BUCKET.helmet]: "head", [BUCKET.arms]: "arms", [BUCKET.chest]: "chest", [BUCKET.legs]: "legs", [BUCKET.classItem]: "class" };
const ORNAMENTS = {};
for (const d of Object.values(ITEMS)) if (d.itemSubType === 21 && d.plug && d.displayProperties && d.displayProperties.icon && !/^Default/.test(d.displayProperties.name))
  (ORNAMENTS[d.plug.plugCategoryIdentifier] = ORNAMENTS[d.plug.plugCategoryIdentifier] || []).push(d.hash);
for (const list of Object.values(ORNAMENTS)) list.sort((a, b) => a - b);
const ornSocket = d => ((d.sockets && d.sockets.socketEntries) || []).findIndex(e => (def(e.singleInitialItemHash) || {}).itemSubType === 21);
const ornPool = d => d.itemType === 2 && d.classType < 3 ? ORNAMENTS["armor_skins_" + ["titan", "hunter", "warlock"][d.classType] + "_" + SLOT_NAME[bucketOf(d)]] || [] : [];
const allItems = vaultItems.concat(...Object.values(invItems), ...Object.values(equipItems));
for (const it of allItems.filter(it => it.itemInstanceId && [2, 3].includes((def(it.itemHash) || {}).itemType))){
  const d = def(it.itemHash), k = ornSocket(d), pool = ornPool(d), n = Number(BigInt(it.itemInstanceId) % 1000n);
  if (k < 0 || !pool.length || n % 3) continue;
  const orn = pool[n % pool.length];
  it.overrideStyleItemHash = orn;
  sockets[it.itemInstanceId].sockets[k] = { plugHash: orn, isEnabled: true, isVisible: true };
}
// Subclasses: each character wears its class's first subclass (by hash)
// and carries two more, with the default super/abilities/aspects/fragments
// from the definition. In-game loadouts pick the worn one up through
// equipItems, as real ones include it. No rand() calls.
const SUBCLASS_BUCKET = 3284755031;
for (const c of characters){
  const subs = Object.values(ITEMS).filter(d => d.itemType === 16 && d.classType === c.classType && d.sockets && d.displayProperties && d.displayProperties.icon && /Subclass$/.test(d.itemTypeDisplayName || "") && d.inventory && d.inventory.bucketTypeHash === SUBCLASS_BUCKET)
    .sort((a, b) => a.hash - b.hash).slice(0, 3);
  subs.forEach((d, k) => {
    const id = String(nextInstance++);
    instances[id] = { isEquipped: k === 0, canEquip: true, equipRequiredLevel: 0 };
    // Aspect and fragment sockets start empty in the definition; worn
    // subclasses have them filled, so take the next unused one from the
    // socket's plug set (each aspect/fragment can only be in one socket).
    const used = new Set();
    sockets[id] = { sockets: d.sockets.socketEntries.map(e => {
      let plug = e.singleInitialItemHash || 0;
      if (/^Empty (Aspect|Fragment) Socket$/.test((def(plug) || {}).displayProperties?.name || "")){
        const set = PLUGSETS[String(e.reusablePlugSetHash || e.randomizedPlugSetHash)];
        const next = set && set.reusablePlugItems.map(p => p.plugItemHash).find(h => def(h) && !used.has(h) && !/^Empty/.test(def(h).displayProperties.name));
        if (next){ plug = next; used.add(next); }
      }
      return { plugHash: plug || undefined, isEnabled: true, isVisible: !!plug };
    }) };
    const item = { itemHash: d.hash, itemInstanceId: id, quantity: 1, bindStatus: 0, location: 1, bucketHash: SUBCLASS_BUCKET, transferStatus: 0, lockable: false, state: 0 };
    (k === 0 ? equipItems : invItems)[c.id].push(item);
  });
}

// Artifacts: each character wears Tablet of Ruin and carries the Slayer
// Baron Apothecary Satchel, with perks picked from each column's plug set
// (different per character and socket, never the same perk twice). The
// Reset socket keeps its default. No rand() calls.
const ARTIFACT_BUCKET = 1506418338, ARTIFACTS = [3821685388, 1770364095];
characters.forEach((c, ci) => {
  ARTIFACTS.forEach((hash, k) => {
    const d = def(hash);
    if (!d || !d.sockets) return;
    const id = String(nextInstance++);
    instances[id] = { isEquipped: k === 0, canEquip: true, equipRequiredLevel: 0 };
    const used = new Set();
    sockets[id] = { sockets: d.sockets.socketEntries.map((e, si) => {
      let plug = e.singleInitialItemHash || 0;
      const set = PLUGSETS[String(e.reusablePlugSetHash)];
      const perks = set ? set.reusablePlugItems.map(p => p.plugItemHash).filter(h => def(h) && def(h).itemTypeDisplayName === "Artifact Perk") : [];
      if (perks.length){ const pick = perks.filter(h => !used.has(h))[(ci * 3 + si) % Math.max(1, perks.length - 3)]; if (pick){ plug = pick; used.add(pick); } }
      return { plugHash: plug || undefined, isEnabled: true, isVisible: !!plug };
    }) };
    const item = { itemHash: hash, itemInstanceId: id, quantity: 1, bindStatus: 0, location: 1, bucketHash: ARTIFACT_BUCKET, transferStatus: 0, lockable: false, state: 0 };
    (k === 0 ? equipItems : invItems)[c.id].push(item);
  });
});

// A loadout item's plugs, one per socket (2166136261 = leave as is), with
// its ornament socket set to the ornament it wears, or `orn` if given.
const NO_CHANGE = 2166136261;
function loPlugs(it, orn){
  const d = def(it.itemHash), k = ornSocket(d);
  const plugs = ((d.sockets && d.sockets.socketEntries) || []).map(() => NO_CHANGE);
  if (k >= 0 && d.itemType <= 3) plugs[k] = orn || it.overrideStyleItemHash || d.sockets.socketEntries[k].singleInitialItemHash;
  return plugs;
}

// In-game loadouts (component 206): 10 slots per character. Alpha = what's
// equipped, Beta = the best other gear from inventory and vault (so applying
// it has to move things), and the Titan's Crucible borrows the Hunter's
// equipped kinetic weapon. The rest are empty, as in game. No rand() calls.
const LC = Object.values(JSON.parse(fs.readFileSync(path.join(dir, "DestinyLoadoutConstantsDefinition.json"), "utf8")))[0];
const loSlot = (k, items) => ({ colorHash: LC.loadoutColorHashes[k], iconHash: LC.loadoutIconHashes[k], nameHash: LC.loadoutNameHashes[k],
  items: items.map(it => ({ itemInstanceId: it.itemInstanceId, plugItemHashes: loPlugs(it, wants.get(it)) })) });
// Beta asks for a different ornament on its first armor piece that has
// one to spare, so applying it visibly changes an ornament.
const wants = new Map();
const bucketOfItem = it => bucketOf(def(it.itemHash));
const characterLoadouts = {};
for (const c of characters){
  const alpha = equipItems[c.id].slice();
  const usable = vaultItems.concat(invItems[c.id]).filter(it => it.itemInstanceId && instances[it.itemInstanceId] && [2, 3].includes(def(it.itemHash).itemType) &&
    (def(it.itemHash).itemType === 3 || [c.classType, 3].includes(def(it.itemHash).classType)));
  const exo = { 2: 0, 3: 0 }, beta = [];
  for (const eq of alpha){
    const b = bucketOfItem(eq);
    const best = usable.filter(it => bucketOfItem(it) === b && !(def(it.itemHash).inventory.tierType === 6 && exo[def(it.itemHash).itemType]))
      .sort((x, y) => instances[y.itemInstanceId].primaryStat.value - instances[x.itemInstanceId].primaryStat.value || x.itemInstanceId.localeCompare(y.itemInstanceId))[0];
    if (best){ beta.push(best); if (def(best.itemHash).inventory.tierType === 6) exo[def(best.itemHash).itemType]++; }
  }
  const swap = beta.find(it => ornPool(def(it.itemHash)).length > 1 && ornSocket(def(it.itemHash)) >= 0);
  if (swap){ const pool = ornPool(def(swap.itemHash)); wants.set(swap, pool.find(h => h !== swap.overrideStyleItemHash)); }
  const slots = [loSlot(0, alpha), loSlot(1, beta)];
  if (c.classType === 0){
    const hunterKinetic = equipItems[characters[1].id].find(it => bucketOfItem(it) === bucketOfItem(alpha[0]));
    slots.push(loSlot(10, alpha.map((it, k) => k === 0 && hunterKinetic ? hunterKinetic : it)));
  }
  while (slots.length < LC.loadoutCountPerCharacter) slots.push({ colorHash: LC.loadoutColorHashes[0], iconHash: LC.loadoutIconHashes[0], nameHash: LC.loadoutNameHashes[0], items: [] });
  characterLoadouts[c.id] = { loadouts: slots };
}

// Materials for the Materials panel: stackables from the consumables
// bucket, mostly in the vault, a few on the first two characters.
{
  const MATERIALS = ["Enhancement Core", "Ascendant Shard", "Enhancement Prism", "Upgrade Module", "Ascendant Alloy", "Strange Coin", "Spoils of Conquest", "Herealways Piece", "Exotic Cipher", "Treasure Key", "Raid Banner"];
  const found = new Map();
  for (const d of Object.values(ITEMS)){
    const n = d.displayProperties && d.displayProperties.name, inv = d.inventory || {};
    if (MATERIALS.includes(n) && !found.has(n) && inv.bucketTypeHash === 1469714392 && inv.maxStackSize > 1 && !d.redacted) found.set(n, d);
  }
  for (const d of found.values()) vaultItems.push({ itemHash: d.hash, quantity: Math.max(1, Math.min(d.inventory.maxStackSize, pick([3, 12, 47, 150, 600, 2400]))), bindStatus: 0, location: 2, bucketHash: BUCKET.vault, transferStatus: 0, lockable: false, state: 0 });
  for (const c of characters.slice(0, 2)) for (const d of [...found.values()].slice(0, 3))
    invItems[c.id].push({ itemHash: d.hash, quantity: between(1, Math.min(20, d.inventory.maxStackSize)), bindStatus: 0, location: 1, bucketHash: 1469714392, transferStatus: 0, lockable: false, state: 0 });
}

const profile = {
  _note: "Sample data generated by tools/build-locker-demo.js from Bungie's manifest. Not a real account.",
  profileCurrencies: { data: { items: [{ itemHash: 3159615086, quantity: 67883 }, { itemHash: 2817410917, quantity: 6068 }, { itemHash: 3147280338, quantity: 250 }] } },
  profile: { data: { userInfo: { displayName: "Sample Guardian", membershipType: 3, membershipId: "4611686018400000000" }, characterIds: characters.map(c => c.id) } },
  characters: { data: charData },
  profileInventory: { data: { items: vaultItems } },
  characterInventories: { data: Object.fromEntries(characters.map(c => [c.id, { items: invItems[c.id] }])) },
  characterEquipment: { data: Object.fromEntries(characters.map(c => [c.id, { items: equipItems[c.id] }])) },
  characterLoadouts: { data: characterLoadouts },
  itemComponents: {
    instances: { data: instances },
    stats: { data: stats },
    sockets: { data: sockets },
    reusablePlugs: { data: reusablePlugs }
  }
};
const out = path.join(ROOT, "assets", "locker-demo.json");
fs.writeFileSync(out, JSON.stringify(profile));
const total = vaultItems.length + Object.values(invItems).flat().length + Object.values(equipItems).flat().length;
console.log("wrote " + path.relative(ROOT, out) + ": " + total + " items, " + Math.round(fs.statSync(out).size / 1024) + "KB");
