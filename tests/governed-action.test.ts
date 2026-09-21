import assert from "node:assert/strict";
import test from "node:test";
import {buildCanonicalizationRequest,summarizeCanonicalizationResult} from "../lib/governed-action.ts";

const planHash="a".repeat(64);
const sourceHash="b".repeat(64);

test("governed canonicalization requires an acknowledged plan before apply",()=>{
  assert.throws(()=>buildCanonicalizationRequest({projectId:"apoe-rexach",literatureRunId:"RUN-20260803",candidateId:"CAND-001",mode:"apply"}),/--plan is required/);
  assert.throws(()=>buildCanonicalizationRequest({projectId:"apoe-rexach",literatureRunId:"RUN-20260803",candidateId:"CAND-001",mode:"apply",planHash:"uppercase"}),/64-character lowercase/);
  assert.deepEqual(buildCanonicalizationRequest({projectId:"apoe-rexach",literatureRunId:"RUN-20260803",candidateId:"CAND-001",mode:"apply",planHash}),{
    route:"/api/literature-canonicalize",
    payload:{projectId:"apoe-rexach",runId:"RUN-20260803",candidateId:"CAND-001",mode:"apply",planHash},
  });
});

test("governed canonicalization exposes authority limits and source binding",()=>{
  const request={projectId:"apoe-rexach",literatureRunId:"RUN-20260803",candidateId:"CAND-001",mode:"preview" as const};
  const output=summarizeCanonicalizationResult({plan:{plan_hash:planHash,risk:"notify",actions:[{},{}]},created:[]},request,sourceHash,12.4);
  assert.equal(output.tool,"change.preview");
  assert.equal(output.source.source_hash,sourceHash);
  assert.equal(output.authority.canonical_write,false);
  assert.equal(output.authority.can_attest_human_review,false);
  assert.equal(output.authority.can_promote_claim_to_supported,false);
  assert.equal(output.result.action_count,2);
  assert.equal(output.result.elapsed_ms,12);
  assert.throws(()=>summarizeCanonicalizationResult({plan:{plan_hash:"c".repeat(64)}},{...request,mode:"apply",planHash},sourceHash,1),/did not match/);
});
