import {createHash} from "node:crypto";
import {
  nextRecordId,
  parseMarkdownRecord,
  scalarField,
  type RecordType,
} from "./research-schema.ts";
import type {LiteratureCandidate} from "./literature-intake.ts";

export type CanonicalRecordView={id:string;type:RecordType;title:string;raw:string};
export type CanonicalizationAction={
  type:RecordType;
  id:string;
  title:string;
  operation:"create"|"link-existing";
  reason:string;
};
export type CanonicalizationPlan={
  schema_version:"autonomous-canonicalization-v2";
  candidate_id:string;
  candidate_revision:string;
  record_revisions:Record<string,string>;
  mode:"create"|"merge";
  identity_match:"explicit"|"doi"|"pmid"|"pmcid"|"none";
  risk:"low"|"notify";
  plan_hash:string;
  paper_id:string;
  evidence_ids:string[];
  claim_ids:string[];
  idea_ids:string[];
  decision_id:string;
  related_record_ids:string[];
  evidence_claim_ids:Record<string,string[]>;
  actions:CanonicalizationAction[];
};

function normalized(value:string){
  return value.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

export function normalizeDoi(value:string){
  return value.trim().toLowerCase()
    .replace(/^doi:\s*/,"")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//,"")
    .replace(/[?#].*$/,"")
    .replace(/[)\],.;]+$/,"")
    .trim();
}

export function normalizePmid(value:string){
  return value.trim().replace(/^pmid:\s*/i,"").replace(/\D/g,"");
}

export function normalizePmcid(value:string){
  const compact=value.trim().toUpperCase().replace(/^https?:\/\/[^\s/]+\//,"").replace(/^PMC\s*/,"PMC");
  const digits=compact.replace(/\D/g,"");
  return digits?`PMC${digits}`:"";
}

function stableValue(value:unknown):unknown {
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.entries(value as Record<string,unknown>)
      .filter(([key])=>key!=="canonicalization")
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([key,item])=>[key,stableValue(item)]));
  }
  return value;
}

