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
  ':(exclude)skills-lock.json' ':(exclude).gitignore' > /tmp/promote.patch
git -C rally-flag apply --reject /tmp/promote.patch
```

Expected rejects: hunks touching the Xûr "Predicted" preview in
`vendors.html` (dev-only, unreleased). Anything else rejecting means prod and
dev drifted — stop and look. After applying, `diff -rq` the two trees: the
only differences should be `CNAME`, `.gitignore`, the dev-only files above,
and the Xûr preview in `vendors.html`. (`design-preview.html` and
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
  mode, and the `.rf-boot` load-shift guard). It is duplicated in ~24 pages
  and must stay in sync with `getStoredTheme` / `getStoredModePref` /
  `resolveMode` in `assets/nav.js`. Change all copies together.
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
- **Light mode colours:** use `--accent-text` for accent-coloured text and
  `--accent-fill` / `--accent-fill-deep` with `--on-accent` for solid fills.
  Raw `--accent` fails contrast on light backgrounds.
- **Canonical tags** match each page's `og:url`. Raid/dungeon guide pages
  have no static canonical; script sets one per `?slug=`.
- **Cosmic layer + official art.** `theme.css` ("Cosmic layer") draws the
  starfield (`body::before`), panel edge/glow and art styles from the theme
  tokens. Raids/dungeons carry `art` (pgcrImage path from Bungie's
  DestinyActivityDefinition) in their data files; `rallyFlagArtUrl()` /
  `rallyFlagArtThumb()` in `nav.js` build the URL / card thumbnail. New raid
  or dungeon → look up its pgcrImage in the manifest and add `art`.
- **`404.html`** is served for any missing path at any depth; it sets `<base>`
  to the site root and writes its asset tags from script. Keep that pattern.

## Testing approach that worked

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
