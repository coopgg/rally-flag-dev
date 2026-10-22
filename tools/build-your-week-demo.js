/* Builds assets/your-week-demo.json, the sample data for your-week.html?demo:
   the characters from assets/locker-demo.json plus a reply shaped like
   Bungie's GetProfile for components 100,104,200,201,202,300,301,700 and
   each character's raid/dungeon activity history, from real definitions:
     node --max-old-space-size=6144 tools/build-your-week-demo.js <manifest dir> <progress manifest dir>
   The first dir needs DestinyInventoryItemDefinition.json (as for
   build-locker-demo.js); the second DestinyObjectiveDefinition,
   DestinyMilestoneDefinition, DestinySeasonDefinition,
   DestinySeasonPassDefinition, DestinyPresentationNodeDefinition and
   DestinyActivityDefinition. Times are stored relative (_hours: bounty
   expiry from now; _hoursAgo: when an activity was played) and turned into
   dates on load, so the sample always reads as this week. */
const fs = require("fs"), path = require("path");
const [mfDir, mf2Dir] = process.argv.slice(2);
if (!mfDir || !mf2Dir){ console.error("usage: build-locker-progress-demo.js <manifest dir> <progress manifest dir>"); process.exit(1); }
const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name + ".json"), "utf8"));
const LOCKER_DEMO = path.join(__dirname, "..", "assets", "locker-demo.json"), OUT = path.join(__dirname, "..", "assets", "your-week-demo.json");
const demo = JSON.parse(fs.readFileSync(LOCKER_DEMO, "utf8"));
const ACTS = read(mf2Dir, "DestinyActivityDefinition");
const ITEMS = read(mfDir, "DestinyInventoryItemDefinition");
const OBJ = read(mf2Dir, "DestinyObjectiveDefinition"), MS = read(mf2Dir, "DestinyMilestoneDefinition");
const SEASONS = read(mf2Dir, "DestinySeasonDefinition"), PASSES = read(mf2Dir, "DestinySeasonPassDefinition"), NODES = read(mf2Dir, "DestinyPresentationNodeDefinition");

let seed = 7;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rand() * a.length)];
const chars = demo.profile.data.characterIds;
const objective = (h, done) => {
  const c = (OBJ[h] && OBJ[h].completionValue) || 1;
  const p = done ? c : Math.floor(rand() * c);
  return { objectiveHash: +h, progress: p, completionValue: c, complete: p >= c, visible: true };
};
const withObjectives = t => Object.values(ITEMS).filter(d => d.itemType === t && !d.redacted && d.displayProperties && d.displayProperties.name && d.displayProperties.icon &&
  d.objectives && d.objectives.objectiveHashes && d.objectives.objectiveHashes.length && d.objectives.objectiveHashes.every(h => OBJ[h] && OBJ[h].progressDescription))
  .sort((a, b) => a.hash - b.hash);
const bounties = withObjectives(26), quests = withObjectives(12);

// Season and pass in effect on the day this was built.
const now = Date.now();
const season = Object.values(SEASONS).filter(s => Date.parse(s.startDate) <= now).sort((a, b) => (b.seasonNumber || 0) - (a.seasonNumber || 0))[0];
const passEntry = (season.seasonPassList || []).find(p => Date.parse(p.seasonPassStartDate) <= now && now < Date.parse(p.seasonPassEndDate)) || (season.seasonPassList || [])[0];
const pass = PASSES[passEntry.seasonPassHash];

