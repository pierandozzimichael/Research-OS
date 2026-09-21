# Research OS UI Acceptance Checklist

Use this checklist for every redesigned surface and for the Stage 0 vertical slice (`navigation → map focus → record overview → assistant`). A slice is accepted only when all applicable gates pass and the lead reviewer records any intentional exception.

## A. Scope and safety

- [ ] The change is limited to the approved UI surface and declared files.
- [ ] No vault, Markdown/YAML canonical record, schema, stable ID, relationship direction, or scientific status changed.
- [ ] No human-review field was added, promoted, or implied by presentation.
- [ ] No private scientific content appears in screenshots, fixtures, prompts, hosted design tools, or test output.
- [ ] Any external provider context is bounded and requires the existing one-time approval flow.
- [ ] Worker changes did not add dependencies or change app architecture without explicit lead approval.

## B. Visual contract

- [ ] The surface communicates one dominant task.
- [ ] The design uses the shared typography, spacing, surface, radius, and semantic status tokens.
- [ ] Body text is at least 14px; supporting text is at least 12px; no critical content uses micro text.
- [ ] Primary, secondary, quiet, and destructive actions are visually distinct and appropriately limited.
- [ ] Selection, status, relationship, privacy, uncertainty, and review state have text/icon/style cues in addition to color.
- [ ] There are no one-off colors, unexplained badges, decorative panels, or competing active states.
- [ ] Empty, loading, error, retry, and success states preserve layout and hierarchy.

## C. Responsive behavior

- [ ] At 320px there is no horizontal overflow or clipped label.
- [ ] At 390px the primary task is usable without a desktop-only interaction.
- [ ] At 1280px the map, reader, and shell retain usable proportions.
- [ ] At 1440px extra width improves breathing room rather than adding ornamental UI.
- [ ] At 200% browser zoom content remains usable and actions remain reachable.
- [ ] Fixed headers, bottom navigation, sheets, and drawers do not obscure focused or actionable content.
- [ ] Mobile record detail shows identity, summary, status, evidence state, uncertainty, and next action in the first viewport.
- [ ] Tables have an intentional mobile behavior: responsive columns, horizontal scroll with identity preserved, or a documented list fallback.

## D. Accessibility

- [ ] Keyboard-only users can reach, understand, operate, and leave every interactive element.
- [ ] Focus is visible in light, dark, and high-contrast modes and is restored after dialogs/drawers/sheets close.
- [ ] Modal layers trap focus and make background content inert.
- [ ] Icon-only controls have accessible names; unfamiliar controls have visible supporting text or tooltip.
- [ ] Common touch targets are approximately 44px and none is smaller than 24px.
- [ ] Information is not conveyed by color alone; contrast remains sufficient in all themes.
- [ ] Reduced-motion mode removes animated transitions without removing state changes or orientation cues.
- [ ] Dragging, graph traversal, row selection, and presentation advance have non-pointer alternatives.
- [ ] Large-text and dyslexia modes preserve content order, labels, and action discoverability.

## E. Evidence map

- [ ] The default map opens at a readable overview or focused view, not an unreadable all-node zoom.
- [ ] Overview, Focus, Presentation, and Edit modes are explicit and visually distinguishable.
- [ ] Selected nodes, selected paths, and current presentation nodes are clear without relying on hue alone.
- [ ] Edge direction and relationship meaning remain understandable through labels, line style, direction, or icons.
- [ ] A list/outline fallback mirrors visible nodes and supports keyboard traversal.
- [ ] Presentation mode supports pause, advance, finish, and current/past/upcoming state.
- [ ] Edit controls are hidden outside Edit mode; camera and node positions still save correctly.

## F. Records, assistant, and provenance

- [ ] Record identity, summary, status, evidence state, uncertainty, and next action are visible before secondary sections.
- [ ] Evidence, methods, plan/experiment, and history/provenance use clear progressive disclosure.
- [ ] Contradictory, missing, or limited evidence is not hidden from the overview.
- [ ] AI-generated or provisional content is visually distinct from canonical record content.
- [ ] Source identity and provenance are visible at the point of use.
- [ ] Assistant readiness, privacy boundary, and selected context are visible together.
- [ ] Long AI operations show meaningful stages, an always-visible Stop action, failure state, and retry path.
- [ ] Voice controls are absent or clearly unavailable when the local transcription service is not running.

## G. Verification

- [ ] Production build passes.
- [ ] Existing unit, integration, privacy, schema, and API checks relevant to the surface pass.
- [ ] Accessibility checks pass for the changed states and viewports.
- [ ] Before/after screenshots were reviewed at 320px, 390px, 1280px, and 1440px.
- [ ] A synthetic-data fixture was used for screenshots and hosted-tool exploration.
- [ ] No console errors, focus traps, clipped labels, or layout shifts remain in the tested flow.
- [ ] The lead reviewer confirmed the change against `docs/UI_DESIGN_SYSTEM.md`.

## Review record

Surface:  
Worker/task:  
Files changed:  
Viewports checked:  
Exceptions and rationale:  
Lead reviewer:  
Date:  
