/* ============================================================
   Rally Flag DIM relay (Cloudflare Worker).

   Browsers can't read dim.gg from our pages (no CORS headers), so this
   fetches a shared loadout page server-side and returns the loadout JSON
   that DIM puts in its "Open in DIM" link.

   GET /?id=hneqrla   (or ?url=https://dim.gg/hneqrla/Any-Name)
   → 200 { id, name, classType, equipped, unequipped, parameters, … }
   → 400 bad id, 404 no such loadout, 502 dim.gg changed or is down

   Only dim.gg share ids are fetched (not an open proxy), only our sites
   get CORS, and answers are cached for 10 minutes.
   ============================================================ */
const ALLOWED_ORIGINS = ["https://rallyflag.gg", "https://www.rallyflag.gg", "https://coopgg.github.io"];
const CACHE_SECONDS = 600;

function cors(origin){
  return ALLOWED_ORIGINS.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS", "Vary": "Origin" }
    : { "Vary": "Origin" };
}
function reply(body, status, origin){
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": status === 200 ? "public, max-age=" + CACHE_SECONDS : "no-store",
    ...cors(origin)
  } });
}
// "hneqrla", "dim.gg/hneqrla/Name" or "https://dim.gg/hneqrla/Name" -> "hneqrla"
function shareId(params){
  const raw = (params.get("id") || params.get("url") || "").trim();
  const m = raw.match(/^(?:https?:\/\/)?(?:www\.)?dim\.gg\/([a-z0-9]+)/i) || raw.match(/^([a-z0-9]+)$/i);
  return m && m[1].length >= 5 && m[1].length <= 16 ? m[1].toLowerCase() : null;
}

export default {
  async fetch(request){
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "GET") return reply({ error: "Use GET." }, 405, origin);

    const id = shareId(new URL(request.url).searchParams);
    if (!id) return reply({ error: "That isn't a dim.gg loadout link." }, 400, origin);

    let res;
    try {
      res = await fetch("https://dim.gg/" + id + "/loadout", { headers: { "User-Agent": "RallyFlag-DIM-relay (+https://rallyflag.gg)" }, cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true } });
    } catch (e){ return reply({ error: "Couldn't reach dim.gg." }, 502, origin); }
    if (res.status === 404) return reply({ error: "DIM has no loadout with that link." }, 404, origin);
    if (!res.ok) return reply({ error: "dim.gg answered " + res.status + "." }, 502, origin);

    // The page's "Open in DIM" button: ...loadouts?loadout=<URL-encoded JSON>"
    const html = await res.text();
    const m = html.match(/[?&]loadout=([^"'&<>\s]+)/);
    if (!m) return reply({ error: "DIM has no loadout with that link." }, 404, origin);
    let loadout;
    try {
      const text = decodeURIComponent(m[1].replace(/&amp;/g, "&").replace(/\+/g, " "));
      loadout = JSON.parse(text);
    } catch (e){ return reply({ error: "Couldn't read that loadout (dim.gg may have changed)." }, 502, origin); }
    if (!loadout || !Array.isArray(loadout.equipped)) return reply({ error: "Couldn't read that loadout (dim.gg may have changed)." }, 502, origin);
    return reply(loadout, 200, origin);
  }
};
