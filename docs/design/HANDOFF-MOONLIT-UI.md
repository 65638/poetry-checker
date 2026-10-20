# Handoff: Moonlit Mountains UI (first pass)

Brief: `docs/design/CLAUDE-MOONLIT-UI-BRIEF-EN.md`. Branch `feat/claude-moonlit-poetry-ui`, not merged and not pushed.

## 1. Revisions
- Application baseline: `898b1a0`. Brief and t2i documentation: `a0d1390`, `b77911e`.
- Implementation: `bc41981` (scene, rail, motion preference, layout rewrite).
- Checks and rail-height fix: `96eaa3a`. Capture script: `13c5efd`.
- Evidence and docs: the commit that adds this file. See `git log`.

## 2. Changed paths (write scope respected)
- `apps/web/src/presentation/CheckerView.tsx`: masthead with the 律 seal and the motion toggle; the hall grid with rail, plinth (editor) and manuscript; editor disclosure; quiet-scene signal.
- `components/MoonlitScene.tsx` (new): fixed, `aria-hidden` SVG/CSS landscape; pointer response loop.
- `components/ReadingRail.tsx` (new): sticky rail with book, counts and line jump list; scroll spy.
- `components/ReportView.tsx`: line anchors `pc-line-N`; `data-motion="off"` treated as reduced motion.
- `components/InkStage.tsx`: deleted (replaced by the scene).
- `useMotionPreference.ts` (new): local display state only, using localStorage `pc-motion-effects` with try/catch.
- `styles/tokens.css`: single palette source (moonlit night/teal/mist/manuscript/seal), motion and ambient tokens, and the zeroing blocks.
- `styles/scene.css`, `styles/rail.css` (new); `styles/layout.css` (rewritten).
- `apps/web/public/design/cursor-moon.svg` (new): crescent cursor, hotspot 4,4.
- Not touched: view-contract, app/api/features/hooks, main.tsx, packages, tests, configs, lockfile, dependencies.

## 3. Commands and results (Node 24.19.0, pnpm 11.25.0)
- `pnpm verify`: exit 0, 733 tests passed.
- `pnpm test:e2e`: see section 9 for the final run on the docs commit.
- `node docs/design/moonlit-ui/moonlit-scene-checks.mjs`: exit 0, 12/12.
- `node docs/design/moonlit-ui/moonlit-report-checks.mjs`: exit 0, 9/9.
- `node docs/design/moonlit-ui/moonlit-reveal-checks.mjs`: exit 0, 13/13.
- `node docs/design/moonlit-ui/capture.mjs round1`: exit 0, 52 screenshots plus `round1/manifest.json`.
- Results JSON: `docs/design/moonlit-ui/results/*.json`.

## 4. Motion map (trigger, duration, interruption)
- **Ambient (idle, no pointer):** mist 26s/31s alternate drift, water glint 9s, moon haze 16s scale. Pure CSS: rAF count is 0 while idle.
  - Paused for reduced motion, effects off, and `visibilitychange` hidden.
  - Quiet (gain lowered) while the evidence panel is open, while editing, or while busy.
- **Pointer response:** one rAF loop with a halo time constant of 80ms and a scene parallax of 260ms. It settles back to ambient within about 900ms and stops itself.
  - New pointer input interrupts the settle without restarting it.
  - Mouse only; `hover: none` and forced colours disable it.
  - Ripples: at most 2 at once, 250ms minimum gap, never over interactive elements or `.pc-surface`.
- **Controls:** press 120ms, control 160ms, feedback 160ms, book switch 200ms, example load glow 220ms.
- **Disclosure:** editor collapse 320ms (allow-discrete with `@starting-style`). The textarea stays mounted and the body is `inert` while collapsed.
- **Report:** reveal 360ms; finding 260ms; panel in 320ms and out 220ms; settle 700ms.
- **Rail jump:** smooth `scrollIntoView` (auto when effects are off or motion is reduced), plus a one-time line flash. Any user scroll takes over immediately.
- **Single column (≤899px) result reveal:** the existing intent logic is kept. A wheel, touch or scroll key while pending cancels it.
- Reduced motion or effects off: all durations go to 0 or 1ms, `--pc-dur-report` ≤ 1, and the scene stays static.

## 5. Performance evidence (headless Chromium, indicative only)
- 10s scripted pointer trace, 314 moves: 1995 frames, p50 4.2ms, p95 4.3ms, p99 4.3ms, 0 frames over 50ms, 0 long tasks.
- Idle 30s: transforms change every 10s sample for mist, haze and glint; rAF calls stay 0.
- Source: `docs/design/moonlit-ui/round1/manifest.json`, `motion`.

## 6. Preview method and cleanup
- The scripts start their own isolated stack via `docs/design/moonlit-ui/harness.mjs`: local API plus Vite on `127.0.0.1:0` (random free port) with an API proxy. The URL is recorded in each results JSON and the manifest.
- Cleanup is automatic: `stop()` closes the browser, Vite and API in `finally`. No long-running server was left behind. Ports 56658 and 5173 (other checkouts) were not touched.
- Manual preview: `pnpm dev:web -- --port 5190 --strictPort` from this worktree; stop with Ctrl+C.

## 7. Capture evidence
- `docs/design/moonlit-ui/round1/`: 52 PNGs, written to disk only and never viewed in this text-only session.
- Viewports: 1440x900, 1366x768, 1280x800, 1100x900, 1024x768, 900x900, 899x900, 768x1024, 375x812.
- States: initial and report everywhere; evidence, long-top/middle/bottom, stale and error at 1440, 900 and 375.
- Also: reduced motion at 1440 and 375, effects off at 1440, idle t0/t10/t20/t30s, and pointer frames plus settled.
- The manifest records SHA (clean tree at `13c5efd`), mode, viewport, timestamp and data source (real local API, not fixture).

## 8. Limitations and open items
- Visual review is **pending (Codex)**. Nothing here was inspected as pixels.
- The evidence panel exit animation is not implemented; the close is immediate, as before.
- The scene has no offscreen pause beyond `visibilitychange`; it is a fixed layer that is always in view.
- t2i was not used, so there are no concept rasters. All shipped art is SVG/CSS.
- The long-poem fixture repeats two reviewed quatrains. Unreviewed characters (for example 国) correctly return HTTP 503 from the real API.
- Ruled lines and serif alignment depend on the shipped font stack, as already recorded in visual-spec.
- Fix found by the new checks: the sticky rail exceeded a 900px viewport before sticking. `--pc-rail-clear` now caps its height.

## 9. Final run
- Recorded in the docs commit message and in the chat report.