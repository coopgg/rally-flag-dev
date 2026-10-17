#!/usr/bin/env node
/* ============================================================
   Rally Flag site checks (dev-only; see tests/README.md).

   Serves the working tree *at the dev origin* (the Bungie API key is
   origin-locked, so live data only works there) and loads every public
   page in headless Chromium at desktop/phone × dark/light, checking:
     - no script errors
     - no axe-core violations (WCAG 2.0/2.1/2.2 A+AA, best practices)
     - no sideways scroll
     - no broken images (any image answered 4xx/5xx, or a local one
       that fails to decode)
     - no visible text under 12px
     - layout shift (CLS) under 0.1 (dark mode, desktop + phone)
   all with the Arc theme; with THEMES=1, also every other theme ×
   dark/light (desktop):
     - no colour-contrast problems (axe color-contrast + link-in-text-block)
   plus, once:
     - generated guide pages are up to date (tools/build-guide-pages.js --check)
     - every page's inline boot script matches tools/boot-script.js
     - each guide page's raw HTML (what link previews see) has its own
       title, image and canonical
     - old raid-guide.html?slug= / dungeon-guide.html?slug= links forward
     - every internal .html link on every page points at a real file

   Usage (from tests/):  npm ci && npm run check
   THEMES=1 adds the theme pass (~6 more minutes).
   LIVE_URL=https://rallyflag.gg/ checks the live site instead of this
   working tree: pages come from its sitemap, links are checked over
   HTTP, and the file-only checks (generated pages, boot script) are
   skipped. The daily workflow runs LIVE_URL + THEMES.
   Exit code 1 on any failure. Writes a summary to $GITHUB_STEP_SUMMARY
   when set (GitHub Actions).
   ============================================================ */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium, request } = require("playwright");

// SITE_ROOT=/path/to/rally-flag checks the prod clone before a promotion.
const ROOT = path.resolve(process.env.SITE_ROOT || path.join(__dirname, ".."));
const LIVE = process.env.LIVE_URL ? process.env.LIVE_URL.replace(/\/?$/, "/") : null;
const BASE = LIVE || "https://coopgg.github.io/rally-flag-dev/";
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain" };

// Dev-only tools and pages that need OAuth parameters aren't public pages.
const SKIP = new Set(["debug.html", "api-debug.html", "xur-debug.html", "clan-admin.html", "oauth-callback.html"]);
let pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html") && !SKIP.has(f)).sort();
pages.push("no/such/page"); // served by 404.html, like GitHub Pages

// Live-mode HTTP requests (honours HTTPS_PROXY, unlike Node's fetch).
let http = null;
async function httpGet(url, method = "get"){
  if (!http) http = await request.newContext(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  return http[method](url, { failOnStatusCode: false });
}

// The live site's own page list: its sitemap (the root URL is index.html).
async function livePages(){
  const res = await httpGet(BASE + "sitemap.xml");
  if (!res.ok()) throw new Error("sitemap.xml: HTTP " + res.status());
  const urls = [...(await res.text()).matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);
  const list = urls.map(u => u.replace(/^https?:\/\/[^/]+\//, "") || "index.html");
  return [...new Set(list)].sort().concat("no/such/page");
}
const GUIDE_RE = /^(raid|dungeon)-(?!guide\.html$).+\.html$/;

const COMBOS = [
  { name: "desktop dark", width: 1280, height: 900, mode: "dark" },
  { name: "desktop light", width: 1280, height: 900, mode: "light" },
  { name: "phone dark", width: 390, height: 844, mode: "dark" },
  { name: "phone light", width: 390, height: 844, mode: "light" }
];

// Arc gets the full check above; the theme pass covers the rest. Keep in
// sync with THEMES in assets/nav.js (the run fails if a theme is missing).
const OTHER_THEMES = ["solar", "void", "stasis", "strand", "prismatic", "cosmic", "aurora", "eclipse"];

const failures = [];
const results = [];
function record(check, ok, detail){
  results.push({ check, ok, detail });
  if (!ok) failures.push(check + (detail ? ": " + detail : ""));
  console.log((ok ? "✅ " : "❌ ") + check + (detail ? " — " + detail : ""));
}

function serveFrom(context){
  return context.route(BASE + "**", route => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace("/rally-flag-dev/", "")) || "index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){
      return route.fulfill({ status: 404, contentType: "text/html", body: fs.readFileSync(path.join(ROOT, "404.html")) });
    }
    route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
  });
}

