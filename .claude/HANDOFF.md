# Handoff — Rally Flag design and accessibility pass

Written 2026-10-16 (updated 2026-10-17) by a Claude Code cloud session for the next session
(desktop or cloud). Project background and gotchas: `.claude/CLAUDE.md`.

## Where things stand

**Production (`coopgg/rally-flag`, rallyflag.gg) is at `eb6bedf`, synced
with dev up to `3f12dec` (small items).** That includes everything below: the first round
(14-item review, cache fix, sign-in fixes, Auto/Light/Dark, iPhone
`minimal-ui`) and the whole skills rescan, items 1–8. Next promotion range
starts at `3f12dec`. Before promoting, run `SITE_ROOT=<prod clone> npm run check` in tests/.

| Item | Dev commit(s) | What |
|---|---|---|
| 1 | `fc43069` | Filter chips → `<button aria-pressed>`; card headers (God Rolls, Armor Sets, Artifacts) → `role=button`, `tabindex=0`, `aria-expanded`, Enter/Space; Puzzle Helper wish cards + rune picker keyboard-operable. Pixel-identical. |
| 2 | `30e4f1f` | `<main id="main-content">` on every page + "Skip to main content" link (injected by `nav.js`). Pixel-identical. |
| 3 | `e0da63d`, `83274f9` | Load-time layout shift: `#site-nav` min-height + `.rf-boot` reveal guard. CLS < 0.1 on all 21 pages, desktop and phone (was 12/21 and 7/21). Trade-off: first visit can wait up to 400ms for fonts. |
| 4 | `8531b73` | Custom `404.html`, canonical tags, 1200×630 share image (`assets/og-image.png`, large card), sitemap fixes. The share image only resolves once promoted (tags point at rallyflag.gg). |
| 5 | `987a5ba` | 22 `transition: all` → explicit colour/opacity properties; `prefers-reduced-motion` (CSS + smooth-scroll JS); `color-scheme` per mode; `text-wrap: balance` on headings; `touch-action: manipulation`; `aria-label` on 4 search inputs + Bungie-name input; `aria-live` on filter counts, `role=status` on sign-in callback; `tabular-nums` on Distortions clock; preconnect to www.bungie.net; `:focus-visible` ring on inputs. axe 0 on 21 pages; pixel-identical at rest apart from countdowns and sub-pixel heading glyph shifts. |
| 6 | `5e41c2e` | Site-menu button: ☰ text glyph → inline SVG in the gear's stroke style; button 34×34 (was 34.6×30) so it lines up with the settings button. Keyboard open/Escape unchanged. |
| 7 | `2fff29f` | Readability: long-form text 16px capped ~62ch; card descriptions 14–15px; 12px label floor (100 declarations); Builds reading column centred; Codes cards 300px; guides less phone padding. Visible change: pages 1–35% taller. axe 0 (dark+light), CLS 0 on all 21 pages. Known: 4 god-roll / 3 armor-set meta labels now wrap to 2 lines in narrow cards. |
| 8 | `e3395fd` | "A + Cosmic": starfield, accent-edged see-through panels + glow, official activity art on Raids/Dungeons/This Week cards, guide-header art banners, featured-raid banner on Home. axe 0 on 22 pages × desktop/phone × dark/light; CLS unchanged (21/21 good). |
| — | `92e56cd` | Pantheon key art (manifest only has a placeholder) saved as `assets/art/pantheon.jpg`; `rallyFlagArtUrl` accepts local paths. Live on prod (`3d2bdbd`). |
| — | `471a9d4` | Xûr "Predicted Next Drop" preview removed from dev's `vendors.html` (it shows his next stock ~a day early); lives only in dev-only `xur-debug.html` now. Dev and prod `vendors.html` are identical, so promotions should apply with no rejects. Dev-only, nothing to promote. |

| next-1 | `b6044b3` | **Live on prod (`f6fbab8`).** Discord/link previews: one generated static page per raid/dungeon (`tools/build-guide-pages.js`), all site links + sitemap + discord-bot pointed at them, old `?slug=` links forward. Bot needs a redeploy to post the new links. |
| next-2 | `6681030` | **Live on prod (`f6fbab8`).** Guides: one card per encounter (h2 "Encounters" heading + toggle, h3 encounter titles, bigger badge), jump links land 16px above the card. |

`fc35fa6` (skills) and the `.claude/*.md` docs are dev-only; never promote them.

## Next up (owner-approved order)

1. Discord link previews — done and live; bot redeploy still needed for its links.
2. Automated checks — `tests/site-check.js` + `.github/workflows/site-checks.yml` (`7763d11`), green on GitHub; awaiting owner review. Dev-only, nothing to promote.
3. Lighter listing pages — `2a89b9d` live on prod: generated `assets/activity-index.js` (4KB) replaces the 180KB guide data on Home, This Week, Raids, Dungeons.
4. Official art for Distortions, Tracker, Public Events, Guides overview — `c12a8c6`, live on prod. (Rotation page done in item 6.)
5. Boot script single source — `4d7000a`, live on prod: `tools/boot-script.js` + `tools/sync-boot-script.js` (stays inline; no extra request).
6. Small items — `3f12dec`, live on prod: Armor Sets source label de-duplicated (+ body font), God Rolls drops "Legendary", Rotation page thumbnails. Discord bot redeploy is the owner's.
7. Builds loadout names wrap instead of "…"; bracketed perks on their own line — `6391db7` on dev, awaiting review.

## Rescan items (all done and live)

5. Done — see table above.
6. Done — see table above.
7. Done — see table above.
8. **Design direction — owner chose "A + Cosmic"; built in for real (see table).**
   The mock-ups (`design-preview.html`, `?look=mix`) are gone. What shipped
   to dev: starfield + nebula, see-through panels with a subclass-coloured
   edge and glow (theme.css "Cosmic layer"), official activity art (`art`
   in raids-data.js / dungeons-data.js, helpers in nav.js) on Raids,
   Dungeons, This Week, the guide headers, and a featured-raid banner on
   Home. A's fonts, 6 themes and light mode unchanged. Dropped the
   preview's backdrop blur on panels (scroll performance on phones).

## Workflow the owner expects

- Work on dev, push to `main` (dev deploys), then stop and report for review.
  Do not touch prod until told.
- Each report: what changed, how it was verified (numbers, not adjectives),
  any trade-off, and exactly what to click on dev to check it.
- Keep visual changes out of fix commits unless the item is visual; prove
  "no visual change" with screenshot or geometry comparison.
