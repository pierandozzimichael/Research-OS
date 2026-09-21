# Daily literature agent handoff

This is the orchestration contract for a future scheduled Claude or Codex task.
The schedule is not enabled yet. The first two resumable local boundaries are
implemented:

```powershell
pnpm agent:daily -- --project <project-id> --mode dry-run --total-timeout-seconds 1800 --lease-seconds 7200
```

It checkpoints validation, context generation, request creation, and routing
snapshots under `vault/14 AI Workspace/runs/<run-id>/`, then stops at
`handoff-ready`. To deliberately launch the local worker, use explicit paths:

The runner has a renewable per-project lease, a whole-run deadline, and a
bounded worker-output budget. This prevents overlapping restarts and stops a
run before it can exceed its configured limits; checkpoints are retained for a
governed resume. An expired lock fails closed rather than being automatically
reclaimed: inspect the prior process and run artifacts before manually removing
the lock, so a slow worker cannot overlap with a replacement.

## Recovering an expired lease

First inspect `.research-os/agent-locks/<project-id>.json` and the matching
`vault/14 AI Workspace/runs/<run-id>/RUN.json`. Confirm that the recorded PID
is no longer running and that no scheduled launcher is still active. Only then
remove that one explicit lock file and resume the run. Never delete the whole
lock directory or the prior run folder; both are part of the recovery record.

```powershell
pnpm agent:daily -- --project <project-id> --mode worker --jarvis-root "<jarvis-root>" --python "<python-executable>" --worker-timeout-seconds 900
```

Worker mode imposes a 30–3600 second outer deadline. On timeout, it terminates
only the known Jarvis process tree, preserves all prior checkpoints, and never
retries automatically. It hash-validates Jarvis's `MANIFEST.json` outputs and
copies its manifest, shortlist, and import proposal into the Research OS run
folder before stopping at `frontier-review-ready`. It does not launch a
frontier model, stage the proposal, create canonical records, or enable a
schedule.

Before enabling or changing a local model worker, follow
`docs/LOCAL_MODEL_WORKFLOW.md` and run `pnpm local:contract:check`. Local model
output must be schema-constrained and span-validated; a fluent local summary is
never sufficient evidence for the frontier-review step.

## Objective

Use Jarvis for high-volume metadata and abstract mapping. Use the frontier
agent for bounded selection, primary-source verification, synthesis, and
provisional Research OS updates.

## Daily sequence

1. Read `START_HERE.md`, `AGENTS.md`, the selected `PROJECT.md`,
   `ACTIVE_CONTEXT.md`, and `PAPER_REVIEW_QUEUE.md`.
2. Generate a request:

   ```powershell
   pnpm literature:request -- --project <project-id> --out "<temporary-request.json>"
   ```

3. Submit it to Jarvis with an outer process timeout (or use the `worker` mode
   above, which does this and records the verified handoff automatically):

   ```powershell
   & "<bundled-python>" -m jarvis.src.jarvis.cli bulk-run --request "<temporary-request.json>"
   ```

4. Read `MANIFEST.json`. Continue only for `complete` or `partial`; report all
   source and local-model errors.
5. Read `SHORTLIST.json`, not the entire raw result set initially.
6. Select a bounded 3–8 candidates using relevance, novelty, contradiction
   value, evidence quality, and experimental actionability.
7. Verify selected candidates against primary sources. Do not infer full-text
   review from an abstract.
8. Import `IMPORT_PROPOSAL.json` with `pnpm literature:import`.
9. Review selected candidates under `docs/FRONTIER_LITERATURE_REVIEW.md` and
   save each recommendation with `pnpm literature:review`.
10. For each accepted or merged candidate, request a canonicalization preview.
    Resolve identifier conflicts and title-only collisions explicitly.
11. Apply only the exact acknowledged plan hash. A legacy review may create a
    paper and provisional claims, but only a `frontier-review-v2` verified
    evidence entry may create an `EVD-###` record.
12. Run `pnpm schema:validate` and `pnpm ai:check`.
13. Leave a concise daily brief: search coverage, failures, selected papers,
    potentially model-changing evidence, contradictions, and requested human
    decisions.

## Time and volume limits

- At most 50 queries per run.
- At most 500 records per source and query.
- At most 100 shortlist candidates.
- At most 100 local-model screens.
- Each source request: 2–60 seconds.
- Each local-model call: 5–300 seconds.
- The outer scheduler must also impose a total job deadline.

## Worker checkpoint and stop conditions

The orchestration run accepts only `complete` or `partial` manifests. It
stops, retains its logs, and does not stage a proposal when a required artifact
is missing, a manifest hash fails, the request/project/run IDs disagree, or a
proposal requests canonical authority, claims human review, or contains a
non-pending decision. A partial result is retained for frontier triage with
its source/local-model errors; it is never silently rerun.

Stop and report instead of importing when:

- every source fails;
- the run manifest is missing or its hashes do not match;
- a proposal requests canonical write authority;
- a candidate claims human review;
- identifiers or titles indicate unresolved duplicates;
- the canonicalization preview changes before apply;
- transaction recovery reports a file changed after interruption;
- primary-source identity cannot be verified;
- the selected project does not match the request.

## Scientific boundary

Jarvis output is a navigation and triage artifact. It is never itself evidence.
Only exact primary-source locations should become `EVD-###` records, and claims
remain provisional until the governed human-review gate is satisfied.
