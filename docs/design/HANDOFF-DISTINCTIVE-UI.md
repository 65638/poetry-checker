# HANDOFF - Distinctive UI ("山·墨·诗" ink exhibition hall)

## 1. Identity
- Branch: `feat/claude-distinctive-poetry-ui` (local, not pushed)
- Base: `1917581` (codex/d3-b-integration 7918281 + brief docs commit)
- Commits: `857906d` first initial/report pair; `7bbfd54` refinement round 1; docs commit on top
- Direction: B "ink exhibition hall" - see `docs/design/DISTINCTIVE-UI-DIRECTION.md`
- Visual review: **pending (Codex)**. Everything below marked "self" is code/metric self-review only.

## 2. Changed files (presentation scope only)
- `apps/web/src/presentation/CheckerView.tsx` - stage header + `.pc-hall` (plinth / manuscript) + footer, busy bar, root mode classes
- `apps/web/src/presentation/components/InkStage.tsx` - new, decorative, `aria-hidden`
- `apps/web/src/presentation/components/ReportView.tsx` - WAAPI reveal keyed on `inputHash`, status glyph wrapper, section numerals
- `apps/web/src/presentation/styles/{tokens,layout,input,report,evidence}.css`
- Untouched: view-contract, app/api/features/hooks, main.tsx, packages, tests, lockfile, deps

## 3. Visible differences vs. collation-desk baseline
- Dark ink stage header: giant 「诗」 glyph, seal-red sun, three SVG mountain layers + mist, 「律」 seal, Kaiti display title (64/52/34px)
- Input plinth overlaps the stage; ruled textarea with seal-red left rule; seal-red primary button
- Report is a manuscript sheet with double outline; 64px stamped status icon, per-status shape; display-font verdict
- Rhyme characters in seal red with double underline; related cells pulse twice on selection
- Findings: tighter rows, two columns at >= 1280px (round 1)
- Evidence drawer: full-height right, ink header, seal-red edge; top edge on mobile
- Stale report: dimmed with dashed outline

## 4. Motion (tokens in tokens.css; all zeroed under prefers-reduced-motion)
- Opening (page load, once): stage 760ms, 120ms delay steps - glyph-in, sun stamp, mountains rise, title fade
- Report reveal (new `inputHash`): report fade 360ms, verdict stamp, lines staggered 60ms; total capped ~650ms
- Evidence drawer: 300ms slide; body items stagger
- Controls: 160ms hover/press; busy bar 1100ms loop; related-cell pulse 700ms x2
- Reduced motion: duration tokens -> 0, keyframe animations forced off with `!important`; `--pc-dur-report` remains on `.pc-root` (e2e reads it)
- The brief's bold mandate supersedes the old 140-280ms band; longest single motion is the 760ms opening, once per load

## 5. Functional invariants preserved (brief section 5)
- Examples, real `/` route, evidence drawer (tab trap, Escape, focus restore), candidate override, export gating, status text+shape redundancy, IME, 44px targets
- Evidence: e2e 18/18 below exercises these on the real route

## 6. Commands (Node 24.19.0, pnpm 11.25.0) - results on `7bbfd54`
- `pnpm verify` -> exit 0, 53 files / 733 tests passed
- `pnpm test:e2e` -> exit 0, 18 passed, 0 blocked, 0 failed
- Same results on `857906d`
- Preview: `pnpm --filter @poetry/web exec vite --port 5199 --strictPort` (needs the API running); capture.mjs starts its own isolated stack on port 0

## 7. Screenshots (disk only)
- `docs/design/distinctive-ui/round0-857906d/` - 18 PNG + `manifest.json`
- `docs/design/distinctive-ui/round1-7bbfd54/` - 18 PNG + `manifest.json`
- Manifest records sha, dirty flag, readiness, URL, viewport, mode, timestamp per file
- States: opening motion frames, initial, report, report-poem, evidence (1440/375); initial + 黄鹤楼 report (768); reduced-motion initial/report; stale; cilin error alert
- Re-run: `node docs/design/distinctive-ui/capture.mjs <outDir> <label>`; geometry: `node docs/design/distinctive-ui/probe.mjs`

## 8. Round-1 self-review (metrics from probe.mjs, reduced motion)
- 1440 report document height 7923 -> 5411px (two-column findings)
- 1440 submit button 905-961px inside 1000px viewport; textarea min-height 200 -> 168px
- 375 glyph 168 -> 128px, moved to stage bottom-right, clear of title box
- scrollWidth <= viewport at 1440 / 768 / 375

## 9. Known limitations
- 375px: seven-character lines wrap at 44px cells (lead-approved P0 behaviour)
- Font-stack dependency: Kaiti / Songti may fall back to SimSun on Windows; ruled-line alignment verified only by metrics
- Examples sit below the fold at 1440 initial state
- Visual review pending; no pixel-level verification done in this session

## 10. Integration notes
- `reportRevision` prop idea (replay reveal for identical text) still open for D
- No props-interface changes were made
