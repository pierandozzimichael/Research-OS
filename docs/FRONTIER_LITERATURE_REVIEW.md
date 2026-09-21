# Frontier literature review contract

This contract governs Claude or Codex review of candidates staged by Jarvis.
It records concise scientific conclusions and provenance, not hidden
chain-of-thought.

## Allowed recommendations

- `accept`: worth creating a new provisional paper record after separate
  canonicalization.
- `merge`: belongs in an existing `PAP-###` record.
- `reject`: duplicate, irrelevant, invalid, or too weak for the project.
- `defer`: potentially useful, but blocked by access, identity, scope, or
  verification.

Recommendations are not human decisions and do not create canonical records.

## Required review fields

- `schema_version`: `frontier-review-v1` for legacy paper-only review or
  `frontier-review-v2` for verified reusable evidence
- `recommendation`
- `verification_depth`: `metadata`, `abstract`, or `full-text`
- `primary_source_checked`
- concise `rationale`
- exact model/version in `reviewed_by_model`
- timestamp in `reviewed_at`
- `checked_urls`
- bounded candidate claims
- contradiction, novelty, and model-impact assessments

`accept` and `merge` require a checked primary-source URL and at least abstract
verification. `merge` also requires a `PAP-###` target.

The agent must never set `human_reviewed: true`.

## Verified evidence in v2

Worker-selected `abstract_evidence_spans` are routing hints and never become
canonical evidence by themselves. Each `frontier-review-v2`
`verified_evidence` entry must include:

- bounded exact source text;
- a source URL that exactly matches one of `checked_urls`;
- an abstract, section, figure, table, or page locator;
- `DIRECT` or `AUTHOR` as the epistemic label;
- a verification timestamp; and
- zero-based `claim_indices` identifying which candidate claims it supports.

If a candidate claim belongs to an existing claim record, `claim_targets` must
align positionally with `candidate_claims` and explicitly name the `CLM-###`
target. Text similarity alone cannot authorize an autonomous claim merge.

An accept or merge review may contain no reusable evidence anchors. In that
case canonicalization may create or link a paper and provisional claims, but it
must not create an `EVD` record.

## Agent commands

Import a Jarvis proposal:

```powershell
pnpm literature:import -- --project <project-id> --proposal "<IMPORT_PROPOSAL.json>"
```

Save one candidate review:

```powershell
pnpm literature:review -- --project <project-id> --run "<run-id>" --candidate "<candidate-id>" --review "<frontier-review.json>"
```

Both commands discover the running Research OS port, obtain the ephemeral local
write token, and impose network deadlines. They fail if Research OS is not
running.

Every saved review atomically updates the staging proposal and regenerates
`BRIEF-<run-id>.md`. The brief is routed into AI context as a provisional inbox
note and explicitly cannot support a scientific claim.

## Autonomous canonicalization

For an `accept` or `merge` candidate, an agent first requests a deterministic
preview, then applies exactly the returned plan hash:

```powershell
pnpm literature:canonicalize -- --project <project-id> --run "<run-id>" --candidate "<candidate-id>" --mode preview --out "<plan.json>"
pnpm literature:canonicalize -- --project <project-id> --run "<run-id>" --candidate "<candidate-id>" --mode apply --plan "<plan-hash>"
```

Apply creates only agent-attributed provisional records: `agent-verified`
papers, explicitly verified evidence anchors when present, provisional claims,
and an explicit decision ledger. Plans are bound to the reviewed candidate and
the revisions of existing records they touch. Apply progress is journaled
outside the vault under `.research-os/transactions/` so an interrupted run can
recover without turning operational state into scientific content.

It never creates a supported claim, asserts human review, rewrites mechanistic
model text, or runs laboratory work. Material novelty or a likely contradiction
is applied as a notify-only action and recorded in the ledger.
