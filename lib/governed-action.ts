export type CanonicalizationMode="preview"|"apply";

export type CanonicalizationRequest={
  projectId:string;
  literatureRunId:string;
  candidateId:string;
  mode:CanonicalizationMode;
  planHash?:string;
};

type CanonicalizationApiResult={
  plan?:{
    plan_hash?:string;
    candidate_id?:string;
    candidate_revision?:string;
    record_revisions?:Record<string,string>;
    risk?:"low"|"notify";
    actions?:unknown[];
  };
  created?:string[];
  idempotent?:boolean;
};

const HASH=/^[a-f0-9]{64}$/;
const SAFE_RUN_ID=/^[A-Za-z0-9._-]{1,160}$/;

function required(value:string,label:string){
  const normalized=value.trim();
  if(!normalized)throw new Error(`${label} is required.`);
  return normalized;
}

/** Build the narrow payload accepted by the existing transactional canonicalizer. */
export function buildCanonicalizationRequest(request:CanonicalizationRequest){
  const projectId=required(request.projectId,"--project");
  const literatureRunId=required(request.literatureRunId,"--literature-run");
  const candidateId=required(request.candidateId,"--candidate");
  if(!SAFE_RUN_ID.test(literatureRunId))throw new Error("--literature-run must contain only safe filename characters.");
  if(!SAFE_RUN_ID.test(candidateId))throw new Error("--candidate must contain only safe identifier characters.");
  if(request.mode!=="preview"&&request.mode!=="apply")throw new Error("--mode must be preview or apply.");
  const planHash=request.planHash?.trim();
  if(request.mode==="apply"&&!planHash)throw new Error("--plan is required when --mode apply.");
  if(planHash&&!HASH.test(planHash))throw new Error("--plan must be a 64-character lowercase SHA-256 hash.");
  return {
    route:"/api/literature-canonicalize",
    payload:{projectId,runId:literatureRunId,candidateId,mode:request.mode,planHash},
  };
}

/**
 * Deliberately exposes the limits of canonicalization authority. The returned
 * source hash is a routing snapshot; transactional freshness is enforced by
 * the API's plan hash plus candidate and touched-record revisions.
 */
export function summarizeCanonicalizationResult(
  result:CanonicalizationApiResult,request:CanonicalizationRequest,sourceHash:string,elapsedMs:number,
){
  if(!HASH.test(sourceHash))throw new Error("Current canonical source hash is invalid.");
  const planHash=String(result.plan?.plan_hash||"");
  if(!HASH.test(planHash))throw new Error("Canonicalization response did not include a valid plan hash.");
  if(request.mode==="apply"&&request.planHash!==planHash)throw new Error("Canonicalization response plan hash did not match the acknowledged plan.");
  return {
    schema_version:"research-governed-action-v1",
    tool:request.mode==="preview"?"change.preview":"change.apply",
    source:{source_hash:sourceHash},
    authority:{
      canonical_write:request.mode==="apply",
      requires_acknowledged_plan_hash:true,
      transactional_freshness:"candidate revision and touched-record revisions are verified by the canonicalization API",
      source_hash_role:"routing snapshot only; it does not replace the plan freshness gate",
      can_attest_human_review:false,
      can_promote_claim_to_supported:false,
    },
    result:{
      literature_run_id:request.literatureRunId,
      candidate_id:request.candidateId,
      mode:request.mode,
      plan_hash:planHash,
      risk:result.plan?.risk||"unknown",
      action_count:result.plan?.actions?.length||0,
      created:result.created||[],
      idempotent:Boolean(result.idempotent),
      elapsed_ms:Math.max(0,Math.round(elapsedMs)),
    },
  };
}
