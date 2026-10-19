# Codex review — distinctive UI, round 1

Date: 2026-10-20 (Asia/Shanghai). Reviewed branch: `feat/claude-distinctive-poetry-ui`; HEAD `21b343f`; implementation `7bbfd54`; base `1917581`. Review only: no product source changes, no push or merge.

## Verdict

The implementation passes the independently rerun automated checks. It needs a second layout refinement before design sign-off. The current conversation still prohibits image-returning tools, so this review uses source inspection and live browser geometry, not visual inspection of the PNGs. **Pixel-level visual review remains pending; no aesthetic score is assigned.**

## Findings

### P2 — Intermediate widths leave too little room for the report

Locations: `apps/web/src/presentation/styles/layout.css:137` and `:394`; `apps/web/src/presentation/styles/report.css:35`.

The main layout retains a 400px input column until the viewport drops below 900px. The status component independently retains three columns until 599px. In a real Pingshui 登鹳雀楼 report at 900×900, the report sheet measures 413px wide, the status body only 88px wide, and its label wraps across four lines. The status block is 547px tall. All four five-character verse lines wrap onto two rows despite ample width being reserved for the input. At 899px the layout suddenly stacks and the status body becomes 511px wide. This is a measurable responsive hierarchy failure, although there is no horizontal overflow.

Round 2: base report layout changes on available component width, or stack/shrink the input column earlier. Let the actions move below the verdict before the central text becomes a narrow strip. Verify 899/900/1024/1100px as well as the existing three viewport sizes. Keep the approved 375px seven-character wrapping behavior; this finding concerns unnecessarily wrapped five-character verse on a larger viewport.

### P2 — The main action misses the requested first desktop viewport

Locations: `apps/web/src/presentation/styles/input.css:21`, `apps/web/src/presentation/components/InputPanel.tsx:55`, and `apps/web/src/presentation/styles/layout.css:64`.

At 1440px wide the Analyze button starts at y=905 and ends at 961; at 1280×900 it has the same placement and is completely below the initial viewport. Lowering textarea `min-height` to 168px does not make it 168px tall: its unchanged `rows={6}` and line-height produce an actual height of 266px. The input sheet still measures 821px tall. Capturing desktop only at 1000px viewport height conceals this gap against the brief's first-viewport requirement.

Round 2: reduce the actual initial textarea height/rows while retaining manual resize and the same DOM identity. Compress repeated form spacing and reconsider how much vertical space the opening stage consumes. Make the input, book selection, Analyze button, and a discoverable example entry usable at 1440×900 and 1366×768 without an introductory scroll. Do not solve this by shrinking touch targets or removing required explanations.

## Additional refinement recommendation

The report still overwhelms its short poem with unfiltered findings: a real twenty-character 登鹳雀楼 produces 36 findings, a 5411px document at 1440px, and a 10882px document at 375px. Two-column rows improve the old length but do not establish information priority. Consider a compact overview with an accessible disclosure for passed checks; keep failed/uncertain items prominent and every original finding, ID, explanation, and location reachable. This is a presentation recommendation, not a request to change the API, remove findings, or reinterpret the summary.

On mobile, the report starts at y=927 and the annotated reading section at y=1427; the first actual character begins at y=1569. After a user submits, ensure the result is discoverable without traversing a second long form. Preserve keyboard focus and avoid moving the textarea or causing an IME remount.

## Independent verification

Executed against `21b343f` with Node 24.19.0 and pnpm 11.25.0:

| Command | Actual outcome |
|---|---|
| `pnpm verify` | exit 0; 53 files / 733 tests; lint, typecheck, build and 8 generated checks passed |
| `pnpm test:e2e --out artifacts/acceptance/ui-review-21b343f` | exit 0; 18 passed / 0 blocked / 0 failed |
| `node docs/design/distinctive-ui/probe.mjs` | exit 0; measured 1440/768/375px initial and real report states |
| Local supplementary geometry probe | exit 0; measured 1280/1100/1024/900/899px at 900px height |
| `git diff --check 1917581..HEAD` | exit 0 |

Local reproduction evidence (ignored artifacts, not source changes):

- `artifacts/ui-review-verify.log`
- `artifacts/acceptance/ui-review-21b343f/`
- `artifacts/acceptance/ui-review-probe.mjs`
- `artifacts/acceptance/ui-review-geometry.txt`

The existing browser suite does not certify subjective visual quality, the entire keyboard matrix, IME on every platform, or every responsive width. Its 18 passing scenarios must retain their existing scope. No new data approvals or API claims are made by this review.

## Handoff for round 2

Keep the chosen ink/landscape direction. Fix the two concrete layout findings first, then prioritize the report's information hierarchy if time permits. Capture desktop at 900px and 768px heights, not only 1000px, plus the intermediate-width report and 375px mobile states. Run the same real browser suite and verification checks after changes. Continue returning text and local screenshot paths under the current channel restriction; actual image review is still required before a visual approval claim.
