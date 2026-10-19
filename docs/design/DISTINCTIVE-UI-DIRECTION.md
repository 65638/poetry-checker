# Distinctive UI direction: three concepts and the choice

Author: Claude (presentation). Skill: pinned `distinctive-ai-design` (SKILL.md + references/review-and-media.md).
Mandate: the user's bold, theatrical, exhibition-grade redesign request ("大胆浮夸"). The brief section 5 functional list is binding.

## Concept A: illuminated landscape scroll (手卷)
- Composition: one horizontal band like an unrolled handscroll. Input at the scroll head, the poem unrolls rightwards, evidence shows as colophon slips.
- Hierarchy: the poem is centred, verdict is a small inscription at the scroll end.
- Type: vertical display lettering for the title, horizontal working text.
- Motion: the scroll "unrolls" with a wide clip reveal on report.
- Risk: horizontal reading fights 375px and keyboard order. Unrolling needs clip-path or width animation (not transform-only). Rejected.

## Concept B: black-ink exhibition hall (墨厅)
- Composition: a full-bleed deep-ink stage with huge pale lettering and layered mountain silhouettes. Input sits on a lit paper "plinth", and the report is a manuscript sheet hung on the dark wall.
- Hierarchy: the stage introduces, the plinth works, the sheet is the event.
- Type: oversized serif display (120-180px desktop) as architecture, with poem cells at gallery scale.
- Motion: a staged lighting-up (stage, then lettering, then plinth). Lines are hung one by one on report, and the drawer slides in like a placard.
- Risk: dark surfaces lower the contrast budget. The dense evidence area must stay on light paper.

## Concept C: vermilion typographic edition (朱字版)
- Composition: a poster grid with giant vermilion characters cropped by the viewport edge, black body text and hard rules.
- Hierarchy: the typography itself is the image, with the poem set like a broadside.
- Motion: characters slide into the grid on load.
- Risk: vermilion at that scale competes with the fail colour. Loud but generic "poster" energy, and it reads as decoration, not as the checker's own subject.

## Comparison
| | A scroll | B ink hall | C vermilion |
|---|---|---|---|
| First-viewport input usable | weak | strong (plinth overlaps stage) | medium |
| Poem as central event | strong | strong | medium |
| 375px fit | poor | good (stage compresses to a band) | good |
| Status colours stay distinct | good | good (light sheet) | poor (red saturation) |
| Theatrical ambition | medium | high | high |

## Choice: B, "Mountains, Ink, and Verse" (山·墨·诗), with A's vertical lettering as an accent
B is the only concept that is both theatrical and keeps the working surfaces on paper with full contrast.

## Executable brief
- User and task: someone checking a classical poem. Type or paste, pick a rhyme book, read the annotated verdict, inspect a character's evidence.
- Feeling: entering a quiet exhibition hall at dusk. Ink mountains, a spotlight on paper, a red seal.
- Metaphor: the poem is the exhibit, the input is the plinth, the report is the hung manuscript, evidence is the curator's placard.
- Composition (desktop):
  - A dark ink stage spans the top and the left.
  - The giant title 「山墨詩」-style lettering sits on the stage: 「诗」 is huge and partly cropped, with a vertical 「格律」 alongside.
  - The plinth (input card) overlaps the stage edge on the left and is usable without scrolling.
  - The manuscript (report) occupies the right column on paper, ruled, with the poem in large serif cells.
- Composition (mobile): the stage collapses to a 200px band. The plinth follows immediately, then the manuscript.
- Colour: ink #14181a to #1f2629, warm paper #f4efe4, vermilion seal #b8321f, mineral green for 平 (#1f6b55). Status colours remain the existing semantic set on paper.
- Type: system CJK serif (Songti / SimSun / Noto Serif CJK) for the display and the poem, system sans for UI. No web fonts.
- Key interactions:
  - Staged opening (about 800ms; controls usable at t=0).
  - Busy: an ink brush stroke sweeping on the submit button and a circling seal ring on the manuscript.
  - Report: the verdict stamp drops, then lines hang at 70ms stagger (about 600ms total) once per inputHash.
  - Drawer slides from the right (260ms in, 180ms ghost out).
  - Diagnosis focus pulses the related cells.
- Avoid: gradients-as-decoration on working surfaces, glassmorphism, particles, cursor effects, infinite loops (the busy loop stops with `busy`), and motion other than transform and opacity.
- Minimum first version: initial and report pair at 1440 and 375, evidence drawer, reduced-motion static parity.
