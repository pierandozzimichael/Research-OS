# APOE Research OS

A local-first research workspace for APOE4, local ancestry, lipid biology, cell
state, tau phenotypes, and experiment planning.

## Labmate-ready distribution

The fastest safe first run is the synthetic demo release. Download the ZIP,
install Node.js 22.13 or newer, then run **Install Research OS.ps1**. It uses
the locked dependencies, refreshes the AI navigation layer, validates the
schema, runs the readiness checks, and creates a desktop shortcut. The demo
vault contains no real scientific data.

See [docs/LABMATE_QUICKSTART.md](docs/LABMATE_QUICKSTART.md) for the Windows
install path, bounded failure behavior, and the rules for connecting a real
lab vault. Maintainers can build the safe archive with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-lab-release.ps1
```

The package script deliberately excludes the real `vault/`, additional
`projects/`, local agent state, build output, and credentials. A public GitHub
repository should publish this demo distribution only. Use a private GitHub
repository with explicit lab access controls before committing unpublished
research records.

See [docs/GITHUB_DISTRIBUTION.md](docs/GITHUB_DISTRIBUTION.md) for the private
lab-repository versus public software-repository decision.

The source workspace described below contains the private lab vault;
the demo archive intentionally replaces that registry and vault with
`examples/demo-projects.json` and `examples/demo-vault/`.

## Multiple projects

Use the project switcher in the upper-left to move between independent research
projects or select **Create new project**.

- The default project remains in `vault/`.
- New projects are registered in `projects.json`.
- Each new project lives under `projects/<project-id>/vault/`.
- New vaults receive separate Dashboard, Sources, Papers, Claims, Methods,
  Ideas, Hypotheses, Experiments, Results, Models, and Templates folders.
- A project-purpose document is created at
  `projects/<project-id>/vault/00 Dashboard/PROJECT.md`.
- The last active project is remembered as a device-local interface preference;
  the registry and research data remain filesystem-backed.

The active project is always the target for new records, Markdown edits,
relationship changes, and saved free-canvas positions. Point Codex or Claude
Code at the specific project directory when you want it to work only within
that project.

The Markdown vault is canonical. The browser automatically loads a generated
runtime snapshot from the loopback-only local server for reading. Private
records are never copied into `public/` or the deployable build. Free-canvas
node moves are written directly back to the corresponding Markdown file by the
local app. Connect the `vault` folder when
you also want to create records or edit full Markdown through the browser.
This makes the same material easy for Obsidian, Codex, Claude Code, Git, and
ordinary text tools to understand.

Node coordinates are stored as `canvas_x` and `canvas_y` in YAML frontmatter.
Typed edges are stored as ordinary Markdown under `## Connections`, for example:

```markdown
- supports [[CLM-001]]
- tests [[HYP-001]]
```

This makes synchronization bidirectional: the website can draw and save an
edge, while Codex or Claude Code can create the same relationship by editing
Markdown. Use **Refresh vault** to reload AI-authored changes.

Store each causal relationship once in its canonical direction: evidence
supports or contradicts claims, experiments test hypotheses, and experiments
produce results. Do not add a reciprocal edge merely to make navigation work;
the UI traverses incoming and outgoing connections.

Every loaded record carries a content revision. If Codex, Claude Code, or
another editor changes a file after the browser loads it, the browser refuses
to overwrite the newer version and asks for a refresh. Local API writes use
same-directory temporary files and atomic replacement so an interrupted write
does not leave a partially written Markdown record.

## Schema v2

All canonical records use real YAML frontmatter with `schema_version: 2`.
Record, status, relationship, and idea vocabularies are defined once in
`lib/research-schema.ts` and shared by the UI, project indexer, templates,
validator, and migration tools.

Ideas keep maturity, disposition, priority, evidence strength, feasibility,
blockers, the decision needed, and the next action as separate fields.
Every canonical record also carries `created` and `updated` dates. Dates added
from filesystem metadata are labeled as provenance estimates, not scientific
review dates.

Use `pnpm schema:validate` to check YAML, IDs, statuses, relationships,
duplicates, and dangling links. `pnpm schema:preview` creates a read-only
migration plan. Applying a specific plan verifies that its source records have
not changed and creates a timestamped backup before writing.

Claims may use `supported` only when `human_reviewed: true`, `reviewed_by`, a
`reviewed_at` date, and at least one `EVD-###` evidence anchor are present.
The API and validator reject unsupported promotions even if a status is edited
outside the browser.

Ordinary wiki links are references and do not automatically become graph
edges. Only typed entries under `## Connections` are drawn. This keeps source
citations available without turning the graph into an unreadable web.

## AI workspace

`START_HERE.md` is the common entrypoint for Codex and Claude Code. Each project
also has a derived navigation layer under
`<vaultPath>/14 AI Workspace/generated/`:

- `PROJECT_INDEX.md` routes to all canonical records.
- `ACTIVE_CONTEXT.md` summarizes the bounded current working set, decisions,
  blockers, and next actions.
- `PAPER_REVIEW_QUEUE.md` tells human and AI collaborators exactly which
  metadata, abstract, methods, figures, and evidence checks remain.
