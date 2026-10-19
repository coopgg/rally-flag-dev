# Rally Flag — project guide for Claude Code

Static Destiny 2 companion site (plain HTML/CSS/JS, no build step). Current
status and next steps live in `.claude/HANDOFF.md`; read it at the start of
a session.

## Two repos, two sites

| Repo | Serves | Notes |
|---|---|---|
| `coopgg/rally-flag-dev` (this one) | https://coopgg.github.io/rally-flag-dev/ (GitHub Pages from `main`) | Work happens here first. Pushing to `main` deploys dev in ~1 min. |
| `coopgg/rally-flag` | https://rallyflag.gg (GitHub Pages, `CNAME`) | Production. Only promote what the owner has reviewed on dev. |

**Promoting dev → prod is a patch, not a copy.** Prod intentionally lacks
dev-only files, so apply only the reviewed commit range:

```bash
git -C rally-flag-dev diff <last-synced-dev-sha> <reviewed-dev-sha> -- . \
  ':(exclude)debug.html' ':(exclude)clan-admin.html' ':(exclude)discord-bot' \
  ':(exclude)api-debug.html' ':(exclude)xur-debug.html' ':(exclude).claude' \
  ':(exclude)skills-lock.json' ':(exclude).gitignore' ':(exclude)tools' \
  ':(exclude)tests' ':(exclude).github' ':(exclude)locker.html' \
  ':(exclude)assets/locker.js' ':(exclude)assets/locker-worker.js' \
  ':(exclude)assets/locker-demo.json' > /tmp/promote.patch
git -C rally-flag apply --reject /tmp/promote.patch
```

Nothing should reject; a reject means prod and dev drifted — stop and look.
After applying, `diff -rq` the two trees: the only differences should be
`CNAME`, `.gitignore` and the dev-only files above. (Until 2026-10-17,
dev's `vendors.html` carried a Xûr "Predicted Next Drop" preview that
always rejected; it now lives only in `xur-debug.html`. Keep unreleased
experiments in the debug pages, not in public pages.) (`design-preview.html` and
`assets/look-mix.*` existed on dev for a while as item 8 mock-ups and were
deleted again; if a promotion range spans them, their add+delete cancels out.)

## Things that bite

- **Bungie API key is origin-locked.** Requests from `localhost` get HTTP 500.
  To test with live data, serve local files *at the dev origin*: in
  Playwright, `context.route('https://coopgg.github.io/rally-flag-dev/**', …)`
  fulfilling from disk. Playwright does not route redirect targets, so any
  mock that redirects must use an HTML `location.replace`, not a 302.
- **Per-host credentials** in `assets/api-keys.js` (dev vs `rallyflag.gg`).
  `www.rallyflag.gg` would fall back to dev credentials.
- **Every page's `<head>` has an inline boot script** (theme, light/dark/auto
  mode, and the `.rf-boot` load-shift guard). Its single source is
  `tools/boot-script.js`; `node tools/sync-boot-script.js` stamps it into
  every page (and rebuilds the guide pages). Never edit a page's copy; the
  site checks fail if one differs. It stays inline on purpose (an external
  file would block first paint on a request). Keep its logic in sync with
  `getStoredTheme` / `getStoredModePref` / `resolveMode` in `assets/nav.js`.
  New page: copy the boot `<script>` block from any page, then run the sync.
- **Pages fill content from script at the end of `<body>`.** `.rf-boot` keeps
  `<main>` and `<footer>` laid out but invisible until DOMContentLoaded +
  web fonts (fonts capped at 400ms; 2.5s fallback). New pages need: the boot
  script, `<div id="site-nav"></div>`, `<main id="main-content" tabindex="-1">`
  around content, `<footer>`, and `assets/nav.js`.
- **Caching:** GitHub Pages sends `max-age=600`. `service-worker.js`
  revalidates (`cache: "no-cache"`) and rewrites `Cache-Control`, so deploys
  show on the next page view. Bump `CACHE_NAME` when changing the worker.
