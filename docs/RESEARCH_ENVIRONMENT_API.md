# Research Environment API

This is the read-only, model-facing core for Research OS. It gives Codex,
Claude Code, and future MCP adapters a small set of deterministic operations
without copying the entire vault into model context.

The Markdown/YAML vault remains canonical. Every result includes the current
canonical source hash. The tool refuses to run when generated navigation files
are stale; run `pnpm ai:sync` to refresh them.

## Operations

| Operation | CLI | Purpose |
| --- | --- | --- |
| `project.brief` | `pnpm research:tool -- brief` | Compact project orientation, active models, urgent tasks, and evidence debt. |
| `search.records` | `pnpm research:tool -- search --query "ABCA7 lipid"` | Deterministic structural and lexical candidate search. |
| `record.get` | `pnpm research:tool -- record --id CLM-004 --sections "Claim,Connections" --max-chars 8000` | Section-selective canonical record retrieval. |
| `graph.explore` | `pnpm research:tool -- graph --id MOD-002 --depth 2` | One- or two-hop traversal of explicit typed connections. |
| `evidence.dossier` | `pnpm research:tool -- evidence --id CLM-004` | Separate supporting, challenging, and contextual relationships plus evidence gaps. |
| `work.next` | `pnpm research:tool -- next --limit 5` | Deterministic routing to high-value work. |
| `context.packet` | `pnpm research:tool -- context --id CLM-004 --max-chars 7000` | A source-bound task briefing with explicit gaps and counterevidence lane. |
| `run.status` | `pnpm research:tool -- run-status --run AGENT-...` | Durable checkpoint and recent event inspection. |
| `run.event` | `pnpm research:tool -- run-event --run AGENT-... --kind note-added --summary "..."` | Append a non-canonical operational event. |
| `run.cancel` | `pnpm research:tool -- run-cancel --run AGENT-... --reason "Stopping for review"` | Request safe cancellation at the next stage or during a local worker. |
| `change.preview` | `pnpm research:tool -- canonicalize --literature-run RUN-... --candidate CAND-... --mode preview` | Build the existing transactional canonicalization plan without writing science. |
| `change.apply` | `pnpm research:tool -- canonicalize --literature-run RUN-... --candidate CAND-... --mode apply --plan <exact-plan-hash> --agent-run AGENT-...` | Apply only the exact reviewed plan, optionally recording a non-canonical run event. |

All operations emit `research-environment-result-v1` JSON to stdout. Errors are
machine-readable `research-environment-error-v1` JSON on stderr. Search returns
record cards rather than full bodies. Record reads have an explicit character
budget. Graph traversal follows only canonical `## Connections` entries; wiki
links alone are not treated as evidence edges.

Context packets select one active record, its current task, bounded canonical
sections, a one-hop explicit graph, and a separate evidence dossier. They are
orienting material, not evidence. When `--run` is given to `context`, an event
is recorded and `CONTEXT_PACKET.json` is atomically replaced in that existing
run. Daily agent runs automatically save the same artifact after routing.

Cancellation writes a non-canonical `CANCEL.json` request and a corresponding
event. The daily agent checks it between stages and once per second during the
bounded Jarvis worker. Cancellation never deletes files or rolls back canonical
science; it leaves a resumable checkpoint and event trail.

Canonicalization is the only governed write operation. It calls the same local,
recoverable transaction used by `literature:canonicalize`; a preview has no
write authority and an apply requires the exact preview's SHA-256 plan hash.
The transaction verifies the staged candidate revision and every touched
canonical record revision before writing. The result's `source_hash` is an
additional routing snapshot, not a substitute for that narrower freshness
gate. Applies can create only provisional agent records and a private decision
ledger: they cannot attest human review or promote a claim to `supported`.

## Design boundary

- Retrieval operations are read-only. The narrowly scoped `change.apply`
  operation is transactional and cannot attest human review or promote claims.
- The CLI is the portable interface that works in coding-agent shells today.
- A later local MCP adapter should call this same library rather than recreate
  retrieval logic. MCP is an interoperability boundary, not a second database.
- Long-running workers continue to use explicit Research OS run IDs and
  checkpoints. Experimental MCP task state must not replace the durable run
  workspace until client support and recovery are verified.

## Evaluation contract

Changes to retrieval or tool schemas must preserve:

1. stable deterministic ordering;
2. current source hashes and project containment;
3. strict separation of support and contradiction;
4. bounded outputs without silent whole-vault dumps;
5. explicit errors that an agent can repair;
6. no canonical write authority in the read tool layer.
