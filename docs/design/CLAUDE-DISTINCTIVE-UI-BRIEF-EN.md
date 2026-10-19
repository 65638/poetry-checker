# Claude — Distinctive Poetry UI, Expressive Edition

## Active assignment

Implement a substantial visual redesign of the existing poetry checker. The user explicitly wants an exceptional, unmistakably poetry-related interface and permits an expressive, theatrical treatment. This is an implementation assignment: deliver functioning React/CSS, not only recommendations. Product copy stays in Simplified Chinese; this engineering brief is English.

This brief supersedes the visual and motion restrictions in the older D1/D3 Claude briefs, including “bounded refinement,” “at most one quiet motif,” and the universal 140–280 ms animation limit. Those documents remain historical references. Existing contracts, evidence policies, accessibility, and working interactions still apply.

The user will switch this same conversation to Claude. Codex has prepared the assignment but has NOT run Claude, generated this redesign, or approved its appearance. Do not describe preparation as completed implementation.

## 1. Actual workspace and design skill

The conversation's default directory is NOT the Git repository. Use this checkout explicitly:

```text
C:/Users/21393/Documents/Codex/2026-10-16/6-vibe-coding-ai-ai-web/work/d2-closeout
```

Preparation baseline: `codex/d3-b-integration` at `79182817b5540b2bdcac60c5d2724bcb2cfe32a3`, plus the subsequent documentation commit containing this brief. Inspect `git status` and the actual HEAD before writing. Never reset or discard other work. Create a feature branch `feat/claude-distinctive-poetry-ui` from the current prepared HEAD if the worktree is clean; if that branch already exists, inspect it before choosing a unique continuation name. Do not start from old `main`.

The requested skill has been installed locally with the skill-installer helper:

```text
C:/Users/21393/Documents/Codex/2026-10-16/6-vibe-coding-ai-ai-web/tools/claude-skills/distinctive-ai-design/SKILL.md
C:/Users/21393/Documents/Codex/2026-10-16/6-vibe-coding-ai-ai-web/tools/claude-skills/distinctive-ai-design/references/review-and-media.md
```

Read both files explicitly; do not depend on automatic skill discovery. Upstream: https://github.com/houxin0010/distinctive-ai-design ; pinned commit: `92c68366767b98924fe2719c16659e7f1e93c7af`. The skill instructions are Chinese; apply them to this English assignment. A copied skill does not install a browser or an external model. The upstream tree inspected contains no LICENSE file; this preparation keeps its downloaded files local, outside the application Git repository, and does not assign a license to them.

If these local files are unavailable on another machine, retrieve the same pinned upstream files before proceeding; do not silently substitute a similarly named skill.

## 2. Read before editing and ownership

Read `AGENTS.md`, `README.md`, `HANDOFF.md`, `docs/ownership.md`, `docs/handoffs/d3-de-takeover-codex.md`, `apps/web/src/view-contract.ts`, the current presentation components/styles, and `docs/design/visual-spec.md`. Historical documents contain stale pending items; the actual implementation and latest handoff are authoritative for current behavior.

Claude owns these paths for this design round:

```text
apps/web/src/presentation/**
apps/web/public/design/**
docs/design/**
```

Codex pauses presentation edits while this round is active. Keep `CheckerView(props: CheckerViewProps)` and the existing callbacks. Do not change shared schemas, API requests, state management, evidence approvals, linguistic conclusions, tests, dependencies, lockfiles, or the production entrypoint. A larger presentation rewrite within the owned paths is allowed. Report any concrete integration dependency rather than duplicating business logic.

Existing user dev servers run from a different checkout at `outputs/poetry-checker`. Do not switch that checkout, kill those services, or assume that `localhost:5173` shows your edits. Use isolated ports and record the actual checkout, SHA, and URL for every preview. Never claim a preview of the old checkout is your new design.

## 3. Creative ambition

Audience: readers, poetry enthusiasts, and students who paste a poem, understand its tonal pattern and rhyme, and inspect the evidence behind a diagnosis.

