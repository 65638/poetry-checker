# Codex review — distinctive UI, round 2

Date: 2026-10-20 (Asia/Shanghai). Reviewed HEAD: `4b2b114`; implementation: `3e1d451`; prior review: `589f59e`. Product code was not changed, pushed, or merged during this review.

## Decision

Both previous P2 layout findings are resolved in the measured scenarios. Findings disclosure preserves the report contents and works with keyboard operation. One new P2 interaction defect remains in the optional auto-scroll. Address it with a focused bug fix, not a third visual redesign round. Actual screenshot visual review remains pending under the text-only restriction; this review does not assign an aesthetic score.

## P2 — Clicking Analyze does not trigger the new mobile result scroll

Location: `apps/web/src/presentation/CheckerView.tsx:49` (effect at lines 45–53).

The effect checks whether `document.activeElement` is inside `.pc-plinth` when the report arrives. A real pointer click focuses the Analyze button, but setting that button disabled while the request is pending removes its focus. When the response arrives the active element is the document body, and the guard returns without scrolling. The normal click path therefore fails the behavior described in the handoff.

Reproduced with a real API response at 375×812, both with and without reduced motion:

| Trigger | Expected automatic manuscript scroll | Observed |
|---|---|---|
| Pointer click on Analyze, reduced motion | One `scrollIntoView`, `behavior=auto` | Zero calls; report top remains about 551px |
| Pointer click on Analyze, normal motion | One `scrollIntoView`, `behavior=smooth` | Zero calls; report top remains about 551px |
| Ctrl+Enter in textarea, reduced motion | One immediate scroll | Passed; report top about 16px, textarea focus retained |
| Ctrl+Enter in textarea, normal motion | One smooth scroll | Passed; report top about 16px, textarea focus retained |

Suggested fix: record the user's submission intent before calling `onAnalyze`, then consume it on the corresponding successful completion. Do not infer the trigger from focus after an asynchronous request. Clear pending intent on failure/cancellation/input changes, and avoid yanking the viewport if the user has deliberately moved elsewhere. Also account for a new successful response having the same input hash; the current dependency is only the text hash. Alternatively, remove this optional auto-scroll and its claim if it cannot be made reliable within the remaining time.

Regression acceptance: real pointer click and Ctrl+Enter; normal/reduced motion; unchanged-text reanalysis; no delayed scroll after cancellation, failure, or abandoned input. No focus theft or textarea remount.

## Previous findings verified closed

- At 900×900 the report body is 322px wide and the four five-character lines each remain on one row. Verified additional widths 899/1024/1100/1280/1366/1440 plus 768/375. No document horizontal overflow in these runs.
- Initial Analyze button bottom is 772px at 1440×900 and 728px at 1366×768. Examples are above the textarea and inside those first viewports.
- The real 登鹳雀楼 report retains all 36 findings with matching messages and status tally. All 36 settled findings start in the closed native disclosure. Space opens it, Enter closes it, and Tab skips hidden finding buttons. Selecting a visible settled finding keeps it selected and the disclosure open.
- The real 黄鹤楼 report retains all 96 findings. All nine attention findings remain outside the disclosure; no fail/uncertain/unsupported item is hidden there, and the actual summary remains `fail`.
- Report height in this run: 1577px at 1440×900 and 2215px at 375×812. Heights vary with viewport and font metrics; do not mix them with measurements at 1440×1000.

The targeted scenario originally named `settled-selection-is-retained-and-reopens` only verifies selection while the section is open. It does not separately exercise an externally supplied selection of a hidden finding. Treat its scope as **selection retained and disclosure open**, not proof of every auto-reopen path.

## Independent checks

Executed on clean `4b2b114`, Node 24.19.0 / pnpm 11.25.0:

| Check | Actual result |
|---|---|
| `pnpm verify` | exit 0; 53 files / 733 tests, lint/typecheck/build/generated checks passed |
| `pnpm test:e2e --out artifacts/acceptance/ui-review-round2` | exit 0; 18 passed / 0 blocked / 0 failed |
| Additional review scenarios, real isolated API/browser | exit 1; 6 passed / 2 failed (both pointer auto-scroll modes above) |
| `probe.mjs`, default viewports and `PROBE_SIZES` intermediate widths | exit 0 |
| `git diff --check 589f59e..4b2b114` | exit 0 |

Review evidence: [targeted results](distinctive-ui/review-round2-codex/targeted.json), [intermediate geometry](distinctive-ui/review-round2-codex/geometry.txt). These files preserve the original review outputs, including the two failures. Local reproduction script: `artifacts/acceptance/ui-round2-targeted.mjs`; verify log: `artifacts/acceptance/ui-review-round2-verify.log`; standard browser output: `artifacts/acceptance/ui-review-round2/`.

No screenshots were loaded into the model. Existing PNGs and their manifests were inspected only as files/metadata. The visual refinement budget is exhausted; this remaining issue is an interaction correctness fix, not a new aesthetic iteration. No data release or full D3 completion is implied.
