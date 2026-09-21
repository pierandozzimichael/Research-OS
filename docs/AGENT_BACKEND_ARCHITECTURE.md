# Frontier-agent backend architecture

Updated: 2026-08-03

## Objective

Give capable frontier models the smallest high-signal orientation needed to
start, then let them retrieve canonical evidence and use governed actions on
demand. Optimize for scientific reasoning quality, evidence fidelity, recovery,
and total useful work rather than minimizing token count in isolation.

## Current research basis

- Anthropic's context-engineering guidance treats context as a finite attention
  budget and recommends minimal high-signal context, just-in-time retrieval,
  non-overlapping tools, compaction, and structured external notes:
  <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
- OpenAI's current model guidance recommends explicit tool return and error
  contracts, preserving tool-call linkage, measuring cache tokens, and judging
  programmatic tool calling on task success and evidence quality rather than
  call-count reduction alone:
  <https://developers.openai.com/api/docs/guides/latest-model>
- MCP 2025-11-25 provides structured tool results, output schemas, behavior
  annotations, and deterministic discovery. Its durable task mechanism remains
  experimental, so Research OS run state must remain independently durable:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>
  <https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks>
- Agent evaluations should grade both the outcome and the multi-turn trajectory
  because tool mistakes compound across a run:
  <https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents>
- GraphRAG can improve retrieval but its model-extracted index is expensive and
  may be noisy. It should not replace Research OS's governed typed graph:
  <https://github.com/microsoft/graphrag>

## Critique and strengthened design

### Research environment API

**Original weakness:** A ten-tool initial surface creates overlap, consumes
prompt space, and makes tool selection harder. Building MCP first would also
couple the scientific core to client-specific protocol behavior.

**Strengthened design:** Six read-only operations form the portable core:
project brief, search, section-bounded record read, typed graph exploration,
evidence dossier, and next-work routing. They share one source-hash envelope and
machine-repairable errors. CLI is available first; MCP is a thin adapter later.

### Context packets

**Original weakness:** A highly compressed packet can hide minority evidence or
lock the model into the packet builder's framing.

**Strengthened design:** Orientation contains evidence debt and explicit gaps.
Search returns candidates, not conclusions. The model can expand canonical
sections and graph paths, while every result identifies its source revision.
Future packet evaluation must measure missed counterevidence, not only size.

### Run ledger

**Original weakness:** Saving every message or hidden reasoning artifact would
create a large, sensitive pseudo-memory that is difficult to trust or reuse.

**Strengthened design:** Persist task, authority, inputs, source hashes, tool
events, artifacts, checkpoints, errors, and concise rationale. Do not request or
store hidden chain-of-thought. Existing Research OS run IDs remain authoritative
even if an MCP client offers experimental task state.

### Retrieval

**Original weakness:** A generic embedding or GraphRAG layer can add cost,
version drift, and AI-inferred relationships that look deceptively canonical.

**Strengthened design:** Stable ID, metadata, status/type filters, lexical
ranking, and explicit graph edges come first. Embeddings may rerank candidates
only after a benchmark demonstrates improved recall without losing
contradictions. Any AI-extracted graph remains generated and disposable.

### Document parsing

**Original weakness:** OCR output can silently alter symbols, table cells,
formulas, and reading order. A model reading a large parsed PDF is not equivalent
to source verification.

**Strengthened design:** Prefer native PDF text when sound; route scans and
complex layouts through a benchmarked parser. Preserve PDF hash, parser/version,
page, figure/table locator, extraction method, and confidence. OCR remains
staging material until a frontier or human reviewer checks the cited location.

### Scientific reasoning tools

**Original weakness:** Tools named `weak_arrows` or `novelty` can launder model
judgment into apparently objective backend facts.

**Strengthened design:** Such operations produce attributed proposals with
evidence for, against, missing evidence, confounders, falsification criteria,
and stop rules. They never alter claim status or attest review.

### Evals and observability

**Original weakness:** Static happy-path tests can reward shorter outputs while
missing lost evidence, tool-selection errors, or privacy violations.

**Strengthened design:** Use multiple trials over tasks that include ambiguous
IDs, stale context, contradicting evidence, missing sources, interrupted runs,
privacy boundaries, and unauthorized promotions. Grade answer correctness,
source fidelity, contradiction recall, authorized state changes, recovery,
tokens, latency, and tool calls in that order.

## Implementation stages

### Stage 0 - contracts and baselines

Status: implemented for the read-only core.

- One source-bound result envelope and machine-readable errors.
- Deterministic operation ordering and hard result limits.
- Contract tests for orientation, search, bounded reads, graph traversal,
  evidence lanes, and task priority.
- Generated-context freshness is a hard gate.

### Stage 1 - portable read tools

Status: implemented.

- `project.brief`
- `search.records`
- `record.get`
- `graph.explore`
- `evidence.dossier`
- `work.next`

See `docs/RESEARCH_ENVIRONMENT_API.md`.

### Stage 2 - task-specific context and run events

Status: implemented foundation.

- A context-packet builder now carries decision, bounded canonical sections,
  explicit evidence gaps, counterevidence lane, graph neighborhood, and source
  revision.
- A concise append-only `EVENTS.jsonl` ledger and `run.status` inspection now
  extend the existing `RUN.json` checkpoints.
- Daily dry-runs atomically save `CONTEXT_PACKET.json` and stage/handoff events.
- Cancellation is request-based (`CANCEL.json`), checked between stages and
  during a local worker without deleting any work. Stage events now retain
  duration in milliseconds.
- Token accounting remains next because it needs provider-specific usage metrics
  from the frontier model and local worker rather than an estimate from text.

### Stage 3 - governed action tools

Status: implemented core.

- `change.preview` and `change.apply` expose the existing recoverable
  canonicalization transaction instead of recreating writing logic.
- Apply requires an acknowledged exact plan hash; the underlying transaction
  rechecks the candidate and touched-record revisions before writing.
- Results advertise authority limits, action timing, idempotence, risk, and the
  current source hash. `--agent-run` records a non-canonical operational event.
- The source hash is a routing snapshot only; it cannot bypass plan freshness.
- Scientific promotions and human-review attestation remain prohibited.

### Stage 4 - MCP adapter

Status: implemented local stdio core; resource expansion remains deferred.

- `scripts/research-mcp.mjs` provides newline-delimited UTF-8 JSON-RPC over
  local stdio, with a deterministic schema-defined tool list.
- It reuses the source-hash-gated Research Environment API and the existing
  governed canonicalization transaction; it has no second state store.
- It does not advertise experimental MCP tasks. Research OS run IDs,
  checkpoints, and cancellation files remain the durable recovery system.
- Resource expansion and client-specific affordances wait on agent evaluation
  results rather than increasing the initial tool surface by default.

### Stage 5 - document and scientific intelligence adapters

Status: planned after representative benchmarks.

- Native PDF plus MinerU/Unlimited-OCR adapter benchmark.
- Page-aware evidence location tools.
- Attributed weak-arrow, challenge, experiment-discrimination, and novelty
  proposals.

## Stop conditions

Do not expand the tool surface when a new operation substantially overlaps an
existing one, cannot return a strict bounded schema, lacks representative evals,
or grants more authority than required. Do not adopt embeddings, GraphRAG, or an
OCR provider merely because a benchmark headline is strong; require improvement
on this project's PDFs and scientific retrieval tasks.
