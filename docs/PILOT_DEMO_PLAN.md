# Research OS pilot demo plan

Status: planning artifact; no application or canonical scientific records are
changed by this document.

## Purpose

Make a short, credible 2–3 minute demonstration that lets a PI understand the
workflow in one sitting:

```text
paper → evidence → claim → hypothesis → experiment → next action
```

The demo should feel like a real research workflow with a carefully selected
visual path, not a tour of every feature. The UI is the visible companion; the
canonical Markdown vault and explicit evidence boundaries remain the source of
authority.

## Demo-fixture safety gate

The live lab vault is not automatically a filmable demo dataset. Its
hypotheses and experiments may be private, and the current public records do not
necessarily form the exact paper → claim → hypothesis → experiment chain shown
below. Before capture, create a separate, clearly labelled `demo` project (or
an equivalent redacted fixture) containing synthetic or explicitly public
summaries only. Validate every stable ID, privacy field, source link, and typed
edge in that fixture. Never copy private record bodies into the fixture, and do
not change canonical scientific records merely to make the storyboard flow.

The routes in the shot list use the valid project-id `demo-evidence`;
replace it only if the generated fixture manifest chooses another lowercase
ID. They remain illustrative record IDs until that manifest confirms them. The recording must show a visible “DEMO DATA ·
NONCANONICAL” label and must pass the privacy/readiness checks immediately
before capture.

## Research-informed design decisions

The plan follows a few durable principles rather than adding decorative motion:

- Motion should explain hierarchy, continuity, feedback, or focus. Apple’s
  motion guidance recommends purposeful, brief, precise feedback, and warns
  against gratuitous motion and motion that blocks interaction:
  [Apple Human Interface Guidelines — Motion](https://developer.apple.com/design/human-interface-guidelines/motion).
- A map transition should preserve spatial continuity. Material Design’s
  motion guidance uses shared-axis transitions for peer views and reverse,
  quicker motion for minimizing/closing an expanded surface:
  [Material motion](https://m1.material.io/motion/material-motion.html).
- Every animated interaction needs a non-motion equivalent. WCAG’s guidance
  recommends respecting `prefers-reduced-motion` or offering a user control to
  disable non-essential animation:
  [W3C Animation from Interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html).
- The demo should show evidence in context instead of merely asserting that
  the product is useful. This is consistent with Nielsen Norman Group’s
  guidance that video evidence can improve comprehension and reduce skepticism:
  [NN/g video evidence and UX research](https://www.linkedin.com/posts/nielsen-norman-group_uxresearch-userexperience-usabilitytesting-activity-7231688008360435712-PpT3).

### Anti-clutter rules

- One focal node at a time; dim unrelated nodes without making them unreadable.
- Never show more than one explanatory callout at once.
- Keep title cards under 6 words and on screen for roughly 1–2 seconds.
- Use the existing color system; do not introduce a new color per feature.
- Do not zoom below the point where labels become noise. Zoom is a transition,
  not a substitute for selecting a meaningful path.
- Hide secondary controls during capture. Restore them for the tutorial and
  real-use workflow.
- If a UI state cannot be reproduced reliably, omit it from the video rather
  than compositing a claim that the product cannot perform live.

## Recommended narrative

### Shot list and exact states

The route examples use the current provider-neutral workspace contract. Replace
record IDs only if the demo fixture changes; do not invent records for a live
scientific presentation.

| Time | Shot | UI state / route | Voiceover or on-screen callout |
| --- | --- | --- | --- |
| 0:00–0:08 | Title | Clean dark landing state, no modal | “Research OS: an evidence workspace for moving from literature to a testable next step.” |
| 0:08–0:22 | Orient | `/?project=demo-evidence&view=map&record=PAP-901&scope=direct` | Show the demo project and map, then briefly identify the selected paper. Callout: “The map is a view over the research vault.” |
| 0:22–0:42 | Paper | `/?project=demo-evidence&view=map&record=PAP-901&scope=direct&expanded=1` | Open the paper detail panel. Point to its source link and summary. Callout: “Source and interpretation stay separate.” |
| 0:42–1:00 | Evidence | `/?project=demo-evidence&view=map&record=CLM-901&scope=direct` | Select the connected provisional claim and reveal its source section. Callout: “Evidence is linked, scoped, and reviewable.” |
| 1:00–1:18 | Claim | `/?project=demo-evidence&view=map&record=CLM-901&scope=2-hop` | Use a short guided transition from paper to claim; illuminate only the validated edge. Voiceover: “The claim is not just a paragraph—it has an explicit relationship to the paper.” |
| 1:18–1:38 | Hypothesis | `/?project=demo-evidence&view=map&record=HYP-901&scope=2-hop` | Select the synthetic hypothesis; show uncertainty, blockers, and next action. Callout: “Inference is labeled as inference.” |
| 1:38–1:58 | Experiment | `/?project=demo-evidence&view=map&record=EXP-901&scope=2-hop&expanded=1` | Expand the synthetic experiment. Show the cheapest discriminating test, controls, predicted outcomes, and stop rule. Callout: “Ideas become falsifiable work.” |
| 1:58–2:12 | AI companion | `/?project=demo-evidence&view=map&record=EXP-901&scope=2-hop&expanded=1` opened/reused in the Codex or ChatGPT embedded browser | The agent asks to show the experiment; the UI opens the exact node. Say: “The model can reason from the vault and bring the human to the relevant place.” Do not imply the UI itself is the scientific authority. |
| 2:12–2:27 | Portability and projects | Briefly collapse the left rail, switch project menu, then show the Markdown vault in a file view | “Projects can be switched or removed from the website without deleting the files. The records remain portable Markdown.” |
| 2:27–2:40 | Safety boundary | Static final card over the map | “AI may summarize, connect, and propose. Human review is still required before a claim is promoted or a paper is marked reviewed.” |
| 2:40–2:50 | Close | Return to the map or show a single next-action card | “The result is a shared research surface: readable by people, navigable by agents, and grounded in source records.” |

The exact scientific wording must be checked against the current canonical
records immediately before capture. The route is a navigation contract, not a
license to claim that every arrow is already supported.

## Motion and callout specification

Use only three motion patterns:

These timings are targets for a later verified motion pass, not claims about
the current implementation. Until that pass is complete, record the actual
behavior honestly.

1. **Shared-axis path transition** — 220–320 ms, ease-out, used when moving
   between paper, claim, hypothesis, and experiment.
2. **Focus reveal** — 160–220 ms opacity/scale change, used for the selected
   node and its direct path; unrelated nodes fade only slightly.
3. **Panel expand/collapse** — 180–240 ms, with collapse faster than expand.

Do not animate every line, card, or background dot. Do not use looping motion.
The explanation should remain readable if the video is paused at any point.

Reduced-motion behavior:

- Honor both the system `prefers-reduced-motion` setting and the app’s
  accessibility setting.
- Replace movement with an instant state change plus a clear focus ring.
- Never make the guided path depend on animation to communicate order; show a
  numbered step label or static breadcrumb as well.
- Keep transitions cancellable and never delay the next input while a transition
  runs. This follows Apple’s guidance to let people cancel motion and W3C’s
  requirement that non-essential interaction animation be suppressible.

Callouts should be anchored to the selected record or the currently visible
relationship, use one sentence, and disappear before the next step. Avoid
arrows pointing at multiple nodes; the highlighted edge and a short label are
enough.

## Codex / ChatGPT opening behavior

The agent demonstration should use the existing `research_show_in_workspace`
MCP tool. The agent requests the smallest useful state, then the client:

1. Reuses the existing Research OS embedded-browser tab when possible.
2. Otherwise opens the returned loopback link in an embedded browser.
3. Otherwise presents a clickable link and continues in text.

Use this example during capture:

```text
http://127.0.0.1:3000/?project=demo-evidence&view=map&record=EXP-901&scope=2-hop&expanded=1
```

The MCP server should not launch arbitrary windows or duplicate development
servers. The video must not suggest that every agent client guarantees an
embedded tab; the capability is client-dependent.

## Pilot capture checklist

### Before recording

- Use a clean demo project or a known-safe snapshot; remove private material.
- Confirm the fixture banner says `DEMO DATA · NONCANONICAL`; do not record
  private lab hypothesis or experiment records.
- Confirm all record IDs and source links resolve.
- Confirm the exact paper → evidence → claim → hypothesis → experiment path.
- Run the schema/privacy/relationship checks and save the fixture manifest with
  the capture package.
- Run the application from the checked-in launcher and verify its bounded
  readiness behavior.
- Close unrelated browser tabs, notifications, terminal windows, and account
  identifiers.
- Set display scale, browser zoom, and window size once; do not change them
  during the take.
- Enable captions or prepare a transcript.
- Test the same deep link in the target Codex/ChatGPT client.
- Capture a reduced-motion still walkthrough as a fallback asset.

### During recording

- Use a deliberate pointer with no frantic cursor movement.
- Pause after each selection long enough to read the title and callout.
- Keep narration focused on the research decision, not the implementation.
- If a loading or agent action exceeds the expected budget, cut and retry;
  never leave a spinner in the final take.
- Do not expose unpublished donor details, local paths, tokens, or unrelated
  projects.

### After recording

- Watch once with sound off: the story must still be understandable from
  labels, focus, and captions.
- Watch once with eyes closed: narration must identify the current node and why
  it matters.
- Check every on-screen scientific statement against canonical Markdown.
- Export a transcript and a static storyboard frame for accessibility and reuse.

## Lightweight first-run tutorial

Derive the tutorial from the same story rather than building a second feature
with separate language. The first slice is a five-step orientation card shown
on the map after first-run hydration; a future Help entry can relaunch it:

1. **Start with a paper** — select a paper to see its summary and links.
2. **Follow evidence** — select the connected evidence or claim; explain that
   graph edges are typed relationships.
3. **Inspect an idea** — show the hypothesis/idea state and its next action.
4. **Open the experiment** — show controls, predicted outcomes, and stop rule.
5. **Ask your agent** — copy the workspace link or use the MCP visual companion.

The shipped first slice is intentionally a compact orientation card: one step
at a time, a real route/action when useful, progress dots, keyboard dismissal,
and “Skip for now.” It is shown on the map after first-run hydration and can be
extended from Help later without changing the underlying contract. It never
modifies records. A future “Try this path” button may open the validated demo
route; it must not create fake scientific data.

## Acceptance criteria

The pilot package is ready when:

- A first-time PI can explain the paper → experiment story after one viewing.
- The full recording is 2–3 minutes with no dead air, duplicate tabs, or
  unrecoverable loading state.
- Every map transition has a static/reduced-motion equivalent.
- Captions and transcript identify the selected record and the evidence status.
- The AI opening is visibly grounded in a stable record ID and loopback link.
- Project switching and Markdown portability are shown without exposing private
  data or implying that files were copied into the UI database.
- The safety card clearly distinguishes AI proposal from human scientific
  review.
- The demo fixture contains no private/restricted record or local-path leak,
  and every displayed edge is validated before recording.
- The tutorial can be completed in under 90 seconds and skipped permanently.
- A lab member unfamiliar with the codebase can reproduce the five-step path
  from the shipped instructions.

## Scope guardrails

This phase produces a capture plan, a clean demo fixture decision, and a
tutorial storyboard. It does not require a video editor, a new animation
framework, automatic email sending, or a new persistent database. Implement
only the motion primitives that support the recorded path; defer decorative
parallax, animated background particles, and feature-wide transitions until a
real pilot user asks for them.