let nextId = 6917529990000000000n;
const characterProgressions = {}, characterInventories = {}, objectives = {};
const milestoneDefs = Object.values(MS).filter(m => m.displayProperties && m.displayProperties.name && m.quests && Object.keys(m.quests).length).slice(0, 6);
const objHashes = Object.keys(OBJ).filter(h => OBJ[h].progressDescription && OBJ[h].completionValue > 1);
chars.forEach((c, ci) => {
  const milestones = {};
  milestoneDefs.forEach((m, k) => {
    const quest = Object.keys(m.quests)[0];
    const steps = [0, 1, 2].slice(0, 1 + (k % 3)).map(() => objective(pick(objHashes), rand() < 0.4));
    milestones[m.hash] = { milestoneHash: m.hash, availableQuests: [{ questItemHash: +quest, status: { questHash: +quest, stepHash: +quest, stepObjectives: steps, completed: steps.every(s => s.complete) } }] };
  });
  characterProgressions[c] = {
    progressions: {
      [pass.rewardProgressionHash]: { progressionHash: pass.rewardProgressionHash, level: 57 + ci * 9, levelCap: 100, progressToNextLevel: 41000 + ci * 9000, nextLevelAt: 100000 },
      [pass.prestigeProgressionHash]: { progressionHash: pass.prestigeProgressionHash, level: 0, levelCap: -1, progressToNextLevel: 0, nextLevelAt: 100000 }
    },
    milestones, uninstancedItemObjectives: {}
  };
  const items = [];
  const add = (d, hours) => {
    const id = String(nextId++);
    const done = rand() < 0.25;
    objectives[id] = { objectives: d.objectives.objectiveHashes.map(h => objective(h, done)) };
    items.push(Object.assign({ itemHash: d.hash, itemInstanceId: id, quantity: 1, bindStatus: 0, location: 1, bucketHash: 1345459588, transferStatus: 2, lockable: false, state: 0 }, hours ? { _hours: hours } : {}));
  };
  for (let k = 0; k < 8; k++) add(pick(bounties), 6 + Math.floor(rand() * 150));
  for (let k = 0; k < 4; k++) add(pick(quests), 0);
  characterInventories[c] = { items };
});
const seals = Object.values(NODES).filter(n => n.completionRecordHash && !n.redacted && n.displayProperties && n.displayProperties.name && n.displayProperties.icon).slice(0, 18);
const nodes = {};
seals.forEach((n, k) => {
  const total = 10 + Math.floor(rand() * 40), done = k < 3 ? total : Math.floor(rand() * total);
  nodes[n.hash] = { state: 0, progressValue: done, completionValue: total };
});
// Raid and dungeon clears: some this week (hours ago), some last week.
const RAID = 2043403989, DUNGEON = 608898761;
const acts = Object.values(ACTS).filter(a => (a.activityTypeHash === RAID || a.activityTypeHash === DUNGEON) && a.displayProperties && a.displayProperties.name && !a.redacted && /: (Standard|Normal)$/.test(a.displayProperties.name));
const byName = new Map();
for (const a of acts){ const base = a.displayProperties.name.replace(/: .*$/, ""); if (!byName.has(base)) byName.set(base, a); }
const activityHistory = {};
chars.forEach(c => {
  activityHistory[c] = [...byName.values()].filter(() => rand() < 0.55).map(a => ({
    period: null, _hoursAgo: rand() < 0.6 ? 2 + Math.floor(rand() * 60) : 200 + Math.floor(rand() * 300),
    activityDetails: { referenceId: a.hash, directorActivityHash: a.hash, mode: a.activityTypeHash === RAID ? 4 : 82 },
    values: { completed: { basic: { value: 1 } }, completionReason: { basic: { value: 0 } } }
  }));
});
// A few Master clears this week (Your Week shows them on their own row).
const masters = Object.values(ACTS).filter(a => (a.activityTypeHash === RAID || a.activityTypeHash === DUNGEON) && a.displayProperties && / Master$/.test(a.displayProperties.name || "") && !a.redacted);
const masterByName = new Map();
for (const a of masters) if (!masterByName.has(a.displayProperties.name)) masterByName.set(a.displayProperties.name, a);
chars.forEach(c => {
  for (const a of masterByName.values()) if (rand() < 0.25) activityHistory[c].push({
    period: null, _hoursAgo: 3 + Math.floor(rand() * 50),
    activityDetails: { referenceId: a.hash, directorActivityHash: a.hash, mode: a.activityTypeHash === RAID ? 4 : 82 },
    values: { completed: { basic: { value: 1 } }, completionReason: { basic: { value: 0 } } }
  });
});
const out = {
  profile: demo.profile, characters: demo.characters,
  activityHistory,
  progress: {
  profile: { data: Object.assign({}, demo.profile.data, { currentSeasonHash: season.hash }) },
  profileProgression: { data: { seasonalArtifact: { artifactHash: 0, pointsAcquired: 132, powerBonus: 14 } } },
  characterProgressions: { data: characterProgressions },
  characterInventories: { data: characterInventories },
  itemComponents: { objectives: { data: objectives } },
  profilePresentationNodes: { data: { nodes } }
  }
};
out.progress.characters = demo.characters;
fs.writeFileSync(OUT, JSON.stringify(out));
// The Locker's sample no longer carries progress data.
if (demo.progress){ delete demo.progress; fs.writeFileSync(LOCKER_DEMO, JSON.stringify(demo)); }
console.log("your-week sample: " + byName.size + " raids/dungeons; season", season.displayProperties.name, "/", pass.displayProperties.name, "·", bounties.length, "bounty defs,", quests.length, "quest defs,", seals.length, "seals");
