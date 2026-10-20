# Claude implementation brief — Moonlit Mountains, Living Manuscript

Prepared 2026-10-20. This is the active assignment when the user starts the frontend session. Product copy stays in Simplified Chinese. Deliver working React/CSS, not a design proposal alone.

## 1. Decision and outcome

The user has selected **Moonlit Mountains**. Do not reopen concept selection or repeat the previous three-concept exercise. Apply the pinned distinctive-ai-design skill directly to implementation and review. The desired quality is an expressive, carefully composed literary experience: moonlight over mountains and water, with an annotated manuscript as the working surface. Visible, theatrical motion is welcome when it feels continuous and responsive. “Subtle” is not the acceptance criterion; control, coherence and readability are.

Solve these specific problems together:

1. After scrolling a long report, the left column becomes empty and editing feels disconnected from reading.
2. The dark header abruptly meets a pale page; the interface reads as two unrelated designs.
3. The pointer, ambient scene and everyday operations lack a convincing sense of response and craft.

Keep the recognizable 律 seal and real analysis. A recolor, a taller hero or a decorative landing page followed by the old checker is insufficient. Build both the initial writing state and the real report state. Use one coherent scene from top to bottom; make the manuscript legible within it.

## 2. Exact workspace and baseline

Use this prepared worktree, not the conversation's default directory:

```text
C:/Users/21393/Documents/Codex/2026-10-16/6-vibe-coding-ai-ai-web/work/ui-moonlit
```

Prepared branch: `feat/claude-moonlit-poetry-ui`. Application baseline: `origin/integrate/d4` at `898b1a0a26a5f6e8e79a0b2cb31848b24537a185`, followed by the documentation commit containing this brief. Inspect `git status`, current branch and HEAD first. Continue this prepared branch; it already exists. Preserve other work. Never reset to the old UI branch, start from old main, or silently merge new remote changes into an active editing session. If working on a different machine, use the same published D4 application baseline and bring this documentation increment with you; document the actual location and SHA.

Read AGENTS.md, README.md, HANDOFF.md, docs/ownership.md, this brief, MOONLIT-LANDSCAPE-PLAN.md and the existing visual-spec.md. Read these two pinned skill files explicitly:

```text
C:/Users/21393/Documents/Codex/2026-10-16/6-vibe-coding-ai-ai-web/tools/claude-skills/distinctive-ai-design/SKILL.md
C:/Users/21393/Documents/Codex/2026-10-16/6-vibe-coding-ai-ai-web/tools/claude-skills/distinctive-ai-design/references/review-and-media.md
```

Skill upstream: https://github.com/houxin0010/distinctive-ai-design ; local pinned revision `92c68366767b98924fe2719c16659e7f1e93c7af`. The skill is local tooling, not an application dependency. Preserve its existing provenance; do not copy it into the app or invent a license. If missing on another machine, report that fact and use this self-contained brief without claiming skill compliance.

This assignment supersedes the old three-concept selection, blanket custom-cursor prohibition and previous two-round budget. It begins a new implementation pass with up to two focused refinements. The D4 UI pause is lifted only for the presentation scope below; other D4 tasks continue independently.

## 3. Ownership and implementation strategy

Write only:

- `apps/web/src/presentation/**`
- `apps/web/public/design/**`
- `docs/design/**`, including new standalone capture/regression scripts under `docs/design/moonlit-ui/`

Use the frozen `CheckerViewProps` from `apps/web/src/view-contract.ts`. Keep API requests, cancellation, overrides, export gating and conclusions in their existing owners. No edits to the contract, business store, data/reviews, rules, dependencies, lockfile, root config or shared E browser runners. Do not weaken test assertions. A real cross-boundary dependency should be recorded with a minimal proposed change for Codex/D; continue independent presentation work.

Internal component props and local presentation state may change. Suggested responsibilities, not mandatory filenames:

- `MoonlitScene`: decorative scene and pointer-responsive layers.
- `ReadingRail`: report-derived navigation and compact editing controls.
- `useMotionPreference`: system preference, local toggle, visibility and cleanup.
- `PointerHalo`: decorative follower, separate from the actual cursor.

Do not create a second model of the report or duplicate the input form. Separate decorative animation state from analysis state. Prefer CSS/SVG and small WAAPI transitions; no WebGL, video, remote font or new animation library is required. New shipping scene illustrations, textures and cursor artwork must stay code-native SVG/CSS. Generated rasters are internal references only, as specified below. Record any new asset provenance. The first implementation should work without downloading anything at runtime.

### Optional t2i concept reference — text-path output only

The user supplied this local MCP integration contract: `t2i` exposes `generate_image(prompt, filename, model, size)`; the default model is `gpt-image-2.5`, and the result is a file path returned as text. Availability was reported by the user, not verified during this documentation preparation. Inspect the actual tool schema in your session for its callable name and accepted sizes. If unavailable, continue SVG/CSS implementation and report the limitation.

Use it only when a concept reference helps resolve composition, landscape depth or light. Start with one reference; this optional tool must not block the working interface.

- Call `generate_image(prompt, filename, model, size)` with an **ABSOLUTE** filename under this worktree's `docs/design/` or a temporary directory. Create the parent directory if required. Suggested file: `C:/Users/21393/Documents/Codex/2026-10-16/6-vibe-coding-ai-ai-web/work/ui-moonlit/docs/design/moonlit-ui/concepts/moonlit-reference-01.png`. Use a new filename for another attempt.
- Set `model` to `gpt-image-2.5` or use its documented default. Select a landscape `size` supported by the actual schema; do not invent supported resolutions. Keep credentials in the configured integration, never in prompts, source or logs.
- The integration must return a **text file path**. Never read generated image bytes into conversation context, embed base64, display the image inline, or invoke an image-returning inspection tool in this Claude session. If the integration unexpectedly returns image blocks, stop using that path and continue without generation; do not forward or reconstruct those blocks.
- For each generation, report **only the absolute returned path plus one line describing the intended concept**. Do not claim inspection, visual quality or a working UI screenshot based on a path alone. The user or Codex can inspect the reference later through a compatible session.
- Generated raster images are **internal concept/mockup/reference ONLY**. Do not place them in `apps/web/public`, import them into TSX/CSS, or embed raster bytes in an SVG wrapper. Shipping scenery, textures, cursor artwork and effects remain editable code-native SVG/CSS.
- Record the prompt, requested model/size, returned path, time, `purpose: internal-concept-only` and `visualReview: pending` in a local reference manifest under `docs/design/moonlit-ui/concepts/`. Separate references from actual browser captures: generated pictures cannot establish implementation or acceptance.

Suggested concept prompt, adaptable to the selected layout:

> Internal art-direction reference for a Chinese poetry analysis web application, Moonlit Mountains. A composed nocturnal riverside scene with layered blue-green mountains, a low silver moon, sparse mist and restrained reflected light on water. A compact writing desk area on the left and a broad warm ivory manuscript reading surface on the right, with generous quiet areas for real text and controls. Atmosphere continues from the top through the working area, no abrupt black-to-white boundary. Deliberate depth and asymmetry, refined literary exhibition character, a tiny vermilion seal accent. Landscape details stay at the edges; reading surfaces are opaque and calm. No readable text, invented calligraphy, neon, glass dashboard or dense particles. This is a concept reference only; the actual interface and animated layers will be implemented separately in SVG/CSS.

## 4. Art direction and layout

Think of a moonlit riverside writing desk, not a generic glass dashboard. Deep blue-green distance, misty intermediate planes, a low moon and restrained silver water lead toward a warm, almost opaque manuscript. Vermilion is a small punctuation accent around the existing seal and important actions. Keep diagnostic colors distinct from scenic decoration.