Desired experience: entering a contemporary exhibition of Chinese poetry, then opening an annotated manuscript that is genuinely useful. The user has repeatedly rejected subtle cosmetic changes. A different paper texture, slightly stronger borders, or one more seal is insufficient.

Briefly explore three meaningfully different concepts in `docs/design/DISTINCTIVE-UI-DIRECTION.md`: for example, an illuminated landscape scroll, a dramatic black-ink literary exhibition, and an oversized vermilion typographic edition. Compare composition, input/report hierarchy, typography, and motion—not just palettes. Select the strongest direction autonomously and implement it. The user has not requested a separate concept approval stop.

Recommended starting direction: **Mountains, Ink, and Verse — an interactive literary exhibition**. You may improve on this after inspecting the existing app.

- Make the opening composition visually memorable: oversized expressive Chinese display lettering, deliberate negative space, a substantial mountain/ink motif, and an asymmetric composition tied to the writing area. Keep the first usable input and primary action accessible on the initial desktop viewport; on mobile, keep them close to the opening, without an oversized introductory screen.
- Use a coherent palette with real contrast: deep ink, warm paper, and vermilion or a carefully chosen mineral accent. You may alternate a dramatic dark framing area with a light manuscript reading surface. Maintain readable labels and diagnostics.
- The application should feel designed around verse. Let line rhythm, annotations, tone marks, rhyme endings, and vertical accents shape its identity. The report's poem should become the central visual event, not one small card in a dashboard.
- Make typography intentional: strong display/body contrast, tuned Chinese spacing and line heights, aligned verse, and legible evidence prose. System CJK serif/calligraphic fallbacks are available; do not pretend an uninstalled calligraphy font exists. A licensed local font may be used when its actual source and redistribution terms are established; do not add a large full CJK font or a remote font dependency casually.
- Rich decoration is permitted when composed deliberately. Original code-native SVG landscape layers and meaningful borders/ornaments are appropriate. Keep illustrations out of dense evidence and prevent pointer interception (`aria-hidden`, appropriate pointer behavior). No unlicensed scraped artwork or invented historical quotations.
- Keep the existing “律” seal recognizable, but do not make another stamp the entire redesign.
- Design both empty/input and real report states as one coherent product. Preserve textarea identity, caret, focus, and IME while changing modes. A landing page that hands off to the unchanged old checker does not meet this assignment.

## 4. Visible motion with purpose

The user explicitly allows a more flamboyant interface. Use perceptible, coordinated motion rather than only button hover transitions:

1. A staged opening composition, such as landscape reveal, title entrance, and writing surface arrival. Suggested overall duration 500–900 ms; controls must be available immediately and no fake loading delay is allowed.
2. Strong but precise button/segment feedback (roughly 120–220 ms) and a clearly animated busy indication driven by the real `busy` prop.
3. A report reveal with manuscript/line rhythm, roughly 300–650 ms. Do not replay on keystrokes, character selection, or drawer toggles. Do not visually serialize a long poem so slowly that readers must wait.
4. Evidence drawer opening/closing and diagnosis-to-character emphasis. Preserve focus trapping, Escape, restoration, and immediate access to the content.
5. Optional ambient landscape movement only when it contributes to the selected direction. Prefer finite sequences; any persistent decorative motion must be pausable and stop when offscreen/hidden. Avoid flashing, scroll hijacking, custom cursors, or content that chases the pointer.

Use CSS/WAAPI already available; no animation dependency is required. Prefer transforms/opacity and avoid expensive continuous full-screen blur/filter work. `prefers-reduced-motion` must produce a complete immediate static experience with the same states and controls. Decorative assets failing to load must not break analysis.

## 5. Preserve verified functionality

The following already works and must survive:

