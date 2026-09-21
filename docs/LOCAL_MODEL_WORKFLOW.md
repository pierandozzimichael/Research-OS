# Local model workflow contract

## Purpose

Local models are high-throughput, fallible workers. They classify, extract,
tag, and compress bounded source packets. Frontier models plan, choose, verify
primary sources, resolve contradictions, and prepare governed Research OS
updates. Canonical Markdown/YAML remains the scientific record.

This contract prevents a common local-model failure mode: turning an extraction
task into smooth but unsupported prose. A local model must return evidence
atoms, not a literary paper summary.

## Verified current baseline

- Jarvis is configured for `llama3.1:latest` for screen, extract, and brief
  tasks; configured runtime context is `8192`, not the model family's maximum
  advertised context.
- Jarvis configures `nomic-embed-text:latest` for embeddings, but semantic
  search is optional until the installed model is confirmed.
- On 2026-08-02, the local Ollama endpoint at `http://localhost:11434` was not
  accepting connections. Do not infer installed model names or capabilities
  until `jarvis status` succeeds and records the model tags.

Llama 3.1 instruction models are chat-oriented and Meta lists 128k as the
family context limit, but a local runtime's `num_ctx`, quantization, memory,
and latency are the operative limits. Treat 8k as the current worker budget
until a benchmark demonstrates a safe larger setting.

## Model roles

| Role | Current default | Allowed work | Must not do |
| --- | --- | --- | --- |
| Screen worker | `llama3.1:latest`, temperature 0 | classify title/abstract; copy exact evidence spans; emit reason codes | infer mechanisms; write a scientific narrative; claim review |
| Extraction worker | `llama3.1:latest`, low temperature | turn one bounded chunk into typed observations, methods, limitations, and questions | synthesize across papers; create claims or model text |
| Embedding worker | configured embedding model | retrieve candidate chunks after metadata filtering | decide relevance or scientific truth |
| Frontier supervisor | Codex/Claude | choose candidates, inspect sources, fact-check, synthesize, prepare provisional plans | assert human review; promote claims automatically |

Do not select a model by a benchmark label alone. Before enabling a model for a
role, record its exact Ollama tag/digest, task prompt version, `num_ctx`,
temperature, latency, JSON-validity rate, and abstention behavior on the
evaluation set below.

## The local task packet

Every model call is one small job. The runner, not the model, owns control
flow, retrieval, retries, and writes.

```json
{
  "schema_version": "local-worker-task-v1",
  "task_id": "screen-<run>-<candidate>",
  "role": "screen",
  "model": "llama3.1:latest",
  "model_digest": "record when available",
  "prompt_version": "online-screen-v2",
  "input_kind": "title-abstract",
  "source_id": "PMID or DOI or run candidate id",
  "source_url": "primary metadata URL",
  "allowed_evidence_text": "the exact supplied title and abstract",
  "output_schema": "docs/local-worker/schemas/local-screening-v1.json",
  "limits": {"input_chars": 6000, "output_tokens": 450, "timeout_seconds": 90}
}
```

Persist the task packet, raw response, validated response, response metrics,
and error separately under the immutable Jarvis run. They are operational
artifacts, not evidence. A frontier model receives the validated response plus
the original source metadata and exact spans; it can always inspect the raw
response if a validator rejected it.

## Prompt rules that prevent literary drift

1. Use a concrete role (`screen`, `extract`, `chunk-label`), not a persona.
2. Give one input unit: title/abstract, or one explicitly numbered text chunk.
3. Supply JSON Schema through Ollama's `format` field *and* state the schema
   fields in the prompt.
4. Use `temperature: 0` for classification and extraction. Never rely on
   sampling to produce diverse scientific interpretations.
5. Enumerate decisions (`reason_code`, `recommended_use`, `relevance`) instead
   of requesting a free-form explanation.