Starting palette for visual exploration, not measured compliance: night `#101F25`, distant teal `#203C43`, mist `#7E9B9D`, manuscript `#F5F0E5`, text `#233238`, seal `#A64135`. Derive tokens and verify actual text/focus contrast on the rendered surfaces. Use Chinese display/body contrast with honest installed-font fallbacks. Do not use vertical body paragraphs, ornamental labels for ordinary actions, or unreadable calligraphy as instructions.

**One continuous scene.** Put atmosphere behind the entire page, not exclusively inside the header. Let the header dissolve into the working area through mist and landscape silhouettes; do not simply make every card dark. Place visible motion mainly in outer margins and scenic gaps. Reading and evidence surfaces must not show moving water behind the text. Avoid neon outlines, cursor glitter, a field of floating cards, and several effects competing for attention at once.

**Initial state.** Compact masthead, examples before the editor, clear book selection and an immediately usable Analyze action. At 1440×900 and 1366×768 the full primary action must be visible without scrolling at 100% zoom with the default four-row editor. On 375×812 prioritize the form; the scene should frame it, not introduce a full-screen prologue.

**Report state.** The poem is the visual center, followed by prioritized findings and evidence access. Preserve the collapsed passed/not-applicable section and automatic opening for a selected contained finding. Do not expand all findings to make the page look more substantial.

**Desktop rail.** Keep a compact left reading rail sticky within the report container. Show the selected book, report-derived line navigation, concise existing counts and editing access. Give the rail a viewport-based height cap; only its line directory may scroll internally. Do not put the whole page in a nested scroller. Keep the rail clear of the footer. Observe section positions efficiently; a scroll spy may update the active marker but must never initiate a scroll.

**Editor identity.** Keep the same textarea mounted in the same stable React position across writing/reading/expanded states. Do not key it by report, hash or mode. Start with explicit “收起编辑 / 展开编辑” controls. If you add automatic compaction, do it only after a successful intentional submission, when focus is outside the editor and IME composition is inactive. Never collapse merely on blur. Clicking a collapse control should retain focus on that control; hidden descendants must leave the tab order. Reopening for editing may focus the preserved textarea, as a direct user action. Use a size-contained wrapper rather than animating/detaching the textarea itself.

**Responsive layout.** The existing one-column boundary is 899px; retain it unless a measured reason justifies changing it. If changed, update every presentation-side layout and result-reveal condition together. Test the breakpoint on both sides. At 900–1100px, guard the report's minimum usable width: wrap the verdict actions before squeezing the conclusion text. On mobile replace the sticky rail with a compact in-flow Edit/Directory disclosure. Never cover the poem with a tall fixed toolbar. Directory links must refer to actual rendered report lines; disabled or clearly stale when the report is stale. An explicit jump scrolls to the line, then highlights it once. Keyboard-activated navigation must place focus at the destination or otherwise provide an equivalent accessible destination announcement; passive scroll spying must not move focus.

## 5. Pointer and ambient scene

Use a crisp moonlight nib or arrow via a small local SVG cursor with an explicit hotspot and native fallback. The actual click point tracks the operating-system pointer immediately. A separate soft halo may follow with 60–100ms damping. Preserve text-selection I-beams, resize/grab semantics and disabled-state feedback. Do not use global `cursor:none`, magnetic buttons or moving click targets.

Enable decorative following only for actual mouse movement on a fine hover-capable pointer. Handle hybrid touch/mouse devices using event pointer type, not media queries alone. Hide and suspend the follower on touch, pointer cancellation, window blur, pointer leaving the document, forced colors and reduced motion. Scope it to the app and keep it behind the evidence dialog. All decorative layers use appropriate `aria-hidden` and `pointer-events:none` semantics.

Three coherent responses:

| Layer | Movement | Boundary |
| --- | --- | --- |
| Distant moon/mountains | Approximately 2–4px parallax, almost still | Never transform the text/reading surface |
| Near mist | Slow sparse drift and approximately 6–12px offset | Outer margins, no full-screen animated blur |
| Water reflection | Gentle glow responding to pointer position; occasional ripple on a deliberate background click | Water region only; exclude controls, links, text selection, scrollbars and modal |

These amplitudes are starting points, not goals to maximize. Cap ripples (for example two alive, at least 250ms between spawns). Pointermove only updates refs/coordinates; at most one scheduled animation frame applies changes. No React render per pointermove, unbounded trails, per-frame getBoundingClientRect or one loop per layer. Stop a follower loop when settled; pause ongoing ambient work when hidden or offscreen. Clean up listeners, observers, frames and animations on unmount, including React StrictMode re-mounts.

**Idle is alive, too — an explicit user requirement.** A stationary pointer must not freeze the whole landscape. Compose an independent ambient timeline: sparse mist drifts over roughly 18–32 seconds, water glints change softly over 6–12 seconds, and the moon's outer haze may breathe very slightly over 12–20 seconds. Treat these as starting ranges, not three synchronized loops. Keep the moon disc and mountain silhouettes steady. Do not animate the whole page's exposure, create rhythmic flashes, or repeatedly spawn ripples without interaction. Use seamless, offset cycles, with low enough contrast to read comfortably for a minute.

Pointer movement adds a separate restrained response over that ambient base. After movement stops, the response settles smoothly (roughly 500–900ms) back to the ambient composition; ambient mist and water continue. A stopped follower loop is not an instruction to stop CSS ambient animation. During input/composition or an open evidence dialog, lower the ambient emphasis further; while hidden, offscreen, reduced-motion or effects-off, pause it completely. Verify both a 10-second active pointer trace and a 30-second idle trace, and save a short idle recording/representative timed frames. Include idle-to-interaction-to-idle in the focused regression. Do not claim idle behavior from a pointer-only recording.

Provide a visible, keyboard-operable “动态效果” control. Default to system preference; system reduced motion overrides any saved enable preference. Turning effects off disables ongoing scene motion, decorative following, spatial transitions and smooth scrolling, while status changes and readable busy feedback remain. Store only this display preference locally; catch unavailable storage. If an active animation is disabled, finish at the correct final state rather than leaving hidden content. No animation setting changes request or report state.

## 6. Motion choreography

Each user action has one focal motion. Input/state updates happen immediately; animations do not delay network requests, focus, validation or usable content. Related movements overlap rather than queue. Interrupting or reversing an action continues smoothly from its current visual state. Strong movement is allowed; repeated bouncing and long decorative endings are not.

| Event | Visual intent | Starting timing | Trigger and interruption rule |
| --- | --- | --- | --- |
| First load | Moon, mountain depth and paper arrive as a composition | 600–900ms overall | Once per mount, controls active immediately |
| Button / book change | Firm press, restrained rebound; selected light moves between segments | 100–240ms | Checked value changes immediately; no shift of hit area |
| Load example | Brief illumination of the writing surface | 180–260ms | Callback updates the complete text once; never typewriter-edit the draft |
| Analyze | Primary action transforms into a real busy indication; scenery quiets | 120–200ms entry | Only `busy`; no invented progress percentage |
| New result | Manuscript unfolds with a short coordinated line reveal | 400–700ms maximum | A new successful submitted result, including unchanged-text reanalysis; not token selection, typing or drawer activity |
| Edit disclosure | Rail and wrapper resize continuously | 240–380ms | Preserve textarea/IME; cancel or reverse unfinished transitions |
| Evidence open / close | Clear spatial arrival, quicker departure | 280–380ms / 180–260ms | Focus and inertness must remain correct during the entire visible lifetime |
| Finding disclosure / line location | Explanations open; target edge briefly lights | 180–450ms | Retain native disclosure semantics and real selection |
| Copy/download / error / stale | Precise confirmation or a steady warning transition | 120–200ms | Based on real props/callback outcome; never imply successful analysis or export |

