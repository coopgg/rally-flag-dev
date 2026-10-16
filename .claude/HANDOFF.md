# Handoff — Rally Flag design and accessibility pass

Written 2026-10-16 by a Claude Code cloud session for the next session
(desktop or cloud). Project background and gotchas: `.claude/CLAUDE.md`.

## Where things stand

**Production (`coopgg/rally-flag`, rallyflag.gg) is at `4260de2`.** It has the
first round of work: the original 14-item design review, the cache fix, both
Bungie sign-in fixes, Auto/Light/Dark mode, and the iPhone `minimal-ui`
change. That round was promoted from dev up to `5750a98`.

**Dev (`coopgg/rally-flag-dev`, `main`) is ahead of prod.** These are on dev
waiting for the owner's review; NOT promoted to prod — wait for the go-ahead:

| Item | Dev commit(s) | What |
|---|---|---|
| 1 | `fc43069` | Filter chips → `<button aria-pressed>`; card headers (God Rolls, Armor Sets, Artifacts) → `role=button`, `tabindex=0`, `aria-expanded`, Enter/Space; Puzzle Helper wish cards + rune picker keyboard-operable. Pixel-identical. |
| 2 | `30e4f1f` | `<main id="main-content">` on every page + "Skip to main content" link (injected by `nav.js`). Pixel-identical. |
| 3 | `e0da63d`, `83274f9` | Load-time layout shift: `#site-nav` min-height + `.rf-boot` reveal guard. CLS < 0.1 on all 21 pages, desktop and phone (was 12/21 and 7/21). Trade-off: first visit can wait up to 400ms for fonts. |
| 4 | `8531b73` | Custom `404.html`, canonical tags, 1200×630 share image (`assets/og-image.png`, large card), sitemap fixes. The share image only resolves once promoted (tags point at rallyflag.gg). |
| 5 | see `git log` ("Web-design-guidelines fixes") | 22 `transition: all` → explicit colour/opacity properties; `prefers-reduced-motion` (CSS + smooth-scroll JS); `color-scheme` per mode; `text-wrap: balance` on headings; `touch-action: manipulation`; `aria-label` on 4 search inputs + Bungie-name input; `aria-live` on filter counts, `role=status` on sign-in callback; `tabular-nums` on Distortions clock; preconnect to www.bungie.net; `:focus-visible` ring on inputs. axe 0 on 21 pages; pixel-identical at rest apart from countdowns and sub-pixel heading glyph shifts. |

`fc35fa6` (skills) and the `.claude/*.md` docs are dev-only; never promote
them. When promoting items 1–5, use the patch recipe in `.claude/CLAUDE.md`
with the range `fc35fa6..<last reviewed dev sha>` (skills commit excluded by
the `.claude` / `skills-lock.json` / `.gitignore` excludes).

## Remaining items from the rescan (owner wants them one at a time on dev, review, then next)

5. Done — see table above.
6. **☰ — next. menu button is a text glyph** (taste inspector flags it as emoji on
   every page) → inline SVG like the gear icon.
7. **Readability:** body text is 12–13.5px on 19 pages, text under 13px on
   16, paragraphs run past ~75 characters on 13. Proposal: 16px body,
   12–13px minimum for labels, ~65ch measure.
8. **Design direction — owner decision, not a bug.** The taste inspector
   fails every page on monospace labels, eyebrow labels, card shadows,
   outlines, hairlines, three typefaces, no motion, no pictures, no focal
   point. Options: keep the HUD look (mark those rules allowed), or restyle
   toward a `typeui-*` direction (closest: cosmic, fantasy, futuristic, mono)
   — offer 2–3 side-by-side mock-ups first. Strongest single idea from the
   critique: Bungie's API serves official art for every raid/dungeon/weapon;
   the site currently shows zero pictures.

## Workflow the owner expects

- Work on dev, push to `main` (dev deploys), then stop and report for review.
  Do not touch prod until told.
- Each report: what changed, how it was verified (numbers, not adjectives),
  any trade-off, and exactly what to click on dev to check it.
- Keep visual changes out of fix commits unless the item is visual; prove
  "no visual change" with screenshot or geometry comparison.
