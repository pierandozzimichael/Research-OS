# APOE Research OS — AI Collaboration Contract

This repository is a research workspace, not a polished narrative database.
The canonical scientific content lives under `vault/`. The browser UI is a
view/editor over those Markdown files.

`projects.json` is the multi-project registry. The default project uses the
root `vault/`. Additional projects use
`projects/<project-id>/vault/`. When a task names a project, resolve its
`vaultPath` from `projects.json` and keep reads and edits within that project
unless cross-project comparison is explicitly requested.

## Read order

In the paths below, replace `vault/` with the selected project's `vaultPath`
from `projects.json`.

1. Root `START_HERE.md`
2. `vault/00 Dashboard/PROJECT.md`
3. `vault/00 Dashboard/CLAIM_STATUS_RULES.md`
4. `vault/14 AI Workspace/generated/ACTIVE_CONTEXT.md` for routing only
5. The relevant mechanistic model under `vault/12 Mechanistic Models/`
6. Linked claims, hypotheses, papers, and experiments
7. `vault/99 Templates/` before creating a new record

Generated files under `vault/14 AI Workspace/generated/` are navigation
projections, not evidence. Run `pnpm ai:check` to test freshness and
`pnpm ai:sync` to rebuild them. Cite and edit their canonical linked records,
not the generated files.

## Scientific reasoning rules

- Keep `DIRECT`, `AUTHOR`, `INFERENCE`, and `SPECULATION` separate.
- Never upgrade a claim merely because an AI summary sounds convincing.
- Never set a paper's `human_reviewed` field, reviewer, or review date on the
  user's behalf. AI may prepare provisional extraction, not attest human review.
- Treat `01 Inbox/Literature/RUN-*.json` as Jarvis staging data, not canonical
  evidence. Never cite it as scientific support or silently convert every
  candidate into a paper record.
- Frontier literature reviews must follow
  `docs/FRONTIER_LITERATURE_REVIEW.md`. Record concise rationale and source
  provenance, not hidden chain-of-thought. Accept and merge recommendations
  require primary-source verification.
- A claim can move to `supported` only after human review of the relevant
  methods, figures, sample structure, statistics, and scope.
- A supported claim must record `human_reviewed: true`, `reviewed_by`,
  `reviewed_at`, and at least one `EVD-###` entry in `evidence_anchors`.
- Preserve contradictions, negative results, and uncertainty.
- Distinguish self-identified population, global ancestry, local ancestry,
  APOE genotype, APOE haplotype, and nearby regulatory variation.
- For experiments, distinguish independent donors, independent
  differentiations, and technical replicates.
- Prefer a discriminating experiment over a merely confirmatory one.
- For every ambitious proposal, identify a cheaper first test and a stop rule.

## Privacy boundary

- Never place names, MRNs, dates of birth, or re-identifiable donor details in
  the vault.
- Use coded cell-line identifiers.
- Treat records marked `privacy: private` as unpublished lab material.
- Do not use private records in public literature outputs unless explicitly
  instructed by the user.

## Stable IDs

- `PAP-###` paper
- `IDEA-###` exploratory idea
- `CLM-###` claim
- `HYP-###` hypothesis
- `EXP-###` experiment
- `RES-###` result
- `MOD-###` mechanistic model
- `ENT-###` entity
- `TOP-###` topic synthesis
- `SRC-###` imported or collected source
- `METHOD-###` method
- `DEC-###` decision
- `EVD-###` reusable evidence anchor
- `POL-###` policy
- `PRJ-###` project

Schema v2 records include `schema_version: 2`. Use the controlled record,
status, relationship, and idea vocabularies in `lib/research-schema.ts`. Run
`pnpm schema:validate` after editing multiple records or relationships.

Ideas keep maturity, disposition, priority, evidence strength, feasibility,
blockers, and next action separate. Do not encode a warning or review request
as an invented idea status. Preserve `legacy_status` when interpreting a
migrated idea.

Link records with Obsidian-style links that include the stable ID, for example
`[[CLM-001 Example provisional claim]]`.

Wiki links are references, not necessarily graph edges. Add a typed line under
`## Connections` only when a relationship should appear on the evidence map.
Store relationships once in their canonical direction: evidence supports or
contradicts claims, experiments test hypotheses, and experiments produce
results. Do not add reciprocal duplicates solely for navigation.
Free-canvas positions are stored in frontmatter as integer `canvas_x` and
`canvas_y` values; preserve those fields unless intentionally rearranging the
manual layout.

## Default brainstorming response

When asked to brainstorm:

1. State the current model and its weakest arrows.
2. Steelman and challenge the proposed idea.
3. List evidence for, evidence against, and missing evidence.
4. Identify confounding and ancestry-definition risks.
5. Offer a low-cost first test, a stronger follow-up, controls, predicted
   outcomes, falsification criteria, and stop conditions.
6. Name the vault records that should be updated if the result is obtained.
