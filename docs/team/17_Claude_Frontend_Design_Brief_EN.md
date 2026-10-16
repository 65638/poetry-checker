# Claude Frontend Design and Presentation Brief

Document version: 1.3. Public API contract: 1.0. Project: a Chinese poetry meter and rhyme checker built by six students over five days.

## Ready-to-use request

Please help implement the visual presentation of this educational web application using React, TypeScript, and CSS. Use the project files and tools available in your current session. Start by reviewing the existing repository, its collaboration guidance, and this brief. Preserve existing work and follow the agreed file ownership.

Your deliverables are a coherent visual system, responsive React presentation components, and an accurate record of validation. Member D owns application state, API integration, pronunciation selection, and exports. Work through the component interface below. Keep the interface in Simplified Chinese; this English document is for development instructions.

Please implement a small, reviewable first slice before expanding to the remaining states. If repository access or a tool is unavailable, describe the limitation and provide the relevant files or patch with relative paths. Record checks as passed only after running them. Ask for clarification when a material requirement is unclear, and continue independent work where practical.

## 1. Context and current status

The product helps readers inspect tone patterns, rhyme groups, metrical diagnostics, and pronunciation evidence. It supports three selected rhyme books and distinguishes definite violations from uncertain readings, inapplicable rules, and unsupported forms.

The repository currently contains contract schemas, generated OpenAPI documentation, synthetic response fixtures, basic metrical templates, and foundation tests. The complete analyzer, real datasets, API, and frontend are still under development. Existing foundation test results do not establish that the full application works.

The intended stack is React + TypeScript + Vite, with a Fastify API in a pnpm workspace. Zod schemas in `@poetry/contracts` are the authoritative source for public types. Your work concerns presentation; analysis decisions are supplied by the backend.

Claude access is a planned option, not an established integration. The project lead coordinates this work. If that option is unavailable, Codex can take over the same presentation scope. Member D remains the human owner of the frontend module.

## 2. Ownership and deliverables

| Owner | Responsibility |
|---|---|
| Claude, when available | Visual direction, design tokens, responsive layout, presentation components, accessibility behavior, visual review |
| Member D and their coding assistant | View contract, application containers, API client, request lifecycle, pronunciation overrides, exports, mock scenarios, interaction tests |
| Codex | Core analysis and contracts; review that the UI represents results accurately; presentation fallback under an explicit path handoff |
| Project lead and integration assistant | Dependency installation, build configuration, integration, final design choice |
| Member E | System acceptance, mobile and keyboard checks, end-to-end regression |

Your writing scope after the lead assigns it is:

```text
apps/web/src/presentation/
  CheckerView.tsx
  components/
  styles/
  preview/
apps/web/public/design/
docs/design/
```

D owns `apps/web/src/view-contract.ts`, `src/app/`, `src/api/`, `src/features/`, `src/hooks/`, `src/main.tsx`, `fixtures/mocks/`, and `docs/ui.md`. The integration assistant maintains package manifests, dependencies, and the lockfile.

Use one active writer per path. For a change outside your scope, provide a concrete patch request and coordinate the handoff through the lead. When presentation ownership moves between Claude and Codex, record the current commit, affected paths, and remaining work in `docs/ownership.md` and `docs/handoffs/`.

Deliver `CheckerView.tsx`, supporting components and styles, a development preview, `docs/design/visual-spec.md`, a visual acceptance record, and `docs/design/HANDOFF.md`. Prefer system fonts and CSS so the classroom demonstration works offline. Additional product features, marketing pages, accounts, dark mode, illustration commissions, and framework migrations are outside this task.

If your session has no repository access, provide complete files or patches with relative paths. The lead will arrange local integration and validation. Treat unrun checks as unrun, and do not report a local edit, screenshot, or deployment that did not occur.

## 3. First two hours

1. Inspect available files, repository guidance, ownership, and uncommitted changes. Read existing contracts and fixtures.
2. Coordinate the view interface with D. Use the concrete visual baseline below to create one direction rather than several speculative concepts.
3. Implement an initial 1440px and 375px layout with an input panel, a needs-review report, and an open evidence panel. Include working event callbacks.
4. Preview it in the existing Vite setup if available. If application setup is pending, deliver mountable React components while D continues the container work.
5. Record the first slice, validation results, and missing states in the handoff. Continue with all report statuses, loading/errors, long evidence, and keyboard behavior.