6. Require copied, exact source spans for every local evidence field. If a span
   does not occur verbatim in the supplied input, reject the output.
7. Make abstention explicit: `insufficient-abstract`, empty evidence spans,
   and a short `abstain_reason` are valid outputs.
8. Reject unknown fields, Markdown fences, prose before/after JSON, URLs not
   supplied in the packet, and any `human_reviewed` or canonical-write field.
9. Pass only a compact task packet. Do not paste the whole vault or ask a local
   worker to maintain a conversation memory.

## Retrieval and storage

1. Deterministically collect metadata and abstracts from PubMed/Europe PMC.
2. Deduplicate by DOI/PMID before embedding or prompting.
3. Perform lexical filters first. Embed only bounded, versioned chunks with
   source ID, heading/page locator when available, text hash, model name, and
   embedding dimensions.
4. On embedding requests, set `truncate: false`; oversized input must fail
   visibly rather than silently losing the end of a source.
5. Retrieve 10–30 candidate chunks; include metadata and exact text in the
   frontier packet. Similarity is a routing signal, never evidence.
6. Keep vector indexes rebuildable from Markdown/JSONL. Do not make an opaque
   database the sole source of a fact or relationship.

## Pipeline

```text
Research OS request
  -> deterministic source search + DOI/PMID deduplication
  -> bounded local screen task (JSON Schema)
  -> schema/span validation + metrics
  -> immutable shortlist/proposal (no canonical authority)
  -> frontier selection and primary-source verification
  -> governed staging, review, canonicalization preview/apply
  -> schema validation + AI index freshness check
```

The local worker stops after an invalid response, timeout, missing model, or
source mismatch and records a partial run. It does not retry indefinitely,
silently repair content, or write canonical paper, evidence, claim, or model
records. The frontier supervisor may use partial results but must see errors.

## Frontier supervisor packet

A frontier model should receive a short index, not a giant dump:

1. Active `PROJECT.md`, governing policies, and generated routing context.
2. The task request and manifest (including model, prompt, hashes, timings, and
   errors).
3. A ranked shortlist with deterministic scores and validated local fields.
4. The original title, abstract, identifiers, source URL, and exact local
   evidence spans for each selected candidate.
5. Existing potentially matching `PAP-###` / `CLM-###` IDs and known
   contradictions.

The frontier instruction must say: *local classifications are provisional
routing hints; verify the source yourself; do not turn an abstract into a
full-text claim; preserve uncertainty and contradictions.*

## Evaluation gate before model or prompt changes

Maintain a small private `local-worker-evals/` fixture set with at least:

- clear in-scope abstracts;
- mechanistically adjacent but out-of-scope papers;
- missing/weak abstracts that should abstain;
- duplicate DOI/PMID cases;
- contradictory papers; and
- adversarial prose that tries to induce unsupported conclusions.

For every candidate model/prompt version, record: JSON-schema pass rate,
unknown-field rate, exact-span fidelity, abstention precision, screening
precision at the chosen shortlist size, median/95th-percentile latency, and
timeout/error rate. Promote a worker configuration only after it improves or
matches the incumbent on validity and abstention without exceeding the timeout
budget. This gate is operational; it never upgrades scientific evidence.

## Sources

- Ollama supports JSON Schema constrained responses and recommends validating
  the returned JSON: [Structured Outputs](https://docs.ollama.com/capabilities/structured-outputs).
- Ollama's embedding endpoint accepts arrays, reports prompt metrics, and can
  fail rather than truncate oversized inputs: [Embed API](https://docs.ollama.com/api/embed).
- Ollama returns load, prompt, and generation timing metrics that should be
  preserved in run manifests: [Usage metrics](https://docs.ollama.com/api/usage).
- Meta's Llama 3.1 model card lists the family context window and intended
  instruction-tuned use: [Llama 3.1 model card](https://github.com/meta-llama/llama-models/blob/main/models/llama3_1/MODEL_CARD.md).
