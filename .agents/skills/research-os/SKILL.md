---
name: research-os
description: Navigate, analyze, brainstorm within, or propose governed changes to an APOE Research OS project. Use for scientific questions, evidence tracing, project orientation, experiment design, literature review, and Research OS record changes; not for unrelated application coding.
---

# Research OS

Use the workspace as external project memory while preserving its evidence and authority boundaries.

## Orient

1. Follow `START_HERE.md` and `AGENTS.md`; resolve the selected project's `vaultPath` from `projects.json`.
2. Prefer `research_brief` for compact orientation when the Research OS MCP server is available. Otherwise run `pnpm research:tool -- brief` from the repository root.
3. Check generated-state freshness before relying on navigation projections. If a tool reports stale state, run `pnpm ai:check`; rebuild with `pnpm ai:sync` only when the task permits generated-file updates.

Do not scan the entire vault at startup. Expand context only for the current question or decision.

## Use the visual companion deliberately

When seeing a record, graph path, or evidence sequence would materially help the user, call `research_show_in_workspace` with the smallest useful state. If the client supports an embedded browser, open or reuse the returned loopback URL there. Otherwise provide the clickable URL and continue the answer normally.

Do not open the workspace for routine retrieval, every tool call, or unrelated software work. Do not start duplicate development servers or wait indefinitely for the UI. The browser is a presentation and editing surface; MCP responses and canonical Markdown remain authoritative.

## Retrieve and reason

- Search for stable IDs and concepts, then read selected canonical record sections.
- Use explicit graph paths and evidence dossiers to inspect support, challenge, and missing-evidence lanes.
- Treat generated indexes, task queues, run artifacts, and provisional literature intake as routing context, never as scientific evidence.
- For figures, retrieve the manifest first and inspect an image only when its visual content is decision-relevant.
- Cite canonical records and exact evidence anchors. Preserve disagreements and scope limitations.

For brainstorming, use the response structure in `AGENTS.md`: weakest arrows, steelman and challenge, evidence for and against, missing evidence, confounders, cheap test, stronger follow-up, controls, predictions, falsification, stop conditions, and records affected.

## Change records

Before creating a record, read the matching template under the selected vault's `99 Templates/` directory. Use stable IDs and canonical relationship direction.

Prefer a governed preview when a matching Research OS write tool exists. Apply only the exact fresh plan hash and only within the user's authority. Never assert human review, promote a claim automatically, erase a contradiction, or place identifying donor information in the vault.

After multiple record or relationship edits, run `pnpm schema:validate`. Run `pnpm ai:sync` only after canonical changes validate, then report the canonical files changed and any unresolved evidence debt.

## Task-specific references

- Literature review: `docs/FRONTIER_LITERATURE_REVIEW.md`
- Local-model work: `docs/LOCAL_MODEL_WORKFLOW.md`
- Tool behavior and budgets: `docs/RESEARCH_ENVIRONMENT_API.md`
- MCP transport and write boundary: `docs/MCP_SERVER.md`
- Visual companion links and fallbacks: `docs/VISUAL_COMPANION.md`
- Capability claims: `docs/CAPABILITY_MATRIX.md`