The lead timeboxes connection setup to about one hour. If access is unavailable, or there is no reviewable first slice after approximately two working hours, the lead may activate the fallback. D continues application work using fixture-driven containers throughout.

## 4. Presentation interface

D places this interface in `apps/web/src/view-contract.ts` during the first working hour of D1. Import it; avoid maintaining a second definition. The following is a shared draft, not a claim that application source already exists.

```ts
import type {
  AnalyzeRequest, AnalysisResponse, ReadingOverride,
} from '@poetry/contracts';

export type InputDraft = Pick<
  AnalyzeRequest, 'text' | 'rhymeBook' | 'genreHint' | 'formHint'
>;

export interface CheckerViewProps {
  draft: InputDraft;
  report: AnalysisResponse | null;
  busy: boolean;
  stale: boolean;
  error: { code: string; message: string } | null;
  feedback: string | null;
  selectedTokenId: string | null;
  selectedFindingId: string | null;
  examples: Array<{ id: string; title: string; text: string }>;
  onDraftChange: (next: InputDraft) => void;
  onAnalyze: () => void;
  onLoadExample: (exampleId: string) => void;
  onSelectToken: (tokenId: string) => void;
  onSelectFinding: (findingId: string) => void;
  onChooseReading: (override: ReadingOverride) => void;
  onCloseEvidence: () => void;
  onCopySummary: () => void;
  onDownloadReport: () => void;
}
```

The presentation entry is `export function CheckerView(props: CheckerViewProps)`.

- D owns `draft`, `report`, the request lifecycle, and overrides. Presentation components render these values and invoke callbacks.
- `stale` means the visible report no longer matches the current input. Mark it clearly; disable selecting a pronunciation from that report. `busy` also disables conflicting pronunciation changes while keeping input editing available.
- `feedback` carries non-diagnostic notices such as successful copying. `error` describes a request or validation failure. Unknown readings are ordinary report content, not network errors.
- `onChooseReading` sends only an existing token/candidate pair. D validates and attaches `inputHash`, merges overrides, and requests a new analysis.
- `onDraftChange` expresses an edit. D handles incompatible genre/form choices and clears obsolete selections on text or rhyme-book changes.
- `selectedTokenId` opens evidence; `selectedFindingId` identifies a diagnostic to locate. The presentation layer handles DOM focus, a modal focus trap where appropriate, dismissal, focus restoration, and scrolling. D clears selection when the report identity changes.
- Render the backend's summary, findings, rhyme relations, and evidence without changing their meaning. Looking up an ID or grouping diagnostics is appropriate; recalculating meter, a score, or a verdict is outside the presentation layer.
- Temporary local state for composition input or a disclosure is fine. Keep analysis data and network calls in D's layer.

## 5. Visual baseline: a poetry reading desk

Use a warm paper background, ink-colored text, restrained green and red accents, and generous but purposeful spacing. The hierarchy is poem first, result and rhyme-book policy second, then diagnostics and evidence. Use the Chinese product name supplied by the lead; without branding, use the existing descriptive product name.

| Token | Initial specification |
|---|---|
| Background / surface / divider | `#F7F5EF` / `#FFFFFF` / `#DDD8CC` |
| Primary / secondary text | `#262923` / `#666A61` |
| Primary action and pass accent | `#245C4B`; accompany a status with text and an icon |
| Definite violation | `#A52F2F` on a light `#FFF1EF` surface |
| Needs review | `#805500` on a light `#FFF6DE` surface |
| Inapplicable and unsupported | Neutral surfaces, with distinct labels, explanations, and icons |
| Focus | A visible 2px outline with a 2px offset |
| Spacing | 4, 8, 12, 16, 24, 32, 48px |
| Corners | Usually 8px; larger panels up to 12px |
| Text size | 16px controls/body, 14px supporting text; poem characters 28px desktop, 24px mobile |
| Fonts | System sans-serif for controls; local Song/Ming-style serif preference for poetry, with system fallbacks and supplementary-character coverage |

