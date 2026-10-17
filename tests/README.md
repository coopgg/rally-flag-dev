# Site checks (dev-only)

`site-check.js` loads every public page in headless Chromium, served from
this working tree **at the dev origin** (the Bungie API key only answers
there), at desktop/phone × dark/light, and fails if any page has:

- a script error
- an accessibility violation (axe-core: WCAG 2.0/2.1/2.2 A + AA, best practices)
- sideways scroll
- a broken image
- visible text under 12px
- layout shift (CLS) of 0.1 or more (dark mode, desktop + phone)

Those run with the Arc theme. `THEMES=1` adds a second pass that loads
every page in each of the other 8 themes, dark and light, at desktop width,
and fails on any axe colour-contrast or link-in-text-block problem. A theme
added to `THEMES` in `assets/nav.js` but not to `OTHER_THEMES` in
`site-check.js` fails that pass. It adds about 6 minutes.

## The live site, daily

`.github/workflows/live-check.yml` runs the checks against
https://rallyflag.gg once a day (13:07 UTC) with the theme pass, and can be
started by hand from the Actions tab ("Live site check" → Run workflow).
`LIVE_URL` switches the script to a live site: pages come from its
`sitemap.xml` (plus a missing path for the 404 page), links are checked
over HTTP, and the file-only checks (generated pages, boot scripts) are
skipped. A failed scheduled run emails the repo owner.

Locally: `LIVE_URL=https://rallyflag.gg/ THEMES=1 npm run check`.

It also checks that the generated guide pages are up to date
(`tools/build-guide-pages.js --check`), that every page's inline boot
script matches `tools/boot-script.js`, that each guide page's raw HTML has
its own preview tags, that old `?slug=` guide links forward, and that every
internal `.html` link points at a real file.

New pages are picked up automatically (every `*.html` in the root except
the dev-only tools listed in `SKIP`).

## Run it

```bash
cd tests
npm ci
npx playwright install chromium   # first time only
npm run check
```

Before a promotion, check the prod clone the same way:
`SITE_ROOT=../../rally-flag npm run check` (the generated-pages freshness
check is skipped there; it runs on dev).

GitHub runs the same thing on every push (`.github/workflows/site-checks.yml`);
the run's summary page lists every check. Takes about 3 minutes; the theme
pass is left to the daily live check.

Live Bungie data is fetched during the run, so a Bungie outage can show up
as a failure; re-run before digging in.