function hashValue(value:unknown){
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function frontmatter(record:CanonicalRecordView){
  return parseMarkdownRecord(record.raw).fields;
}

function next(type:RecordType,records:CanonicalRecordView[]){
  return nextRecordId(type,records.filter(record=>record.type===type).map(record=>record.id));
}

function identifierPaperMatch(candidate:LiteratureCandidate,records:CanonicalRecordView[]){
  const matches:Array<{record:CanonicalRecordView;by:"doi"|"pmid"|"pmcid"}>=[];
  const candidateDoi=normalizeDoi(candidate.doi||"");
  const candidatePmid=normalizePmid(candidate.pmid||"");
  const candidatePmcid=normalizePmcid(candidate.pmcid||"");
  for(const record of records){
    if(record.type!=="paper")continue;
    const fields=frontmatter(record);
    if(candidateDoi&&candidateDoi===normalizeDoi(scalarField(fields,"doi")))matches.push({record,by:"doi"});
    else if(candidatePmid&&candidatePmid===normalizePmid(scalarField(fields,"pmid")))matches.push({record,by:"pmid"});
    else if(candidatePmcid&&candidatePmcid===normalizePmcid(scalarField(fields,"pmcid")))matches.push({record,by:"pmcid"});
  }
  const ids=[...new Set(matches.map(match=>match.record.id))];
  if(ids.length>1)throw new Error(`Identifiers conflict across existing papers: ${ids.join(", ")}.`);
  return matches[0];
}

function titlePaperMatch(candidate:LiteratureCandidate,records:CanonicalRecordView[]){
  const targetTitle=normalized(candidate.title);
  return records.find(record=>record.type==="paper"&&targetTitle&&targetTitle===normalized(record.title));
}

function titleForEvidence(candidate:LiteratureCandidate,index:number){
  return `${candidate.title}: verified anchor ${index+1}`;
}

export function buildCanonicalizationPlan(candidate:LiteratureCandidate,records:CanonicalRecordView[]):CanonicalizationPlan {
  if(candidate.decision!=="accept"&&candidate.decision!=="merge"){
    throw new Error("Only accept or merge recommendations can be canonicalized.");
  }
  if(!candidate.agent_review)throw new Error("A frontier-agent review is required before canonicalization.");
  const matched=identifierPaperMatch(candidate,records);
  const explicitMerge=candidate.agent_review.merge_target;
  const explicitRecord=explicitMerge?records.find(record=>record.id===explicitMerge&&record.type==="paper"):undefined;
  if(explicitMerge&&!explicitRecord)throw new Error(`Explicit merge target ${explicitMerge} does not exist as a paper.`);
  if(explicitRecord&&matched&&explicitRecord.id!==matched.record.id){
    throw new Error(`Explicit merge target ${explicitRecord.id} conflicts with identifier match ${matched.record.id}.`);
  }
  const titleMatch=titlePaperMatch(candidate,records);
  if(!explicitMerge&&!matched&&titleMatch){
    throw new Error(`Title matches ${titleMatch.id}; an explicit reviewed merge target or distinct paper identity is required.`);
  }
  const mergeTarget=explicitRecord?.id||matched?.record.id;
  const mode:"create"|"merge"=mergeTarget?"merge":"create";
  const identityMatch:"explicit"|"doi"|"pmid"|"pmcid"|"none"=explicitRecord?"explicit":matched?.by||"none";
  const paperId=mergeTarget||next("paper",records);
  const newRecords=[...records];
  if(mode==="create")newRecords.push({id:paperId,type:"paper",title:candidate.title,raw:""});
  const verifiedEvidence=candidate.agent_review.schema_version==="frontier-review-v2"
    ? candidate.agent_review.verified_evidence||[]
    : [];
  const evidenceIds=verifiedEvidence.map((_,index)=>{
    const id=next("evidence",newRecords);
    newRecords.push({id,type:"evidence",title:titleForEvidence(candidate,index),raw:""});
    return id;
  });
  const claimIds=(candidate.agent_review.candidate_claims||[]).map((claim,index)=>{
    const explicitTarget=candidate.agent_review?.claim_targets?.[index];
    if(explicitTarget){
      const existing=records.find(record=>record.id===explicitTarget&&record.type==="claim");
      if(!existing)throw new Error(`Explicit claim target ${explicitTarget} does not exist as a claim.`);
      return existing.id;
    }
    const titleMatch=records.find(record=>record.type==="claim"&&normalized(record.title)===normalized(claim));
    if(titleMatch)throw new Error(`Candidate claim matches ${titleMatch.id}; an explicit claim_targets entry is required.`);
    const id=next("claim",newRecords);
    newRecords.push({id,type:"claim",title:claim,raw:""});
    return id;
  });
  const ideaIds:string[]=[];
  const decisionId=next("decision",newRecords);
  const relatedRecordIds=[] as string[];
  const evidenceClaimIds=Object.fromEntries(evidenceIds.map((id,index)=>[
    id,
    (verifiedEvidence[index]?.claim_indices||[]).map(claimIndex=>claimIds[claimIndex]).filter(Boolean),
  ]));
  const risk:"low"|"notify"=candidate.agent_review.model_impact==="material"||candidate.agent_review.contradiction_signal==="likely"||candidate.agent_review.novelty==="high"
    ?"notify":"low";
  const actions:CanonicalizationAction[]=[];
  actions.push(mode==="create"
    ? {type:"paper",id:paperId,title:candidate.title,operation:"create",reason:"Accepted frontier-agent review with primary-source verification."}
    : {type:"paper",id:paperId,title:records.find(record=>record.id===paperId)?.title||candidate.title,operation:"link-existing",reason:"Merged against DOI, PMID, title, or explicit PAP target."});
  evidenceIds.forEach((id,index)=>actions.push({type:"evidence",id,title:titleForEvidence(candidate,index),operation:"create",reason:"Frontier-reviewer-verified source text retained with its locator and epistemic label."}));
  claimIds.forEach((id,index)=>actions.push({type:"claim",id,title:candidate.agent_review!.candidate_claims[index]||records.find(record=>record.id===id)?.title||id,operation:records.some(record=>record.id===id)?"link-existing":"create",reason:"Candidate claim remains provisional."}));
  actions.push({type:"decision",id:decisionId,title:`Agent canonicalization for ${paperId}`,operation:"create",reason:`Autonomous ${risk=== "notify"?"notify-only":"low-risk"} action ledger.`});
  const recordRevisions=Object.fromEntries(
    records
      .filter(record=>record.id===paperId||claimIds.includes(record.id))
      .map(record=>[record.id,hashValue(record.raw)]),
  );
  const candidateRevision=hashValue(candidate);
  const planCore={
    schema_version:"autonomous-canonicalization-v2" as const,
    candidate_id:candidate.candidate_id,
    candidate_revision:candidateRevision,
    record_revisions:recordRevisions,
    mode,
    identity_match:identityMatch,
    risk,
    paper_id:paperId,
    evidence_ids:evidenceIds,
    claim_ids:claimIds,
    idea_ids:ideaIds,
    decision_id:decisionId,
    related_record_ids:relatedRecordIds,
    evidence_claim_ids:evidenceClaimIds,
    actions,
  };
  const hash=hashValue(planCore);
  return {
    ...planCore,
    plan_hash:hash,
  };
}