Check actual foreground/background combinations; target 4.5:1 for normal text and 3:1 for large text and necessary UI boundaries. These are starting specifications, not previously verified visual results. Keep refinements centralized in design tokens and settle the direction on D1.

### Layout

- At 1440px, center content at a maximum width of 1200px. Use 24–32px page margins, an input column around 340px, and a flexible report column with a 24px gap. Keep the header compact so the text input and analyze action are immediately accessible.
- At 768–1099px, use one column. The input can collapse after analysis if the current rhyme book and an edit action remain visible. An evidence panel should fit within the viewport with at least 16px edge clearance on each side.
- At 375px, use 16px page margins. A seven-character line should fit in the remaining 343px with approximately 44px targets and 4px gaps. Place punctuation without reducing the character targets; it may wrap at the line end. Use a full-width evidence panel when appropriate.
- Display each original character, its Chinese tone annotation, ambiguity marker, and rhyme-ending indicator. Preserve original order, punctuation, and correct token mapping.
- Place the conclusion and policy near the top of the report, followed by the poem and diagnostics. Keep evidence details in their panel; collapsible version information is fine, while the modern-tone policy must remain visible.
- Prefer clear groups and separators over a separate floating card for every field. Keep decoration modest so it does not displace the reading task.

### Required report states

| Backend summary | Meaning the Chinese UI must preserve |
|---|---|
| `pass` | Required implemented checks pass under the selected rhyme book and rule set; this is not a literary quality score |
| `fail` | Definite rule violations exist; show character location, expected/observed values, and evidence |
| `needs_review` | Readings, form, or required evidence remain unresolved; provide candidates and a next step |
| `not_applicable` | The regulated-verse checks do not apply; character-level tone and rhyme information remains available |
| `unsupported` | This form or a necessary rule is not implemented; a passing verdict is unavailable |

Also cover empty input, loading, HTTP 422/503, stale reports, long citations, missing fanqie data, and acknowledged metrical exceptions. Missing source information should be described as unavailable, with no invented reference.

## 6. Acceptance cases

| ID | Input or action | Expected result |
|---|---|---|
| CL01 | Empty report and text | Clear input, rhyme-book selector, and analyze action; keyboard-operable controls |
| CL02 | All five valid response fixtures | Five meanings remain distinct; uncertainty and unsupported results never appear as a green pass |
| CL03 | Select a diagnostic or character | Accurate callbacks and character-level highlighting, including related positions |
| CL04 | Multiple readings and a long citation | Readable candidates, reasoning, source, close action, and selection controls |
| CL05 | Loading, errors, and stale results | Input remains available; obsolete overrides cannot be reused; errors stay visible |
| CL06 | 1440px, 768px, and 375px | No clipped essential content; readable seven-character lines and responsive evidence panel |
| CL07 | Tab, Escape, close panel | Visible focus, accessible dismissal, and focus restored to the triggering control |
| CL08 | Reviewed examples: Deng Guan Que Lou, Jing Ye Si, Huang He Lou | Load the approved text through callbacks; the UI does not hardcode the poem's verdict or genre |
| CL09 | Modern rhyme-book result and an accepted metrical exception | Policy remains visible; original deviation, compensating position, and rule are available |
| CL10 | Selection, book switching, and export | Callbacks connect to D's state; presentation never changes the report or exported data |

Use `fixtures/contracts/` for development states. Those fixtures use synthetic tone-pattern characters; label them as development examples rather than presenting them as actual analyses of famous poems. D owns additional mock scenarios and validates them against the shared Schema.

Provide the preview entry, real screenshots at 1440px and 375px when your tools support them, tested dimensions, and an acceptance record. E checks tablet and keyboard boundaries; D verifies callbacks and real flows. When rendering is unavailable, deliver the runnable code and explicitly leave visual acceptance pending. Focus automated tests on behavior, not static wording or individual animation frames.

## 7. Schedule and optional motion

