#!/usr/bin/env node
/* ============================================================
   Tells IndexNow (Bing, Yandex, Seznam, Naver…; Bing feeds ChatGPT
   search and Copilot) which rallyflag.gg pages changed, so they're
   re-crawled in hours instead of weeks.

   The key file (a4e3706e8626fed14b3a824b7d612ef2.txt at the site root) proves the site is ours;
   it ships to prod with the rest of the site. Run AFTER a promotion is
   live on rallyflag.gg (the key file must be reachable), from dev:
     node tools/indexnow.js <last-synced-dev-sha> <promoted-dev-sha>
     node tools/indexnow.js --all     every URL in sitemap.xml
     add --dry-run to print the URLs without sending them
   Only public pages count: dev-only files are left out, index.html is
   the root URL, and anything not in sitemap.xml isn't sent.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://rallyflag.gg/";
const KEY = "a4e3706e8626fed14b3a824b7d612ef2";
const args = process.argv.slice(2), DRY = args.includes("--dry-run");

const sitemap = new Set([...fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
let urls;
if (args.includes("--all")) urls = [...sitemap];
else {
  const [from, to] = args.filter(a => !a.startsWith("--"));
  if (!from || !to) { console.error("usage: node tools/indexnow.js <from-sha> <to-sha> | --all  [--dry-run]"); process.exit(2); }
  const changed = execFileSync("git", ["-C", ROOT, "diff", "--name-only", from, to], { encoding: "utf8" }).split("\n").filter(Boolean);
  // A changed data file changes the pages that show it; a changed shared
  // asset (theme.css, nav.js) changes every page, but that's a re-style,
  // not new content, so only pages whose own file changed are sent.
  urls = [...new Set(changed.filter(f => /^[^/]+\.html$/.test(f)).map(f => SITE + (f === "index.html" ? "" : f)))].filter(u => sitemap.has(u));
}
if (!urls.length) { console.log("No public pages changed: nothing to send."); process.exit(0); }
console.log(urls.length + " URL(s):\n  " + urls.join("\n  "));
if (DRY) process.exit(0);

(async () => {
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: "rallyflag.gg", key: KEY, keyLocation: SITE + KEY + ".txt", urlList: urls.slice(0, 10000) })
  });
  // 200 OK and 202 Accepted are both success; 403 = key file not found yet (promote first).
  console.log("IndexNow answered " + res.status + (res.status === 200 || res.status === 202 ? " (accepted)" : res.status === 403 ? " (key file not reachable on rallyflag.gg yet: promote first)" : ": " + (await res.text()).slice(0, 200)));
  if (!(res.status === 200 || res.status === 202)) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });
