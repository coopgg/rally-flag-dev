/* ============================================================
   Rally Flag loadout sync (Cloudflare Worker + D1).

   Keeps each player's Locker loadouts and Favorite/Junk tags on
   Cloudflare so they survive clearing site data and follow them to other
   devices, like DIM's sync.

   GET  /loadouts/<destinyMembershipId>
        → 200 { version, loadouts: [...], deleted: { id: at }, tags: { itemId: { t, at } } }
          (version 0 and empty lists when nothing is stored yet)
   PUT  /loadouts/<destinyMembershipId>   body { base, loadouts, deleted, tags }
        → 200 { version }                 saved
        → 409 { version, loadouts, deleted, tags }  someone else saved first:
          merge with this copy and PUT again with its version as base
   DELETE /loadouts/<destinyMembershipId>
        → 200 { version: 0 }   the account's row is removed entirely
          (devices that synced before see version 0 and clear theirs)

   Share links (locker.html?share=<id>):
   POST   /shares/<destinyMembershipId>  body { loadout }
        → 200 { id }   a short id for a copy of that one loadout (sharing
          the same loadout again gives the same id)
   GET    /shares/<destinyMembershipId>  → 200 { count }  how many links you have
   DELETE /shares/<destinyMembershipId>  → 200 { deleted } every link you made stops working
   GET    /share/<id>   (no sign-in) → 200 { loadout, created } or 404
   A share holds the loadout only: name, class, item hashes and plug
   choices (no item instance ids). Its owner column is a SHA-256 of the
   account id, only so "Delete my share links" can find them; it is never
   sent back.

   Every request carries the player's Bungie sign-in:
     Authorization: Bearer <Bungie access token>
   The worker asks Bungie which account that token belongs to (one
   GetMembershipsForCurrentUser call, remembered for 10 minutes under a
   hash of the token) and only lets it read or write that account's
   Destiny memberships. The token itself is never stored or logged.

   Setup (Cloudflare dashboard): see README.md next to this file.
   Bindings: D1 database as DB. No secrets: the Bungie API keys below
   are the site's public ones (assets/api-keys.js), picked by Origin,
   because Bungie only accepts a token with its own app's key.
   ============================================================ */
const SITES = {
  "https://coopgg.github.io": "910ddacf41f646a68fefdeb315f1c800",
  "https://rallyflag.gg": "6299b9c9d3124d83ac607b10dd582eb7",
  "https://www.rallyflag.gg": "6299b9c9d3124d83ac607b10dd582eb7"
};
// Bungie checks the Origin against the app's registered site.
const BUNGIE_ORIGIN = { "https://www.rallyflag.gg": "https://rallyflag.gg" };
const MAX_BYTES = 256 * 1024;  // a few hundred loadouts; stops abuse
const SHARE_MAX_BYTES = 16 * 1024;
const SHARE_MAX_PER_ACCOUNT = 200;
// No 0/o/1/l/i: ids get read aloud and typed.
const SHARE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const AUTH_CACHE_SECONDS = 600;

function cors(origin){
  return SITES[origin] ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  } : { "Vary": "Origin" };
}
function reply(body, status, origin){
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors(origin) } });
}

