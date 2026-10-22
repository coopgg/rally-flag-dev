// Locker behaviour checks (dev-only). site-check.js covers how the Locker
// looks (axe, layout, contrast); this covers what it does: moves, tags,
// loadouts, max Power, in-game loadouts, DIM import and apply, loadout and
// tag sync between two devices, Bungie maintenance, and the two
// Cloudflare Workers' rules. Bungie's write endpoints, the sync service and
// the DIM helper are mocked (the workers' own code runs in-process against
// an in-memory database); Bungie's public item database loads live, as in
// site-check.js. Exits 1 if anything fails.
//
//   cd tests && npm run locker
import { createRequire } from "module";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://coopgg.github.io/rally-flag-dev/";
const SYNC = "https://rallyflag-sync.rallyflag.workers.dev/";
const RELAY = "https://rallyflag-dim.rallyflag.workers.dev/";
const MEMBER = "4611686018400000000";
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const DEMO = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/locker-demo.json"), "utf8"));
const WEEK = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/your-week-demo.json"), "utf8"));
const [TITAN] = DEMO.profile.data.characterIds;
const MAINT = { ErrorCode: 5, ThrottleSeconds: 0, ErrorStatus: "SystemDisabled", Message: "This system is temporarily disabled for maintenance.", MessageData: {} };

// ---------- results ----------
const results = [];
function check(name, ok, detail){ results.push({ name, ok: !!ok, detail }); console.log((ok ? "✅ " : "❌ ") + name + (ok || detail == null ? "" : " — " + detail)); }
// ONLY=<part of a section name> runs just the matching sections; DEBUG=1 shows more of an error.
async function section(name, fn){
  if (process.env.ONLY && !name.toLowerCase().includes(process.env.ONLY.toLowerCase())) return;
  try { await fn(); } catch (e){ check(name + " ran to the end", false, e.message.split("\n").slice(0, process.env.DEBUG ? 30 : 1).join(" | ")); }
}

// ---------- the workers, in-process ----------
// The workers are ES modules with `export default`; load them from source.
const loadWorker = async file => (await import("data:text/javascript," + encodeURIComponent(fs.readFileSync(path.join(ROOT, file), "utf8")))).default;
function fakeD1(){
  const rows = new Map(), shares = new Map();
  return { rows, shares, prepare(sql){ return { bind(...a){ return /\bshares\b/.test(sql) ? shareSql(shares, sql, a) : {
    async first(){ const r = rows.get(a[0]); return r ? { data: r.data, version: r.version } : null; },
    async run(){
      if (/^INSERT/.test(sql)){ if (rows.has(a[0])) return { meta: { changes: 0 } }; rows.set(a[0], { data: a[1], version: 1 }); return { meta: { changes: 1 } }; }
      if (/^UPDATE/.test(sql)){ const [data, next, , id, base] = a; const r = rows.get(id); if (!r || r.version !== base) return { meta: { changes: 0 } }; rows.set(id, { data, version: next }); return { meta: { changes: 1 } }; }
      if (/^DELETE/.test(sql)) return { meta: { changes: rows.delete(a[0]) ? 1 : 0 } };
      throw new Error("unexpected SQL: " + sql);
    } }; } }; } };
}
// The share-link table: id -> { owner, data, created_at }.
function shareSql(shares, sql, a){
  const mine = owner => [...shares.values()].filter(r => r.owner === owner);
  return {
    async first(){
      if (/^SELECT data, created_at FROM shares WHERE id = \?$/.test(sql)){ const r = shares.get(a[0]); return r ? { data: r.data, created_at: r.created_at } : null; }
      if (/^SELECT COUNT\(\*\) AS n FROM shares WHERE owner = \?$/.test(sql)) return { n: mine(a[0]).length };
      if (/^SELECT id FROM shares WHERE owner = \? AND data = \?$/.test(sql)){ const r = mine(a[0]).find(x => x.data === a[1]); return r ? { id: r.id } : null; }
      throw new Error("unexpected SQL: " + sql);
    },
    async run(){
      if (/^INSERT INTO shares/.test(sql)){ if (shares.has(a[0])) return { meta: { changes: 0 } }; shares.set(a[0], { id: a[0], owner: a[1], data: a[2], created_at: a[3] }); return { meta: { changes: 1 } }; }
      if (/^DELETE FROM shares WHERE owner = \?$/.test(sql)){ const gone = mine(a[0]); gone.forEach(r => shares.delete(r.id)); return { meta: { changes: gone.length } }; }
      throw new Error("unexpected SQL: " + sql);
    }
  };
}
// The workers call fetch (Bungie for sign-in checks, dim.gg for shares) and
// caches.default; answer those here instead of the network.
const TOKENS = { GOOD: [MEMBER] };
const DIM_PAGE = fs.readFileSync(path.join(ROOT, "tests/fixtures/dim-share.html"), "utf8");
const dimPages = { hneqrla: DIM_PAGE };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes("GetMembershipsForCurrentUser")){
    const tok = String((opts.headers || {}).Authorization || "").replace("Bearer ", "");
    if (!TOKENS[tok]) return new Response(JSON.stringify({ ErrorCode: 99 }), { status: 401 });
    return new Response(JSON.stringify({ ErrorCode: 1, Response: { destinyMemberships: TOKENS[tok].map(id => ({ membershipId: id, membershipType: 3 })) } }));
  }
  const dim = url.match(/^https:\/\/dim\.gg\/([a-z0-9]+)\//);
  if (dim) return dimPages[dim[1]] ? new Response(dimPages[dim[1]], { status: 200 }) : new Response("not found", { status: 404 });
  return realFetch(url, opts);
};
const cacheStore = new Map();
globalThis.caches = { default: { async match(req){ const v = cacheStore.get(req.url); return v ? new Response(v) : undefined; }, async put(req, res){ cacheStore.set(req.url, await res.text()); } } };
const SyncWorker = await loadWorker("tools/sync-worker/worker.js");
const RelayWorker = await loadWorker("tools/dim-relay/worker.js");

// ---------- browser helpers ----------
const browser = await chromium.launch();
// opts: { real } signs in with a fake session and mocks Bungie's profile and
// actions; { env } is the sync service's database (shared = two devices).
async function open(opts = {}){
  const context = await browser.newContext({ viewport: { width: opts.width || 1280, height: 900 }, serviceWorkers: "block", isMobile: (opts.width || 1280) < 900 });
  if (opts.real) await context.addInitScript(() => sessionStorage.setItem("rallyflag_bungie_auth", JSON.stringify({ access_token: "GOOD", access_expires_at: Date.now() + 3600e3 })));
  await context.route(BASE + "**", r => {
    const rel = new URL(r.request().url()).pathname.replace("/rally-flag-dev/", "") || "index.html";
    const file = path.join(ROOT, rel);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) r.fulfill({ body: fs.readFileSync(file), contentType: TYPES[path.extname(file)] || "application/octet-stream" });
    else r.continue();
  });
  const calls = [];
  if (opts.real){
    await context.route("https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/", r => r.fulfill(opts.down ? maint() : json({ ErrorCode: 1, Response: { primaryMembershipId: MEMBER, destinyMemberships: [{ membershipType: 3, membershipId: MEMBER, displayName: "Main" }].concat(opts.accounts || []) } })));
    await context.route(new RegExp("/Profile/(" + MEMBER + "|" + (opts.accounts || []).map(a => a.membershipId).concat(["x"]).join("|") + ")/\\?components"), r => {
      calls.push({ ep: "Profile", body: r.request().url() });
      if (opts.down) return r.fulfill(maint());
      // Your Week's call (milestones, pursuits, seals).
      if (/components=[^&]*202/.test(r.request().url())){ calls.push({ ep: "Week profile", body: r.request().url() }); return r.fulfill(json({ ErrorCode: 1, Response: WEEK.progress })); }
      const p = JSON.parse(JSON.stringify(DEMO)); p.responseMintedTimestamp = new Date(Date.now() - 600000).toISOString();
      r.fulfill(json({ ErrorCode: 1, Response: p }));
    });
    // Raid/dungeon activity history for Your Week (times relative to now, as in the sample).
    await context.route(/\/Stats\/Activities\//, r => {
      const u = r.request().url(), c = (u.match(/Character\/(\d+)/) || [])[1], mode = +(u.match(/mode=(\d+)/) || [])[1];
      calls.push({ ep: "Activity history", body: u });
      const list = (WEEK.activityHistory[c] || []).filter(a => a.activityDetails.mode === mode).map(a => Object.assign({}, a, { period: new Date(Date.now() - a._hoursAgo * 3600e3).toISOString() }));
      r.fulfill(json({ ErrorCode: 1, Response: { activities: list } }));
    });
    await context.route(/\/Platform\/Destiny2\/Actions\//, r => {
      const ep = r.request().url().split("/Actions/")[1].replace(/^Items\//, "").replace(/\/$/, "");
      const body = JSON.parse(r.request().postData() || "{}");
      calls.push({ ep, body });
      if (opts.refuseOnce && opts.refuseOnce(ep, body)){ opts.refuseOnce = null; return r.fulfill(json({ ErrorCode: 1679, ErrorStatus: "DestinySocketActionNotAllowed", Message: "Not enough energy" })); }
      r.fulfill(json({ ErrorCode: 1, Response: 0 }));
    });
    if (opts.down) await context.route("https://www.bungie.net/Platform/Destiny2/Manifest/", r => r.fulfill(maint()));
  }
  const syncEnv = opts.env || { DB: fakeD1() }; // shared between pages = one account on two devices
  await context.route(SYNC + "**", r => viaWorker(SyncWorker, r, syncEnv));
  await context.route(RELAY + "**", r => opts.relay ? r.fulfill(json(opts.relay)) : viaWorker(RelayWorker, r, {}));
  const page = await context.newPage();
  page.errors = []; page.on("pageerror", e => page.errors.push(e.message));
  page.calls = calls; page.context_ = context;
  await page.goto(opts.url || BASE + "locker.html" + (opts.real ? "" : "?demo") + (opts.hash || ""));
  if (!opts.down && !opts.signedOut) await page.waitForSelector(opts.ready || "#locker-app:not([hidden])", { timeout: 120000 });
  await page.waitForTimeout(opts.real ? 2200 : 600);
  return page;
}
const json = body => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const maint = () => ({ status: 503, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(MAINT) });
async function viaWorker(worker, route, env){
  const q = route.request();
  const res = await worker.fetch(new Request(q.url(), { method: q.method(), headers: q.headers(), body: ["PUT", "POST"].includes(q.method()) ? q.postData() : undefined }), env);
  route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: res.status === 204 ? "" : await res.text() });
}
const idle = p => p.waitForFunction(() => !document.body.classList.contains("locker-busy"), null, { timeout: 90000 }).then(() => p.waitForTimeout(300));
const toastText = p => p.textContent("#locker-toast");
const status = p => p.evaluate(() => [...document.querySelectorAll("#view-loadouts .lo-detail:not([hidden]) .lo-status")].map(x => x.textContent).join(" || "));
const comeBack = p => p.evaluate(() => { const now = Date.now; Date.now = () => now() + 120000; document.dispatchEvent(new Event("visibilitychange")); }).then(() => p.waitForTimeout(2200));
const allItems = [].concat(DEMO.profileInventory.data.items, ...Object.values(DEMO.characterInventories.data).map(c => c.items), ...Object.values(DEMO.characterEquipment.data).map(c => c.items));
const hashOf = id => (allItems.find(i => i.itemInstanceId === id) || {}).itemHash;
const SUBCLASS_BUCKET = 3284755031;
// axe on what's showing now (site-check.js covers the Locker's other states).
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
async function axe(p){
  await p.evaluate(AXE);
  return p.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] })).violations.map(v => v.id + "×" + v.nodes.length));
}
const SHOTS = process.env.SHOTS; // a folder: save screenshots of the share states there
const shot = (p, name) => SHOTS ? p.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: true }) : null;

