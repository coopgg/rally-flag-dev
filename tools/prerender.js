#!/usr/bin/env node
/* ============================================================
   Writes a static copy of each data-driven page's content into that
   page, inside <noscript id="prerendered"> just before </main>.

   Why: these pages draw their content with JavaScript (the guides are an
   empty frame until the script runs). Google runs the script; most of the
   crawlers behind AI answers (GPTBot, ClaudeBot, PerplexityBot, Common
   Crawl) don't, so to them a raid guide was 8 words. Browsers with
   JavaScript ignore <noscript> entirely, so visitors see exactly what they
   did before; a crawler (or a reader with scripts off) gets the same
   content as plain, semantic HTML.

   How: each page is opened in headless Chromium from disk, with every
   outside request blocked except Bungie's API (God Rolls' perk names), so
   the copy holds the site's own data and is the same on every run; a page
   whose Bungie data didn't load isn't written (and --check skips it with a
   warning rather than failing while Bungie is down). The rendered <main>
   is boiled down to
   headings, paragraphs, lists, tables, links and images: no classes,
   styles, buttons or icons.

   Also writes faq.html's FAQPage structured data from its questions.

   Run after changing a page below, its data file or the guide templates
   (after tools/build-guide-pages.js):
     node tools/prerender.js           update every page
     node tools/prerender.js --check   exit 1 if any copy is stale
   Needs Playwright (tests/node_modules) and a Chromium: set PW_CHROMIUM to
   a Chromium binary if Playwright's own isn't installed.
   ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CHECK = process.argv.includes("--check");
const { chromium } = require(path.join(ROOT, "tests", "node_modules", "playwright"));

// Pages whose content comes from the site's own static data (not live
// Bungie data, not the date, not the visitor): the copy stays true.
const GUIDES = fs.readdirSync(ROOT).filter(f => /^(raid|dungeon)-(?!guide\.html$).+\.html$/.test(f)).sort();
const PAGES = ["raids.html", "dungeons.html", "guides.html", "god-rolls.html", "builds.html", "armor-set-bonuses.html", "artifacts.html", "codes.html"].concat(GUIDES);

// Served at the dev site's address, so the site's Bungie API key works:
// God Rolls gets its perk names from Bungie's API. Nothing else outside
// the site loads.
const ORIGIN = "https://coopgg.github.io/rally-flag-dev/";
const BUNGIE_API = /^https:\/\/(www|stats)\.bungie\.net\/Platform\//;
const PRERENDER_RE = /<noscript id="prerendered">[\s\S]*?<\/noscript>\n/;
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon" };

// Runs in the page: the rendered <main> as plain semantic HTML.
function boil(){
  const KEEP = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "UL", "OL", "LI", "A", "STRONG", "B", "EM", "I", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "IMG", "BR", "DL", "DT", "DD", "SECTION", "ARTICLE", "FIGURE", "FIGCAPTION", "BLOCKQUOTE", "CODE", "SMALL", "DIV"]);
  const DROP = new Set(["SCRIPT", "STYLE", "SVG", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "TEMPLATE", "NOSCRIPT", "IFRAME", "CANVAS", "LABEL", "DIALOG", "FORM", "VIDEO", "AUDIO"]);
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const attr = s => esc(s).replace(/"/g, "&quot;");
  const out = node => {
    if (node.nodeType === 3) return esc(node.textContent.replace(/\s+/g, " "));
    if (node.nodeType !== 1) return "";
    const el = node, tag = el.tagName;
    // Pages can mark what matters inside a control: [data-prerender-list]
    // becomes a list, [data-prerender-item] (even a button) one item of it.
    if (el.hasAttribute("data-prerender-item")) return "<li>" + [...el.childNodes].map(out).join("").trim() + "</li>";
    if (el.hasAttribute("data-prerender-list")) return "<ul>" + [...el.childNodes].map(out).join("").trim() + "</ul>";
    if (DROP.has(tag) || el.hidden || el.getAttribute("aria-hidden") === "true" || el.classList.contains("sr-only") || el.classList.contains("skel") || el.hasAttribute("data-no-prerender")) return "";
    const inner = [...el.childNodes].map(out).join("");
    // span, nav, header…: just their content, kept apart from what's next to
    // it the way the page lays it out (a label above its text shouldn't run
    // into it: "Objective" + "Activate…").
    if (!KEEP.has(tag)){
      // A field label ("Objective", "Roles") reads as one before its text.
      if (/(^|-)label\b/.test(el.className) && inner.trim()) return " <strong>" + inner.trim() + "</strong> ";
      const d = getComputedStyle(el).display;
      return d === "inline" || d === "contents" ? inner : d.startsWith("inline") ? " " + inner + " " : "\n" + inner + "\n";
    }
    if (tag === "DIV" || tag === "SECTION"){
      // A div laid out inline-block sits beside its neighbours, not under them.
      const d = getComputedStyle(el).display;
      if (d.startsWith("inline") && !el.id) return " " + inner + " ";
    }
    const name = tag.toLowerCase();
    if (tag === "IMG"){
      const src = el.getAttribute("src") || "";
      return /^(https:\/\/www\.bungie\.net\/|assets\/|puzzle-assets\/)/.test(src) ? '<img src="' + attr(src) + '" alt="' + attr(el.getAttribute("alt") || "") + '">' : "";
    }
    if (tag === "BR") return "<br>";
    if (!inner.trim() && !/<img /.test(inner)) return "";
    let a = "";
    if (tag === "A"){
      const href = el.getAttribute("href") || "";
      if (!href || href.startsWith("javascript:")) return inner;
      a = ' href="' + attr(href) + '"';
    }
    if (/^H[1-6]$|^SECTION$|^ARTICLE$|^DIV$/.test(tag) && el.id && !/^(main-content)$/.test(el.id)) a += ' id="' + attr(el.id) + '"';
    for (const k of ["colspan", "rowspan"]) if (el.hasAttribute(k)) a += " " + k + '="' + attr(el.getAttribute(k)) + '"';
    // A div with no id adds nothing but a line break.
    if (tag === "DIV" && !a) return "\n" + inner.trim() + "\n";
    // Links built side by side with no space between them stay apart.
    return "<" + name + a + ">" + inner.trim() + "</" + name + ">" + (tag === "A" ? " " : "");
  };
  const main = document.querySelector("main");
  return [...main.childNodes].map(out).join("")
    .replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/\n{2,}/g, "\n").replace(/ {2,}/g, " ").trim();
}

// faq.html: FAQPage structured data from its own questions and answers.
function faqSchema(html){
  const strip = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  const qa = [...html.matchAll(/<div class="faq-q">([\s\S]*?)<\/div>\s*<div class="faq-a">([\s\S]*?)<\/div>/g)].map(m => [strip(m[1]), strip(m[2])]);
  if (!qa.length) throw new Error("faq.html: no .faq-q / .faq-a pairs found");
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  return '<script type="application/ld+json" id="faq-schema">' + JSON.stringify(ld).replace(/</g, "\\u003c") + "</script>\n";
}

(async () => {
  let stale = 0, written = 0;
  const report = (file, current, next) => {
    if (current === next) return;
    if (CHECK){ console.error("stale: " + file); stale++; }
    else { fs.writeFileSync(path.join(ROOT, file), next); written++; }
  };

  // FAQ structured data (no browser needed).
  {
    const file = "faq.html", current = fs.readFileSync(path.join(ROOT, file), "utf8");
    const base = current.replace(/<script type="application\/ld\+json" id="faq-schema">[\s\S]*?<\/script>\n/, "");
    report(file, current, base.replace("</head>", faqSchema(base) + "</head>"));
  }

  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", javaScriptEnabled: true });
  await ctx.route("**/*", route => {
    const url = route.request().url();
    if (BUNGIE_API.test(url)) return route.continue();
    if (!url.startsWith(ORIGIN)) return route.abort();
    const rel = decodeURIComponent(url.slice(ORIGIN.length).split(/[?#]/)[0]) || "index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: "" });
    route.fulfill({ status: 200, body: fs.readFileSync(file), contentType: TYPES[path.extname(file)] || "application/octet-stream" });
  });
  const page = await ctx.newPage();
  for (const file of PAGES){
    const current = fs.readFileSync(path.join(ROOT, file), "utf8");
    await page.goto(ORIGIN + file, { waitUntil: "domcontentloaded" });
    // Wait until the content stops changing (scripts done drawing).
    let last = -1;
    for (let i = 0; i < 40; i++){
      await page.waitForTimeout(250);
      const n = await page.evaluate(() => document.querySelector("main").innerHTML.length);
      if (n === last && i > 3) break;
      last = n;
    }
    // Bungie's data didn't load (God Rolls says so): don't write a copy that does.
    if (await page.evaluate(() => { const n = document.getElementById("live-data-notice"); return !!(n && !n.hidden && n.offsetParent); })){
      console.log("skipped " + file + ": Bungie's API didn't answer, so its copy wasn't " + (CHECK ? "checked" : "updated"));
      continue;
    }
    const content = await page.evaluate(boil);
    if (content.split(/\s+/).length < 40) throw new Error(file + ": the rendered page has almost no content (" + content.length + " chars); did its script fail?");
    const block = '<noscript id="prerendered">\n<!-- A static copy of this page\'s content for readers and crawlers without JavaScript. GENERATED by tools/prerender.js; don\'t edit. -->\n' + content + "\n</noscript>\n";
    const base = current.replace(PRERENDER_RE, "");
    if (!base.includes("</main>")) throw new Error(file + ": no </main>");
    report(file, current, base.replace("</main>", block + "</main>"));
  }
  await browser.close();

  if (CHECK){
    if (stale){ console.error(stale + " prerendered page(s) out of date: run node tools/prerender.js"); process.exit(1); }
    console.log("prerendered copies up to date (" + (PAGES.length + 1) + " pages)");
  } else console.log(written + " of " + (PAGES.length + 1) + " pages updated");
})().catch(e => { console.error(e.message); process.exit(1); });
