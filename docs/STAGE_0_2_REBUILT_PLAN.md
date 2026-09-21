# Rebuilt Stage 0–2 plan

Updated: 2026-07-29

## Critique of the original plan

The original direction was sound but several controls were too broad.

1. Hashing the whole vault would make a canonicalization preview stale after an
   unrelated canvas move. Stage 2 instead binds a plan to the reviewed
   candidate, the schema and policy version, allocated IDs, and the exact merge
   target revision.
2. Exact-title matching is useful for duplicate detection but unsafe as
   automatic merge authority. Only normalized DOI, PMID, or an explicit
   reviewed merge target may authorize an autonomous merge. Title matches
   produce a notification and require an explicit target.
3. Worker-selected abstract spans are navigation hints, not verified evidence.
   An `EVD` record may be created only from a bounded evidence anchor explicitly
   verified in the frontier review.
4. A transaction journal inside the vault would become scientific content and
   perturb generated context. Journals belong under
   `.research-os/transactions/`, outside the canonical vault.
5. Enforcing every conceivable source/target combination immediately would
   freeze useful exploratory relationships. Stage 1 enforces only
   high-confidence invariants and warns on reciprocal semantic duplicates.
6. Rollback must never delete a record modified after the transaction. Recovery
   compares the journaled content hash before removing a newly created file.
7. Stage 1 cannot manufacture evidence merely to improve graph completeness.
   Existing paper-level `supports` edges become `informs` until primary-source
   evidence is actually verified.

## Stage 0 — truth alignment

- Maintain `docs/CAPABILITY_MATRIX.md`.
- Keep `ROADMAP.md` synchronized with implemented and verified behavior.
- Treat current schema, AI freshness, privacy, and test results as the baseline.

## Stage 1 — evidence graph integrity

- Define high-confidence relationship direction rules.
- Reject `supports` and `contradicts` claims unless the source is an Evidence
  record.
- Detect reciprocal source-target pairs and canonical reverse duplicates.
- Provide a deterministic migration preview and source-revision hash.
- Apply only the mechanical current-vault repairs described by that plan.

## Stage 2 — canonicalization integrity

- Accept legacy `frontier-review-v1` reviews for paper-only canonicalization.
- Add `frontier-review-v2` verified evidence anchors with exact bounded text,
  URL, locator, epistemic label, and verification timestamp.
- Create `EVD` records only from those verified anchors.
- Normalize DOI, PMID, PMCID, and primary URLs.
- Bind preview/apply to candidate content and target revisions.
- Journal apply progress outside the canonical vault and recover only files
  whose content still matches the transaction.
- Add route-level success, stale-plan, idempotence, and failure-recovery tests.

## Completion gates

- No paper directly `supports` or `contradicts` a claim.
- No canonical reverse duplicate exists solely for navigation.
- Every newly generated Evidence record is reviewer-verified and traceable.
- Changing the review or merge target invalidates an old plan.
- Repeating or resuming an apply cannot create duplicate records.
- Schema, generated context, privacy checks, build, and full tests pass.

