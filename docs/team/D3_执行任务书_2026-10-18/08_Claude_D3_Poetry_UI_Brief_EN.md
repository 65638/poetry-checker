# Claude Code — D3 Poetry Interface Refinement

Implement this assignment in the existing repository: https://github.com/65638/poetry-checker. Start from the latest main containing `f42172f10399449093b750b3d03d66b0a9d08be8`, preserve subsequent work, and record the actual base SHA. Use a separate checkout and a branch named `feat/claude-d3-poetry-ui`. Inspect existing branches before creating or switching anything; preserve uncommitted work.

This is a bounded refinement of the existing React/Vite interface. The first redesign and basic motion are already implemented. The user still wants a stronger connection to Chinese poetry, clearer page composition, and more visible interaction feedback. Improve the existing components and deliver working TSX/CSS, rather than a proposal alone.

## 1. Current state and collaboration

- The HTTP contract and `CheckerViewProps` are frozen. The current main passed 591 tests across 45 files; use actual results after your changes rather than quoting that count as your result.
- The three approved poems have working real API responses under Pingshui. A known Yellow Crane Tower rule exception is being fixed by Codex. Other rhyme-book coverage is still under review. Presentation must display the supplied result honestly.
- D owns request state, sample text, cancellation, pronunciation overrides, exports, business tests, and app integration. E owns independent system tests. GLM owns dependencies, API wiring, CI, startup, and integration. Codex handles metrical logic and technical review.
- D is enabling the three existing sample buttons. Until props provide nonempty approved text, preserve their unavailable state. Do not invent sample data or embed a separate poem library in presentation.
- D3 is the third project workday, not a promise about a calendar date. Limit the first representative slice to approximately 2–3 hours; use D4 for one focused refinement round. Preserve at least half of D5 for final integration and rehearsal.

## 2. Tools and communication

Run in a standalone Claude Code session with repository access. Use source files and text-returning tools. A previous integration reported an image-content schema error; this assignment does not attempt to repair the provider configuration.

Do not send image blocks, screenshots, base64 images, or image-returning tool results through this session. GLM/Codex will perform visual inspection separately and return text feedback. You may edit SVG source files and existing local assets as ordinary repository files. Do not add remote font services, image-generation dependencies, or new packages for this slice.

If the environment cannot execute within 30 minutes, provide the exact error, completed steps, and any usable files. The lead will transfer presentation ownership to Codex if needed. Only one agent writes the presentation directories at a time. If GPT and Claude cannot run concurrently, Codex delivers the rule fix first and GLM continues integration while this task runs.

## 3. Read and preserve

Read these repository files before editing:

```text
AGENTS.md
README.md
docs/ownership.md
apps/web/src/view-contract.ts
apps/web/src/presentation/CheckerView.tsx
apps/web/src/presentation/components/InputPanel.tsx
apps/web/src/presentation/components/ReportView.tsx
apps/web/src/presentation/components/EvidencePanel.tsx
apps/web/src/presentation/styles/
docs/design/visual-spec.md
docs/handoffs/2026-10-18-frontend-next-round-plan.md
```

Older D1 documents may describe completed work as pending. Use the current source and this D3 assignment for the active increment. The user has authorized this limited layout and basic-motion work; unrelated optional features remain out of scope.

You may write only:

```text
apps/web/src/presentation/
apps/web/public/design/
docs/design/
```

Keep `export function CheckerView(props: CheckerViewProps)` and import the existing view contract. Do not edit business state, API clients, `view-contract.ts`, `main.tsx`, package manifests, lockfiles, or metrical decisions. If a new prop appears necessary, first complete the slice using existing state where possible and document a concrete dependency for D/GLM. Do not duplicate shared types.

## 4. Visual direction

Use one coherent direction: a contemporary poetry writing desk that becomes an annotated reading page.

