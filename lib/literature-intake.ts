export const literatureIntakeSchema="research-intake-v1";
export const agentRecommendations=["pending","accept","reject","merge","defer"] as const;
export const agentVerificationDepths=["metadata","abstract","full-text"] as const;
export const evidenceLabels=["DIRECT","AUTHOR"] as const;

export type AgentRecommendation=typeof agentRecommendations[number];
export type AgentVerificationDepth=typeof agentVerificationDepths[number];
export type VerifiedEvidenceAnchor={
  exact_text:string;
  source_url:string;
  locator:string;
  epistemic_label:typeof evidenceLabels[number];
  verified_at:string;
  claim_indices:number[];
};

export type LiteratureAgentReview={
  schema_version:"frontier-review-v1"|"frontier-review-v2";
  recommendation:Exclude<AgentRecommendation,"pending">;
  verification_depth:AgentVerificationDepth;
  primary_source_checked:boolean;
  rationale:string;
  reviewed_by_model:string;
  reviewed_at:string;
  checked_urls:string[];
  candidate_claims:string[];
  claim_targets?:Array<string|null>;
  contradiction_signal:"none"|"possible"|"likely"|"unclear";
  novelty:"low"|"medium"|"high"|"unclear";
  model_impact:"none"|"minor"|"material"|"unclear";
  merge_target?:string;
  fact_check_notes?:string;
  verified_evidence?:VerifiedEvidenceAnchor[];
};

export type LiteratureCandidate={
  candidate_id:string;
  title:string;
  abstract?:string;
  doi?:string;
  pmid?:string;
  pmcid?:string;
  year?:string;
  journal?:string;
  url?:string;
  deterministic_score?:number;
  known_match?:boolean;
  query_matches?:string[];
  source_matches?:string[];
  abstract_evidence_spans?:string[];
  local_extraction?:unknown;
  decision:AgentRecommendation;
  human_reviewed:false;
  agent_review?:LiteratureAgentReview;
  canonicalization?:{
    status:"applied";
    plan_hash:string;
    record_ids:string[];
    applied_at:string;
    applied_by_model:string;
    plan?:unknown;
  };
};

export type LiteratureProposal={
  schema_version:typeof literatureIntakeSchema;
  run_id:string;
  project_key:string;
  created_at:string;
  canonical_write_authorized:false;
  candidates:LiteratureCandidate[];
};