- `AGENT_START.md` gives a fresh model the shortest safe read order.
- `TASK_QUEUE.json` exposes bounded operational tasks to agents.
- `EVIDENCE_DEBT.json` identifies claims and papers lacking reusable evidence.
- `GRAPH.json` exposes explicit typed relationships to machines.

## Jarvis literature worker

Jarvis is a separate local bulk worker. `pnpm literature:request` produces a
bounded `research-intake-v1` request containing the active project's configured
query buckets plus DOI and PMID identifiers already present in its vault.
Jarvis searches and stages an immutable `IMPORT_PROPOSAL.json`; a frontier
agent imports it with `pnpm literature:import`, then records governed
accept/reject/merge/defer recommendations with `pnpm literature:review`.

The Literature Inbox is deliberately outside the canonical record index.
Candidates remain provisional with `decision: pending` and
`human_reviewed: false` until a separate review creates or updates canonical
Markdown records.

The future scheduler handoff, limits, and stop conditions are documented in
`docs/DAILY_LITERATURE_AGENT.md`.
The review payload and verification requirements are documented in
`docs/FRONTIER_LITERATURE_REVIEW.md`. Saving reviews regenerates a provisional
`BRIEF-<run-id>.md` without creating canonical records.
- `MANIFEST.json` records the canonical source hash and freshness metadata.

Run `pnpm ai:sync` to rebuild these files or `pnpm ai:check` to verify that they
still match the canonical vault. The launcher refreshes them before starting.
The website's **AI Workspace** shows the same orientation layer and can refresh
it after browser or external edits.

## Start

On a fresh labmate download, run `Install Research OS.ps1` once first. It
installs locked dependencies and creates the desktop shortcut. After that,
run `Start APOE Research OS.ps1`; the launcher opens the correct localhost
page automatically. Select **Connect vault** and choose this repository's
`vault` directory only when you want full browser editing.

The launcher selects a free port, uses a bounded 58-second readiness check, and
opens the exact URL automatically. If startup fails, it terminates the whole
process tree instead of leaving a hidden server behind. `Stop APOE Research
OS.ps1` stops the hidden local server.

The server binds only to `127.0.0.1`. Write requests require a per-launch token
and same-origin validation. The hosting package is deliberately disabled while
this remains a private research workspace.

Before a future schema migration, run `pnpm backup` to create a timestamped,
ignored backup under `.research-os/backups/`.

## Graph views

- **Research flow** arranges records as papers → claims → ideas → hypotheses →
  experiments → results.
- **Topic map** groups records by ancestry, lipid biology, trafficking, tau,
  regulation, and other topics.
- **Free canvas** uses `canvas_x` and `canvas_y`. Moving a node shows a save
  indicator and persists the location to Markdown.
- **Direct** shows only relationships touching the selected node.
- **2-hop** expands one additional step.
- **All** shows the complete explicit network, with unrelated lines subdued.
- Solid arrows represent stronger evidence or test relationships. Dashed arrows
  represent contextual, generated, dependency, or related relationships.

## Following paths in the libraries

Every Papers, Ideas, Hypotheses, Experiments, Results, and Review Queue page
includes a branch navigator for the selected record:

- **Leads into** shows records with typed relationships pointing to it.
- **Current record** keeps the active summary in the center.
- **Branches to** shows its outgoing typed relationships.
- If no outgoing typed relationship exists, referenced records are shown as a
  clearly labeled fallback.

Selecting any branch makes it the current record, allowing a scientific path to
be followed across record categories without returning to the full graph.

The detail panel defaults to a compact reading width. Select **Expand** to give
it roughly two-thirds of the workspace for rereading full summaries and notes;
select **Collapse** or press `Escape` to return to the compact view.

## Review Queue

The Review Queue is a human decision workspace, not a list of every uncertain
record. Low confidence alone does not place something in the queue. A record
appears only when its type and workflow status imply a concrete next action.

The queue has four lanes:

- **Resolve blockers** — missing primary sources, unclear scope, or unmet
  experimental prerequisites.
- **Verify evidence** — unverified or abstract-only papers and provisional or
  contested claims.
- **Make a decision** — ideas, hypotheses, and experiment designs requiring
  prioritization, scoping, approval, parking, or retirement.
- **Analyze results** — missing data or preliminary observations requiring
  quantification, controls, and interpretation.

Each queue card states its priority, why it is present, the next human action,
and the condition for leaving the queue. Lane and priority controls filter the
workspace. Selecting a card opens its complete record and connected path.

Completing a review does not automatically change scientific status. After the
decision is documented, edit the record status to the appropriate governed
state. In particular, no automated process may promote a claim to `supported`;
follow `vault/00 Dashboard/CLAIM_STATUS_RULES.md`.

## Workflow

1. Capture raw material into `vault/01 Inbox`.
2. Turn sources into paper records.
3. Keep exploratory ideas in the idea incubator.
4. Split papers into atomic claims.
5. Link claims into mechanistic models.
6. Promote mature ideas into falsifiable hypotheses.
7. Design experiments with controls and stop rules.
8. Record results and observations, including negative results.
9. Update claims and models only after human review.

Point Codex or Claude Code at the repository and ask it to follow `AGENTS.md`.