- Build the composition around poem lines, stanza rhythm, tone marks, rhyme endings, and margin notes. The title, input, settings, and report should have a clear hierarchy.
- Retain warm paper, deep ink, a restrained vermilion accent, and the existing seal. A texture-opacity change or another decorative stamp alone does not satisfy the task.
- Add at most one quiet original motif, such as a code-drawn mountain contour or manuscript ruling. Keep it outside dense reading areas. Avoid decorative wallpaper, competing ornaments, and multiple card borders around every item.
- Use local assets and system font fallbacks. Keep body text legible, Chinese labels concise, and evidence text selectable. Do not invent literary quotations or attribute generated text to historical poets.
- Use Simplified Chinese throughout the product UI. Keep approval IDs, internal filenames, and tool names out of ordinary user flows. Explain the selected rhyme system and data limitations only when they affect the user's interpretation.

### Initial state

Make the writing area generous, with compact guidance and nearby rhyme-book controls. Establish a clear primary action. Avoid a large empty results column containing only a placeholder sentence. A short three-step explanation or a restrained poem-related motif may support the writing area without competing with it.

### Report state

Make the annotated poem the dominant surface. Place verdict, configuration, and export actions in a compact header. Present diagnostics and evidence as supporting reading notes. Keep input editing easy. Distinguish pass, fail, needs_review, not_applicable, unsupported, busy, error, and stale states without relying solely on color. Respect the API's rule exception explanations; do not infer exceptions from a poem title.

## 5. Required interaction motion

Use existing CSS tokens and modest opacity/transform transitions, approximately 140–280 ms where appropriate:

1. Button and rhyme-book selection feedback.
2. Report entrance only when a new result is received; do not replay it on every keystroke, selection, or evidence toggle.
3. Evidence panel open/close and backdrop feedback, with focus behavior preserved.
4. Diagnostic-to-poem targeting with a brief visible highlight; reduced motion must use an immediate, readable state change.

Respect `prefers-reduced-motion`. No autoplay scenes, artificial loading delays, continuous decorative loops, scroll hijacking, or focus loss. Keep touch targets at least 44 px. The approved 375 px seven-character wrapping behavior may remain; do not spend the day inventing horizontal-scrolling mechanics.

## 6. First two hours

1. Inspect the actual initial/report component tree and identify the smallest layout changes that address the user's complaint.
2. Implement both representative states in the same `CheckerView` implementation, using existing props.
3. Within the existing presentation preview, make initial/report selection explicit and start with the evidence panel closed. The preview uses clearly labeled synthetic fixtures and cannot substitute for real API acceptance.
4. Provide reproduction instructions for each animation trigger and for reduced motion. GLM captures before/after comparisons using identical content, state, viewport, and recorded SHAs.

## 7. Acceptance matrix

| ID | Scenario | Expected behavior |
|---|---|---|
| V01 | Initial view at 1440 and 375 px | Clear poetry-related composition; input is prominent; no empty report wall or obstructed controls |
| V02 | Report at 1440 and 375 px | Poem is visually dominant; annotations, verdict, and supporting notes have clear hierarchy |
| V03 | New result, evidence toggle, diagnosis target | Motion is perceptible, restrained, and triggered by the relevant interaction only |
| V04 | Reduced motion | Equivalent immediate feedback; no animation-dependent access to content |
| V05 | Keyboard and panel focus | Visible focus, Escape closes, focus returns to the invoking token, no keyboard trap |
| V06 | Busy/error/stale and five report states | No misleading success treatment, no hidden input, no lost callbacks |
| V07 | 768 px and long evidence text | No accidental overflow or clipping; controls remain usable |
| V08 | Empty sample props versus approved samples | Availability follows props; presentation never fabricates approved content |
| V09 | Production entry `/` after integration | Same presentation components; D/E verify real API interactions separately |

Run the checks you can actually execute, including `pnpm verify`, and report failures verbatim. Do not claim visual approval from a successful build. GLM/Codex record technical review; the project lead separately confirms the visual direction.

## 8. Handoff

Deliver `docs/design/HANDOFF-D3.md` containing: base/head SHA, changed files, representative states, routes, before/after capture instructions, motion triggers, reduced-motion behavior, actual commands/results, known limitations, and any concrete integration request for D/GLM. Push a reviewable branch/PR after checks pass; GLM integrates. Do not send messages to team members directly.

Environment: Node 24.19.0 and pnpm 11.25.0. For a fresh clone use `pnpm install --frozen-lockfile`; do not regenerate the lockfile or upgrade dependencies to resolve a local setup issue without GLM coordination.