- **Sign-in** (`assets/oauth.js`, `oauth-callback.html`): pending state lives
  in localStorage (shared across tabs), tokens in sessionStorage, and a
  10-minute handoff lets the tab that started sign-in adopt it. iPhone
  home-screen installs can't share storage with Safari; the manifest uses
  `display: minimal-ui` so the icon opens in Safari.
- **Body font: `font-family:var(--font-sans)`**, never a bare `'Inter',
  sans-serif`. The stack adds "Inter Fallback" (Arial/Liberation/Helvetica)
  and "Inter Fallback Roboto" faces in `theme.css`, size-adjusted to Inter's
  width, so text wraps the same before and after a late Inter swap (a
  2→3-line subtitle on Armor Set Bonuses was a 0.56 CLS on slow fonts).
- **Light mode colours:** use `--accent-text` for accent-coloured text and
  `--accent-fill` / `--accent-fill-deep` with `--on-accent` for solid fills.
  Raw `--accent` fails contrast on light backgrounds.
- **Raid/dungeon guides are generated pages.** `raid-<slug>.html` /
  `dungeon-<slug>.html` (22 files) are built by `node tools/build-guide-pages.js`
  from the templates `raid-guide.html` / `dungeon-guide.html` plus the data
  files, so each has its own title, description, canonical and og/twitter
  tags with the activity's art (link previews never run JS). After editing a
  template or raids-/dungeons-data.js, re-run it; `--check` exits 1 if any
  page is stale. Never hand-edit the generated files. The templates forward
  old `?slug=` links to the generated page. Link with
  `rallyFlagGuideHref(kind, slug)` (nav.js). `tools/` is dev-only. The same
  run writes `assets/activity-index.js`, a 4KB summary (name, slug, art,
  difficulties, armorSlugs, encounterCount) that listing pages (Home, This
  Week, Raids, Dungeons) load instead of the full ~180KB guide data.
- **Canonical tags** match each page's `og:url` (the generated guide pages
  set their own).
- **Cosmic layer + official art.** `theme.css` ("Cosmic layer") draws the
  starfield (`body::before`), panel edge/glow and art styles from the theme
  tokens. Raids/dungeons carry `art` (pgcrImage path from Bungie's
  DestinyActivityDefinition) in their data files; `rallyFlagArtUrl()` /
  `rallyFlagArtThumb()` in `nav.js` build the URL / card thumbnail. New raid
  or dungeon → look up its pgcrImage in the manifest and add `art`. If the
  manifest only has a placeholder (Pantheon), save key art as a 1280×720 JPG
  in `assets/art/` and use that relative path.
- **Card grids keep every card the same size.** Static card grids use CSS
  grid with `repeat(auto-fit|auto-fill, minmax(N, 1fr))` + `grid-auto-rows:
  1fr`. Grids of cards that open (God Rolls, Armor Sets, Artifacts, Builds)
  stay `align-items:start` and reserve the variable bits instead (fixed line
  counts / min-heights). New card content that can vary in length needs the
  same treatment or the grid stops matching.
