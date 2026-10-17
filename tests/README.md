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

It also checks that the generated guide pages are up to date
(`tools/build-guide-pages.js --check`), that each guide page's raw HTML has
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

GitHub runs the same thing on every push (`.github/workflows/site-checks.yml`);
the run's summary page lists every check. Takes about 3 minutes.

Live Bungie data is fetched during the run, so a Bungie outage can show up
as a failure; re-run before digging in.
