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
const [TITAN] = DEMO.profile.data.characterIds;
const MAINT = { ErrorCode: 5, ThrottleSeconds: 0, ErrorStatus: "SystemDisabled", Message: "This system is temporarily disabled for maintenance.", MessageData: {} };

// ---------- results ----------
const results = [];
function check(name, ok, detail){ results.push({ name, ok: !!ok, detail }); console.log((ok ? "✅ " : "❌ ") + name + (ok || detail == null ? "" : " — " + detail)); }
async function section(name, fn){
  try { await fn(); } catch (e){ check(name + " ran to the end", false, e.message.split("\n")[0]); }
}

// ---------- the workers, in-process ----------
// The workers are ES modules with `export default`; load them from source.
const loadWorker = async file => (await import("data:text/javascript," + encodeURIComponent(fs.readFileSync(path.join(ROOT, file), "utf8")))).default;
function fakeD1(){
  const rows = new Map();
  return { rows, prepare(sql){ return { bind(...a){ return {
    async first(){ const r = rows.get(a[0]); return r ? { data: r.data, version: r.version } : null; },
    async run(){
      if (/^INSERT/.test(sql)){ if (rows.has(a[0])) return { meta: { changes: 0 } }; rows.set(a[0], { data: a[1], version: 1 }); return { meta: { changes: 1 } }; }
      if (/^UPDATE/.test(sql)){ const [data, next, , id, base] = a; const r = rows.get(id); if (!r || r.version !== base) return { meta: { changes: 0 } }; rows.set(id, { data, version: next }); return { meta: { changes: 1 } }; }
      if (/^DELETE/.test(sql)) return { meta: { changes: rows.delete(a[0]) ? 1 : 0 } };
      throw new Error("unexpected SQL: " + sql);
    } }; } }; } };
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
    await context.route("https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/", r => r.fulfill(opts.down ? maint() : json({ ErrorCode: 1, Response: { destinyMemberships: [{ membershipType: 3, membershipId: MEMBER }] } })));
    await context.route(new RegExp("/Profile/" + MEMBER + "/\\?components"), r => {
      if (opts.down) return r.fulfill(maint());
      const p = JSON.parse(JSON.stringify(DEMO)); p.responseMintedTimestamp = new Date(Date.now() - 600000).toISOString();
      r.fulfill(json({ ErrorCode: 1, Response: p }));
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
  await page.goto(BASE + "locker.html" + (opts.real ? "" : "?demo") + (opts.hash || ""));
  if (!opts.down) await page.waitForSelector("#locker-app:not([hidden])", { timeout: 90000 });
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
  check("gear: no script errors", !p.errors.length, p.errors.join("; "));
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
  await A.click("#tab-gear"); await A.click('#buckets .item-tile[data-id="' + item + '"]'); await A.click('#item-dialog [data-tag="favorite"]'); await A.keyboard.press("Escape"); await A.waitForTimeout(2000);
  check("sync: saves reach the service", env.DB.rows.has(MEMBER) && /Synced/.test(env.DB.rows.get(MEMBER).data));
  const B = await open({ real: true, env, hash: "#loadouts" });
  check("sync: a fresh browser gets the loadout", /Synced/.test(await B.textContent("#view-loadouts")));
  check("sync: and the tag", await B.evaluate(id => /tag-favorite/.test(document.querySelector('#buckets .item-tile[data-id="' + id + '"]').className), item));
  // Both change at once: B deletes the loadout, A saves another.
  await B.click('[data-lo-pick^="r-"]'); const del = B.locator("[data-lo-del]").first(); await del.click(); await del.click(); await B.waitForTimeout(2000);
  await A.click("#tab-loadouts"); await A.fill("#lo-name", "Second"); await A.click('[data-lo-save="' + TITAN + '"]'); await A.waitForTimeout(2200);
  const names = p => p.evaluate(() => [...document.querySelectorAll('[data-lo-pick^="r-"]')].map(x => x.textContent.trim().replace(/\s*\(.*$/, "")).sort().join());
  await comeBack(B);
  check("sync: a delete on one device and a save on the other both land", await names(A) === "Second" && await names(B) === "Second", (await names(A)) + " / " + (await names(B)));
  await A.click("#lo-erase"); await A.click("#lo-erase"); await A.waitForTimeout(800);
  await comeBack(B);
  check("sync: Delete my saved loadouts and tags clears every device", !env.DB.rows.size && await names(B) === "" && await B.evaluate(id => !/tag-/.test(document.querySelector('#buckets .item-tile[data-id="' + id + '"]').className), item));
  check("sync: no script errors", !A.errors.length && !B.errors.length, A.errors.concat(B.errors).join("; "));
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
