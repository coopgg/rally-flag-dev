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
const AUTH_CACHE_SECONDS = 600;

function cors(origin){
  return SITES[origin] ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
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

async function readRow(db, id){
  const row = await db.prepare("SELECT data, version FROM loadouts WHERE membership_id = ?").bind(id).first();
  if (!row) return { version: 0, loadouts: [], deleted: {}, tags: {} };
  const data = JSON.parse(row.data);
  return { version: row.version, loadouts: data.loadouts || [], deleted: data.deleted || {}, tags: data.tags || {} };
}

export default {
  async fetch(request, env){
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (!SITES[origin]) return reply({ error: "This service is only for Rally Flag." }, 403, origin);

    const m = new URL(request.url).pathname.match(/^\/loadouts\/(\d{1,20})\/?$/);
    if (!m) return reply({ error: "Not found." }, 404, origin);
    const id = m[1];

    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Sign in with Bungie.net first." }, 401, origin);
    let ids;
    try { ids = await membershipsFor(token, origin); } catch (e){ return reply({ error: "Couldn't reach Bungie to check your sign-in." }, 502, origin); }
    if (!ids) return reply({ error: "Bungie didn't accept your sign-in. Sign in again." }, 401, origin);
    if (!ids.includes(id)) return reply({ error: "That isn't your account." }, 403, origin);

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