| Day | Design contribution | D's parallel work |
|---|---|---|
| D1 | Initial slice within about two working hours; settle tokens, layout, five states, and evidence structure | View contract, mock/API client, container state, first submission loop |
| D2–D3 | Complete responsive states, evidence layout, and focus behavior; integrate real responses | Real API, precise selection, pronunciation overrides, exports; freeze P0 on D3 |
| D4 | One concentrated visual review and fixes | Interaction, accessibility, and system regression |
| D5 | Morning fixes only; support rehearsal in the afternoon | Final checks; reserve at least half a day for integration and rehearsal |

Keep visual direction changes to at most two consolidated rounds on D1. Functional and accessibility defects still receive fixes afterward. The team keeps its existing six-person budget; additional AI assistance does not expand P0 or consume the rehearsal slot.

Optional P1 animation starts only after every P0 acceptance criterion passes and the lead allocates remaining time. The design owner handles presentation transitions, D handles state/cancellation integration, and E performs regression. The existing allowance remains roughly 2–4 hours of D's coordination and implementation effort plus 0.5 hour of E's review, not another separate design phase.

Suggested durations are 100–150ms for control feedback, 150–250ms for results, 200–250ms for evidence panels, and approximately 200–300ms for diagnostic scrolling. Prefer CSS. Show new results immediately, interrupt obsolete transitions, and respect `prefers-reduced-motion`, including JavaScript scrolling. Keep focus and exported data correct throughout.

## 8. HANDOFF format

```text
Access mode: repository tools / chat-only delivery
Branch, commit if available, and owned paths:
Implemented views, states, and dimensions:
Entry component, interface version, and design tokens:
Commands actually run and their results:
Screenshot paths and checks not run:
Callbacks or state work D still needs to connect:
Open visual, functional, or accessibility issues:
Dependency proposals, if any:
Path handoff and next small deliverable:
```

## 9. Public contract reference

The types below are copied directly from the team's shared contract during document generation. They describe the payload; the implementation's Zod schemas and the lead's recorded freeze remain authoritative. Import exported types in application code instead of copying this reference into source files.