async function newContext(browser, combo, opts = {}){
  const context = await browser.newContext({ viewport: { width: combo.width, height: combo.height }, serviceWorkers: "block", ...opts });
  await context.addInitScript(([mode, theme]) => {
    try { localStorage.setItem("rallyflag_theme", theme); localStorage.setItem("rallyflag_mode_pref", mode); } catch (e) {}
    // Layout shift since navigation start, read back after the page settles.
    window.__cls = 0;
    try {
      new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
        .observe({ type: "layout-shift", buffered: true });
    } catch (e) {}
  }, [combo.mode, combo.theme || "arc"]);
  await context.route(/twitch\.tv|twitch\.com/, r => r.abort());
  if (!LIVE) await serveFrom(context);
  return context;
}

async function settle(page){
  await page.waitForFunction(() => !document.documentElement.classList.contains("rf-boot"), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function checkCombo(browser, combo, linkSink){
  const context = await newContext(browser, combo);
  const page = await context.newPage();
  let errors = [], badImages = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => { if (r.request().resourceType() === "image" && r.status() >= 400) badImages.push(r.status() + " " + r.url()); });

  const problems = { errors: [], axe: [], hscroll: [], images: [], small: [], cls: [] };
  for (const pg of pages){
    errors = []; badImages = [];
    // Don't wait on the full "load" event: one slow third-party image or
    // font (Bungie, Google Fonts) can stall it past the timeout on a CI
    // runner. The page's own content is ready at DOMContentLoaded plus the
    // .rf-boot reveal; retry once, and report a page that still won't load
    // instead of aborting the whole run.
    let loaded = false;
    for (let attempt = 0; attempt < 2 && !loaded; attempt++){
      try { await page.goto(BASE + pg, { waitUntil: "domcontentloaded", timeout: 30000 }); loaded = true; }
      catch (e){ if (attempt) problems.errors.push(pg + ": didn't load (" + e.message.split("\n")[0] + ")"); }
    }
    if (!loaded) continue;
    await settle(page);
    const cls = await page.evaluate(() => window.__cls);
    // Scroll through so lazy images load, then come back.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
      scrollTo(0, 0);
    });
    await page.waitForTimeout(600);

    const info = await page.evaluate(() => {
      const hscroll = document.documentElement.scrollWidth - innerWidth;
      const broken = [...document.images].filter(i => i.src.startsWith(location.origin) && i.complete && i.naturalWidth === 0).map(i => i.src);
      let small = null;
      const walker = document.createTreeWalker(document.querySelector("main") || document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode());){
        const el = n.parentElement;
        if (!n.textContent.trim() || !el.offsetParent) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 12 && (!small || size < small.size)) small = { size, text: n.textContent.trim().slice(0, 30), cls: el.className };
      }
      const links = [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href"));
      return { hscroll, broken, small, links };
    });
    await page.addScriptTag({ content: AXE });
    const violations = await page.evaluate(async () =>
      (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] }))
        .violations.map(v => v.id + "×" + v.nodes.length + " (" + v.nodes.slice(0, 2).map(n => n.target.join(" ")).join("; ") + ")"));

    if (errors.length) problems.errors.push(pg + ": " + errors.join(" | "));
    if (violations.length) problems.axe.push(pg + ": " + violations.join(", "));
    if (info.hscroll > 0) problems.hscroll.push(pg + ": " + info.hscroll + "px");
    if (info.broken.length || badImages.length) problems.images.push(pg + ": " + [...info.broken, ...badImages].slice(0, 3).join(", "));
    if (info.small) problems.small.push(pg + ": " + info.small.size + "px \"" + info.small.text + "\" (." + info.small.cls + ")");
    if (combo.mode === "dark" && cls >= 0.1) problems.cls.push(pg + ": " + cls.toFixed(3));
    if (linkSink) info.links.forEach(h => linkSink.push([pg, h]));
  }
  await context.close();

  const n = pages.length;
  record(`[${combo.name}] no script errors (${n} pages)`, !problems.errors.length, problems.errors.join("; "));
  record(`[${combo.name}] no accessibility violations`, !problems.axe.length, problems.axe.join("; "));
  record(`[${combo.name}] no sideways scroll`, !problems.hscroll.length, problems.hscroll.join("; "));
  record(`[${combo.name}] no broken images`, !problems.images.length, problems.images.join("; "));
  record(`[${combo.name}] no text under 12px`, !problems.small.length, problems.small.join("; "));
  if (combo.mode === "dark") record(`[${combo.name}] layout shift under 0.1`, !problems.cls.length, problems.cls.join("; "));
}

