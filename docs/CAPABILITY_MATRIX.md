# Research OS capability matrix

Updated: 2026-08-20

This file distinguishes working software from documented intent. A capability
is `verified` only when the current checkout has an automated check or a
recorded bounded smoke test.

| Capability | State | Evidence or remaining gate |
| --- | --- | --- |
| Local private launcher and localhost API | verified | Covered by build, privacy, and local API tests. |
| Multi-project Markdown vaults | verified | Project routing and path-containment tests pass. |
| Revision-aware atomic record writes | verified | Conflict, creation, and position-write tests pass. |
| Schema-v2 records and human claim gate | verified | Vault validator and schema tests pass. |
| Generated AI index, active context, review queue, and graph | verified | `pnpm ai:check` verifies the canonical source hash. |
| Browser graph, libraries, branching, editing, touch navigation | verified | Rendering and interaction wiring tests pass; visual QA remains manual. |
| Jarvis proposal staging | verified | Bounded live smoke run and proposal tests exist. |
| Frontier accept/reject/merge/defer review | verified | Review validation, API persistence, and brief generation are tested. |
| Governed agent canonicalization preview and apply | verified | The agent facade requires an exact plan hash for writes, reports authority limits, and reuses the tested transactional API with candidate/record revision checks. |
| Evidence-direction enforcement | verified | Validator tests, reciprocal-edge tests, and the 2026-07-29 migration pass. |
| Reviewer-verified evidence objects | verified | v2 validation and canonicalization planning tests separate verified anchors from worker spans. |
| Resumable canonicalization journal | verified | Unit recovery checks and isolated live-API process-exit recovery pass. |
| Canonicalization process-exit recovery | verified | Isolated API test forces exit after two writes, resumes, and verifies idempotence without touching the real vault. |
| Agent routing projections | verified | Agent start, task queue, and evidence-debt projections are generated and tested. |
| Resumable agent run workspace | verified in dry-run mode | A real local smoke run resumed from checkpoints with zero canonical or external actions. |
| Token-bounded research environment tools | verified | Read-only brief, search, record, graph, evidence, next-work, context, and figure-manifest operations have deterministic contract tests. |
| Local stdio MCP adapter | verified | `research:mcp` exposes the source-bound environment through newline-delimited JSON-RPC, requires initialization, rejects invalid arguments, and reuses no secondary state store. |
| Agent-to-UI visual companion links | verified locally | The MCP server emits validated loopback deep links for project, view, record, graph scope, and detail state. A live in-app check opened `IDEA-003` at two hops with expanded detail, then verified view and scope URL synchronization. Client embedding remains capability-dependent. |
| Portable AI orientation and readiness | verified | Root orientation/trap documents, `AI_MANIFEST.json`, and bounded `pnpm ai:doctor` checks are covered by readiness tests. |
| Codex and Claude project adapters | verified locally | Checked-in MCP configurations and the Research OS skill pass static checks; the launcher retrieves a project brief even when started outside the repository. Each client still requires its normal trust/approval flow. |
| In-app provider-neutral assistant surface | implemented; live provider eval pending | The drawer, bounded request/response contract, stable-ID validation, read-only Codex adapter, timeout, and presentation-only map actions are covered by contract/static checks. A real model trajectory still must pass the representative evaluation set before this is called verified. |
| Source-bound context packets and agent event ledger | verified in dry-run mode | Packets have strict character budgets, source hashes, evidence gaps, and one-hop graph context; a live dry-run wrote atomic packet/checkpoint artifacts, append-only events, stage durations, and cancellation markers. |
| One-command daily agent | verified in dry-run/worker boundaries | The runner has checkpointed stages, worker-artifact verification, a fail-closed renewable project lease, bounded worker output, worker deadlines, and a whole-run deadline; scheduling itself remains opt-in. |
| Local figure integrity | verified | Local figure uploads verify image signatures and record a SHA-256 manifest; release checks verify the path boundary, bytes, size, and hash while deployable assets reject `16 Media`. |
| Scheduled unattended operation | not enabled | Enable only after resumability and forced-interruption tests pass. |
| Experiment readiness and result ingestion | planned | Phase 5. |
| Weekly synthesis and maintenance | planned | Phase 6. |

## Interpretation

- `verified` means the bounded behavior above was checked; it does not imply
  scientific review of vault content.
- Generated AI files are navigation projections, not evidence.
- The private Markdown vault remains the durable source of truth. D1 and R2
  remain disabled because this workspace is intentionally local-only.
