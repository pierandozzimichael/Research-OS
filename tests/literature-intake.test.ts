import assert from "node:assert/strict";
import test from "node:test";
import {
  literatureProposalFileName,
  renderLiteratureDecisionBrief,
  validateAgentReview,
  validateLiteratureProposal,
} from "../lib/literature-intake.ts";

const proposal={
  schema_version:"research-intake-v1",
  run_id:"20260727T120000.000000Z",
  project_key:"apoe_tau",
  created_at:"2026-07-27T12:00:00Z",
  canonical_write_authorized:false,
  candidates:[{
    candidate_id:"abc123",
    title:"Candidate paper",
    decision:"pending",
    human_reviewed:false,
  }],
};

test("accepts a bounded provisional literature proposal",()=>{
  assert.deepEqual(validateLiteratureProposal(proposal),[]);
  assert.equal(literatureProposalFileName(proposal.run_id),`RUN-${proposal.run_id}.json`);
});

test("rejects canonical authority, invented review, and unsafe run IDs",()=>{
  const unsafe={
    ...proposal,
    run_id:"../../escape",
    canonical_write_authorized:true,
    candidates:[{...proposal.candidates[0],decision:"accept",human_reviewed:true}],
  };
  const errors=validateLiteratureProposal(unsafe);
  assert.ok(errors.some(error=>error.includes("run_id")));
  assert.ok(errors.some(error=>error.includes("canonical_write_authorized")));
  assert.ok(errors.some(error=>error.includes("decision pending")));
  assert.ok(errors.some(error=>error.includes("human review")));
});

test("governs frontier-agent recommendations without granting human review",()=>{
  const review={
    schema_version:"frontier-review-v1",
    recommendation:"accept",
    verification_depth:"abstract",
    primary_source_checked:true,
    rationale:"The primary abstract directly addresses the active mechanism and merits deeper human review.",
    reviewed_by_model:"frontier-test-model",
    reviewed_at:"2026-07-27T12:30:00Z",
    checked_urls:["https://pubmed.ncbi.nlm.nih.gov/123/"],
    candidate_claims:["The abstract reports a relevant association."],
    contradiction_signal:"possible",
    novelty:"high",
    model_impact:"material",
    fact_check_notes:"Only the abstract was checked; methods and figures remain unverified.",
  };
  assert.deepEqual(validateAgentReview(review),[]);
  const reviewed={
    ...proposal,
    candidates:[{...proposal.candidates[0],decision:"accept",human_reviewed:false,agent_review:review}],
  };
  assert.deepEqual(validateLiteratureProposal(reviewed,"stored"),[]);
  assert.ok(validateLiteratureProposal(reviewed,"import").some(error=>error.includes("decision pending")));
  assert.match(renderLiteratureDecisionBrief(reviewed as never),/Recommendations require a separate canonicalization step/);
});

test("requires primary-source verification for accept or merge",()=>{
  const errors=validateAgentReview({
    schema_version:"frontier-review-v1",
    recommendation:"accept",
    verification_depth:"metadata",
    primary_source_checked:false,
    rationale:"This is long enough to pass the bounded rationale requirement.",
    reviewed_by_model:"frontier-test-model",
    reviewed_at:"2026-07-27T12:30:00Z",
    checked_urls:[],
    candidate_claims:[],
    contradiction_signal:"none",
    novelty:"unclear",
    model_impact:"unclear",
  });
  assert.ok(errors.some(error=>error.includes("checked primary source")));
});

test("frontier-review-v2 requires traceable verified evidence anchors",()=>{
  const review={
    schema_version:"frontier-review-v2",
    recommendation:"accept",
    verification_depth:"abstract",
    primary_source_checked:true,
    rationale:"The checked primary abstract contains a bounded statement relevant to the active claim.",
    reviewed_by_model:"frontier-test-model",
    reviewed_at:"2026-07-27T12:30:00Z",
    checked_urls:["https://pubmed.ncbi.nlm.nih.gov/123/"],
    candidate_claims:["A bounded candidate claim."],
    contradiction_signal:"none",
    novelty:"medium",
    model_impact:"minor",
    verified_evidence:[{
      exact_text:"A bounded source statement.",
      source_url:"https://pubmed.ncbi.nlm.nih.gov/123/",
      locator:"Abstract, results sentence 2",
      epistemic_label:"AUTHOR",
      verified_at:"2026-07-27T12:30:00Z",
      claim_indices:[0],
    }],
  };
  assert.deepEqual(validateAgentReview(review),[]);
  assert.ok(validateAgentReview({
    ...review,
    verified_evidence:[{...review.verified_evidence[0],source_url:"https://example.com/unreviewed"}],
  }).some(error=>error.includes("checked URL")));
});