// Theme colours only change colour, so this pass runs just axe's two colour
// rules, desktop only, four themes at a time.
async function checkThemes(browser){
  const navJs = LIVE ? await (await httpGet(BASE + "assets/nav.js")).text() : fs.readFileSync(path.join(ROOT, "assets", "nav.js"), "utf8");
  const declared = [];
  for (const m of navJs.matchAll(/const (?:SUBCLASS_)?THEMES = (?:SUBCLASS_THEMES\.concat\()?\[([^\]]*)\]/g))
    declared.push(...[...m[1].matchAll(/"([a-z]+)"/g)].map(x => x[1]));
  const untested = declared.filter(t => t !== "arc" && !OTHER_THEMES.includes(t));
  record(`every theme is covered (${declared.length} in nav.js)`, declared.length > 0 && !untested.length, untested.length ? "add to OTHER_THEMES: " + untested.join(", ") : "");

  const jobs = [];
  for (const theme of OTHER_THEMES) for (const mode of ["dark", "light"]) jobs.push({ theme, mode });
  const found = {};
  const worker = async () => {
    for (let job; (job = jobs.shift());){
      const context = await newContext(browser, { width: 1280, height: 900, mode: job.mode, theme: job.theme });
      const page = await context.newPage();
      for (const pg of pages){
        try { await page.goto(BASE + pg, { waitUntil: "domcontentloaded", timeout: 30000 }); }
        catch (e){ continue; } // load failures are reported by the main pass
        await settle(page);
        await page.addScriptTag({ content: AXE });
        const v = await page.evaluate(async () =>
          (await axe.run(document, { runOnly: ["color-contrast", "link-in-text-block"] }))
            .violations.map(v => v.id + "×" + v.nodes.length + " (" + v.nodes.slice(0, 2).map(n => n.target.join(" ")).join("; ") + ")"));
        if (v.length) (found[job.theme + " " + job.mode] ||= []).push(pg + ": " + v.join(", "));
      }
      await context.close();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (const theme of OTHER_THEMES) for (const mode of ["dark", "light"]){
    const list = found[theme + " " + mode] || [];
    record(`[${theme} ${mode}] no colour-contrast problems`, !list.length, list.join("; "));
  }
}

function checkGeneratedPages(){
  if (!fs.existsSync(path.join(ROOT, "tools", "build-guide-pages.js"))){
    console.log("·  generated-pages freshness skipped (no tools/ here; checked on dev)");
  } else try {
    execFileSync(process.execPath, [path.join(ROOT, "tools", "build-guide-pages.js"), "--check"], { stdio: "pipe" });
    record("generated guide pages are up to date", true);
  } catch (e){
    record("generated guide pages are up to date", false, String(e.stderr || e.message).trim().replace(/\s*\n\s*/g, "; "));
  }
  if (fs.existsSync(path.join(ROOT, "tools", "sync-boot-script.js"))) try {
    execFileSync(process.execPath, [path.join(ROOT, "tools", "sync-boot-script.js"), "--check"], { stdio: "pipe" });
    record("every page's boot script matches tools/boot-script.js", true);
  } catch (e){
    record("every page's boot script matches tools/boot-script.js", false, String(e.stderr || e.message).trim().replace(/\s*\n\s*/g, "; "));
  }
  // What a link-preview bot sees: the raw HTML, no JavaScript.
  const bad = [];
  const guides = fs.readdirSync(ROOT).filter(f => GUIDE_RE.test(f));
  for (const f of guides){
    const html = fs.readFileSync(path.join(ROOT, f), "utf8");
    const tag = k => (html.match(new RegExp('<meta property="' + k + '" content="([^"]*)"')) || [])[1] || "";
    const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
    const title = tag("og:title");
    if (!title || /^(Raid|Dungeon) Guide$/.test(title)) bad.push(f + ": generic og:title");
    if (/og-image\.png$/.test(tag("og:image")) && !/pantheon/.test(f)) bad.push(f + ": generic og:image");
    if (canonical !== "https://rallyflag.gg/" + f) bad.push(f + ": canonical " + canonical);
  }
  record(`each of the ${guides.length} guide pages has its own preview tags`, guides.length > 0 && !bad.length, bad.join("; "));
}

async function checkRedirects(browser){
  const context = await newContext(browser, COMBOS[0]);
  const page = await context.newPage();
  const cases = [
    ["raid-guide.html?slug=vault-of-glass#encounter-templar", "raid-vault-of-glass.html#encounter-templar"],
    ["dungeon-guide.html?slug=prophecy", "dungeon-prophecy.html"]
  ];
  const bad = [];
  for (const [from, to] of cases){
    await page.goto(BASE + from, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1000);
    if (page.url() !== BASE + to) bad.push(from + " → " + page.url().replace(BASE, "") + " (expected " + to + ")");
  }
  await page.goto(BASE + "raid-guide.html?slug=no-such-raid", { waitUntil: "domcontentloaded" }); await settle(page);
  const h1 = await page.textContent("h1");
  if (!/not found/i.test(h1)) bad.push("unknown slug shows \"" + h1 + "\" instead of \"Raid not found\"");
  await context.close();
  record("old ?slug= guide links forward to the right page", !bad.length, bad.join("; "));
}

async function checkLinks(links){
  const missing = new Set(), oldStyle = new Set(), status = new Map();
  for (const [from, href] of links){
    if (/^(https?:|mailto:|#|javascript:)/.test(href) || !/\.html/.test(href)) continue;
    const file = href.split("#")[0].split("?")[0];
    if (/(raid|dungeon)-guide\.html\?slug=/.test(href)) oldStyle.add(from + " → " + href);
    if (LIVE){
      // Every page lives at the root (404.html sets <base> to it).
      const url = new URL(file, BASE).href;
      if (!status.has(url)) status.set(url, await httpGet(url, "head").then(r => r.status(), e => e.message.split("\n")[0]));
      if (status.get(url) !== 200) missing.add(from + " → " + href + " (" + status.get(url) + ")");
      continue;
    }
    // On the prod clone, nav.js's Debug entry still renders (we serve it at
    // the dev host); on rallyflag.gg it's hidden, so dev-only pages are fine.
    if (process.env.SITE_ROOT && SKIP.has(file)) continue;
    if (!fs.existsSync(path.join(ROOT, file))) missing.add(from + " → " + href);
  }
  record(`internal links point at real pages (${links.length} links checked)`, !missing.size, [...missing].slice(0, 10).join("; "));
  record("no internal links use the old ?slug= guide URLs", !oldStyle.size, [...oldStyle].slice(0, 10).join("; "));
}

(async () => {
  const started = Date.now();
  if (LIVE) pages = await livePages();
  console.log(`Checking ${LIVE || ROOT}: ${pages.length} pages × ${COMBOS.length} views…`);
  if (!LIVE) checkGeneratedPages();
  const browser = await chromium.launch();
  const links = [];
  await Promise.all(COMBOS.map((combo, i) => checkCombo(browser, combo, i === 0 ? links : null)));
  if (process.env.THEMES) await checkThemes(browser);
  else console.log("·  theme pass skipped (THEMES=1 runs it; the daily live check does)");
  await checkRedirects(browser);
  await checkLinks(links);
  await browser.close();

  const secs = Math.round((Date.now() - started) / 1000);
  const summary = `${results.length - failures.length}/${results.length} checks passed in ${secs}s`;
  console.log("\n" + summary);
  if (process.env.GITHUB_STEP_SUMMARY){
    const md = ["## Rally Flag site checks" + (LIVE ? " (live: " + LIVE + ")" : ""), "", summary, "", "| | Check | Details |", "|---|---|---|",
      ...results.map(r => `| ${r.ok ? "✅" : "❌"} | ${r.check} | ${(r.detail || "").replace(/\|/g, "\\|").slice(0, 600)} |`)].join("\n");
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  }
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