- **Locker (dev-only preview).** `locker.html` + `assets/locker.js` show the
  signed-in player's weapons/armor (one GetProfile call) with God Roll
  matches and armor set progress. `assets/locker-worker.js` downloads
  Bungie's DestinyInventoryItemLiteDefinition (~3MB gz), trims it to ~6MB
  and caches it in IndexedDB per manifest version. Armor sets join Bungie's
  DestinyEquipableItemSetDefinition to sets-data.js by name or slug.
  `locker.html?demo` uses `assets/locker-demo.json`, built by
  `node --max-old-space-size=6144 tools/build-locker-demo.js <manifest dir>`
  from real hashes (needs the full item, plug set, item set and stat
  tables). Linked from nav.js's Debug section (hidden on rallyflag.gg); its
  four files are excluded from promotion. Stage 2 (moving, equipping,
  locking, postmaster pulls, desktop drag and drop) posts to
  /Platform/Destiny2/Actions/Items/{TransferItem,EquipItem,SetLockState,
  PullFromPostmaster}/ one at a time; these need the app's "Move or equip
  Destiny gear" OAuth scope (owner, bungie.net), and players re-sign-in
  after it's enabled. Bungie's profile lags a moment behind moves, so
  every change goes into a 5-minute sessionStorage journal laid over any
  profile minted before it (older of response/secondary minted stamps);
  DestinyItemNotFound triggers a one-item GetItem lookup and one retry.
  After every action the profile re-syncs on its own (1.5s debounce).
  Farming mode (per character, sessionStorage) runs every 45s while the
  tab is visible: inventory over 7 per slot and postmaster gear go to the vault.
  Junk cleanup sends vault Junk to a character's free spaces (and turns that
  character's farming off).
  Two layouts (`WIDE` = min-width 1100px, re-renders on change). Wide =
  DIM desktop (`renderAll`): per slot, character cells aligned under their
  cards (equipped | inventory, n/9 under the equipped item), then that
  slot's vault items full width, armor one row per class; cards are plain
  divs, pinned with the search box in `#locker-head` (sticky, solid, full
  width) so they stay over their columns while scrolling,
  with armor stat totals / vault space + currencies (worker DB `schema`:
  bump SCHEMA in locker-worker.js whenever the stored shape changes).
  Narrower = DIM mobile (`renderOne`): the cards pick `state.focus`
  (localStorage `rallyflag_locker_focus`), one owner shown. Drag a tile
  onto a card, a character cell (wide) or the
  "Move to" bar (shown a tick after dragstart; changing the DOM inside
  dragstart cancels the drag in Chrome).
  Loadouts + max Power: `maxPowerPlan` / `equipSet` / `makeRoom` (shared
  `spareFirst` ordering with farming); saved per account in localStorage.
  In-game loadouts: component 206 + Actions/Loadouts/EquipLoadout (also
  sets subclass and mods); missing items are moved onto the character first.
  `?demo` simulates every action locally. Test the
  real path with Playwright: a fake session in sessionStorage
  (`rallyflag_bungie_auth`) plus routed Profile/Actions endpoints.
- **Standalone pages:** `<body data-nav="standalone">` (nav.js) hides the
  site menu and Discord/Ko-fi, keeps brand + settings (theme, sign-in). The
  Locker uses it so it can be shared directly; its links go to rallyflag.gg.
- **`404.html`** is served for any missing path at any depth; it sets `<base>`
  to the site root and writes its asset tags from script. Keep that pattern.

## Testing approach that worked

**Automated:** `tests/site-check.js` (see `tests/README.md`) runs on every
push via GitHub Actions (`.github/workflows/site-checks.yml`) and covers
script errors, axe, sideways scroll, broken images, text <12px, CLS,
generated guide pages, old-link forwarding and internal links for every
public page at desktop/phone × dark/light. `.github/workflows/live-check.yml` runs the same checks daily against
rallyflag.gg (`LIVE_URL`) plus a colour-contrast pass for every page in every
other theme × dark/light (`THEMES=1`; new theme → add it to `OTHER_THEMES`). Run it locally before pushing:
`cd tests && npm ci && npm run check`. A red run on dev means don't promote.
`tests/` and `.github/` are dev-only.

**By hand, for anything visual or new:**

Headless Chromium is the test bench (Playwright; in containers running as
root, Chrome needs `--no-sandbox` — the taste-skill inspector takes a
`CHROME_PATH` wrapper script that adds it). For each change: keyboard-only
walkthroughs, axe-core (`wcag2a/aa`, `wcag21aa`, `wcag22aa`, `best-practice`),
layout-shift (CLS) via `PerformanceObserver`, and pixel or geometry
comparison against the previous version / live prod to prove "no visual
change" claims. Test desktop (1280) and phone (390), dark and light.

## Skills in this repo

`.claude/skills/` holds review and style skills: `web-design-guidelines`
(fetches Vercel's rules), `design-taste-frontend` (lint + real-browser
inspector + critique rubric), `redesign-existing-projects` (audit checklist),
taste-skill style presets/generators, and 67 `typeui-*` design-system briefs.
Sources and hashes are in `skills-lock.json` (`npx skills update`).

The taste inspector's house rules (no monospace labels, no eyebrows, no
hairlines, etc.) conflict with Rally Flag's deliberate HUD-style look; treat
those findings as a design decision for the owner, not bugs.