export function validateAgentReview(value:unknown):string[] {
  if(!value||typeof value!=="object"||Array.isArray(value))return ["Agent review must be an object."];
  const review=value as Partial<LiteratureAgentReview>;
  const errors:string[]=[];
  if(!["frontier-review-v1","frontier-review-v2"].includes(String(review.schema_version)))errors.push("Agent review schema_version must be frontier-review-v1 or frontier-review-v2.");
  if(!agentRecommendations.slice(1).includes(review.recommendation as never))errors.push("Agent recommendation must be accept, reject, merge, or defer.");
  if(!agentVerificationDepths.includes(review.verification_depth as never))errors.push("verification_depth must be metadata, abstract, or full-text.");
  if(typeof review.primary_source_checked!=="boolean")errors.push("primary_source_checked must be boolean.");
  if(!review.rationale||review.rationale.trim().length<20||review.rationale.length>4_000)errors.push("rationale must be 20 to 4000 characters.");
  if(!review.reviewed_by_model||review.reviewed_by_model.length>200)errors.push("reviewed_by_model is required and must be at most 200 characters.");
  if(!review.reviewed_at||Number.isNaN(Date.parse(review.reviewed_at)))errors.push("reviewed_at must be an ISO-compatible timestamp.");
  if(!Array.isArray(review.checked_urls)||review.checked_urls.length>20||review.checked_urls.some(url=>typeof url!=="string"||!/^https?:\/\//i.test(url)))errors.push("checked_urls must contain at most 20 HTTP(S) URLs.");
  if(!Array.isArray(review.candidate_claims)||review.candidate_claims.length>20||review.candidate_claims.some(claim=>typeof claim!=="string"||claim.length>1_000))errors.push("candidate_claims must contain at most 20 bounded strings.");
  if(review.claim_targets!==undefined&&(
    !Array.isArray(review.claim_targets)||
    review.claim_targets.length!==(review.candidate_claims?.length||0)||
    review.claim_targets.some(target=>target!==null&&!/^CLM-\d{3,}$/.test(String(target)))
  ))errors.push("claim_targets must align with candidate_claims and contain CLM-### IDs or null.");
  if(!["none","possible","likely","unclear"].includes(String(review.contradiction_signal)))errors.push("Invalid contradiction_signal.");
  if(!["low","medium","high","unclear"].includes(String(review.novelty)))errors.push("Invalid novelty.");
  if(!["none","minor","material","unclear"].includes(String(review.model_impact)))errors.push("Invalid model_impact.");
  if(review.fact_check_notes&&review.fact_check_notes.length>5_000)errors.push("fact_check_notes must be at most 5000 characters.");
  if(review.schema_version==="frontier-review-v2"){
    if(!Array.isArray(review.verified_evidence)||review.verified_evidence.length>20){
      errors.push("frontier-review-v2 verified_evidence must be an array of at most 20 anchors.");
    }else{
      review.verified_evidence.forEach((anchor,index)=>{
        if(!anchor||typeof anchor!=="object"){errors.push(`Verified evidence ${index+1} must be an object.`);return;}
        if(typeof anchor.exact_text!=="string"||!anchor.exact_text.trim()||anchor.exact_text.length>2_000)errors.push(`Verified evidence ${index+1} exact_text is required and limited to 2000 characters.`);
        if(typeof anchor.source_url!=="string"||!/^https?:\/\//i.test(anchor.source_url)||!review.checked_urls?.includes(anchor.source_url))errors.push(`Verified evidence ${index+1} source_url must exactly match a checked URL.`);
        if(typeof anchor.locator!=="string"||!anchor.locator.trim()||anchor.locator.length>500)errors.push(`Verified evidence ${index+1} requires a bounded source locator.`);
        if(!evidenceLabels.includes(anchor.epistemic_label as typeof evidenceLabels[number]))errors.push(`Verified evidence ${index+1} epistemic_label must be DIRECT or AUTHOR.`);
        if(!anchor.verified_at||Number.isNaN(Date.parse(anchor.verified_at)))errors.push(`Verified evidence ${index+1} verified_at must be an ISO-compatible timestamp.`);
        if(!Array.isArray(anchor.claim_indices)||anchor.claim_indices.some(value=>!Number.isInteger(value)||value<0||value>=(review.candidate_claims?.length||0)))errors.push(`Verified evidence ${index+1} claim_indices must reference candidate_claims by zero-based index.`);
      });
    }
  }else if(review.verified_evidence!==undefined){
    errors.push("verified_evidence requires frontier-review-v2.");
  }
  if(review.recommendation==="merge"&&!/^PAP-\d{3,}$/.test(review.merge_target||""))errors.push("A merge recommendation requires a PAP-### merge_target.");
  if(["accept","merge"].includes(String(review.recommendation))&&(
    review.primary_source_checked!==true||
    !["abstract","full-text"].includes(String(review.verification_depth))||
    !review.checked_urls?.length
  )){
    errors.push("Accept or merge requires a checked primary source URL and abstract or full-text verification.");
  }
  return errors;
}

export function validateLiteratureProposal(value:unknown,mode:"import"|"stored"="import"):string[] {
  if(!value||typeof value!=="object"||Array.isArray(value))return ["Proposal must be an object."];
  const proposal=value as Partial<LiteratureProposal>;
  const errors:string[]=[];
  if(proposal.schema_version!==literatureIntakeSchema)errors.push(`schema_version must be ${literatureIntakeSchema}.`);
  if(!proposal.run_id||!/^[A-Za-z0-9._-]{8,80}$/.test(proposal.run_id))errors.push("run_id must be 8 to 80 safe filename characters.");
  if(!proposal.project_key||proposal.project_key.length>80)errors.push("project_key is required and must be at most 80 characters.");
  if(proposal.canonical_write_authorized!==false)errors.push("canonical_write_authorized must be false.");
  if(!Array.isArray(proposal.candidates)||proposal.candidates.length>100){
    errors.push("candidates must be an array of at most 100 provisional papers.");
    return errors;
  }
  const seen=new Set<string>();
  proposal.candidates.forEach((candidate,index)=>{
    if(!candidate||typeof candidate!=="object"){errors.push(`Candidate ${index+1} must be an object.`);return;}
    if(!candidate.candidate_id||typeof candidate.candidate_id!=="string"||candidate.candidate_id.length>100){
      errors.push(`Candidate ${index+1} requires a bounded candidate_id.`);
    }else if(seen.has(candidate.candidate_id)){
      errors.push(`Duplicate candidate_id ${candidate.candidate_id}.`);
    }else seen.add(candidate.candidate_id);
    if(!candidate.title||typeof candidate.title!=="string"||candidate.title.length>1_000)errors.push(`Candidate ${index+1} requires a bounded title.`);
    if(!agentRecommendations.includes(candidate.decision as AgentRecommendation))errors.push(`Candidate ${index+1} has an invalid recommendation.`);
    if(mode==="import"&&candidate.decision!=="pending")errors.push(`Candidate ${index+1} must enter with decision pending.`);
    if(candidate.decision==="pending"&&candidate.agent_review)errors.push(`Candidate ${index+1} cannot have an agent review while pending.`);
    if(candidate.decision!=="pending"){
      const reviewErrors=validateAgentReview(candidate.agent_review);
      errors.push(...reviewErrors.map(error=>`Candidate ${index+1}: ${error}`));
      if(candidate.agent_review?.recommendation!==candidate.decision)errors.push(`Candidate ${index+1} recommendation does not match its agent review.`);
    }
    if(candidate.human_reviewed!==false)errors.push(`Candidate ${index+1} cannot attest human review.`);
  });
  return errors;
}

export function renderLiteratureDecisionBrief(proposal:LiteratureProposal) {
  const counts=Object.fromEntries(agentRecommendations.map(value=>[
    value,
    proposal.candidates.filter(candidate=>candidate.decision===value).length,
  ]));
  const lines=[
    `# Daily literature decision brief — ${proposal.run_id}`,
    "",
    "> Generated from provisional frontier-agent reviews. This is a staging artifact, not canonical evidence or human review.",
    "",
    "## Summary",
    "",
    `- Candidates: ${proposal.candidates.length}`,
    `- Accept: ${counts.accept}`,
    `- Merge: ${counts.merge}`,
    `- Reject: ${counts.reject}`,
    `- Defer: ${counts.defer}`,
    `- Pending: ${counts.pending}`,
    "",
  ];
  for(const candidate of proposal.candidates){
    lines.push(`## ${candidate.title}`,"",`- Recommendation: \`${candidate.decision}\``);
    if(candidate.doi)lines.push(`- DOI: ${candidate.doi}`);
    if(candidate.pmid)lines.push(`- PMID: ${candidate.pmid}`);
    const review=candidate.agent_review;
    if(review){
      lines.push(
        `- Verification: \`${review.verification_depth}\`; primary source checked: \`${review.primary_source_checked}\``,
        `- Reviewed by model: ${review.reviewed_by_model}`,
        `- Novelty: \`${review.novelty}\`; contradiction: \`${review.contradiction_signal}\`; model impact: \`${review.model_impact}\``,
        "",
        review.rationale,
        "",
      );
      if(review.candidate_claims.length){
        lines.push("Candidate claims:");
        for(const claim of review.candidate_claims)lines.push(`- ${claim}`);
        lines.push("");
      }
      if(review.verified_evidence?.length){
        lines.push("Verified evidence anchors:");
        for(const anchor of review.verified_evidence){
          lines.push(`- ${anchor.epistemic_label} · ${anchor.locator} · ${anchor.source_url}`);
        }
        lines.push("");
      }
      if(review.fact_check_notes)lines.push("Fact-check notes:","",review.fact_check_notes,"");
    }
    lines.push("");
  }
  lines.push(
    "## Boundary",
    "",
    "Recommendations require a separate canonicalization step. Do not convert this brief directly into supported claims.",
  );
  return `${lines.join("\n").trim()}\n`;
}

export function literatureProposalFileName(runId:string) {
  if(!/^[A-Za-z0-9._-]{8,80}$/.test(runId))throw new Error("Invalid literature run ID");
  return `RUN-${runId}.json`;
}