// ---------- 1. Workers ----------
await section("Sync worker", async () => {
  const env = { DB: fakeD1() };
  const call = async (method, { token = "GOOD", origin = "https://coopgg.github.io", id = MEMBER, body } = {}) => {
    const res = await SyncWorker.fetch(new Request(SYNC + "loadouts/" + id, { method, headers: Object.assign({ Origin: origin }, token ? { Authorization: "Bearer " + token } : {}), body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, cors: res.headers.get("access-control-allow-origin"), body: res.status === 204 ? null : await res.json() };
  };
  let r = await call("GET"); check("sync: empty account reads as version 0", r.status === 200 && r.body.version === 0 && r.cors === "https://coopgg.github.io", JSON.stringify(r));
  r = await call("PUT", { body: { base: 0, loadouts: [{ id: "a", at: 1 }], deleted: {}, tags: { x: { t: "junk", at: 2 } } } }); check("sync: first save is version 1", r.status === 200 && r.body.version === 1, JSON.stringify(r));
  r = await call("PUT", { body: { base: 0, loadouts: [], deleted: {} } }); check("sync: a stale save gets 409 with the newer copy", r.status === 409 && r.body.loadouts.length === 1 && r.body.tags.x.t === "junk", JSON.stringify(r));
  r = await call("GET", { id: "4611686018499999999" }); check("sync: someone else's account is refused", r.status === 403);
  r = await call("GET", { token: null }); check("sync: no sign-in is refused", r.status === 401);
  r = await call("GET", { token: "BAD" }); check("sync: a sign-in Bungie rejects is refused", r.status === 401);
  r = await call("GET", { origin: "https://example.com" }); check("sync: other websites are refused, without CORS", r.status === 403 && !r.cors);
  r = await call("PUT", { body: { base: 1, loadouts: [], deleted: {}, tags: [] } }); check("sync: malformed tags are refused", r.status === 400);
  r = await call("PUT", { body: { base: 1, loadouts: [{ id: "z", pad: "x".repeat(300000) }], deleted: {} } }); check("sync: oversized saves are refused", r.status === 413);
  r = await call("DELETE"); const after = await call("GET"); check("sync: DELETE removes the account's row", r.status === 200 && after.body.version === 0 && !env.DB.rows.size);
});
await section("Share worker", async () => {
  const env = { DB: fakeD1() };
  const call = async (method, path, { token = "GOOD", origin = "https://coopgg.github.io", body } = {}) => {
    const res = await SyncWorker.fetch(new Request(SYNC + path, { method, headers: Object.assign({ Origin: origin }, token ? { Authorization: "Bearer " + token } : {}), body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, cors: res.headers.get("access-control-allow-origin"), body: await res.json() };
  };
  const lo = { name: "Shared", cls: 0, items: [{ id: "6917529000000000001", hash: 1234567 }, { id: "x", hash: 7654321 }], subclass: { hash: 99, sockets: { 0: 5, 1: "bad" } }, mods: [11, "x"], cosmetics: {}, dim: { id: "abc" }, note: "secret" };
  let r = await call("POST", "shares/" + MEMBER, { token: null, body: { loadout: lo } }); check("share: making a link needs a sign-in", r.status === 401);
  r = await call("POST", "shares/4611686018499999999", { body: { loadout: lo } }); check("share: not for someone else's account", r.status === 403);
  r = await call("POST", "shares/" + MEMBER, { body: { loadout: { name: "x", items: [] } } }); check("share: a loadout with no gear is refused", r.status === 400);
  r = await call("POST", "shares/" + MEMBER, { body: { loadout: lo } });
  const id = r.body.id;
  check("share: a link gets a short id", r.status === 200 && /^[a-z0-9]{8}$/.test(id) && !/[01lio]/.test(id), JSON.stringify(r.body));
  r = await call("POST", "shares/" + MEMBER, { body: { loadout: lo } }); check("share: sharing the same loadout again keeps its link", r.body.id === id && env.DB.shares.size === 1);
  const row = env.DB.shares.get(id);
  check("share: stores the loadout only (no instance ids, notes or DIM id; owner hashed)", !/6917529000000000001|secret|abc|bad/.test(row.data) && row.owner !== MEMBER && /^[0-9a-f]{64}$/.test(row.owner) && JSON.parse(row.data).mods.join() === "11", row.data);
  r = await call("GET", "share/" + id, { token: null }); check("share: opening a link needs no sign-in", r.status === 200 && r.body.loadout.name === "Shared" && r.body.loadout.items.length === 2 && r.cors === "https://coopgg.github.io");
  r = await call("GET", "share/" + id, { token: null, origin: "https://example.com" }); check("share: other websites can't read links", r.status === 403 && !r.cors);
  r = await call("GET", "shares/" + MEMBER); check("share: counts your links", r.body.count === 1);
  r = await call("DELETE", "shares/" + MEMBER); const gone = await call("GET", "share/" + id, { token: null });
  check("share: Delete my share links removes them all", r.body.deleted === 1 && gone.status === 404 && /deleted/.test(gone.body.error), JSON.stringify(gone));
});
await section("DIM relay worker", async () => {
  const call = async (q, origin = "https://rallyflag.gg") => { const res = await RelayWorker.fetch(new Request(RELAY + q, { headers: { Origin: origin } }), {}); return { status: res.status, cors: res.headers.get("access-control-allow-origin"), body: await res.json() }; };
  let r = await call("?url=" + encodeURIComponent("https://dim.gg/hneqrla/ItzChantall-Solar"));
  check("relay: reads the loadout out of a dim.gg page", r.status === 200 && r.body.name === "ItzChantall - Solar" && r.body.equipped.length === 9 && r.cors === "https://rallyflag.gg", JSON.stringify(r).slice(0, 200));
  r = await call("?id=zzzzzzz"); check("relay: unknown share id is 404", r.status === 404);
  r = await call("?url=" + encodeURIComponent("https://example.com/x")); check("relay: non-DIM links are refused", r.status === 400);
  r = await call("?id=hneqrla", "https://example.com"); check("relay: no CORS for other websites", r.status === 200 && !r.cors);
});

// ---------- 2. Gear (sample data) ----------
await section("Gear", async () => {
  const p = await open();
  check("gear: sample data renders tiles", await p.locator("#buckets .item-tile[data-id]").count() > 100);
  const inv = DEMO.characterInventories.data[TITAN].items.find(i => i.bucketHash !== SUBCLASS_BUCKET && i.itemInstanceId && i.bucketHash !== 215593132);
  const tile = '#buckets .item-tile[data-id="' + inv.itemInstanceId + '"]';
  const before = await p.locator("#buckets .item-tile").count();
  await p.click(tile); await p.click('#item-dialog [data-tag="favorite"]'); await p.keyboard.press("Escape");
  check("gear: Favorite marks the tile", /tag-favorite/.test(await p.getAttribute(tile, "class")));
  check("gear: tagging redraws one tile, not the page", await p.locator("#buckets .item-tile").count() === before);
  for (const t of ["keep", "infuse", "archive"]){
    await p.click(tile); await p.click('#item-dialog [data-tag="' + t + '"]');
    const pressed = await p.getAttribute('#item-dialog [data-tag="' + t + '"]', "aria-pressed"); await p.keyboard.press("Escape");
    check("tags: " + t + " marks the tile", pressed === "true" && new RegExp("tag-" + t).test(await p.getAttribute(tile, "class")) && await p.locator(tile + " .tile-badge.tag-" + t).count() === 1);
  }
  await p.selectOption("#tag-filter", "archive");
  check("tags: the tag filter shows only that tag", await p.locator("#buckets .item-tile[data-id]").count() === 1);
  await p.selectOption("#tag-filter", "");
  // PvE / PvP: their own marks, alongside a tag; both can be on.
  await p.click(tile); await p.click('#item-dialog [data-use="pvp"]'); await p.click('#item-dialog [data-use="pve"]');
  const both = [await p.getAttribute('#item-dialog [data-use="pve"]', "aria-pressed"), await p.getAttribute('#item-dialog [data-use="pvp"]', "aria-pressed"), await p.getAttribute('#item-dialog [data-tag="archive"]', "aria-pressed")].join();
  await p.click('#item-dialog [data-use="pve"]'); await p.keyboard.press("Escape");
  check("pve/pvp: marks sit alongside the tag; each button toggles its half", both === "true,true,true" && /tagged archive, for PvP/.test(await p.getAttribute(tile, "aria-label")) && await p.locator(tile + " .tile-use .use-pvp").count() === 1 && await p.locator(tile + " .tile-use .use-pve").count() === 0, both);
  await p.selectOption("#tag-filter", "pvp");
  check("pve/pvp: the filter menu shows PvP gear", await p.locator("#buckets .item-tile[data-id]").count() === 1);
  await p.selectOption("#tag-filter", "");
  await p.fill("#locker-search", "is:crucible"); await p.waitForTimeout(300);
  const pvpShown = await p.locator("#buckets .item-tile[data-id]:not([hidden])").count();
  await p.fill("#locker-search", "is:pve"); await p.waitForTimeout(300);
  check("pve/pvp: is:pvp (is:crucible) and is:pve search", pvpShown === 1 && await p.locator("#buckets .item-tile[data-id]:not([hidden])").count() === 0);
  await p.fill("#locker-search", ""); await p.waitForTimeout(300);
  await p.click(tile); await p.fill("#item-note", "Quillwick roll"); await p.click("#note-form [type=submit]");
  check("notes: saving a note marks the tile", /Note saved/.test(await toastText(p)) && await p.locator(tile + " .tile-note").count() === 1 && /note: Quillwick roll/.test(await p.getAttribute(tile, "aria-label")));
  await p.keyboard.press("Escape");
  await p.fill("#locker-search", "quillwick"); await p.waitForTimeout(300);
  check("notes: search finds notes", await p.locator("#buckets .item-tile[data-id]:not([hidden])").count() === 1);
  await p.fill("#locker-search", ""); await p.waitForTimeout(300);
  await p.selectOption("#tag-filter", "note");
  check("tags: Has a note filter", await p.locator("#buckets .item-tile[data-id]").count() === 1);
  await p.selectOption("#tag-filter", "");
  await p.click(tile); await p.click('#item-dialog [data-tag="favorite"]'); await p.keyboard.press("Escape");
  // Actions keep the popup open (redrawn), so its buttons can be pressed in turn.
  await p.click(tile); await p.click('#item-dialog [data-act="move"][data-to="vault"]'); await idle(p);
  check("gear: Move to vault", /vault/i.test(await toastText(p)) && /Vault/.test(await p.textContent("#item-dialog .dlg-sub")), await toastText(p));
  await p.click('#item-dialog [data-act="equip"][data-to="' + TITAN + '"]'); await idle(p);
  check("gear: Equip from the vault onto the Titan", await p.evaluate(id => document.querySelector('#buckets .item-tile[data-id="' + id + '"]').classList.contains("equipped"), inv.itemInstanceId), await toastText(p));
  const lockBefore = await p.getAttribute('#item-dialog [data-act="lock"]', "aria-label");
  await p.click('#item-dialog [data-act="lock"]'); await idle(p);
  check("gear: Lock toggles", (await p.getAttribute('#item-dialog [data-act="lock"]', "aria-label")) !== lockBefore);
  await p.keyboard.press("Escape");
  await p.fill("#locker-search", "zzzzqq"); await p.waitForTimeout(300);
  check("gear: search with no match says so", await p.isVisible("#search-empty"));
  // Sort menu: equipped first, then the chosen order; remembered.
  const slotNames = () => p.evaluate(() => { const sec = [...document.querySelectorAll("#buckets .bucket:not(.postmaster) .owner-group")].find(x => x.querySelectorAll(".item-tile[data-id]").length > 4); return [...sec.querySelectorAll(".item-tile[data-id]")].map(t => ({ id: t.dataset.id, name: t.getAttribute("aria-label").split(",")[0], eq: t.classList.contains("equipped") })); });
  await p.selectOption("#sort-by", "name");
  const byName = await slotNames(), rest = byName.filter(x => !x.eq).map(x => x.name);
  check("sort: Name sorts A to Z after the equipped item", byName[0].eq && rest.join("|") === rest.slice().sort((a, b) => a.localeCompare(b)).join("|"), rest.slice(0, 5).join(", "));
  await p.selectOption("#sort-by", "newest");
  const byNew = (await slotNames()).filter(x => !x.eq).map(x => x.id);
  check("sort: Newest puts the newest items first", byNew.join() === byNew.slice().sort((a, b) => b.length - a.length || (b > a ? 1 : -1)).join());
  await p.reload(); await p.waitForSelector("#locker-app:not([hidden])"); await p.waitForTimeout(600);
  check("sort: the choice is remembered", await p.inputValue("#sort-by") === "newest");
  await p.selectOption("#sort-by", "power");
  // Duplicates filter and compare.
  await p.fill("#locker-search", ""); await p.waitForTimeout(200);
  const counts = {}; allItems.filter(i => i.itemInstanceId).forEach(i => { counts[i.itemHash] = (counts[i.itemHash] || 0) + 1; });
  await p.click('.chip[data-value="dupes"]');
  const shown = await p.$$eval("#buckets .item-tile[data-id]", t => t.map(x => x.dataset.id));
  check("dupes: the Duplicates filter shows only items you own more than once", shown.length > 0 && shown.every(id => counts[hashOf(id)] >= 2), shown.length + " shown");
  const dupe = shown[0], n = counts[allItems.find(i => i.itemInstanceId === dupe).itemHash];
  await p.click('#buckets .item-tile[data-id="' + dupe + '"]');
  check("compare: the popup offers Compare N copies", (await p.textContent("#open-compare")) === "Compare " + n + " copies");
  await p.click("#open-compare");
  check("compare: one column per copy, focus on this one", await p.locator(".cmp thead th").count() === n && await p.evaluate(id => document.activeElement.dataset.cmpOpen === id, dupe));
  check("compare: values better or worse than the other copy are shaded", await p.locator(".cmp td.q4").count() > 0 && await p.locator(".cmp td.q0").count() > 0);
  check("compare: a scope chip offers similar items", await p.locator("[data-cmp-scope]").count() >= 2 && await p.getAttribute('[data-cmp-scope="same"]', "aria-pressed") === "true");
  // Sort by a stat: the best copy comes first; again: worst first.
  const sortKey = await p.getAttribute(".cmp tbody tr:last-child [data-cmp-sort]", "data-cmp-sort");
  const firstCol = () => p.getAttribute(".cmp thead th:nth-child(2) [data-cmp-open]", "data-cmp-open");
  const lastRow = () => p.$$eval(".cmp tbody tr:last-child td", t => t.map(x => +x.textContent.replace(/\D+/g, "") || 0));
  await p.click('[data-cmp-sort="' + sortKey + '"]');
  const best = await lastRow();
  await p.click('[data-cmp-sort="' + sortKey + '"]');
  const worst = await lastRow();
  check("compare: clicking a row name sorts by it, again reverses", await p.getAttribute('th:has([data-cmp-sort="' + sortKey + '"])', "aria-sort") !== null && best.join() === worst.slice().reverse().join() && await p.evaluate(k => document.activeElement.dataset.cmpSort === k, sortKey), best + " / " + worst);
  // Act on one copy without leaving.
  const col = await firstCol();
  await p.click('[data-cmp-tag="junk"][data-cmp-id="' + col + '"]');
  check("compare: Junk on a column tags that copy, popup stays", await p.getAttribute('[data-cmp-tag="junk"][data-cmp-id="' + col + '"]', "aria-pressed") === "true" && /tag-junk/.test(await p.getAttribute('#buckets .item-tile[data-id="' + col + '"]', "class")) && await p.evaluate(() => document.getElementById("item-dialog").dataset.view) === "compare");
  await p.click('[data-cmp-tag="junk"][data-cmp-id="' + col + '"]');
  await p.click('[data-cmp-lock="' + col + '"]'); await idle(p);
  check("compare: Lock on a column locks that copy, popup stays", await p.getAttribute('[data-cmp-lock="' + col + '"]', "aria-pressed") !== null && await p.evaluate(() => document.getElementById("item-dialog").dataset.view) === "compare", await toastText(p));
  check("compare: perks show as icons with our God Roll ringed", await p.locator(".cmp .cmp-perk-ico").count() > 0);
  const v = await axe(p); check("compare passes axe", !v.length, v.join(", "));
  check("compare: on desktop the popup widens to fit every copy, no sideways scroll", await p.evaluate(() => { const d = document.getElementById("item-dialog"), sc = d.querySelector(".cmp-scroll"); return d.getBoundingClientRect().width > 460 && sc.scrollWidth <= sc.clientWidth; }));
  const other = await p.$$eval("[data-cmp-open]", b => b.map(x => x.dataset.cmpOpen));
  const target = other.find(x => x !== dupe);
  await p.click('[data-cmp-open="' + target + '"]');
  check("compare: Open goes to that copy", await p.evaluate(() => document.getElementById("item-dialog").dataset.item) === target);
  await p.keyboard.press("Escape");
  await p.click('.chip[data-value="dupes"]');
  // Organizer: the table view.
  await p.fill("#locker-search", ""); await p.waitForTimeout(200);
  await p.click("#table-toggle"); await p.waitForSelector(".org");
  const rowsN = () => p.locator(".org tbody tr").count();
  check("organizer: Table lists every weapon with its details", await rowsN() > 50 && /Perks/.test(await p.textContent(".org thead")) && await p.getAttribute("#table-toggle", "aria-pressed") === "true");
  await p.click('[data-org-sort="name"]');
  const names = await p.$$eval(".org tbody th", t => t.map(x => x.textContent));
  check("organizer: clicking a column sorts by it", names.join("|") === names.slice().sort((a, b) => a.localeCompare(b)).join("|") && await p.getAttribute('th:has([data-org-sort="name"])', "aria-sort") === "ascending");
  await p.click('[data-org-kind="armor"]'); await p.click('[data-org-sort="total"]');
  const totals = await p.$$eval('.org tbody tr', r => r.map(x => +x.children[13].textContent));
  check("organizer: armor shows stats and sorts by total, highest first", totals.length > 30 && totals.every((t, k) => k === 0 || t <= totals[k - 1]), totals.slice(0, 5).join(","));
  await p.fill("#locker-search", "class:titan"); await p.waitForTimeout(350);
  const titanRows = await rowsN();
  check("organizer: search filters the table and the bulk bar acts on it", titanRows > 0 && titanRows < totals.length && (await p.textContent(".bulk-count")).startsWith(titanRows + " item"));
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#org-csv")]);
  const csvFile = path.join(path.dirname(fileURLToPath(import.meta.url)), ".org-test.csv"); await dl.saveAs(csvFile);
  const csv = fs.readFileSync(csvFile, "utf8"); fs.unlinkSync(csvFile);
  check("organizer: Export CSV saves what's shown", /^rallyflag-armor-\d{4}-\d\d-\d\d\.csv$/.test(dl.suggestedFilename()) && csv.trim().split("\r\n").length === titanRows + 1 && /Name,Type,Power/.test(csv), dl.suggestedFilename());
  let tv = await axe(p); check("organizer passes axe", !tv.length, tv.join(", "));
  await p.click(".org-name"); check("organizer: a name opens the item", await p.evaluate(() => document.getElementById("item-dialog").open)); await p.keyboard.press("Escape");
  await p.fill("#locker-search", ""); await p.click("#table-toggle"); await p.waitForSelector("#buckets .item-tile[data-id]");
  // Compact layout: Farming mode and Junk cleanup sit behind Tools.
  check("layout: Farming and Junk cleanup start folded behind Tools", await p.isHidden("#farm-row") && await p.getAttribute("#tools-btn", "aria-expanded") === "false");
  await p.click("#tools-btn");
  await p.click("[data-farm]");
  check("layout: Tools opens them; the button says when farming is on", await p.isVisible("#farm-row") && /farming on/.test(await p.textContent("#tools-btn")));
  await p.click("[data-farm]"); await p.click("#tools-btn");
  check("gear: no script errors", !p.errors.length, p.errors.join("; "));
  await p.context_.close();
});

// ---------- 2b. Search filters and bulk actions (sample data) ----------
await section("Search filters", async () => {
  const p = await open();
  const shownIds = () => p.$$eval("#buckets .item-tile[data-id]:not([hidden])", t => t.map(x => x.dataset.id));
  const q = async text => { await p.fill("#locker-search", text); await p.waitForTimeout(350); return shownIds(); };
  const weapons = await q("is:weapon"), armor = await q("is:armor"), all = await q("");
  check("filters: is:weapon and is:armor split everything", weapons.length > 50 && armor.length > 40 && weapons.length + armor.length === all.length && !weapons.some(id => armor.includes(id)), weapons.length + "+" + armor.length + "/" + all.length);
  const locked = await q("is:locked"), notLocked = await q("-is:locked");
  check("filters: -is:locked is the rest", locked.length && locked.length + notLocked.length === all.length && (await q("not:locked")).length === notLocked.length);
  const solar = await q("is:solar"), voidW = await q("is:void"), either = await q("is:solar or is:void");
  check("filters: or combines", either.length === solar.length + voidW.length && solar.length > 0);
  const grouped = await q("(is:solar or is:void) slot:energy");
  check("filters: brackets and slot:", grouped.length > 0 && grouped.length < either.length && grouped.every(id => either.includes(id)));
  const hi = await q("stat:total:>=60"), power = await q("power:>=450");
  const totals = Object.fromEntries(Object.entries(DEMO.itemComponents.stats.data).map(([id, s]) => [id, Object.values(s.stats).reduce((t, x) => t + x.value, 0)]));
  check("filters: stat:total and power: compare numbers", hi.length && hi.every(id => totals[id] >= 60) && power.every(id => DEMO.itemComponents.instances.data[id].primaryStat.value >= 450), hi.length + " / " + power.length);
  check("filters: perk: matches perks you have or can switch to", (await q("perk:outlaw")).length > 0 && (await q('type:"hand cannon"')).length > 0);
  check("filters: in:vault", (await q("in:vault")).every(id => DEMO.profileInventory.data.items.some(i => i.itemInstanceId === id)));
  await q("is:nonsense");
  check("filters: an unknown filter is named and ignored", /Not a filter: is:nonsense/.test(await p.textContent("#search-hint")) && (await shownIds()).length === all.length);
  // Suggestions: arrows + Enter.
  await p.fill("#locker-search", ""); await p.type("#locker-search", "is:dup"); await p.waitForTimeout(250);
  check("suggestions: typing offers filters", await p.getAttribute("#locker-search", "aria-expanded") === "true" && (await p.textContent("#search-suggest")).includes("is:dupe"));
  await p.keyboard.press("ArrowDown"); const ad = await p.getAttribute("#locker-search", "aria-activedescendant"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
  check("suggestions: arrow and Enter pick one", ad === "sg-0" && await p.inputValue("#locker-search") === "is:dupe " && await p.getAttribute("#locker-search", "aria-expanded") === "false");
  await p.type("#locker-search", "perk:kill"); await p.waitForTimeout(250);
  check("suggestions: perk names after perk:", /perk:"kill clip"/.test(await p.textContent("#search-suggest")));
  await p.keyboard.press("Escape");
  check("suggestions: Escape closes the list, keeps the text", await p.isHidden("#search-suggest") && /perk:kill/.test(await p.inputValue("#locker-search")));
  await p.click("#search-help-btn");
  check("filters help: opens with examples", await p.isVisible("#search-help") && await p.getAttribute("#search-help-btn", "aria-expanded") === "true");
  let v = await axe(p); check("filters help, hint and suggestions pass axe", !v.length, v.join(", "));
  await p.click('#search-help [data-search="is:weapon is:junk"]'); await p.waitForTimeout(300);
  check("filters help: an example runs its search", await p.inputValue("#locker-search") === "is:weapon is:junk");
  await p.click("#search-help-btn");
  // Bulk: tag, lock, move what's shown.
  const vaultWeapons = await q("in:vault is:weapon is:legendary -is:locked");
  check("bulk: the bar shows for a search", await p.isVisible("#bulk-row") && (await p.textContent("#bulk-row")).includes(vaultWeapons.length + " items shown"));
  v = await axe(p); check("bulk bar passes axe", !v.length, v.join(", "));
  await p.selectOption("#bulk-tag", "infuse"); await p.click("#bulk-tag-go");
  check("bulk: more than 5 asks first", /Tap again/.test(await p.textContent("#bulk-tag-go")));
  await p.click("#bulk-tag-go"); await p.waitForTimeout(300);
  const tags = await p.evaluate(() => JSON.parse(localStorage.getItem("rallyflag_locker_tags")));
  check("bulk: tags everything shown", vaultWeapons.every(id => tags[id] === "infuse") && (await q("is:infuse")).length === vaultWeapons.length);
  await q("is:infuse"); await p.click("#bulk-lock"); await p.click("#bulk-lock"); await idle(p);
  check("bulk: locks everything shown", (await q("is:infuse is:locked")).length === vaultWeapons.length, await toastText(p));
  const few = (await q("is:infuse")).slice(0, 4);
  await q("is:infuse power:>=" + Math.max(...few.map(id => DEMO.itemComponents.instances.data[id].primaryStat.value)));
  const moving = await shownIds();
  await p.waitForTimeout(1800); await idle(p); // the re-sync after locking
  await p.selectOption("#bulk-move", TITAN); await p.click("#bulk-move-go");
  if (/Tap again/.test(await p.textContent("#bulk-move-go"))) await p.click("#bulk-move-go");
  await idle(p);
  check("bulk: moves what's shown to a character (full slots are skipped and counted)", moving.length > 0 && /Moved [1-9]\d* items?/.test(await toastText(p)) && (await q("is:infuse in:titan")).length >= 1, await toastText(p));
  check("search: no script errors", !p.errors.length, p.errors.join("; "));
  await p.context_.close();
});

// ---------- 2c. Perks and mods in the item popup (mocked Bungie) ----------
await section("Perks and mods", async () => {
  const p = await open({ real: true });
  const reuse = DEMO.itemComponents.reusablePlugs.data;
  const w = DEMO.characterInventories.data[TITAN].items.find(i => reuse[i.itemInstanceId] && [1498876634, 2465295065, 953998645].includes(i.bucketHash));
  await p.click('#buckets .item-tile[data-id="' + w.itemInstanceId + '"]');
  const alt = p.locator("#item-dialog .perk-dot.alt").first();
  const h = await alt.getAttribute("data-plug"), k = await alt.getAttribute("data-socket");
  await alt.click();
  check("perks: a perk you can switch to offers Use", await p.isVisible("#plug-use"));
  p.calls.length = 0;
  await p.click("#plug-use"); await idle(p);
  const ins = p.calls.find(c => c.ep === "InsertSocketPlugFree");
  check("perks: Use sends InsertSocketPlugFree for that socket", ins && String(ins.body.plug.plugItemHash) === h && String(ins.body.plug.socketIndex) === k && ins.body.itemId === w.itemInstanceId && ins.body.characterId === TITAN, JSON.stringify(ins && ins.body));
  check("perks: the popup shows it as the perk on", await p.locator('#item-dialog .perk-dot.sel[data-plug="' + h + '"]').count() === 1);
  await p.keyboard.press("Escape");
  const helm = DEMO.characterEquipment.data[TITAN].items.find(i => i.bucketHash === 3448274439);
  await p.click('#buckets .item-tile[data-id="' + helm.itemInstanceId + '"]');
  await p.locator("#item-dialog .mod-sq.empty").first().click();
  const choices = await p.locator("[data-mod-pick]").count();
  check("mods: an empty mod socket lists mods for it", choices > 3 && !/Locked Armor Mod/.test(await p.textContent("#plug-change")), String(choices));
  let v = await axe(p); check("mods: the mod list passes axe", !v.length, v.join(", "));
  await p.evaluate(() => document.querySelector("[data-mod-pick]").focus());
  await p.evaluate(() => document.getElementById("locker-refresh").click()); // a re-sync redraws the popup
  await p.waitForTimeout(500); await idle(p);
  check("mods: a re-sync keeps the mod list open and focus in it", await p.locator("[data-mod-pick]").count() === choices && await p.evaluate(() => !!document.activeElement.dataset.modPick));
  const mod = await p.locator("[data-mod-pick]").nth(1).getAttribute("data-mod-pick"), sock = await p.getAttribute("#item-dialog .mod-sq.empty >> nth=0", "data-socket");
  p.calls.length = 0;
  await p.locator("[data-mod-pick]").nth(1).click(); await idle(p);
  const put = p.calls.find(c => c.ep === "InsertSocketPlugFree");
  check("mods: picking one puts it in that socket", put && String(put.body.plug.plugItemHash) === mod && String(put.body.plug.socketIndex) === sock && await p.locator('#item-dialog .mod-sq[data-plug="' + mod + '"]').count() === 1, JSON.stringify(put && put.body));
  await p.keyboard.press("Escape");
  // A vault item moves to a character first.
  const vw = DEMO.profileInventory.data.items.find(i => reuse[i.itemInstanceId] && Object.values(reuse[i.itemInstanceId].plugs).some(l => l.length > 1 && l.length < 5));
  check("perks: the sample has a vault item to switch", !!vw);
  if (vw){
    await p.click('#buckets .item-tile[data-id="' + vw.itemInstanceId + '"]');
    await p.locator("#item-dialog .perk-dot.alt").first().click();
    check("perks: a vault item says it moves first", /moves to your/.test(await p.textContent("#plug-change")));
    p.calls.length = 0; await p.click("#plug-use"); await idle(p);
    check("perks: then moves it and switches", p.calls[0] && p.calls[0].ep === "TransferItem" && p.calls.some(c => c.ep === "InsertSocketPlugFree" && c.body.itemId === vw.itemInstanceId), JSON.stringify(p.calls.map(c => c.ep)));
    await p.keyboard.press("Escape");
  }
  check("perks: no script errors", !p.errors.length, p.errors.join("; "));
  await p.context_.close();
});

// ---------- 2d. Wish lists (sample data) ----------
await section("Wish list", async () => {
  const p = await open();
  const reuse = DEMO.itemComponents.reusablePlugs.data;
  const w = DEMO.characterInventories.data[TITAN].items.find(i => reuse[i.itemInstanceId] && [1498876634, 2465295065, 953998645].includes(i.bucketHash));
  const tile = '#buckets .item-tile[data-id="' + w.itemInstanceId + '"]';
  await p.click(tile);
  const onCopy = await p.$$eval("#item-dialog .perk-col", cs => cs.map(c => c.querySelector(".perk-dot.sel").getAttribute("title")));
  await p.click("#wish-add"); await p.waitForSelector(".wish-col", { timeout: 30000 });
  const heads = await p.$$eval(".wish-col-h", h => h.map(x => x.textContent));
  const counts = await p.$$eval(".wish-col", c => c.map(x => x.querySelectorAll("[data-wish-perk]").length));
  check("wish: a generic copy lists every perk the weapon can roll, per column", heads.length >= 4 && counts.filter(n => n >= 2).length >= 3 && await p.evaluate(() => document.activeElement.id === "dlg-name"), heads.join(", ") + " / " + counts.join(","));
  check("wish: on desktop every column, Masterwork included, sits on one row", await p.evaluate(() => new Set([...document.querySelectorAll(".wish-col")].map(c => Math.round(c.getBoundingClientRect().top))).size === 1));
  // The trait this copy has, or another from that column (any of them will do).
  const trait = onCopy[onCopy.length - 2], col = await p.getAttribute('[data-wish-perk="' + trait + '"]', "data-wish-col");
  const others = await p.$$eval('[data-wish-col="' + col + '"]', b => b.map(x => x.dataset.wishPerk));
  const alsoOk = others.find(x => x !== trait);
  await p.click('[data-wish-perk="' + trait + '"]'); await p.click('[data-wish-perk="' + alsoOk + '"]');
  check("wish: picks are pressed and the count of matching copies updates", await p.locator('.wish-perk[aria-pressed="true"]').count() === 2 && /^1 of your 1 copy has this roll/.test(await p.textContent("#wish-count")), await p.textContent("#wish-count"));
  let v = await axe(p); check("wish: the generic weapon passes axe", !v.length, v.join(", "));
  await p.click("#wish-save");
  check("wish: saving says how many copies have it", /Wish-list roll saved\. 1 of your copies has it/.test(await toastText(p)), await toastText(p));
  check("wish: back on the copy, the roll shows as had and the perk is ringed", /This copy has it/.test(await p.textContent(".wish-roll")) && / or /.test(await p.textContent(".wish-roll")) && await p.locator("#item-dialog .perk-dot.wished").count() >= 1 && await p.evaluate(() => document.activeElement.id === "wish-add"));
  await p.keyboard.press("Escape");
  check("wish: a full match fills the green bar on the tile", await p.locator(tile + " .tile-wish.full").count() === 1 && /matches your wish list/.test(await p.getAttribute(tile, "aria-label")));
  await p.fill("#locker-search", "is:wishlist"); await p.waitForTimeout(300);
  check("wish: is:wishlist finds it", await p.locator("#buckets .item-tile[data-id]:not([hidden])").count() === 1);
  await p.fill("#locker-search", ""); await p.waitForTimeout(200);
  await p.selectOption("#tag-filter", "wish");
  check("wish: the filter menu has Wish-list match", await p.locator("#buckets .item-tile[data-id]").count() === 1);
  await p.selectOption("#tag-filter", "");
  // Edit: picks come back; add a barrel this copy doesn't have.
  await p.click(tile); await p.click("[data-wish-edit]"); await p.waitForSelector(".wish-col");
  check("wish: Edit brings the picks back", (await p.$$eval('.wish-perk[aria-pressed="true"]', b => b.map(x => x.dataset.wishPerk))).sort().join() === [trait, alsoOk].sort().join());
  const barrel = (await p.$$eval('[data-wish-col="0"]', b => b.map(x => x.dataset.wishPerk))).find(x => x !== onCopy[0]);
  await p.click('[data-wish-perk="' + barrel + '"]');
  check("wish: a perk no copy has drops the count to 0", /^0 of your 1/.test(await p.textContent("#wish-count")));
  await p.click("#wish-save");
  check("wish: the copy now says what it's missing", /Has 1 of 2/.test(await p.textContent(".wish-roll")) && await p.locator(".wish-roll").count() === 1);
  await p.keyboard.press("Escape");
  check("wish: a part match shows a half-full amber bar and says so", await p.locator(tile + ' .tile-wish:not(.full)[style*="--w:50%"]').count() === 1 && /has 1 of 2 wish-list picks/.test(await p.getAttribute(tile, "aria-label")));
  await p.fill("#locker-search", "wish:>=1 -is:wishlist"); await p.waitForTimeout(300);
  check("wish: wish:>=1 -is:wishlist finds part matches", await p.locator("#buckets .item-tile[data-id]:not([hidden])").count() === 1);
  await p.fill("#locker-search", ""); await p.waitForTimeout(200);
  await p.click(tile);
  // Masterwork: a last column with only this weapon's stats; the copy's stat counts at any tier.
  await p.click("[data-wish-edit]"); await p.waitForSelector(".wish-col");
  const mwHead = await p.textContent(".wish-col:last-child .wish-col-h");
  const mw = await p.$$eval(".wish-col:last-child [data-wish-perk]", b => b.map(x => ({ n: x.dataset.wishPerk, mine: x.textContent.includes("on a copy you own") })));
  check("wish: a Masterwork column lists this weapon's stats, the copy's own marked", mwHead === "Masterwork" && mw.length >= 3 && mw.filter(x => x.mine).length === 1 && mw.length <= 6, JSON.stringify(mw));
  await p.click('[data-wish-perk="' + barrel + '"]'); // back to a roll the copy has
  await p.click('[data-wish-perk="' + mw.find(x => x.mine).n + '"]');
  check("wish: the copy's masterwork stat keeps the match", /^1 of your 1/.test(await p.textContent("#wish-count")));
  await p.click('[data-wish-perk="' + mw.find(x => x.mine).n + '"]'); await p.click('[data-wish-perk="' + mw.find(x => !x.mine).n + '"]');
  check("wish: another masterwork stat doesn't match", /^0 of your 1/.test(await p.textContent("#wish-count")));
  await p.click("#wish-cancel");
  check("wish: the popup shows the copy's masterwork stat and tier", /Masterwork/.test(await p.textContent("#item-dialog .dlg-body")) && /^(?:[A-Z][a-z]+ ?)+(Tier \d+ of 10|Fully masterworked)/.test(await p.textContent("#item-dialog .mw-row")), await p.textContent("#item-dialog .mw-row"));
  const del = p.locator("[data-wish-del]"); await del.click(); await del.click();
  await p.keyboard.press("Escape");
  check("wish: Delete (two taps) removes the roll and the badge", await p.locator(tile + " .tile-wish").count() === 0 && await p.evaluate(() => localStorage.getItem("rallyflag_locker_wishes")) === "{}");
  check("wish: no script errors", !p.errors.length, p.errors.join("; "));
  await p.context_.close();
});

// ---------- 2e. Your Week (its own page) ----------
await section("Your Week", async () => {
  const p = await open({ url: BASE + "your-week.html?demo", ready: "#yw-app .featured-card" });
  const titles = await p.$$eval(".featured-card .featured-name", n => n.map(x => x.textContent));
  check("week: this week's featured raids and dungeons, three of each", titles.length === 6 && titles.includes("The Desert Perpetual") && titles.includes("Equilibrium"), titles.join(", "));
  const chips = await p.$$eval(".featured-card", cs => cs.map(c => [...c.querySelectorAll(".yw-char")].map(x => x.textContent)));
  check("week: each featured activity shows every character's clear since reset", chips.every(c => c.length === 3) && chips.flat().some(t => /cleared/.test(t)) && chips.flat().some(t => /not yet/.test(t)));
  check("week: links to our guide from each featured card", await p.locator('.featured-card a.featured-link[href*="raid-"]').count() === 3 && await p.locator('.featured-card a.featured-link[href*="dungeon-"]').count() === 3);
  check("week: season pass, milestones, pursuits and seals render", await p.locator(".pg-season").count() === 1 && await p.locator(".pg-ms-row").count() >= 3 && await p.locator(".pg-card").count() > 0 && await p.locator(".pg-seal").count() >= 1);
  check("week: pursuits expiring before reset are marked", await p.locator(".pg-tag").count() >= 1);
  const other = await p.getAttribute('[data-yw-owner][aria-pressed="false"]', "data-yw-owner");
  await p.click('[data-yw-owner="' + other + '"]');
  check("week: switching character shows theirs, focus stays", await p.evaluate(c => document.activeElement.dataset.ywOwner === c, other) && await p.locator(".pg-card").count() > 0);
  check("week: the switch links back to This Week", await p.getAttribute('.yw-switch a[aria-current="page"]', "href") === "your-week.html" && await p.locator('.yw-switch a[href="this-week.html"]').count() === 1);
  const v = await axe(p); check("week passes axe", !v.length, v.join(", "));
  check("week: no script errors", !p.errors.length, p.errors.join("; "));
  await p.context_.close();
  // Signed out: an explanation, a sign-in and the sample.
  const so = await open({ signedOut: true, url: BASE + "your-week.html" });
  await so.waitForSelector("#yw-signin");
  check("week: signed out, it explains and offers sign-in and sample data", /Sign in with Bungie\.net to see your week/.test(await so.textContent("#yw-status")) && await so.locator('a[href="your-week.html?demo"]').count() === 1);
  await so.context_.close();
  // Signed in: the profile call with progress components, and each character's raid and dungeon history.
  const q = await open({ real: true, url: BASE + "your-week.html", ready: "#yw-app .featured-card" });
  const ids = DEMO.profile.data.characterIds;
  check("week: signed in, it reads progress and each character's raid and dungeon history", q.calls.some(c => c.ep === "Week profile" && /components=100,104,200,201,202,300,301,700/.test(c.body)) &&
    ids.every(id => q.calls.some(c => c.ep === "Activity history" && c.body.includes(id) && /mode=4/.test(c.body)) && q.calls.some(c => c.ep === "Activity history" && c.body.includes(id) && /mode=82/.test(c.body))));
  check("week: and shows the same clears as the sample", JSON.stringify(await q.$$eval(".featured-card", cs => cs.map(c => [...c.querySelectorAll(".yw-char")].map(x => x.textContent)))) === JSON.stringify(chips));
  check("week: signed in, no script errors", !q.errors.length, q.errors.join("; "));
  await q.context_.close();
  // The Locker no longer has a Progress tab.
  const l = await open();
  check("locker: Progress lives on Your Week now, not in the Locker", await l.locator("#tab-progress").count() === 0);
  await l.context_.close();
});

// ---------- 2f. New markers, infusion, stat totals, DIM links (sample data) ----------
await section("DIM extras", async () => {
  const p = await open({ hash: "#gear" });
  check("new: a first visit marks nothing new", await p.locator(".tile-new").count() === 0 && await p.isHidden("#new-clear"));
  const ids = await p.$$eval("#buckets .item-tile[data-id]", t => t.map(x => x.dataset.id));
  const fresh = ids.slice(3, 6);
  await p.evaluate(drop => { const s = JSON.parse(localStorage.getItem("rallyflag_locker_seen:demo")); localStorage.setItem("rallyflag_locker_seen:demo", JSON.stringify(s.filter(id => !drop.includes(id)))); }, fresh);
  await p.reload(); await p.waitForSelector("#locker-app:not([hidden])", { timeout: 90000 }); await p.waitForTimeout(600);
  check("new: items not seen before get a dot and say so", await p.locator(".tile-new").count() === 3 && /, new(,|$)/.test(await p.getAttribute('#buckets .item-tile[data-id="' + fresh[0] + '"]', "aria-label")) && /Mark 3 new as seen/.test(await p.textContent("#new-clear")));
  await p.fill("#locker-search", "is:new"); await p.waitForTimeout(300);
  check("new: is:new finds them", await p.locator("#buckets .item-tile[data-id]:not([hidden])").count() === 3);
  await p.fill("#locker-search", ""); await p.waitForTimeout(300);
  await p.click('#buckets .item-tile[data-id="' + fresh[0] + '"]');
  const fuel = await p.$$eval("[data-fuel]", b => b.map(x => x.textContent));
  check("infuse: the popup lists higher-Power fuel of the same category", fuel.length >= 1 && fuel.every(t => /\+\d+/.test(t)), fuel.join(" | "));
  await p.keyboard.press("Escape");
  check("new: opening an item clears its dot", await p.locator(".tile-new").count() === 2);
  await p.click("#new-clear");
  check("new: Mark as seen clears the rest", await p.locator(".tile-new").count() === 0 && await p.isHidden("#new-clear"));
  const armorTiles = await p.locator("#buckets .item-tile[data-id] .tile-total").count();
  check("armor tiles show their stat total", armorTiles > 40 && /stat total \d+/.test(await p.$eval("#buckets .item-tile[data-id]:has(.tile-total)", t => t.getAttribute("aria-label"))));
  // Copy DIM link: DIM's loadout link format, which our own importer reads back.
  await p.context_.grantPermissions(["clipboard-read", "clipboard-write"]);
  await p.click("#tab-loadouts"); await p.fill("#lo-name", "DIM out"); await p.click('[data-lo-save="' + TITAN + '"]');
  const id = (await p.getAttribute('[data-lo-pick^="r-"]', "data-lo-pick")).slice(2);
  await p.click('[data-lo-dim="' + id + '"]'); await p.waitForTimeout(200);
  const url = await p.evaluate(() => navigator.clipboard.readText());
  const j = JSON.parse(decodeURIComponent(url.split("loadout=")[1]));
  check("dim link: Copy DIM link makes a DIM loadout link with gear, subclass, mods and cosmetics", url.startsWith("https://app.destinyitemmanager.com/loadouts?loadout=") && j.name === "DIM out" && j.equipped.length >= 9 && j.parameters.mods.length > 0 && Object.keys(j.parameters.modsByBucket).length > 0);
  await p.fill("#lo-dim", url); await p.click("#lo-dim-go"); await p.waitForTimeout(800);
  check("dim link: and it imports back", /Imported DIM out/.test(await toastText(p)), await toastText(p));
  check("extras: no script errors", !p.errors.length, p.errors.join("; "));
  await p.context_.close();
});

// ---------- 2h. Community wish lists (Voltron, routed to a small list) ----------
await section("Community rolls", async () => {
  const reuse = DEMO.itemComponents.reusablePlugs.data;
  const w = DEMO.characterInventories.data[TITAN].items.find(i => reuse[i.itemInstanceId] && [1498876634, 2465295065, 953998645].includes(i.bucketHash));
  const plugs = DEMO.itemComponents.sockets.data[w.itemInstanceId].sockets.map(x => x.plugHash).filter(Boolean);
  const alt = Object.values(reuse[w.itemInstanceId].plugs)[0].map(x => x.plugItemHash).find(h => !plugs.includes(h));
  const list = "title:Test list\n\n//notes:Great for testing\ndimwishlist:item=" + w.itemHash + "&perks=" + plugs.slice(1, 3).concat(alt ? [alt] : []).join(",") + "\n" +
    "dimwishlist:item=" + w.itemHash + "&perks=1,2,3#notes:never\ndimwishlist:item=-" + w.itemHash + "&perks=" + plugs[1] + "\n";
  let fetched = 0;
  const p = await open();
  await p.context_.route("https://raw.githubusercontent.com/**", r => { fetched++; r.fulfill({ status: 200, contentType: "text/plain", headers: { "access-control-allow-origin": "*" }, body: list }); });
  const tile = '#buckets .item-tile[data-id="' + w.itemInstanceId + '"]';
  check("community: off by default, nothing downloaded", fetched === 0 && await p.locator(tile + " .community").count() === 0);
  await p.click("#tools-btn"); await p.click("#community-on");
  await p.waitForFunction(() => /rolls for your weapons/.test(document.getElementById("community-row").textContent), null, { timeout: 30000 });
  check("community: switching it on downloads the list once and counts your rolls", fetched === 1 && /2 rolls for your weapons/.test(await p.textContent("#community-row")), await p.textContent("#community-row"));
  const star = await p.locator(tile + " .tile-badge:not(.community)").filter({ hasText: "★" }).count();
  check("community: a copy with the roll (perks it has or can switch to) is marked", /community recommended roll/.test(await p.getAttribute(tile, "aria-label")) && (star || await p.locator(tile + " .tile-badge.community").count() === 1));
  await p.fill("#locker-search", "is:community"); await p.waitForTimeout(300);
  check("community: is:community finds it", await p.locator("#buckets .item-tile[data-id]:not([hidden])").count() >= 1);
  await p.fill("#locker-search", ""); await p.waitForTimeout(200);
  await p.click(tile);
  check("community: the popup says so, with the list's note", /Community roll/.test(await p.textContent("#item-dialog")) && /Great for testing/.test(await p.textContent("#item-dialog")));
  await p.keyboard.press("Escape");
  await p.reload(); await p.waitForSelector("#locker-app:not([hidden])", { timeout: 90000 }); await p.waitForTimeout(800);
  check("community: kept for the week, no new download on reload", fetched === 1 && /community recommended roll/.test(await p.getAttribute(tile, "aria-label")));
  if (await p.isHidden("#community-on")) await p.click("#tools-btn");
  await p.click("#community-on");
  check("community: switching it off removes the marks", !/community recommended roll/.test(await p.getAttribute(tile, "aria-label")));
  check("community: no script errors", !p.errors.length, p.errors.join("; "));
  await p.context_.close();
});

// ---------- 2g. Account switcher ----------
await section("Accounts", async () => {
  const one = await open({ real: true });
  check("accounts: one account, no switcher", await one.isHidden("#account-row"));
  await one.context_.close();
  const OTHER = "4611686018400000999";
  const p = await open({ real: true, accounts: [{ membershipType: 2, membershipId: OTHER, displayName: "Couch" }, { membershipType: 1, membershipId: "4611686018400000888", crossSaveOverride: 3, displayName: "Folded" }] });
  const opts = await p.$$eval("#account-pick option", o => o.map(x => x.textContent));
  check("accounts: more than one account offers a switcher (cross-saved ones left out)", opts.length === 2 && /Main · Steam/.test(opts[0]) && /Couch · PlayStation/.test(opts[1]), opts.join(" / "));
  p.calls.length = 0;
  await Promise.all([p.waitForNavigation(), p.selectOption("#account-pick", OTHER)]);
  await p.waitForSelector("#locker-app:not([hidden])", { timeout: 90000 }); await p.waitForTimeout(500);
  check("accounts: switching loads that account's profile, and it's remembered", p.calls.some(c => c.ep === "Profile" && c.body.includes("/Profile/" + OTHER + "/")) && await p.inputValue("#account-pick") === OTHER);
  check("accounts: no script errors", !p.errors.length, p.errors.join("; "));
  await p.context_.close();
});

// ---------- 3. Loadouts and max Power (sample data) ----------
await section("Loadouts", async () => {
  const p = await open({ hash: "#loadouts" });
  check("loadouts: #loadouts opens the tab", await p.isVisible("#view-loadouts"));
  await p.fill("#lo-name", "Check Titan"); await p.click('[data-lo-save="' + TITAN + '"]');
  const saved = await status(p);
  check("loadouts: a saved loadout is fully on", /equipped 8 of 8 · subclass set · artifact set · mods (\d+) of \1/.test(saved) && await p.locator('.lo-tile[aria-expanded="true"] .lo-check').count() === 1, saved);
  await p.click('[data-lo-pick="g-' + TITAN + '-1"]'); await p.click('[data-game-lo="1"][data-to="' + TITAN + '"]'); await idle(p);
  await p.click('[data-lo-pick^="r-"]');
  check("loadouts: equipping something else is reflected", /equipped 0 of 8/.test(await status(p)), await status(p));
  const id = (await p.getAttribute('[data-lo-pick^="r-"]', "data-lo-pick")).slice(2);
  await p.click('[data-lo-equip="' + id + '"][data-to="' + TITAN + '"]'); await idle(p);
  check("loadouts: equipping the saved loadout puts it all back", /equipped 8 of 8 · subclass set/.test(await status(p)), await status(p));
  await p.click('[data-lo-max="' + TITAN + '"]'); await idle(p);
  check("max Power: Titan reaches max", /At max Power/.test(await p.textContent('[data-lo-max="' + TITAN + '"]')), await toastText(p));
  // Rename: Enter saves (and the grid follows), Escape cancels, empty is refused.
  await p.click('[data-lo-rename="' + id + '"]');
  check("rename: the name box opens with the name selected", await p.evaluate(() => { const i = document.getElementById("lo-rename-input"); return document.activeElement === i && i.value === "Check Titan" && i.selectionEnd - i.selectionStart === i.value.length; }));
  await p.fill("#lo-rename-input", "Raid DPS"); await p.keyboard.press("Enter");
  const renamed = await p.evaluate(id => JSON.parse(localStorage.getItem("rallyflag_locker_loadouts:demo")).find(x => x.id === id), id);
  check("rename: Enter saves the new name", renamed.name === "Raid DPS" && /Raid DPS/.test(await p.textContent('[data-lo-pick="r-' + id + '"]')) && !(await p.locator("#lo-rename-input").count()), JSON.stringify(renamed && renamed.name));
  check("rename: focus returns to Rename", await p.evaluate(id => document.activeElement.dataset.loRename === id, id));
  await p.click('[data-lo-rename="' + id + '"]'); await p.fill("#lo-rename-input", "Nope"); await p.keyboard.press("Escape");
  await p.click('[data-lo-rename="' + id + '"]'); await p.fill("#lo-rename-input", "  "); await p.keyboard.press("Enter");
  const still = await p.evaluate(id => JSON.parse(localStorage.getItem("rallyflag_locker_loadouts:demo")).find(x => x.id === id).name, id);
  check("rename: Escape cancels and an empty name is refused", still === "Raid DPS" && /name first/.test(await toastText(p)), still);
  await p.click("[data-lo-rename-cancel]");
  // Edit: swap a slot, clear one, take mods, add a mod; Save keeps it, Cancel doesn't.
  await p.click('[data-lo-edit="' + id + '"]');
  check("edit: the editor opens on its heading with 8 slots", await p.evaluate(() => document.activeElement.id === "lo-edit-h") && await p.locator(".ed-slot").count() === 8);
  await p.click('[data-ed-slot="1498876634"]');
  check("edit: Change opens a filterable list, focus in the filter", await p.evaluate(() => document.activeElement.id === "ed-q") && await p.locator("[data-ed-pick]").count() > 1);
  await p.fill("#ed-q", "zzzzzz"); check("edit: the filter narrows the list", await p.locator("[data-ed-pick]").count() === 0); await p.fill("#ed-q", "");
  const swap = await p.locator("[data-ed-pick]:not(.on)").first().getAttribute("data-ed-pick");
  await p.click('[data-ed-pick="' + swap + '"]');
  await p.click('[data-ed-clear="3448274439"]');
  await p.click('[data-ed-drop="mods"]');
  await p.selectOption("#ed-mod-add", { index: 2 }); await p.click("#ed-mod-go");
  let v = await axe(p); check("edit: the editor passes axe", !v.length, v.join(", "));
  await p.click("#ed-save");
  const edited = await p.evaluate(id => JSON.parse(localStorage.getItem("rallyflag_locker_loadouts:demo")).find(x => x.id === id), id);
  check("edit: Save keeps the swap, the cleared slot and the mods", edited.items.length === 7 && edited.items.some(x => x.id === swap) && edited.mods.length === 1 && await p.evaluate(id => document.activeElement.dataset.loEdit === id, id), JSON.stringify(edited.items.length));
  await p.click('[data-lo-edit="' + id + '"]'); await p.click('[data-ed-clear="1498876634"]'); await p.keyboard.press("Escape");
  check("edit: Escape cancels without saving", (await p.evaluate(id => JSON.parse(localStorage.getItem("rallyflag_locker_loadouts:demo")).find(x => x.id === id), id)).items.length === 7 && !(await p.locator(".lo-edit").count()));
  // Armor optimizer: top 10 by stat total, minimums and an Exotic respected; Equip and Save work.
  await p.click("#opt-go"); await p.waitForSelector(".opt-build");
  const totals = await p.$$eval(".opt-total", t => t.map(x => +x.textContent.replace(/\D/g, "")));
  check("optimizer: finds up to 10 armor sets, best total first", totals.length >= 1 && totals.length <= 10 && totals.every((t, k) => k === 0 || t <= totals[k - 1]) && await p.locator(".opt-build:first-child .opt-piece").count() === 5, totals.join(","));
  const firstStat = await p.getAttribute("[data-opt-min]", "data-opt-min");
  const topFirst = await p.$$eval(".opt-build .opt-stat:first-child", t => Math.max(...t.map(x => +x.textContent.replace(/\D/g, ""))));
  await p.fill("#opt-min-" + firstStat, String(topFirst)); await p.click("#opt-go"); await p.waitForTimeout(800);
  check("optimizer: every result meets the minimums", await p.locator(".opt-build").count() >= 1 && (await p.$$eval(".opt-build .opt-stat:first-child", t => t.map(x => +x.textContent.replace(/\D/g, "")))).every(v => v >= topFirst));
  await p.fill("#opt-min-" + firstStat, "200"); await p.click("#opt-go"); await p.waitForTimeout(800);
  check("optimizer: impossible minimums say so", /No armor set meets/.test(await p.textContent("#view-loadouts")));
  await p.fill("#opt-min-" + firstStat, "0");
  const exo = await p.$$eval("#opt-exotic option", o => o.slice(2).map(x => [x.value, x.textContent]));
  if (exo.length){
    await p.selectOption("#opt-exotic", exo[0][0]); await p.click("#opt-go"); await p.waitForSelector(".opt-build");
    check("optimizer: a chosen Exotic is in every result", (await p.$$eval(".opt-build", b => b.map(x => x.textContent))).every(t => t.includes(exo[0][1])));
    await p.selectOption("#opt-exotic", "none"); await p.click("#opt-go"); await p.waitForSelector(".opt-build");
    check("optimizer: No Exotic leaves them all out", (await p.$$eval(".opt-build", b => b.map(x => x.textContent))).every(t => !exo.some(([, n]) => t.includes(n))));
  }
  v = await axe(p); check("optimizer passes axe", !v.length, v.join(", "));
  await p.click('[data-opt-equip="0"]'); await idle(p);
  check("optimizer: Equip puts the set on the character", /Equipped the optimized armor/.test(await toastText(p)), await toastText(p));
  const before = await p.evaluate(() => JSON.parse(localStorage.getItem("rallyflag_locker_loadouts:demo")).length);
  await p.click('[data-opt-save="0"]');
  const optSaved = await p.evaluate(() => JSON.parse(localStorage.getItem("rallyflag_locker_loadouts:demo")).slice(-1)[0]);
  check("optimizer: Save as loadout stores the 5 pieces", optSaved.items.length === 5 && /^Optimized /.test(optSaved.name) && (await p.evaluate(() => JSON.parse(localStorage.getItem("rallyflag_locker_loadouts:demo")).length)) === before + 1);
  await p.click('[data-lo-del="' + optSaved.id + '"]'); await p.click('[data-lo-del="' + optSaved.id + '"]');
  await p.click('[data-lo-pick="r-' + id + '"]');
  const del = p.locator("[data-lo-del]").first(); await del.click(); await del.click();
  check("loadouts: two-tap delete", await p.locator('[data-lo-pick^="r-"]').count() === 0);
  check("loadouts: no script errors", !p.errors.length, p.errors.join("; "));
  await p.context_.close();
});

// ---------- 4. In-game loadouts, real path (mocked Bungie) ----------
await section("In-game loadouts", async () => {
  const p = await open({ real: true, hash: "#loadouts" });
  p.calls.length = 0;
  await p.click('[data-lo-pick="g-' + TITAN + '-1"]'); await p.click('[data-game-lo="1"][data-to="' + TITAN + '"]'); await idle(p);
  const eq = p.calls.find(c => c.ep === "Loadouts/EquipLoadout");
  check("in-game: missing items move over, then EquipLoadout", p.calls.some(c => c.ep === "TransferItem") && eq && eq.body.loadoutIndex === 1 && eq.body.characterId === TITAN, JSON.stringify(p.calls.map(c => c.ep)));
  check("in-game: Beta shows as on", /Equipped 8 of 8/.test(await p.evaluate(() => document.querySelector("#view-loadouts .lo-detail:not([hidden]) .lo-status").textContent)));
  // Name, icon and colour (Destiny's own choices).
  await p.click('[data-game-edit="' + TITAN + ':1"]');
  check("in-game edit: the editor opens on the name list", await p.evaluate(() => document.activeElement && document.activeElement.id === "ge-name"));
  const opts = await p.$$eval("#ge-name option", o => o.map(x => ({ v: x.value, t: x.textContent })));
  const icons = await p.$$eval("[data-ge-icons]", b => b.map(x => x.dataset.geIcons)), colors = await p.$$eval("[data-ge-colors]", b => b.map(x => x.dataset.geColors));
  check("in-game edit: Destiny's lists are offered", opts.length >= 20 && icons.length >= 20 && colors.length >= 20, opts.length + "/" + icons.length + "/" + colors.length);
  const pick = { name: opts[3], icon: icons[4], color: colors[5] };
  await p.selectOption("#ge-name", pick.name.v); await p.click('[data-ge-icons="' + pick.icon + '"]'); await p.click('[data-ge-colors="' + pick.color + '"]');
  check("in-game edit: the preview follows the picks", (await p.textContent(".ge-preview")).includes(pick.name.t) && await p.getAttribute('[data-ge-colors="' + pick.color + '"]', "aria-pressed") === "true");
  p.calls.length = 0;
  await p.click(".ge-editor [type=submit]"); await idle(p);
  const upd = p.calls.find(c => c.ep === "Loadouts/UpdateLoadoutIdentifiers");
  check("in-game edit: Save sends UpdateLoadoutIdentifiers with the picks", upd && upd.body.loadoutIndex === 1 && upd.body.characterId === TITAN && String(upd.body.nameHash) === pick.name.v && String(upd.body.iconHash) === pick.icon && String(upd.body.colorHash) === pick.color, JSON.stringify(upd && upd.body));
  check("in-game edit: the tile shows the new name", (await p.textContent('[data-lo-pick="g-' + TITAN + '-1"]')).includes(pick.name.t) && !(await p.locator(".ge-editor").count()));
  await p.waitForTimeout(2500); await idle(p);
  check("in-game edit: kept after a re-sync with Bungie's older copy", (await p.textContent('[data-lo-pick="g-' + TITAN + '-1"]')).includes(pick.name.t));
  if (!(await p.isVisible('[data-game-edit="' + TITAN + ':1"]'))) await p.click('[data-lo-pick="g-' + TITAN + '-1"]');
  await p.click('[data-game-edit="' + TITAN + ':1"]'); await p.selectOption("#ge-name", opts[0].v); p.calls.length = 0; await p.keyboard.press("Escape");
  check("in-game edit: Escape cancels without saving", !(await p.locator(".ge-editor").count()) && !p.calls.length && await p.evaluate(k => document.activeElement.dataset.gameEdit === k, TITAN + ":1"));
  // All 10 slots show; an empty one saves what the character wears now.
  check("in-game slots: all 10 slots show, empty ones too", await p.locator('[data-lo-pick^="g-' + TITAN + '-"]').count() === 10 && await p.locator('.lo-tile.empty[data-lo-pick^="g-' + TITAN + '-"]').count() >= 7);
  await p.click('[data-lo-pick="g-' + TITAN + '-5"]');
  check("in-game slots: an empty slot opens on Save current gear", /current gear here/.test(await p.textContent(".ge-editor [type=submit]")));
  const nm = await p.$$eval("#ge-name option", o => o.map(x => ({ v: x.value, t: x.textContent })));
  await p.selectOption("#ge-name", nm[6].v);
  p.calls.length = 0;
  await p.click(".ge-editor [type=submit]"); await idle(p);
  const snap = p.calls.find(c => c.ep === "Loadouts/SnapshotLoadout");
  check("in-game slots: Save sends SnapshotLoadout with the name", snap && snap.body.loadoutIndex === 5 && snap.body.characterId === TITAN && String(snap.body.nameHash) === nm[6].v, JSON.stringify(snap && snap.body));
  const tile5 = () => p.textContent('[data-lo-pick="g-' + TITAN + '-5"]');
  check("in-game slots: the slot now holds the gear", (await tile5()).includes(nm[6].t) && await p.locator('.lo-tile.empty[data-lo-pick="g-' + TITAN + '-5"]').count() === 0);
  if (!(await p.isVisible('[data-game-snap="' + TITAN + ':5"]'))) await p.click('[data-lo-pick="g-' + TITAN + '-5"]');
  check("in-game slots: it reads as on", /Equipped 8 of 8 · subclass on/.test(await p.evaluate(() => document.querySelector("#view-loadouts .lo-detail:not([hidden]) .lo-status").textContent)));
  p.calls.length = 0;
  await p.click('[data-game-snap="' + TITAN + ':5"]');
  check("in-game slots: Replace asks first", !p.calls.length && /Tap again/.test(await p.textContent('[data-game-snap="' + TITAN + ':5"]')));
  await p.click('[data-game-snap="' + TITAN + ':5"]'); await idle(p);
  check("in-game slots: Replace sends SnapshotLoadout keeping the name", p.calls.some(c => c.ep === "Loadouts/SnapshotLoadout" && c.body.loadoutIndex === 5 && String(c.body.nameHash) === nm[6].v));
  if (!(await p.isVisible('[data-game-clear="' + TITAN + ':5"]'))) await p.click('[data-lo-pick="g-' + TITAN + '-5"]');
  p.calls.length = 0;
  await p.click('[data-game-clear="' + TITAN + ':5"]'); await p.click('[data-game-clear="' + TITAN + ':5"]'); await idle(p);
  check("in-game slots: Clear sends ClearLoadout and empties the slot", p.calls.some(c => c.ep === "Loadouts/ClearLoadout" && c.body.loadoutIndex === 5) && await p.locator('.lo-tile.empty[data-lo-pick="g-' + TITAN + '-5"]').count() === 1);
  await p.waitForTimeout(2500); await idle(p);
  check("in-game slots: still empty after a re-sync with Bungie's older copy", await p.locator('.lo-tile.empty[data-lo-pick="g-' + TITAN + '-5"]').count() === 1);
  await p.context_.close();
});

// ---------- 5. DIM import: choose your copies (sample data) ----------
await section("DIM import", async () => {
  const beta = DEMO.characterLoadouts.data[TITAN].loadouts[1].items.map(x => x.itemInstanceId).filter(id => hashOf(id) && !allItems.find(i => i.itemInstanceId === id && i.bucketHash === SUBCLASS_BUCKET));
  const fixture = { id: "chk001", name: "Friend link", classType: 0, equipped: beta.map((id, k) => ({ id: "7000000" + k, hash: hashOf(id) })), unequipped: [], parameters: { mods: [] } };
  const p = await open({ hash: "#loadouts", relay: fixture });
  await p.fill("#lo-dim", "https://dim.gg/chk001/x"); await p.click("#lo-dim-go"); await p.waitForSelector("#lo-h-review");
  check("dim: someone else's link opens Choose your copies first", await p.locator('[data-lo-pick="r-dim-chk001"]').count() === 0 && await p.locator(".pick-slot").count() === beta.length);
  check("dim: copies show their perks", await p.locator(".pick .pick-perk").count() > 0);
  await p.click("#lo-review-save");
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem("rallyflag_locker_loadouts:demo")).find(x => x.id === "dim-chk001"));
  check("dim: saving stores your own copies (nothing greyed out)", stored && stored.items.every(x => !x.id.startsWith("7000000")) && await p.locator(".lo-detail:not([hidden]) .lo-mini.gone").count() === 0, JSON.stringify(stored && stored.items));
  await p.fill("#lo-dim", "https://dim.gg/chk001/x"); await p.click("#lo-dim-go"); await p.waitForSelector("#lo-h-review"); await p.click("#lo-review-cancel");
  check("dim: Don't import leaves nothing behind", await p.locator("#lo-h-review").count() === 0 && await p.locator('[data-lo-pick="r-dim-chk001"]').count() === 1);
  await p.fill("#lo-dim", "hello"); await p.click("#lo-dim-go"); await p.waitForTimeout(500);
  check("dim: a non-link explains itself", /DIM loadout link/.test(await toastText(p)), await toastText(p));
  check("dim: no script errors", !p.errors.length, p.errors.join("; "));
  await p.context_.close();
});

// ---------- 6. DIM apply: subclass and mods (mocked Bungie) ----------
await section("DIM apply", async () => {
  // A: what the Titan wears; B: the in-game Beta loadout's gear and mods.
  const opts = { real: true, hash: "#loadouts" };
  const p = await open(opts);
  const snap = async name => { await p.fill("#lo-name", name); await p.click('[data-lo-save="' + TITAN + '"]'); return p.evaluate(n => JSON.parse(localStorage.getItem("rallyflag_locker_loadouts:4611686018400000000")).find(x => x.name === n), name); };
  const A = await snap("A");
  await p.click('[data-lo-pick="g-' + TITAN + '-1"]'); await p.click('[data-game-lo="1"][data-to="' + TITAN + '"]'); await idle(p);
  const B = await snap("B");
  const subs = [].concat(DEMO.characterEquipment.data[TITAN].items, DEMO.characterInventories.data[TITAN].items).filter(i => i.bucketHash === SUBCLASS_BUCKET);
  const other = subs.find(s => s.itemHash !== A.subclass.hash);
  const plugs = DEMO.itemComponents.sockets.data[other.itemInstanceId].sockets.map(s => s.plugHash || 0);
  const overrides = {}; plugs.forEach((h, k) => { if (h) overrides[k] = h; });
  overrides[0] = A.subclass.sockets[0]; // a different class ability: one real change
  const fixture = { id: "chk002", name: "Apply check", classType: 0, equipped: A.items.map(x => ({ id: x.id, hash: x.hash })).concat([{ id: "1", hash: other.itemHash, socketOverrides: overrides }]), unequipped: [], parameters: { mods: B.mods } };
  await p.route(RELAY + "**", r => r.fulfill(json(fixture)));
  opts.refuseOnce = (ep, body) => ep === "InsertSocketPlugFree" && body.itemId !== other.itemInstanceId;
  await p.fill("#lo-dim", "https://dim.gg/chk002/x"); await p.click("#lo-dim-go"); await p.waitForTimeout(800);
  p.calls.length = 0;
  await p.click('[data-lo-equip="dim-chk002"][data-to="' + TITAN + '"]'); await idle(p);
  const ins = p.calls.filter(c => c.ep === "InsertSocketPlugFree");
  check("dim apply: equips the loadout's subclass", p.calls.some(c => c.ep === "EquipItem" && c.body.itemId === other.itemInstanceId), JSON.stringify(p.calls.map(c => c.ep)));
  check("dim apply: sets the changed subclass choice only", ins.filter(c => c.body.itemId === other.itemInstanceId).map(c => c.body.plug.socketIndex).join() === "0", JSON.stringify(ins.map(c => c.body.plug.socketIndex)));
  check("dim apply: armor mods go on (after one refusal and a retry)", ins.some(c => c.body.itemId !== other.itemInstanceId) && !opts.refuseOnce);
  if (!(await p.isVisible('[data-lo-pick="r-dim-chk002"][aria-expanded="true"]'))) await p.click('[data-lo-pick="r-dim-chk002"]');
  const st = await status(p);
  check("dim apply: the loadout reads as fully on", /equipped 8 of 8 · subclass set · mods (\d+) of \1/.test(st), st);
  await p.context_.close();
});

// ---------- 6b. Artifact (mocked Bungie) ----------
await section("Artifact", async () => {
  const ARTIFACT_BUCKET = 1506418338;
  const p = await open({ real: true, hash: "#loadouts" });
  await p.fill("#lo-name", "Worn"); await p.click('[data-lo-save="' + TITAN + '"]');
  const A = await p.evaluate(() => JSON.parse(localStorage.getItem("rallyflag_locker_loadouts:4611686018400000000")).find(x => x.name === "Worn"));
  const worn = DEMO.characterEquipment.data[TITAN].items.find(i => i.bucketHash === ARTIFACT_BUCKET);
  check("artifact: saving keeps the worn artifact and its perks", A.artifact && A.artifact.hash === worn.itemHash && Object.keys(A.artifact.sockets).length >= 5, JSON.stringify(A.artifact));
  // A DIM link with the other artifact (carried, not worn), its first two
  // perks swapped: both sockets must be emptied first, then set.
  const spare = DEMO.characterInventories.data[TITAN].items.find(i => i.bucketHash === ARTIFACT_BUCKET);
  const plugs = DEMO.itemComponents.sockets.data[spare.itemInstanceId].sockets.map(x => x.plugHash || 0);
  const want = { 0: plugs[1], 1: plugs[0], 2: plugs[2] };
  const fixture = { id: "chk003", name: "Artifact check", classType: 0, equipped: A.items.concat([{ id: "5", hash: spare.itemHash, socketOverrides: want }]), unequipped: [], parameters: { mods: [] } };
  await p.route(RELAY + "**", r => r.fulfill(json(fixture)));
  await p.fill("#lo-dim", "https://dim.gg/chk003/x"); await p.click("#lo-dim-go"); await p.waitForTimeout(800);
  p.calls.length = 0;
  await p.click('[data-lo-equip="dim-chk003"][data-to="' + TITAN + '"]'); await idle(p);
  const onSpare = p.calls.filter(c => c.ep === "InsertSocketPlugFree" && c.body.itemId === spare.itemInstanceId).map(c => c.body.plug.socketIndex + ":" + c.body.plug.plugItemHash);
  check("artifact: the loadout's artifact is equipped", p.calls.some(c => c.ep === "EquipItem" && c.body.itemId === spare.itemInstanceId), JSON.stringify(p.calls.map(c => c.ep)));
  check("artifact: swapped perks are emptied first, then set (socket 2 untouched)",
    onSpare.join() === ["0:1235188590", "1:1235188590", "0:" + plugs[1], "1:" + plugs[0]].join(), onSpare.join());
  if (!(await p.isVisible('[data-lo-pick="r-dim-chk003"][aria-expanded="true"]'))) await p.click('[data-lo-pick="r-dim-chk003"]');
  check("artifact: the loadout reads as artifact set", /artifact set/.test(await status(p)) && /Slayer Baron|Artifact/.test(await p.textContent("#view-loadouts .lo-detail:not([hidden])")), await status(p));
  // The saved loadout brings the original artifact back, with no perk changes.
  const id = await p.evaluate(() => JSON.parse(localStorage.getItem("rallyflag_locker_loadouts:4611686018400000000")).find(x => x.name === "Worn").id);
  p.calls.length = 0;
  await p.click('[data-lo-pick="r-' + id + '"]'); await p.click('[data-lo-equip="' + id + '"][data-to="' + TITAN + '"]'); await idle(p);
  check("artifact: a saved loadout puts its own artifact back", p.calls.some(c => c.ep === "EquipItem" && c.body.itemId === worn.itemInstanceId) && !p.calls.some(c => c.ep === "InsertSocketPlugFree" && c.body.itemId === worn.itemInstanceId), JSON.stringify(p.calls.map(c => c.ep + (c.body.itemId ? ":" + c.body.itemId.slice(-3) : ""))));
  check("artifact: no script errors", !p.errors.length, p.errors.join("; "));
  await p.context_.close();
});

// ---------- 7. Sync between two devices ----------
await section("Sync", async () => {
  const env = { DB: fakeD1() };
  const A = await open({ real: true, env, hash: "#loadouts" });
  await A.fill("#lo-name", "Synced"); await A.click('[data-lo-save="' + TITAN + '"]'); await A.waitForTimeout(2000);
  const item = DEMO.characterInventories.data[TITAN].items.find(i => i.itemInstanceId && i.bucketHash !== SUBCLASS_BUCKET && i.bucketHash !== 215593132).itemInstanceId;
  await A.click("#tab-gear"); await A.click('#buckets .item-tile[data-id="' + item + '"]'); await A.click('#item-dialog [data-tag="favorite"]'); await A.click('#item-dialog [data-use="pvp"]'); await A.keyboard.press("Escape"); await A.waitForTimeout(2000);
  check("sync: saves reach the service", env.DB.rows.has(MEMBER) && /Synced/.test(env.DB.rows.get(MEMBER).data));
  const B = await open({ real: true, env, hash: "#loadouts" });
  check("sync: a fresh browser gets the loadout", /Synced/.test(await B.textContent("#view-loadouts")));
  check("sync: and the tag", await B.evaluate(id => /tag-favorite/.test(document.querySelector('#buckets .item-tile[data-id="' + id + '"]').className), item));
  const wishWeapon = DEMO.characterInventories.data[TITAN].items.find(i => DEMO.itemComponents.reusablePlugs.data[i.itemInstanceId] && [1498876634, 2465295065, 953998645].includes(i.bucketHash)).itemInstanceId;
  await A.click('#buckets .item-tile[data-id="' + wishWeapon + '"]');
  const wTrait = await A.$$eval("#item-dialog .perk-col", cs => cs.map(c => c.querySelector(".perk-dot.sel").getAttribute("title")).slice(-2)[0]);
  await A.click("#wish-add"); await A.waitForSelector(".wish-col", { timeout: 30000 }); await A.click('[data-wish-perk="' + wTrait + '"]'); await A.click("#wish-save"); await A.keyboard.press("Escape"); await A.waitForTimeout(2000);
  await comeBack(B);
  check("sync: wish lists reach the other device", await B.evaluate(id => /matches your wish list/.test(document.querySelector('#buckets .item-tile[data-id="' + id + '"]').getAttribute("aria-label")), wishWeapon));
  check("sync: and the PvP mark", await B.evaluate(id => /for PvP/.test(document.querySelector('#buckets .item-tile[data-id="' + id + '"]').getAttribute("aria-label")), item));
  await A.click("#tab-gear"); await A.click('#buckets .item-tile[data-id="' + item + '"]'); await A.fill("#item-note", "synced note"); await A.click("#note-form [type=submit]"); await A.keyboard.press("Escape"); await A.waitForTimeout(2000);
  await comeBack(B);
  check("sync: notes reach the other device", await B.evaluate(id => /note: synced note/.test(document.querySelector('#buckets .item-tile[data-id="' + id + '"]').getAttribute("aria-label")), item));
  // Both change at once: B deletes the loadout, A saves another.
  await B.click('[data-lo-pick^="r-"]'); const del = B.locator("[data-lo-del]").first(); await del.click(); await del.click(); await B.waitForTimeout(2000);
  await A.click("#tab-loadouts"); await A.fill("#lo-name", "Second"); await A.click('[data-lo-save="' + TITAN + '"]'); await A.waitForTimeout(2200);
  const names = p => p.evaluate(() => [...document.querySelectorAll('[data-lo-pick^="r-"]')].map(x => x.textContent.trim().replace(/\s*\(.*$/, "")).sort().join());
  await comeBack(B);
  check("sync: a delete on one device and a save on the other both land", await names(A) === "Second" && await names(B) === "Second", (await names(A)) + " / " + (await names(B)));
  const secondId = (await A.getAttribute('[data-lo-pick^="r-"]', "data-lo-pick")).slice(2);
  if (!(await A.isVisible('[data-lo-rename="' + secondId + '"]'))) await A.click('[data-lo-pick="r-' + secondId + '"]');
  await A.click('[data-lo-rename="' + secondId + '"]'); await A.fill("#lo-rename-input", "Renamed"); await A.keyboard.press("Enter"); await A.waitForTimeout(2000);
  await comeBack(B);
  check("sync: a rename reaches the other device", await names(B) === "Renamed", await names(B));
  await A.click("#lo-erase"); await A.click("#lo-erase"); await A.waitForTimeout(800);
  await comeBack(B);
  check("sync: Delete my saved loadouts and tags clears every device", !env.DB.rows.size && await names(B) === "" && await B.evaluate(id => !/tag-/.test(document.querySelector('#buckets .item-tile[data-id="' + id + '"]').className), item));
  check("sync: no script errors", !A.errors.length && !B.errors.length, A.errors.concat(B.errors).join("; "));
  await A.context_.close(); await B.context_.close();
});

// ---------- 7b. Share links ----------
await section("Share links", async () => {
  const env = { DB: fakeD1() };
  const A = await open({ real: true, env, hash: "#loadouts" });
  await A.context_.grantPermissions(["clipboard-read", "clipboard-write"]);
  await A.fill("#lo-name", "Raid share"); await A.click('[data-lo-save="' + TITAN + '"]');
  const loId = (await A.getAttribute('[data-lo-pick^="r-"]', "data-lo-pick")).slice(2);
  await A.click('[data-lo-share="' + loId + '"]'); await A.waitForSelector("#lo-share-url");
  const url = await A.inputValue("#lo-share-url");
  check("share links: Share makes a rallyflag link and copies it", /locker\.html\?share=[a-z0-9]{8}$/.test(url) && url.startsWith(BASE) && await A.evaluate(() => navigator.clipboard.readText()) === url && /Link copied/.test(await toastText(A)), url);
  await shot(A, "share-box");
  await A.waitForTimeout(800);
  check("share links: Delete my share links shows with the count", /made 1 share link\./.test(await A.textContent("#view-loadouts")) && await A.isVisible("#lo-shares-del"));
  // Signed out: a preview with names, and a sign-in that comes back here.
  const C = await open({ signedOut: true, env, url });
  await C.waitForSelector(".share-items li", { timeout: 30000 }); await C.waitForTimeout(500);
  const names = await C.$$eval(".share-items b", b => b.map(x => x.textContent));
  check("share links: signed out, the link shows what's in it", /Raid share/.test(await C.textContent(".share-title")) && names.length >= 8 && names.every(n => n && n !== "Item") && /Sign in to import/.test(await C.textContent("#locker-status")), names.join(", "));
  check("share links: the preview has no script errors", !C.errors.length, C.errors.join("; "));
  let v = await axe(C); check("share links: the preview passes axe", !v.length, v.join(", "));
  await shot(C, "share-preview-1280");
  await C.setViewportSize({ width: 390, height: 844 }); await C.waitForTimeout(300);
  v = await axe(C); check("share links: the preview passes axe on a phone", !v.length && await C.evaluate(() => document.documentElement.scrollWidth <= innerWidth), v.join(", "));
  await shot(C, "share-preview-390");
  await C.context_.close();
  // Signed in: Choose your copies first, then it's saved as your own.
  const B = await open({ real: true, env, url });
  check("share links: signed in, the link opens Choose your copies", await B.isVisible("#lo-h-review") && /Someone shared this loadout/.test(await B.textContent(".lo-review")) && await B.locator(".pick-slot").count() === 8 && !/share=/.test(await B.evaluate(() => location.search)));
  await B.click("#lo-review-save");
  const got = await B.evaluate(() => JSON.parse(localStorage.getItem("rallyflag_locker_loadouts:4611686018400000000")).find(x => x.id.startsWith("share-")));
  check("share links: saving keeps your own copies", got && got.name === "Raid share" && got.items.length === 8 && got.items.every(x => x.id) && /From a share link/.test(await B.textContent("#view-loadouts")), JSON.stringify(got && got.items.slice(0, 2)));
  // The note says what deleting means; Escape keeps them.
  await A.click("#lo-shares-del");
  const note = await A.textContent(".lo-confirm");
  check("share links: deleting asks first and says what it means", await A.evaluate(() => document.activeElement.id === "lo-h-shares") && await A.locator(".lo-confirm li").count() === 4 &&
    /stops working, for everyone/.test(note) && /already imported .* stay in their Locker/.test(note) && /saved loadouts, tags and in-game loadouts aren't touched/.test(note) && /can't be undone/.test(note), note);
  v = await axe(A); check("share links: the share box and delete note pass axe", !v.length, v.join(", "));
  await shot(A, "share-confirm");
  await A.keyboard.press("Escape");
  check("share links: Escape keeps them", env.DB.shares.size === 1 && !(await A.locator(".lo-confirm").count()) && await A.evaluate(() => document.activeElement.id === "lo-shares-del"));
  await A.click("#lo-shares-del"); await A.click("#lo-shares-go"); await A.waitForTimeout(600);
  check("share links: Delete removes them; your loadouts stay", env.DB.shares.size === 0 && /Deleted 1 share link/.test(await toastText(A)) && await A.locator('[data-lo-pick="r-' + loId + '"]').count() === 1 && !(await A.locator("#lo-shares-del").count()));
  const D = await open({ signedOut: true, env, url });
  await D.waitForFunction(() => /deleted/.test(document.getElementById("locker-status").textContent), null, { timeout: 15000 });
  check("share links: a deleted link says so", true);
  await D.context_.close();
  check("share links: no script errors", !A.errors.length && !B.errors.length, A.errors.concat(B.errors).join("; "));
  await A.context_.close(); await B.context_.close();
});

// ---------- 8. Bungie maintenance ----------
await section("Maintenance", async () => {
  const p = await open({ real: true, down: true });
  await p.waitForTimeout(2500);
  check("maintenance: the Locker explains instead of hanging", /down for maintenance/.test(await p.textContent("#locker-status")), await p.textContent("#locker-status"));
  check("maintenance: the site-wide notice shows", await p.locator("#bungie-maintenance").count() === 1);
  await p.context_.close();
});

await browser.close();
const failed = results.filter(r => !r.ok);
console.log("\n" + (results.length - failed.length) + "/" + results.length + " Locker checks passed");
process.exit(failed.length ? 1 : 0);