// Bearer token -> the Destiny membership ids it may use, or null.
async function membershipsFor(token, origin){
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  const cacheKey = new Request("https://rallyflag-sync.internal/auth/" + hex);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit.json();
  const res = await fetch("https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/", {
    headers: { "Authorization": "Bearer " + token, "X-API-Key": SITES[origin], "Origin": BUNGIE_ORIGIN[origin] || origin }
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || data.ErrorCode !== 1 || !data.Response) return null;
  const ids = (data.Response.destinyMemberships || []).map(m => String(m.membershipId));
  await cache.put(cacheKey, new Response(JSON.stringify(ids), { headers: { "Cache-Control": "max-age=" + AUTH_CACHE_SECONDS } }));
  return ids;
}

async function sha256(text){
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const shareOwner = id => sha256("rallyflag-share:" + id);
function newShareId(){
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map(b => SHARE_ALPHABET[b % SHARE_ALPHABET.length]).join("");
}
// Keep only what a loadout is made of, as numbers, so a share can't carry
// anything else (instance ids, notes, the DIM link it came from).
const isHash = h => Number.isInteger(h) && h > 0 && h < 2 ** 32;
function plugMap(o){
  const out = {};
  if (o && typeof o === "object" && !Array.isArray(o)) for (const k in o) if (/^\d{1,2}$/.test(k) && isHash(o[k])) out[k] = o[k];
  return out;
}
function cleanLoadout(lo){
  if (!lo || typeof lo !== "object" || !Array.isArray(lo.items)) return null;
  const items = lo.items.filter(x => x && isHash(x.hash)).slice(0, 20).map(x => ({ hash: x.hash }));
  if (!items.length) return null;
  const part = p => p && isHash(p.hash) ? { hash: p.hash, sockets: plugMap(p.sockets) } : null;
  const cosmetics = {};
  if (lo.cosmetics && typeof lo.cosmetics === "object") for (const b in lo.cosmetics)
    if (/^\d{1,10}$/.test(b) && Array.isArray(lo.cosmetics[b])) cosmetics[b] = lo.cosmetics[b].filter(isHash).slice(0, 10);
  return {
    name: String(lo.name || "Shared loadout").slice(0, 60),
    cls: [0, 1, 2, 3].includes(lo.cls) ? lo.cls : 3,
    items, subclass: part(lo.subclass), artifact: part(lo.artifact),
    mods: Array.isArray(lo.mods) ? lo.mods.filter(isHash).slice(0, 60) : [],
    cosmetics
  };
}

async function readRow(db, id){
  const row = await db.prepare("SELECT data, version FROM loadouts WHERE membership_id = ?").bind(id).first();
  if (!row) return { version: 0, loadouts: [], deleted: {}, tags: {} };
  const data = JSON.parse(row.data);
  return { version: row.version, loadouts: data.loadouts || [], deleted: data.deleted || {}, tags: data.tags || {} };
}

// One account's share links: make one, count them, or delete them all.
async function shares(request, env, id, origin){
  try {
    const owner = await shareOwner(id);
    if (request.method === "GET"){
      const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM shares WHERE owner = ?").bind(owner).first();
      return reply({ count: row ? row.n : 0 }, 200, origin);
    }
    if (request.method === "DELETE"){
      const result = await env.DB.prepare("DELETE FROM shares WHERE owner = ?").bind(owner).run();
      return reply({ deleted: (result.meta && result.meta.changes) || 0 }, 200, origin);
    }
    if (request.method !== "POST") return reply({ error: "Use GET, POST or DELETE." }, 405, origin);
    const text = await request.text();
    if (text.length > SHARE_MAX_BYTES) return reply({ error: "That loadout is too big to share." }, 413, origin);
    let body;
    try { body = JSON.parse(text); } catch (e){ return reply({ error: "Bad request." }, 400, origin); }
    const lo = cleanLoadout(body && body.loadout);
    if (!lo) return reply({ error: "That loadout has no weapons or armor to share." }, 400, origin);
    const data = JSON.stringify(lo);
    // The same loadout shared again keeps its link.
    const same = await env.DB.prepare("SELECT id FROM shares WHERE owner = ? AND data = ?").bind(owner, data).first();
    if (same) return reply({ id: same.id }, 200, origin);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM shares WHERE owner = ?").bind(owner).first();
    if (count && count.n >= SHARE_MAX_PER_ACCOUNT) return reply({ error: "You have " + SHARE_MAX_PER_ACCOUNT + " share links, the most there can be. Delete your share links to make new ones." }, 429, origin);
    for (let tries = 0; tries < 4; tries++){
      const shareId = newShareId();
      const result = await env.DB.prepare("INSERT INTO shares (id, owner, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(shareId, owner, data, Date.now()).run();
      if (result.meta && result.meta.changes) return reply({ id: shareId }, 200, origin);
    }
    return reply({ error: "Couldn't make a link. Try again." }, 500, origin);
  } catch (e){
    return reply({ error: "Sharing failed on our side. Try again in a moment." }, 500, origin);
  }
}

export default {
  async fetch(request, env){
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (!SITES[origin]) return reply({ error: "This service is only for Rally Flag." }, 403, origin);

    const pathname = new URL(request.url).pathname;
    // Opening a share link needs no sign-in.
    const open = pathname.match(/^\/share\/([a-z0-9]{4,16})\/?$/);
    if (open){
      if (request.method !== "GET") return reply({ error: "Use GET." }, 405, origin);
      try {
        const row = await env.DB.prepare("SELECT data, created_at FROM shares WHERE id = ?").bind(open[1]).first();
        if (!row) return reply({ error: "This share link was deleted, or it was never made." }, 404, origin);
        return reply({ loadout: JSON.parse(row.data), created: row.created_at }, 200, origin);
      } catch (e){ return reply({ error: "Couldn't read that share link. Try again in a moment." }, 500, origin); }
    }
    const m = pathname.match(/^\/(loadouts|shares)\/(\d{1,20})\/?$/);
    if (!m) return reply({ error: "Not found." }, 404, origin);
    const id = m[2];

    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Sign in with Bungie.net first." }, 401, origin);
    let ids;
    try { ids = await membershipsFor(token, origin); } catch (e){ return reply({ error: "Couldn't reach Bungie to check your sign-in." }, 502, origin); }
    if (!ids) return reply({ error: "Bungie didn't accept your sign-in. Sign in again." }, 401, origin);
    if (!ids.includes(id)) return reply({ error: "That isn't your account." }, 403, origin);

    if (m[1] === "shares") return shares(request, env, id, origin);
    try {
      if (request.method === "GET") return reply(await readRow(env.DB, id), 200, origin);
      if (request.method === "DELETE"){
        await env.DB.prepare("DELETE FROM loadouts WHERE membership_id = ?").bind(id).run();
        return reply({ version: 0 }, 200, origin);
      }
      if (request.method !== "PUT") return reply({ error: "Use GET, PUT or DELETE." }, 405, origin);

      const text = await request.text();
      if (text.length > MAX_BYTES) return reply({ error: "Too many loadouts to save." }, 413, origin);
      let body;
      try { body = JSON.parse(text); } catch (e){ return reply({ error: "Bad request." }, 400, origin); }
      if (!body || !Array.isArray(body.loadouts) || typeof body.deleted !== "object" || typeof body.base !== "number" ||
          (body.tags != null && (typeof body.tags !== "object" || Array.isArray(body.tags))))
        return reply({ error: "Bad request." }, 400, origin);

      // Only save on top of the version the client last saw; otherwise
      // hand back the newer copy to merge with.
      const data = JSON.stringify({ loadouts: body.loadouts, deleted: body.deleted || {}, tags: body.tags || {} });
      const next = body.base + 1, now = Date.now();
      const result = body.base === 0
        ? await env.DB.prepare("INSERT INTO loadouts (membership_id, data, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(membership_id) DO NOTHING").bind(id, data, now).run()
        : await env.DB.prepare("UPDATE loadouts SET data = ?, version = ?, updated_at = ? WHERE membership_id = ? AND version = ?").bind(data, next, now, id, body.base).run();
      if (!result.meta || !result.meta.changes) return reply(await readRow(env.DB, id), 409, origin);
      return reply({ version: next }, 200, origin);
    } catch (e){
      return reply({ error: "Saving failed on our side. Try again in a moment." }, 500, origin);
    }
  }
};
