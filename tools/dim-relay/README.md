# DIM relay (Cloudflare Worker)

Browsers can't read dim.gg from our pages (dim.gg sends no CORS headers), so
the Locker asks this worker instead. It fetches the dim.gg share page
server-side and returns the loadout JSON from its "Open in DIM" link.

    GET https://<worker>.workers.dev/?id=hneqrla
    GET https://<worker>.workers.dev/?url=https://dim.gg/hneqrla/Any-Name

Only dim.gg share ids are fetched, CORS is only sent to rallyflag.gg,
www.rallyflag.gg and coopgg.github.io (`ALLOWED_ORIGINS`), and answers are
cached for 10 minutes. No secrets, no storage.

Deploy: Cloudflare dashboard → Workers & Pages → Create → Worker
("Hello World"), name it, Deploy, then Edit code, paste `worker.js` over
everything, Deploy. Test: open `https://<worker>.workers.dev/?id=hneqrla`.

If dim.gg changes its page and the worker starts answering 502, check what
the page's "Open in DIM" link looks like now and adjust the match in
`worker.js`.
