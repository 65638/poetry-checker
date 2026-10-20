# Paste this into the Claude session

Execute `docs/design/CLAUDE-MOONLIT-UI-BRIEF-EN.md` now.

Use this exact prepared workspace, not the conversation default:
`C:/Users/21393/Documents/Codex/2026-10-16/6-vibe-coding-ai-ai-web/work/ui-moonlit`

1. Inspect `git status`, the current branch and HEAD. Continue the existing `feat/claude-moonlit-poetry-ui` branch. It contains D4 application baseline `898b1a0` plus this documentation preparation. Preserve all work; do not recreate the branch, reset, or start from main.
2. Read AGENTS.md, the active English brief and its two explicitly pinned skill files. The chosen direction is **Moonlit Mountains**: a continuous moonlit landscape, a useful sticky reading rail, a precise expressive cursor with responsive scenery, and fluid, interruptible operation animations. Direction is decided; start implementation without another concept-approval step.
3. Work in presentation, public/design and docs/design only. Keep frozen contracts, real analysis/evidence/export behavior, IME, focus and existing result-reveal fixes intact. Use local display state for motion preferences. Follow the brief's staged delivery and new regression requirements.
4. This channel is TEXT ONLY. Do not call image-returning tools or output image/base64 blocks. Optional MCP `t2i`: call `generate_image(prompt, filename, model, size)` through its text-path-returning interface. Use an ABSOLUTE filename under this worktree's docs/design/ or a temp directory; model defaults to `gpt-image-2.5`; check actual supported sizes. Generated rasters are internal concept/mockup/reference ONLY. Shipping artwork stays code-native SVG/CSS, with no embedded generated rasters. Never read image bytes into context. Report only the returned path plus a one-line concept description. If unavailable, continue implementation. Save actual screenshots/motion captures separately with SHA, viewport, route, mode and timestamp. Visual review remains pending until Codex actually inspects them after the user switches back.
5. Run an isolated preview from this worktree. Existing 56658/5173 services belong to other checkouts. Record the exact preview URL and cleanup method. Do not stop those other services.
6. Use Node 24.19.0 / pnpm 11.25.0; install locked dependencies, then run `pnpm verify`, `pnpm test:e2e` and the focused new UI checks. Report actual results. The previous 733 tests / 18 browser scenarios are baseline observations, not your results.
7. Deliver a functioning initial/report/long-reading pass, a new `HANDOFF-MOONLIT-UI.md`, capture evidence and updated visual-spec.md. Commit only on this feature branch; do not merge or push. Chat should carry progress, file paths, commit SHAs and actual check results, not pasted source files.

Aim for a visibly authored, memorable interface. Boldness is welcome; interaction must respond immediately and settle cleanly. Do not spend both refinement rounds without visual feedback. Complete the first pass and evidence, then hand off for Codex review.

The user also explicitly wants ambient motion while the mouse is still: slow mist drift, soft water shimmer and an optional very slight outer moon-haze variation. Pointer response layers over this living scene and then settles back into it. Keep reading surfaces steady; pause effects under reduced motion, effects-off and hidden-page conditions. Capture and test idle behavior as well as pointer movement.
