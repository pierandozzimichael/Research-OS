import assert from "node:assert/strict";
import test from "node:test";
import {buildCanonicalizationPlan,normalizeDoi} from "../lib/autonomous-canonicalization.ts";
import {createRecordMarkdown,updateRecordFields} from "../lib/research-schema.ts";
import type {LiteratureCandidate} from "../lib/literature-intake.ts";

const candidate:LiteratureCandidate={
  candidate_id:"candidate-001",
  title:"APOE4 local ancestry mechanism",
  abstract:"Abstract summary.",
  doi:"10.1234/example",
  pmid:"123456",
  url:"https://pubmed.ncbi.nlm.nih.gov/123456/",
  abstract_evidence_spans:["The abstract reports a relevant association."],
  decision:"accept",
  human_reviewed:false,
  agent_review:{
    schema_version:"frontier-review-v2",
    recommendation:"accept",
    verification_depth:"abstract",
    primary_source_checked:true,
    rationale:"The verified abstract addresses the active APOE local-ancestry question and warrants provisional routing.",
    reviewed_by_model:"frontier-test-model",
    reviewed_at:"2026-07-26T12:00:00Z",
    checked_urls:["https://pubmed.ncbi.nlm.nih.gov/123456/"],
    candidate_claims:["APOE local ancestry may modify a relevant phenotype."],
    contradiction_signal:"none",
    novelty:"medium",
    model_impact:"minor",
    verified_evidence:[{
      exact_text:"The abstract reports a relevant association.",
      source_url:"https://pubmed.ncbi.nlm.nih.gov/123456/",
      locator:"Abstract, results sentence 1",
      epistemic_label:"AUTHOR",
      verified_at:"2026-07-26T12:00:00Z",
      claim_indices:[0],
    }],
  },
};

test("creates a deterministic provisional record plan for an accepted candidate",()=>{
  const plan=buildCanonicalizationPlan(candidate,[]);
  assert.equal(plan.mode,"create");
  assert.equal(plan.schema_version,"autonomous-canonicalization-v2");
  assert.equal(plan.paper_id,"PAP-001");
  assert.deepEqual(plan.evidence_ids,["EVD-001"]);
  assert.deepEqual(plan.claim_ids,["CLM-001"]);
  assert.equal(plan.decision_id,"DEC-001");
  assert.equal(plan.risk,"low");
  assert.match(plan.plan_hash,/^[a-f0-9]{64}$/);
  assert.deepEqual(plan.evidence_claim_ids,{"EVD-001":["CLM-001"]});
  assert.equal(buildCanonicalizationPlan(candidate,[]).plan_hash,plan.plan_hash);
});

test("merges against an existing DOI match and surfaces material changes",()=>{
  const existingRaw=updateRecordFields(
    createRecordMarkdown("paper","PAP-014","Existing APOE paper","Existing summary"),
    {doi:"10.1234/example"},
  );
  const existing=buildCanonicalizationPlan({
    ...candidate,
    agent_review:{...candidate.agent_review!,model_impact:"material",novelty:"high"},
  },[{id:"PAP-014",type:"paper",title:"Existing APOE paper",raw:existingRaw}]);
  assert.equal(existing.mode,"merge");
  assert.equal(existing.paper_id,"PAP-014");
  assert.equal(existing.risk,"notify");
  assert.equal(existing.actions[0].operation,"link-existing");
  const changedRaw=updateRecordFields(existingRaw,{summary:"Changed after preview"});
  const changed=buildCanonicalizationPlan({
    ...candidate,
    agent_review:{...candidate.agent_review!,model_impact:"material",novelty:"high"},
  },[{id:"PAP-014",type:"paper",title:"Existing APOE paper",raw:changedRaw}]);
  assert.notEqual(changed.plan_hash,existing.plan_hash);
});

test("refuses to canonicalize a deferred candidate",()=>{
  assert.throws(()=>buildCanonicalizationPlan({...candidate,decision:"defer",agent_review:{...candidate.agent_review!,recommendation:"defer"}},[]),/Only accept or merge/);
});

test("normalizes DOI identity and refuses title-only autonomous merges",()=>{
  assert.equal(normalizeDoi("https://doi.org/10.1234/Example."),"10.1234/example");
  const titleOnly=createRecordMarkdown("paper","PAP-009",candidate.title,"Existing title");
  assert.throws(
    ()=>buildCanonicalizationPlan({...candidate,doi:"",pmid:""},[{id:"PAP-009",type:"paper",title:candidate.title,raw:titleOnly}]),
    /explicit reviewed merge target/,
  );
});

test("legacy reviews create no evidence records from worker-selected spans",()=>{
  const legacy={...candidate,agent_review:{...candidate.agent_review!,schema_version:"frontier-review-v1" as const}};
  delete (legacy.agent_review as {verified_evidence?:unknown}).verified_evidence;
  assert.deepEqual(buildCanonicalizationPlan(legacy,[]).evidence_ids,[]);
});

test("requires explicit targets before linking an existing claim",()=>{
  const claimRaw=createRecordMarkdown("claim","CLM-009",candidate.agent_review!.candidate_claims[0],"Existing scoped claim");
  const records=[{id:"CLM-009",type:"claim" as const,title:candidate.agent_review!.candidate_claims[0],raw:claimRaw}];
  assert.throws(()=>buildCanonicalizationPlan(candidate,records),/explicit claim_targets/);
  const targeted={
    ...candidate,
    agent_review:{...candidate.agent_review!,claim_targets:["CLM-009"]},
  };
  assert.deepEqual(buildCanonicalizationPlan(targeted,records).claim_ids,["CLM-009"]);
});