- Three approved example buttons load exact provided text and preserve the selected rhyme book. Availability comes from props; never replace approved poems with decorative sample content.
- Actual `/` production route submits to the real API. `presentation-preview.html` is a synthetic fixture preview and cannot establish application acceptance.
- Character selection opens evidence. Candidate selection “改用此读音” calls the existing callback; choosing 更 as `pingshui:更:ping:八庚` then reanalyzing sends the existing override. Editing the text or changing the book clears old overrides through the business layer.
- Copy/download represent the current report and request. Pending, failed, and stale analysis correctly block exporting an obsolete report. Preserve the currently implemented disabled conditions and callbacks.
- Pass, fail, needs_review, not_applicable, unsupported, error, busy, and stale remain distinguishable without color alone. Do not beautify uncertainty into success.
- 黄鹤楼 historical genre tags remain visible without changing its actual `summary=fail`. Corrected trailing punctuation must not become duplicated Chinese glyphs again.
- Preserve actual Tab/Enter/Space/Escape operation, focus visibility and return, selectable evidence text, 44px touch targets, and 375/768/1440px usability. Seven-character verse wrapping at 375px is an approved fallback; do not clip characters to force a single line.

Keep existing behavior hooks where practical: `.pc-input__text`, `.pc-input__submit`, `.pc-segmented__option` and book input values, `.pc-examples__item`, `[data-token-id]`, `.pc-cell`, `[role=dialog]`, `.pc-candidate button`, `.pc-feedback`, `[role=alert]`, `.pc-report--stale`, `.pc-status--*`, `.pc-reading`, `.pc-punct`, `.pc-historical-tags`. Keep action labels “复制摘要”, “下载报告”, “改用此读音” discoverable. CSS classes may have a new appearance without changing their meaning. Do not weaken test assertions to hide a regression.

## 6. Implementation, visual review, and evidence

Deliver a representative working initial/report pair first, then polish. Use the skill's maximum of two focused visual refinement rounds; fix the most consequential 1–3 issues each round. Do not stop after writing a design manifesto.

Capture real running initial, real Pingshui report, and evidence-open states at 1440 and 375px, plus a 768px layout check. Include representative motion frames or a short local recording, reduced-motion behavior, and an error/stale state. Save new evidence separately under `docs/design/distinctive-ui/` with actual SHA/dirty state, viewport, route, data mode, and capture time. Do not overwrite historical evidence.

This conversation previously encountered image-content protocol errors when using Claude through a switching/proxy setup; the precise cause has not been verified. Use text-returning tools for implementation. Do not call image-returning tools or inject base64/image blocks into this Claude session unless the channel is independently known to support them. Browser tooling may save screenshots to disk and return paths/text. Codex can inspect those local images after the user switches back and provide visual feedback. If images have not actually been inspected, label visual review pending; a screenshot file alone is not a design review.

For an independent reviewer, provide only screenshots, audience/task, the selected brief, and any real references. Do not feed it expected scores or implementation excuses. If no independent reviewer is available, clearly label any visual review as self-review. Aesthetic ratings do not prove accessibility or functional correctness.

Run actual checks in the correct repository using Node 24.19.0 and pnpm 11.25.0:

```text
pnpm verify
pnpm test:e2e
```

The current CDP browser runner uses isolated ports. Do not run the legacy fixed-port scripts. `pnpm test:acceptance` is optional for a presentation-only change; if run, six Cilin/Xinyun evidence blocks are known baseline issues, not permission to loosen data gates. Baseline results were 733 unit tests and 18 passing browser scenarios; those are historical observations, NOT the result of your redesign. Report your actual exits/counts. If an environment prerequisite is unavailable, report the exact failed command and continue independent work.

## 7. Deliverable and completion criteria

Deliver implementation, `DISTINCTIVE-UI-DIRECTION.md`, and `docs/design/HANDOFF-DISTINCTIVE-UI.md` with changed files, base/head SHA, selected direction, visible differences, animation triggers, reduced-motion behavior, actual commands/results, screenshot locations, exact preview URL/start command, and remaining limitations. Commit a reviewable feature branch; never merge main automatically.

The first review must visibly demonstrate all three: **a new composition, a much stronger poetry identity, and perceptible motion**. Preserve working analysis/evidence/export interactions. Do not call it “top-tier” solely because a model awards itself a high score; show the actual result and let the user judge.

After implementation, update `docs/design/visual-spec.md` to describe the actual new design and point to the new handoff. Do not leave the earlier subtle-refinement spec presented as the current visual specification.
