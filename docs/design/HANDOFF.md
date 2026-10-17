# Redesign handoff: slice 1 (writing desk + needs_review + evidence)

- Branch: `feat/claude-poetry-redesign`, base `origin/main` 6375b35. Final SHA: see the commit that adds this file.
- Scope: `apps/web/src/presentation/**`, `apps/web/public/design/mountain-contour.svg`, `docs/design/HANDOFF.md`.
- Untouched: view-contract.ts, main.tsx, app/api/features/hooks, packages, tests, fixtures, configs, lockfile.

## Composition
- Masthead: 「律」 seal, serif title, muted subtitle on one baseline, 3px double rule underneath.
- `pc-desk--writing` (no report): sheet at 680px plus the three-step intro (一/二/三) on the right; the mountain motif sits under the steps, away from dense text. There is no empty report column.
- `pc-desk--reading` (report present): sheet narrows to 380px and becomes sticky; the report page takes the remaining width. Both modes stack below 1100px.
- The textarea keeps the same DOM position in both modes (`section.pc-desk__sheet > InputPanel`), so focus, caret and IME survive. Nothing is keyed by report identity.
- Writing sheet: ruled lines (`--pc-ruling`) aligned to `--pc-text-draft` x `--pc-leading-draft`, scrolling with the content (`background-attachment: local`).
- Report page: compact verdict header (icon, label, actions on the right), a muted policy line, then the annotated poem (couplet spacing, margin line labels with a ruling divider, rhyme cells with a double underline plus the 「韵」 badge), then numbered reading notes ("批注") instead of bordered cards.
- Examples with empty `text` render disabled with a 「待核对」 tag. Rhyme-book hints are now worded as definitions ("通行定义分 106 部"), not coverage claims.

## Motion (all durations come from tokens.css; reduced motion sets them to 0, shifts to 0px and press scale to 1)
| Where | What | Duration | Reduced motion |
|---|---|---|---|
| Buttons, segmented options, cells | bg/border/colour transition, press scale 0.97 | 140ms | none |
| Report entrance | opacity + translateY 8px via WAAPI, effect keyed on `report.inputHash` only | 280ms | skipped (JS check + 0ms token) |
| Evidence backdrop | opacity fade | 220ms | none |
| Evidence panel | opacity + translateX 16px (translateY on mobile) | 220ms | none |
| Related ◆ mark | opacity + scale on mount | 220ms | none |
| Finding select | background transition | 140ms | none |
| Busy | static dot; text says analysis is running, tied to the `busy` prop | n/a | n/a |
- No exit animations, no loops, no typewriter effect, no forced waits.
- scrollIntoView keeps `behavior: auto` under reduced motion.

## Verify
- `pnpm verify` exit 0 (lint, dual typecheck, 410 tests, build, contracts check); the preview harness build also passes.

## Reviewer checklist (brief section 7): not executed in a browser by me
- Initial page at 1440 / 375: not executed (GLM to screenshot)
- needs_review result layout and entrance plays once per new inputHash: not executed
- Entrance does not replay on character click, finding select or typing: not executed
- Evidence panel: Tab trap, Escape, inert background, focus restore: not executed (logic unchanged)
- Reduced-motion emulation: not executed
- IME composition and Ctrl/Cmd+Enter in the new sheet: not executed (logic unchanged)
- Ruled lines align with text lines across fonts: not executed (depends on the serif fallback actually used)

## Integration notes for D / GLM
- Preview route: `/presentation-preview.html` (needs_review fixture). States worth inspecting: initial, busy, needs_review, stale, evidence open.
- Requested: real example texts for D's EXAMPLES; until they arrive every example shows as 「待核对」.
- Possible prop request (not done): a `reportRevision` counter if an identical re-analysis should also replay the entrance; inputHash alone will not.
