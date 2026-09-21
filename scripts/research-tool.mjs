import {
  contextPacket,evidenceDossier,exploreGraph,getRecord,loadResearchEnvironment,nextWork,projectBrief,searchRecords,
} from "../lib/research-environment.ts";
import {appendRunEvent,inspectRun,requestRunCancellation,writeRunContextPacket} from "../lib/agent-run-ledger.ts";
import {buildCanonicalizationRequest,summarizeCanonicalizationResult} from "../lib/governed-action.ts";
import {postLocalResearchApi} from "./local-research-api.mjs";

function argumentsMap(argv){
  const values=new Map(),tokens=argv.slice(3);
  for(let index=0;index<tokens.length;index++){
    const key=tokens[index];
    if(!key.startsWith("--"))throw new Error(`Unexpected argument ${key}.`);
    const value=tokens[index+1];
    if(!value||value.startsWith("--"))throw new Error(`Expected a value after ${key}.`);
    values.set(key.slice(2),value);index++;
  }
  return values;
}
function list(value){return value?value.split(",").map(item=>item.trim()).filter(Boolean):undefined;}
function number(value){return value===undefined?undefined:Number(value);}

const command=process.argv[2];
const args=argumentsMap(process.argv);
try{
  const env=await loadResearchEnvironment(process.cwd(),args.get("project"));
  let output;
  if(command==="brief")output=projectBrief(env);
  else if(command==="search")output=searchRecords(env,{query:args.get("query")||"",types:list(args.get("types")),statuses:list(args.get("statuses")),limit:number(args.get("limit"))});
  else if(command==="record")output=getRecord(env,{id:args.get("id")||"",sections:list(args.get("sections")),maxChars:number(args.get("max-chars"))});
  else if(command==="graph")output=exploreGraph(env,{id:args.get("id")||"",depth:number(args.get("depth")),relations:list(args.get("relations")),limit:number(args.get("limit"))});
  else if(command==="evidence")output=evidenceDossier(env,{id:args.get("id")||"",maxItems:number(args.get("max-items"))});
  else if(command==="next")output=nextWork(env,{limit:number(args.get("limit")),lane:args.get("lane")});
  else if(command==="context"){
    output=contextPacket(env,{id:args.get("id"),decision:args.get("decision"),maxChars:number(args.get("max-chars"))});
    const run=args.get("run");
    const focusId=output.result.focus?.id||"current task";
    if(run){
      const artifact=await writeRunContextPacket(env.vaultRoot,run,output);
      await appendRunEvent(env.vaultRoot,run,{kind:"context-packet-created",summary:`Created source-bound context packet for ${focusId}.`,source_hash:env.sourceHash,artifacts:[artifact]});
    }
  }
  else if(command==="run-status")output=await inspectRun(env.vaultRoot,args.get("run")||"",{eventLimit:number(args.get("event-limit"))});
  else if(command==="run-event"){
    const run=args.get("run")||"",kind=args.get("kind")||"";
    if(!/^[a-z0-9][a-z0-9-]{2,63}$/.test(kind))throw new Error("--kind must be 3 to 64 lowercase letters, numbers, or hyphens.");
    output={schema_version:"research-environment-result-v1",tool:"run.event",project_id:env.project.id,source:{source_hash:env.sourceHash},result:await appendRunEvent(env.vaultRoot,run,{kind,summary:args.get("summary")||"",source_hash:env.sourceHash,artifacts:list(args.get("artifacts"))})};
  }
  else if(command==="run-cancel"){
    const cancellation=await requestRunCancellation(env.vaultRoot,args.get("run")||"",args.get("reason")||"");
    await appendRunEvent(env.vaultRoot,args.get("run")||"",{kind:"cancellation-requested",summary:String(cancellation.reason),source_hash:env.sourceHash,artifacts:["CANCEL.json"]});
    output={schema_version:"research-environment-result-v1",tool:"run.cancel",project_id:env.project.id,source:{source_hash:env.sourceHash},result:cancellation};
  }
  else if(command==="canonicalize"){
    const request={projectId:env.project.id,literatureRunId:args.get("literature-run")||"",candidateId:args.get("candidate")||"",mode:args.get("mode")||"preview",planHash:args.get("plan")};
    const operation=buildCanonicalizationRequest(request);
    const started=Date.now();
    const result=await postLocalResearchApi(operation.route,operation.payload);
    output=summarizeCanonicalizationResult(result,request,env.sourceHash,Date.now()-started);
    const agentRun=args.get("agent-run");
    if(agentRun){
      const action=output.result;
      await appendRunEvent(env.vaultRoot,agentRun,{
        kind:request.mode==="preview"?"canonicalization-previewed":"canonicalization-applied",
        summary:`${request.mode==="preview"?"Previewed":"Applied"} canonicalization for ${action.candidate_id} (${action.plan_hash.slice(0,12)}).`,
        source_hash:env.sourceHash,
        details:{duration_ms:action.elapsed_ms,literature_run_id:action.literature_run_id,candidate_id:action.candidate_id,plan_hash:action.plan_hash,risk:action.risk,idempotent:action.idempotent,created_count:action.created.length,authority:"governed-canonicalization-v1"},
      });
    }
  }
  else throw new Error("Tool must be one of: brief, search, record, graph, evidence, next, context, run-status, run-event, run-cancel, canonicalize.");
  process.stdout.write(`${JSON.stringify(output,null,2)}\n`);
}catch(error){
  process.stderr.write(`${JSON.stringify({schema_version:"research-environment-error-v1",tool:command||"unknown",error:error instanceof Error?error.message:String(error)})}\n`);
  process.exitCode=1;
}