Keep total line stagger bounded regardless of poem length; all lines remain accessible from the start. Use transform/opacity for decorative motion; bounded disclosure-height transitions are acceptable, continuous layout animation is not. Avoid transition:all and transitionend-dependent business/focus logic. Reduced motion supplies an immediate complete final state with equivalent text/status feedback.

Two existing implementation traps require explicit care:

1. `CheckerView.tsx` already records submit intent before calling `onAnalyze`. Its mobile reveal supports click and Ctrl+Enter, unchanged-text reanalysis and cancellation after edit/manual wheel/touch movement. Preserve this. Do not key new-result animation only by inputHash or check which control is focused when a response arrives. There must be one owner of automatic scroll; background, rail and report effects must not each call scrollIntoView.
2. EvidencePanel currently mounts conditionally and closes immediately through the callback. A CSS exit transition alone cannot work after unmount. A retained presentation-only exit shell is allowed, but retain the dialog's inert/focus ownership until it actually closes, restore focus once, and prevent a closing snapshot from accepting candidate actions. The animation completion must tolerate cancellation, reduced motion and component unmount. If this cannot be made robust within the pass, keep an immediate accessible close and report that limitation rather than delaying business state or trapping focus.

## 7. Functional invariants

- The real `/` route and exact example texts/configuration remain intact. `presentation-preview.html` is synthetic and never proves production acceptance.
- Existing candidate selection, including 更 → `pingshui:更:ping:八庚`, must reanalyze through the existing callback. Text/book changes still clear old overrides in the business layer.
- Copy/export must describe the current request/report and remain blocked during pending, failed or stale analysis. Preserve the actual business gates.
- Keep pass, fail, needs_review, not_applicable, unsupported, error, busy and stale distinguishable by words/icons, not color alone. 黄鹤楼 remains fail where other deviations require it; preserve historical tags and approved exceptions.
- Preserve punctuation rendering, evidence text selection, exact character positions, Tab/Enter/Space/Escape, dialog focus return, Ctrl+Enter and IME composition. Seven-character wrapping at 375px is accepted; clipping or shrinking targets below 44px is not.
- Keep existing behavior hooks: `.pc-input__text`, `.pc-input__submit`, `.pc-segmented__option`, `.pc-examples__item`, `[data-token-id]`, `.pc-cell`, `[role=dialog]`, `.pc-candidate button`, `.pc-feedback`, `[role=alert]`, `.pc-report--stale`, `.pc-status--*`, `.pc-reading`, `.pc-punct`, `.pc-historical-tags`. Keep labels 复制摘要 / 下载报告 / 改用此读音 discoverable. Preserve the reduced-motion token hook used by the existing runner.

## 8. Delivery sequence and checks

Deliver reviewable increments in this order:

1. Continuous scene + initial/report compositions + useful reading rail. Verify long-page behavior, intermediate widths and editor identity before adding effects.
2. Core operation choreography + motion preference. Regress submit/reveal, IME, disclosure and dialog state/focus.
3. Custom cursor/halo + mouse-responsive landscape/water. Add bounded scheduling and cleanup, then measure actual responsiveness.
4. Capture and review, up to two focused refinements, 1–3 important issues each. This budget limits aesthetic iteration, not fixing regressions introduced by this work.

Use Node 24.19.0 / pnpm 11.25.0. On this machine Node is under `C:/Users/21393/tools/node-v24.19.0-win-x64`; prepend it to PATH if necessary. Install with `pnpm install --frozen-lockfile` in the new worktree. Read `scripts/acceptance-runtime.mjs`, `tests/e2e/cdp.mjs` and existing design capture scripts for independent previews; do not edit shared helpers. Existing user preview at 127.0.0.1:56658 and older 5173 services belong to other checkouts. Do not stop or reuse them as proof of your implementation. Record actual preview checkout, SHA, port and start/stop commands.

