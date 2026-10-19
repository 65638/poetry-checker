# Codex review — mobile reveal fix closure

Date: 2026-10-20 (Asia/Shanghai). Reviewed clean HEAD: `ee805cd0f8bafa6e73eb165c5c89cbfcf5b38a36`; implementation: `bcaf7fb`. No product code changes, push, or merge performed by this review.

## Outcome

**The P2 reported in the round-2 review is closed.** No additional blocking finding was identified in this focused code and browser review. The earlier two layout findings remain closed. This is technical acceptance of the reviewed increment, not visual approval or full-project completion.

`CheckerView` now records submission intent before invoking the callback, consumes it when a distinct successful report arrives, and clears it on draft edits or explicit wheel/touchmove events. It checks completion and report identity instead of relying on focus or a changed text hash. The real pointer path now reveals the report even though the disabled submit button has lost focus. Keyboard submission retains textarea focus; the reveal itself does not focus another element.

## Independently executed checks

Node 24.19.0 / pnpm 11.25.0, all run on clean `ee805cd`:

| Check | Result |
|---|---|
| `pnpm verify` | exit 0; 53 files / 733 tests; lint, typecheck, builds and 8 generated checks passed |
| `pnpm test:e2e --out artifacts/acceptance/ui-reveal-fix-browser` | exit 0; 18 passed / 0 blocked / 0 failed |
| Codex targeted script, extended with unchanged-text Ctrl+Enter | exit 0; 10/10 |
| `node docs/design/distinctive-ui/reveal-regression.mjs` | exit 0; 9/9 |
| `git diff --check c28b342..ee805cd` | exit 0 |

The two targeted scripts have overlapping coverage; their counts are reported separately, not as 19 distinct feature scenarios.

The former pointer failures now each call manuscript `scrollIntoView` once, using `auto` under reduced motion and `smooth` otherwise. At 375×812 the resulting manuscript top is about 16px. Ctrl+Enter works for the initial report and for reanalysing unchanged text, in both motion modes; focus stays in the textarea in those cases.

The regression script also confirms unchanged-text pointer reanalysis, no reveal on controlled HTTP failure, no delayed reveal after draft-edit cancellation, no reveal after a real wheel event during a delayed request, and no automatic reveal at 1440px. Recorded outcomes include error=true on failure, report=false after edit cancellation, and report=true after the user-scroll case. Failure/delay modes are explicitly controlled browser scenarios; they are not production backend failures.

Previously checked findings behavior remains intact: tally/content preservation, default collapse, Space/Enter operation, hidden items skipped by Tab, selected settled item remaining open, and 黄鹤楼 attention items remaining visible with summary `fail`.

## Evidence and remaining limits

- [Codex targeted results](distinctive-ui/review-reveal-fix-codex/targeted.json)
- [Reveal regression results](distinctive-ui/review-reveal-fix-codex/reveal-regression.json)
- Local extended reproduction script: `artifacts/acceptance/ui-reveal-fix-targeted.mjs`
- Local verify log: `artifacts/acceptance/ui-reveal-fix-verify.log`
- Local standard browser evidence: `artifacts/acceptance/ui-reveal-fix-browser/`

The targeted scenario label was corrected from the previous overbroad “reopens” to “selection retained and open.” An externally supplied selection of an already hidden finding is not separately certified by this probe.

Real touchscreen gestures/hardware, every possible manual-scroll method, and screenshot aesthetics remain unverified. No images were returned or inspected under the active text-only restriction. Both planned visual refinement rounds have finished; no further redesign is requested by this review.
