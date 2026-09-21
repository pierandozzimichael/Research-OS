# Research OS UI Design System

Status: Stage 0 visual contract  
Scope: browser UI only; canonical scientific content remains in `vault/`  
Audience: maintainers, reviewers, and worker agents implementing approved UI slices

## 1. Product character

Research OS should feel like a calm scientific instrument with a restrained futuristic edge. It should communicate orientation, evidence, and next action before decoration or system internals.

The interface is a view/editor over canonical Markdown records. The UI may summarize, filter, connect, and propose; it must not silently change scientific meaning, provenance, review state, or uncertainty.

### Non-negotiable principles

1. **Readable before compact.** Information density is useful only when identity, status, and evidence remain legible.
2. **One dominant task per surface.** Secondary controls use progressive disclosure.
3. **Evidence is visible.** AI-generated prose is visually distinct from source-backed record content and always exposes provenance and uncertainty.
4. **Color is semantic, never sufficient.** Status and relationship meaning also use text, icons, line style, or shape.
5. **Local-first boundaries are explicit.** Local providers are labeled local; any external provider requires one-time approval and bounded synthetic or user-approved context.
6. **Every long operation is interruptible.** Show progress, Stop, failure, and retry states.
7. **Motion explains change.** Reduced-motion users receive the same information without animated transitions.

## 2. Layout and responsive contract

### Breakpoints

Use content-driven breakpoints, with these required review widths:

| Name | Width | Intended behavior |
| --- | ---: | --- |
| Narrow | 320px | No horizontal overflow; single-column reading and bottom navigation |
| Mobile | 390px | Single-column task flow; record detail as sheet or dedicated mode |
| Desktop | 1280px | Full shell with map and compact reader panel |
| Wide | 1440px | Full shell with comfortable gutters; never add decorative columns solely to fill space |

Review browser zoom at 200% and touch interaction at each mobile width. Fixed navigation must not cover focused or actionable content.

### Shell hierarchy

The shell has one visually dominant primary navigation level. The preferred destinations are:

- Map
- Library
- Work / Review
- Assistant

Project switching, search, and current-location context remain discoverable in the shell. Diagnostics, provider configuration, import plumbing, and other infrastructure belong in contextual settings or an Advanced area, not the primary path.

Desktop uses a persistent navigation rail or compact sidebar plus a contextual top bar. Mobile uses a compact header and bottom navigation; bottom navigation must include safe-area padding and must never obscure the last actionable control.

## 3. Visual tokens

Tokens are the shared vocabulary. Components may use only these semantic roles or documented aliases; do not introduce one-off colors or spacing values in a worker slice.

### Typography

Use a neutral UI sans with tabular numerals where numeric comparison matters. Monospace is reserved for IDs, code, and machine-readable metadata.

| Token | Size / line height | Use |
| --- | --- | --- |
| `type-display` | 28 / 34px | Page title, one per surface |
| `type-title` | 22 / 28px | Record or section title |
| `type-heading` | 16 / 22px, 600 | Section heading and navigation label |
| `type-body` | 14 / 21px | Default prose and table cells |
| `type-body-strong` | 14 / 21px, 600 | Labels, selected values, key actions |
| `type-caption` | 12 / 17px | Supporting metadata and helper text |
| `type-micro` | 11 / 15px | Only timestamps, compact counters, and graph chrome; never critical content |

Critical content, warnings, source labels, and status text must not be smaller than `type-caption`. Avoid all-caps text except short labels and never use letter spacing as a substitute for readable size.

### Spacing and shape

Base unit: 4px. Use the following scale: `space-1=4`, `space-2=8`, `space-3=12`, `space-4=16`, `space-5=20`, `space-6=24`, `space-8=32`, `space-10=40`, `space-12=48`.

Use `radius-sm=6px` for controls, `radius-md=10px` for cards and panels, and `radius-lg=14px` for sheets and dialogs. Borders are quiet separators, not decoration. Shadows are reserved for floating layers and should not be used to create a stack of competing cards.

### Surface roles

| Role | Meaning |
| --- | --- |
| `surface-canvas` | Main map or reading background |
| `surface-panel` | Reader, assistant, or inspector layer |
| `surface-raised` | Popover, dialog, or selected card |
| `surface-subtle` | Non-interactive grouping and table bands |
| `border-default` | Structural boundary |
| `border-focus` | Keyboard focus indicator |
| `text-primary` | Titles and essential content |
| `text-secondary` | Supporting content |
| `text-muted` | Nonessential metadata only |

Light and dark themes must preserve role contrast. High-contrast mode must strengthen borders and text without changing meaning. Dyslexia and large-text modes must retain the same hierarchy and content order.

### Semantic status roles