```ts
export type BookId = 'pingshui' | 'cilin' | 'xinyun';
export type FormId = 'wujue' | 'qijue' | 'wulv' | 'qilv';
export type Tone = 'P' | 'Z';
export type CheckStatus =
  | 'pass' | 'fail' | 'uncertain' | 'not_applicable' | 'unsupported';
export type SummaryStatus =
  | 'pass' | 'fail' | 'needs_review' | 'not_applicable' | 'unsupported';

export interface Versions {
  data: string;
  rules: string;
  context: string;
  works: string;
}

export interface SourceRecord {
  id: string;
  title: string;
  edition: string | null;
  url: string | null;
  license: string;
  snapshotSha256: string | null;
  revision: string | null;
  retrievedAt: string | null;
}

export interface Evidence {
  id: string;
  sourceId: string;
  kind: 'rhyme_entry' | 'dictionary' | 'fanqie' | 'context' | 'work_metadata';
  locator: string;
  assertion: string;
  excerpt: string | null;
  reviewStatus: 'approved' | 'unverified';
}

export interface RuleCard {
  id: string;
  version: string;
  name: string;
  scope: string;
  statement: string;
  limitations: string[];
  evidenceIds: string[];
}

export interface ReadingCandidate {
  id: string;
  character: string;
  book: BookId;
  toneClass:
    | 'ping' | 'shang' | 'qu' | 'ru'
    | 'yinping' | 'yangping' | 'neutral' | 'ze_unspecified';
  tone: Tone | null;
  groupIds: string[];
  gloss: string | null;
  modernReading: null | {
    pinyin: string;
    toneNumber: 1 | 2 | 3 | 4 | 5;
    evidenceIds: string[];
  };
  fanqie: null | { text: string; evidenceIds: string[] };
  evidenceIds: string[];
}

export interface RhymeGroup {
  id: string;
  book: BookId;
  name: string;
  toneClass: string | null;
  evidenceIds: string[];
}

export interface LookupResult {
  book: BookId;
  dataVersion: string;
  entries: Array<{ character: string; candidates: ReadingCandidate[] }>;
  missing: string[];
  groups: RhymeGroup[];
  evidence: Evidence[];
  sources: SourceRecord[];
}

export interface ParsedToken {
  tokenId: string;
  text: string;
  line: number;
  column: number;
  startUtf16: number;
  endUtf16: number;
}

export interface ParseNotice {
  code: string;
  message: string;
  startUtf16: number;
  endUtf16: number;
}

export interface ParsedPoem {
  originalText: string;
  inputHash: string;
  lines: Array<{ line: number; text: string; tokenIds: string[] }>;
  tokens: ParsedToken[];
  quality: 'ok' | 'needs_review';
  notices: ParseNotice[];
}

export interface ReadingOverride {
  tokenId: string;
  readingId: string;
}

export interface ContextRule {
  id: string;
  target: string;
  exactPhrases: string[];
  targetOffset: number;
  sense: string;
  book: BookId;
  selectCandidateIds: string[];
  negativeExamples: string[];
  evidenceIds: string[];
  reviewStatus: 'approved' | 'unverified';
}

export interface AnnotatedToken extends ParsedToken {
  candidates: ReadingCandidate[];
  effectiveCandidateIds: string[];
  readingStatus: 'resolved' | 'ambiguous' | 'unknown';
  selectedReadingId: string | null;
  selectionMethod: 'unique' | 'context_rule' | 'user' | 'unresolved';
  possibleTones: Tone[];
  toneStatus: 'resolved' | 'ambiguous' | 'unknown';
  tone: Tone | null;
  reason: string;
  evidenceIds: string[];
}

export interface AnnotatedPoem extends Omit<ParsedPoem, 'tokens'> {
  book: BookId;
  tokens: AnnotatedToken[];
}

export interface TemplateCandidate {
  id: string;
  formId: FormId;
  lineTypes: Array<'A' | 'B' | 'C' | 'D'>;
  expectedTones: Tone[][][];
  requiredRhymeLines: number[];
  evaluatedKeyRate: number;
  features: {
    toneFit: number | null;
    relationFit: number | null;
    rhymeFit: number | null;
    parallelismFit: number | null;
  };
  score: number | null;
}

export interface WorkMetadata {
  id: string;
  title: string;
  author: string | null;
  approvedTextFingerprints: string[];
  formFamily: 'regulated' | 'ancient' | 'undetermined' | 'unsupported';
  formId: FormId | null;
  historicalTags: string[];
  evidenceIds: string[];
  reviewStatus: 'approved' | 'unverified';
}

export interface GenreDecision {
  formFamily: 'regulated' | 'ancient' | 'undetermined' | 'unsupported';
  formId: FormId | null;
  historicalTags: string[];
  applicability: 'applicable' | 'not_applicable' | 'uncertain' | 'unsupported';
  basisType: 'user' | 'reviewed_metadata' | 'heuristic';
  candidateTemplateIds: string[];
  selectedTemplateId: string | null;
  reasons: string[];
  evidenceIds: string[];
}

export interface Finding {
  id: string;
  ruleId: string;
  ruleVersion: string;
  status: CheckStatus;
  severity: 'error' | 'warning' | 'info';
  locations: Array<{ tokenId: string; line: number; column: number }>;
  expected: string[];
  observed: string[];
  message: string;
  templateId: string | null;
  evidenceIds: string[];
  resolvedBy: string | null;
  relatedFindingIds: string[];
}

export interface ProsodyReport {
  candidates: TemplateCandidate[];
  selectedTemplateId: string | null;
  checks: Finding[];
  rhyme: {
    status: CheckStatus;
    tokenIds: string[];
    commonGroupIds: string[];
  };
  relations: Array<{
    kind: 'nian' | 'dui';
    tokenIds: string[];
    status: CheckStatus;
    findingIds: string[];
  }>;
}

export interface AnalyzeRequest {
  text: string;
  rhymeBook: BookId;
  genreHint: 'auto' | 'regulated' | 'ancient';
  formHint: 'auto' | FormId;
  ruleSet: 'teaching-v1';
  inputHash?: string;
  readingOverrides: ReadingOverride[];
}

export interface AnalysisResponse {
  schemaVersion: '1.0';
  inputHash: string;
  versions: Versions;
  policy: {
    rhymeBook: BookId;
    toneBasis: 'historical' | 'mandarin_base';
    notice: string;
  };
  poem: AnnotatedPoem;
  genre: GenreDecision;
  prosody: ProsodyReport;
  provenance: {
    groups: RhymeGroup[];
    sources: SourceRecord[];
    evidence: Evidence[];
    rules: RuleCard[];
  };
  summary: { status: SummaryStatus; message: string };
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    fieldErrors: Array<{ path: string; message: string }>;
  };
}
```