Run `pnpm verify` and `pnpm test:e2e` on the final implementation. D4 baseline was 733 tests and 18 browser scenarios: those numbers are historical, not your result. The existing real-API matrix has six Cilin/Xinyun evidence blocks; a presentation task must not alter approvals to remove them.

Add a small focused standalone CDP regression script under `docs/design/moonlit-ui/`, reusing the existing helper read-only. It must exit nonzero on failure, use isolated ports, clean up its own processes and save actual results with SHA/dirty state. Cover these new risks rather than reimplementing every existing test:

- Long-report rail at top/middle/bottom, no footer overlap; navigation and active marker; manual scrolling never initiates another scroll.
- Editor DOM identity, selection and focus survive disclosure/report changes; compositionstart/update/end is not interrupted. Synthetic composition checks are not a claim of real Windows IME certification.
- Click and Ctrl+Enter result reveal, unchanged-text reanalysis, cancellation/failure/manual-scroll suppression; stale navigation is clearly disabled or correctly labeled.
- Effects toggle, live system reduced-motion changes, blocked storage, touch pointer fallback, hidden-window pause and cleanup; idle ambient continuity and smooth return after interaction.
- Evidence open-close-open interrupted sequences, Escape/focus return, hidden/closing controls not tabbable/actionable; collapsed findings selection still works.

Use real Pingshui analysis for the three core works. For very long layout stress, use a clearly labeled isolated synthetic presentation fixture only; never send manufactured approved evidence through the real API or describe its verdict as a golden case. Test a long findings list as well as many poem lines.

Capture initial/report, long report middle/bottom, evidence, error/stale and reduced-motion states at representative sizes: 1440×900, 1366×768, 900×900, 899×900, 768×1024, 375×812. Probe 1280/1100/1024 and 200% browser zoom for clipping too. Save motion frames or a local short recording; static screenshots alone cannot certify smoothness. Record a bounded 10-second pointer/scroll trace on the actual browser with hardware/viewport, frame-time distribution or long frames and any long tasks. Aim for smooth 60Hz interaction on the tested desktop, but never invent a frame rate; if it stutters, simplify fog/glow work before adding more effects.

## 9. Text-only channel and final handoff

This Claude channel is TEXT ONLY. Do not invoke image-returning tools, display screenshots inline, or print base64. The optional t2i call above is permitted specifically because its integration returns a text path, not an image block; report that path plus one descriptive line only. Browser code may save PNG/video to disk and return paths and numeric measurements only. Use new folders under `docs/design/moonlit-ui/<commit-or-round>/`, with a manifest of SHA, dirty state, route, mode, viewport, timestamp and fixture/real distinction. Never overwrite the previous redesign's evidence.

Codex will inspect screenshots after the user switches back. Until someone actually inspects them, label visual review pending; geometry, passing tests and an unviewed screenshot are not aesthetic approval. If review is unavailable, finish the functional first pass and its evidence; do not fabricate reviewer comments or spend both refinement rounds blindly. No need for another direction approval before starting implementation.

Write files directly, keep chat updates concise. Deliver:

- Implemented initial/report/long-reading states, operation motion and bounded pointer-responsive scenery.
- `docs/design/HANDOFF-MOONLIT-UI.md`: base/head, changed paths, actual commands/exits/counts, trigger/interruption table, limitations, remaining review work, performance evidence, preview URL/cleanup instructions.
- `docs/design/moonlit-ui/` regression and capture artifacts with provenance.
- Update visual-spec.md to describe what actually shipped, including measured contrast and current limitations, and link the new handoff. Mark the plan implemented only to the extent supported by evidence.

Commit on this feature branch. Never merge main or integrate/d4. This assignment does not request a remote push. Keep D4 data work independent and report any necessary integration change precisely.