Use a restrained accent palette: one accent for active navigation and selection, plus explicit semantic roles for `success`, `warning`, `danger`, `info`, and `uncertain`. Every semantic status includes a text label or icon; never communicate a claim state, relationship, or privacy boundary through hue alone.

## 4. Component semantics

### Buttons and controls

Primary actions are solid and limited to one per region. Secondary actions are outlined or quiet. Destructive actions require explicit text. Icon-only controls need an accessible name and a visible tooltip or adjacent label when unfamiliar. Common touch targets target 44px; no target may be smaller than 24px.

Focus is visible in every theme, has a non-color cue, and is restored when a dialog, drawer, or sheet closes. Keyboard users must be able to reach every action available to pointer users.

### Disclosure, dialogs, and drawers

Use disclosure for secondary evidence, methods, history, and advanced settings. Do not hide uncertainty, contradiction, privacy state, or the source identity behind disclosure.

Dialogs trap focus, close predictably, and return focus to the invoking control. Drawers and mobile sheets have a labeled heading, an explicit close action, and a keyboard-equivalent path. Background content is inert while a modal layer is active.

### Evidence and provenance

Evidence labels use a consistent compact pattern: source identity, record type, provenance/review state, and uncertainty or limitation when relevant. AI proposals are marked as provisional and must not imply human review. Contradictory or missing evidence remains visible in the overview state.

### Loading, empty, error, and long-running states

Every asynchronous region has a stable layout, a short status message, and a recovery action where possible. Long AI work exposes meaningful stages such as finding records, checking evidence, composing, and preparing presentation; it also exposes Stop immediately. Empty states explain what is missing and give one next action. Errors identify scope and offer retry without erasing entered work.

## 5. Evidence map contract

The map is the signature surface and has four explicit modes:

- **Overview:** clusters and project structure; context is prioritized over labels.
- **Focus:** selected record and relevant neighborhood; selected path is immediately legible.
- **Presentation:** ordered evidence narrative with current, past, and upcoming nodes; pause, advance, and finish are explicit.
- **Edit:** placement and relationship editing; editing controls appear only in this mode.

The default view must not open with an unreadable all-node graph. Use semantic zoom, clustering, or a focused starting selection. Edge labels primarily appear for the selected path. Relationship meaning uses line style, direction, labels, or icons in addition to color. A list or outline fallback mirrors visible nodes and supports keyboard traversal.

Map camera and node positions continue to save through the existing governed paths. Do not change stable IDs, relationship direction, schema fields, or canonical vault records as part of visual work.

## 6. Record, library, and assistant surfaces

### Record reading

The first viewport shows identity, summary, status, evidence state, uncertainty, and next action. Secondary material is grouped as Overview, Evidence, Plan/Experiment, and History/Provenance. Desktop supports a compact reader alongside the map and a dedicated reading mode. Mobile uses a bottom sheet or dedicated record mode rather than a multi-thousand-pixel dump.

### Library and review

Dense browsing uses full-width tables with pinned identity, status, next action, comfortable/compact density, keyboard row navigation, column controls, and a detail panel on row selection. Cards remain appropriate for genuinely distinct summaries, not repeated record rows.

### Assistant

The assistant header shows provider readiness, privacy boundary, and selected context in one compact region. Sources and UI actions are visually distinct from prose. Voice controls appear only when the local transcription service is available. Provider/model configuration is secondary. Guided presentations use the map's presentation mode and inherit its provenance and uncertainty language.

## 7. Accessibility and verification contract

Every redesigned surface must be checked in light, dark, high-contrast, dyslexia, large-text, and reduced-motion modes; at 320px, 390px, 1280px, and 1440px; and with keyboard-only navigation. Verify no critical text is below 12px, focus is visible and restored, dialogs make background content inert, states are not color-only, and drag operations have button or keyboard alternatives.

## 8. Worker-agent boundary

Worker agents implement approved slices; they do not invent the design system. Each task must name allowed files, reference this contract, specify viewports and tests, and list explicit non-goals.

Workers must not:

- change vault records, schemas, stable IDs, relationship direction, privacy labels, or scientific status;
- add a provider, send project context externally, or bypass approval gates;
- add dependencies, replace the app shell, or migrate the whole component tree without lead approval;
- introduce colors, typography, navigation, graph modes, or interaction patterns not defined here;
- remove evidence, uncertainty, contradiction, provenance, Stop, retry, or accessibility behavior;
- use private scientific records in hosted design tools or screenshot fixtures.

Hosted AI design tools may receive only synthetic fixtures, screenshots without private content, tokens, and isolated component contracts. Generated code is a visual proposal and must be reviewed, reproduced locally, tested, and integrated by the lead-managed workflow.