### HTTP endpoints

| Method and path | Request | Successful response |
|---|---|---|
| POST `/api/v1/analyze` | `AnalyzeRequest` | `AnalysisResponse` |
| GET `/api/v1/rhyme-books` | None | `{books:[{id,name,dataVersion,groupCount,coverageNotice}]}` |
| GET `/api/v1/characters/{char}?book=...` | One character and `BookId` | `LookupResult` |
| GET `/api/v1/rules/{ruleId}` | Rule ID | `{rule,evidence,sources}` |
| GET `/api/v1/sources/{sourceId}` | Source ID | `{source,evidence}` |
| GET `/healthz` | None | `{status:"ok"}` |
| GET `/readyz` | None | `{status:"ready",versions}` |

D implements the client; these paths are context for the presentation task. Validation errors use 422, oversized input 413, missing resources 404, unavailable data 503, and unexpected server errors 500. Missing characters or unresolved readings are normal 200 reports. Input limits are 2,000 Unicode code points and 100 poem lines, enforced on the server.

### Meaning and invariants

- `P` means level tone; `Z` means oblique tone. Unknown is missing information, not a third actual tone.
- `line` and `column` are one-based Chinese-character positions. `startUtf16` and `endUtf16` form a half-open range in the original JavaScript string. Punctuation does not consume a metrical position. Token IDs use `l{line}c{column}`.
- `inputHash` is lowercase SHA-256 of the exact UTF-8 input. Pronunciation overrides require the matching hash and an existing candidate for that character and rhyme book. Changed text or book invalidates previous selections.
- A reading may remain ambiguous even when all effective candidates share one tone. A candidate with unknown tone must not disappear from the uncertainty display. A user-selected reading is labeled as a user choice, not a scholarly source.
- Preserve one-character/multiple-reading and multiple-rhyme-group membership. Display modern pinyin as a modern reading reference, not a reconstruction of historical pronunciation. Render source text and fanqie only when supplied.
- Pingshui has 106 groups, Cilin Zhengyun has 19, and Zhonghua Xinyun has 14. Traditional books treat entering tone as oblique. Xinyun uses Mandarin dictionary base tones: first/second level, third/fourth oblique. The UI should explain that modern-tone results can differ from traditional analysis of the same poem. Selecting Cilin does not enable ci tune-pattern checking.
- A historical yuefu label can coexist with a regulated form. A poem failing a template is not automatically ancient verse. A reviewed Jing Ye Si example is treated as an ancient quatrain; Huang He Lou retains its regulated seven-character form and special irregularity explanation. Render the API decision rather than guessing from the title.
- `not_applicable` and `unsupported` have different meanings. Preserve `error`, `warning`, and `info` severity independently from check status. Three-oblique-tone endings are warnings under the project's current policy.
- Accepted exceptions retain the original deviation and its `resolvedBy` / `relatedFindingIds` relationship. `expectedTones` represents a basic template, not complete permission to ignore exceptional constraints.
- Every displayed evidence/rule/source reference should resolve through the payload or the agreed endpoint. Unverified evidence is visibly pending and cannot be presented as verified support. Render user text as text, not executable markup.
- The API owns summary calculation. The presentation preserves definite failures, required uncertainty, inapplicability, and unsupported coverage; it does not infer a pass from an empty diagnostic list.

This brief is a regular development request within the supplied project. Repository and platform permissions continue to apply; no deployment, credential access, or external messaging is required for the presentation deliverable.
