import {spawn} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdir,open,readFile,unlink,copyFile} from "node:fs/promises";
import path from "node:path";
import {atomicWriteFile} from "../lib/local-project-store.ts";
import {appendRunEvent,readRunCancellation} from "../lib/agent-run-ledger.ts";
import {contextPacket,loadResearchEnvironment} from "../lib/research-environment.ts";
import {parseNamedArguments} from "./local-research-api.mjs";

const root=process.cwd();
const args=parseNamedArguments(process.argv);
const registry=JSON.parse(await readFile(path.join(root,"projects.json"),"utf8"));
const projectId=args.get("project")||registry.projects[0]?.id;
const project=registry.projects.find(item=>item.id===projectId);
if(!project)throw new Error(`Unknown project ${projectId}.`);
const mode=args.get("mode")||"dry-run";
if(!["dry-run","handoff","worker"].includes(mode))throw new Error("--mode must be dry-run, handoff, or worker.");
const workerTimeoutSeconds=Number(args.get("worker-timeout-seconds")||"900");
if(!Number.isInteger(workerTimeoutSeconds)||workerTimeoutSeconds<30||workerTimeoutSeconds>3600)throw new Error("--worker-timeout-seconds must be an integer between 30 and 3600.");
const totalTimeoutSeconds=Number(args.get("total-timeout-seconds")||"1800");
if(!Number.isInteger(totalTimeoutSeconds)||totalTimeoutSeconds<120||totalTimeoutSeconds>14_400)throw new Error("--total-timeout-seconds must be an integer between 120 and 14400.");
const leaseSeconds=Number(args.get("lease-seconds")||"7200");
if(!Number.isInteger(leaseSeconds)||leaseSeconds<60||leaseSeconds>14_400)throw new Error("--lease-seconds must be an integer between 60 and 14400.");
const maxOutputBytes=Number(args.get("max-output-bytes")||"1000000");
if(!Number.isInteger(maxOutputBytes)||maxOutputBytes<65_536||maxOutputBytes>10_000_000)throw new Error("--max-output-bytes must be an integer between 65536 and 10000000.");
const resumeId=args.get("resume");
const requestedId=args.get("run");
const runId=resumeId||requestedId||`AGENT-${new Date().toISOString().replace(/[:.]/g,"-")}`;
if(!/^[A-Za-z0-9._-]{8,100}$/.test(runId))throw new Error("Run ID must contain 8 to 100 safe filename characters.");
const vaultRoot=path.resolve(root,project.vaultPath);
const runRoot=path.join(vaultRoot,"14 AI Workspace","runs",runId);
const statePath=path.join(runRoot,"RUN.json");
const lockRoot=path.join(root,".research-os","agent-locks");
const lockPath=path.join(lockRoot,`${projectId}.json`);
const lockToken=randomBytes(20).toString("base64url");
const deadlineAt=Date.now()+totalTimeoutSeconds*1000;
let lockHeartbeat;
let leaseFailure="";
await mkdir(runRoot,{recursive:true});
await mkdir(lockRoot,{recursive:true});

async function acquireLock(){
  try{
    const handle=await open(lockPath,"wx",0o600);
    await handle.writeFile(`${JSON.stringify({
      schema_version:"agent-lock-v1",project_id:projectId,run_id:runId,pid:process.pid,
      token:lockToken,created_at:new Date().toISOString(),heartbeat_at:new Date().toISOString(),
      expires_at:new Date(Date.now()+leaseSeconds*1000).toISOString(),
    },null,2)}\n`,"utf8");
    await handle.close();
    return;
  }catch(error){
    if(error.code!=="EEXIST")throw error;
  }
  const existing=JSON.parse(await readFile(lockPath,"utf8"));
  const expiry=Date.parse(existing.expires_at||"");
  if(Number.isFinite(expiry)&&expiry<=Date.now())throw new Error(`Project agent lock for ${existing.run_id||"unknown"} is expired. Recovery fails closed; inspect the prior run and remove the lock only after confirming its process is stopped.`);
  throw new Error(`Project agent lock is held by run ${existing.run_id||"unknown"}.`);
}

async function renewLock(){
  const existing=JSON.parse(await readFile(lockPath,"utf8"));
  if(existing.token!==lockToken)throw new Error("Agent lease ownership was lost; stopping before another run can overlap.");
  await atomicWriteFile(lockPath,`${JSON.stringify({...existing,heartbeat_at:new Date().toISOString(),expires_at:new Date(Date.now()+leaseSeconds*1000).toISOString()},null,2)}\n`);
}

async function releaseLock(){
  try{
    const existing=JSON.parse(await readFile(lockPath,"utf8"));
    if(existing.token===lockToken)await unlink(lockPath);
  }catch(error){if(error.code!=="ENOENT")throw error;}
}

function remainingTimeout(label,capMs){
  if(leaseFailure)throw new Error(leaseFailure);
  const remaining=deadlineAt-Date.now();
  if(remaining<=0)throw new Error(`Daily run exceeded its total ${totalTimeoutSeconds}-second deadline before ${label}.`);
  return Math.min(capMs,remaining);
}

function command(label,commandArgs,timeoutMs){
  return runProcess(label,process.execPath,commandArgs,root,remainingTimeout(label,timeoutMs));
}

function runProcess(label,binary,commandArgs,cwd,timeoutMs,cancellation){
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,commandArgs,{cwd,env:process.env,windowsHide:true});
    let output="",outputBytes=0,settled=false;
    let cancellationTimer;
    const terminate=()=>{if(child.pid)spawn("taskkill",["/pid",String(child.pid),"/t","/f"],{windowsHide:true}).unref();};
    const cleanup=()=>{clearTimeout(timer);if(cancellationTimer)clearInterval(cancellationTimer);};
    const finish=(error,value)=>{
      if(settled)return;
      settled=true;cleanup();
      if(error)reject(error);else resolve(value);
    };
    const collect=value=>{
      outputBytes+=value.length;
      if(outputBytes>maxOutputBytes){terminate();finish(new Error(`${label} exceeded its ${maxOutputBytes}-byte output limit and its worker tree was terminated.`));return;}
      output+=value.toString();
    };
    child.stdout?.on("data",collect); child.stderr?.on("data",collect);
    const timer=setTimeout(()=>{
      // `/t` includes only descendants of this known worker PID, avoiding orphaned local processes.
      terminate();
      finish(new Error(`${label} exceeded ${Math.round(timeoutMs/1000)} seconds and its worker tree was terminated.`));
    },timeoutMs);
    let cancellationCheck=false;
    cancellationTimer=cancellation?setInterval(async()=>{
      if(cancellationCheck)return;
      cancellationCheck=true;
      try{
        if(leaseFailure){
          terminate();
          finish(new Error(leaseFailure));
          return;
        }
        const request=await readRunCancellation(cancellation.vaultRoot,cancellation.runId);
        if(request){
          terminate();
          finish(new Error(`Run cancellation requested: ${String(request.reason||"no reason supplied")}`));
        }
      }finally{cancellationCheck=false;}
    },1_000):undefined;
    child.on("error",error=>finish(error));
    child.on("close",status=>{
      if(status!==0)finish(new Error(`${label} failed: ${output.trim().slice(-4_000)}`));
      else finish(null,output.trim());
    });
  });
}

function sha256(value){return createHash("sha256").update(value).digest("hex");}
async function sha256File(file){return sha256(await readFile(file));}

async function validateWorkerArtifacts(workerRunPath,requestPath){
  const manifestPath=path.join(workerRunPath,"MANIFEST.json");
  const shortlistPath=path.join(workerRunPath,"SHORTLIST.json");
  const proposalPath=path.join(workerRunPath,"IMPORT_PROPOSAL.json");
  const [manifest,shortlist,proposal]=await Promise.all([manifestPath,shortlistPath,proposalPath].map(async file=>JSON.parse(await readFile(file,"utf8"))));
  if(!["complete","partial"].includes(manifest.status))throw new Error(`Jarvis manifest status must be complete or partial, received ${manifest.status||"missing"}.`);
  if(proposal.schema_version!=="research-intake-v1"||shortlist.schema_version!=="research-intake-v1")throw new Error("Jarvis returned an unsupported research-intake-v1 artifact.");
  if(proposal.project_key!==project.workerProjectKey)throw new Error(`Jarvis proposal project_key ${proposal.project_key||"missing"} does not match ${project.workerProjectKey}.`);
  if(proposal.canonical_write_authorized!==false)throw new Error("Jarvis proposal attempted to authorize canonical writes.");
  if(!Array.isArray(proposal.candidates)||proposal.candidates.length>100||proposal.candidates.some(candidate=>candidate?.decision!=="pending"||candidate?.human_reviewed!==false))throw new Error("Jarvis proposal must contain at most 100 pending, non-human-reviewed candidates.");
  for(const [name,expected] of Object.entries(manifest.output_sha256||{})){
    if(!/^[A-Za-z0-9._-]+$/.test(name))throw new Error(`Jarvis manifest uses an unsafe artifact name: ${name}.`);
    const file=path.join(workerRunPath,name);
    if(await sha256File(file)!==expected)throw new Error(`Jarvis artifact hash mismatch: ${name}.`);
  }
  if(manifest.run_id!==proposal.run_id||manifest.run_id!==shortlist.run_id)throw new Error("Jarvis artifact run IDs do not agree.");
  if(shortlist.candidates?.length!==proposal.candidates.length)throw new Error("Jarvis shortlist and import proposal candidate counts do not agree.");
  const request=JSON.parse(await readFile(requestPath,"utf8"));
  if(request.project_key!==proposal.project_key)throw new Error("Jarvis proposal does not match this run's request project.");
  return {manifest,proposal,paths:{manifestPath,shortlistPath,proposalPath}};
}

let state;
if(resumeId){
  state=JSON.parse(await readFile(statePath,"utf8"));
  if(state.project_id!==projectId)throw new Error("Resume run belongs to a different project.");
}else{
  try{
    await readFile(statePath,"utf8");
    throw new Error(`Run ${runId} already exists; use --resume ${runId}.`);
  }catch(error){
    if(error.code!=="ENOENT")throw error;
  }
  state={
    schema_version:"agent-run-v1",run_id:runId,project_id:projectId,mode,
    status:"initialized",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    completed_stages:[],canonical_writes:0,external_actions:0,total_timeout_seconds:totalTimeoutSeconds,lease_seconds:leaseSeconds,
  };
}

async function saveState(){
  state.updated_at=new Date().toISOString();
  await atomicWriteFile(statePath,`${JSON.stringify(state,null,2)}\n`);
}

async function completeStage(name,work){
  if(state.completed_stages.includes(name))return;
  remainingTimeout(name,1);
  const cancellation=await readRunCancellation(vaultRoot,runId);
  if(cancellation)throw new Error(`Run cancellation requested: ${String(cancellation.reason||"no reason supplied")}`);
  const startedAt=Date.now();
  const output=await work();
  if(output)await atomicWriteFile(path.join(runRoot,`${name.toUpperCase()}.log`),`${String(output).trim()}\n`);
  state.completed_stages.push(name);
  state.status=`${name}-complete`;
  await saveState();
  await appendRunEvent(vaultRoot,runId,{kind:"stage-completed",summary:`Completed ${name} stage.`,artifacts:output?[`${name.toUpperCase()}.log`]:[],details:{duration_ms:Date.now()-startedAt}}).catch(()=>undefined);
}

await acquireLock();
lockHeartbeat=setInterval(()=>{void renewLock().catch(error=>{leaseFailure=error instanceof Error?error.message:String(error);state.lease_error=leaseFailure;});},Math.min(30_000,Math.max(10_000,Math.floor(leaseSeconds*500))));
try{
  await saveState();
  await completeStage("validate",async()=>command("Vault validation",[path.join(root,"scripts","validate-vault.mjs")],30_000));
  await completeStage("context",async()=>command("AI context generation",[path.join(root,"scripts","build-ai-index.mjs")],30_000));
  await completeStage("request",async()=>{
    const requestPath=path.join(runRoot,"REQUEST.json");
    return command("Literature request generation",[
      path.join(root,"scripts","build-literature-request.mjs"),
      "--project",projectId,"--out",requestPath,
    ],20_000);
  });
  await completeStage("routing",async()=>{
    const generated=path.join(vaultRoot,"14 AI Workspace","generated");
    const taskQueue=await readFile(path.join(generated,"TASK_QUEUE.json"),"utf8");
    const evidenceDebt=await readFile(path.join(generated,"EVIDENCE_DEBT.json"),"utf8");
    await atomicWriteFile(path.join(runRoot,"TASKS.json"),taskQueue);
    await atomicWriteFile(path.join(runRoot,"EVIDENCE_DEBT.json"),evidenceDebt);
    const environment=await loadResearchEnvironment(root,projectId);
    const packet=contextPacket(environment,{maxChars:7_000});
    await atomicWriteFile(path.join(runRoot,"CONTEXT_PACKET.json"),`${JSON.stringify(packet,null,2)}\n`);
    await appendRunEvent(vaultRoot,runId,{kind:"context-packet-created",summary:"Created a source-bound context packet for the current highest-priority task.",source_hash:environment.sourceHash,artifacts:["CONTEXT_PACKET.json"]});
    await atomicWriteFile(path.join(runRoot,"PLAN.md"),[
      `# Agent run plan — ${runId}`,"",
      `- Project: ${project.name}`,
      `- Mode: ${mode}`,
      "- Canonical writes authorized in this run: 0",
      `- External actions authorized in this run: ${mode==="worker"?1:0}`,"",
      "## Next boundary","",
      "Submit `REQUEST.json` to the bounded Jarvis worker. Preserve its immutable manifest and return proposal before frontier review.",
      "Do not treat worker output or this run folder as scientific evidence.","",
    ].join("\n"));
    return "Copied current task and evidence-debt projections plus a source-bound context packet into the run workspace.";
  });
  if(mode==="worker")await completeStage("worker",async()=>{
    const jarvisRoot=args.get("jarvis-root");
    const python=args.get("python");
    if(!jarvisRoot||!python)throw new Error("Worker mode requires --jarvis-root and --python; paths are explicit so the scheduled agent cannot silently choose another installation.");
    const requestPath=path.join(runRoot,"REQUEST.json");
    const output=await runProcess("Jarvis bulk worker",python,["-m","jarvis.src.jarvis.cli","bulk-run","--request",requestPath],path.resolve(jarvisRoot),remainingTimeout("Jarvis bulk worker",workerTimeoutSeconds*1000),{vaultRoot,runId});
    await atomicWriteFile(path.join(runRoot,"WORKER.log"),`${output}\n`);
    let parsed; try{parsed=JSON.parse(output);}catch{throw new Error("Jarvis completed without its required JSON completion record.");}
    if(typeof parsed.run_dir!=="string")throw new Error("Jarvis completion record omitted run_dir.");
    const workerRoot=path.resolve(jarvisRoot);
    const workerRunPath=path.resolve(workerRoot,parsed.run_dir);
    if(workerRunPath!==workerRoot&&!workerRunPath.startsWith(`${workerRoot}${path.sep}`))throw new Error("Jarvis completion run_dir escapes the explicit Jarvis root.");
    const result=await validateWorkerArtifacts(workerRunPath,requestPath);
    for(const [name,source] of Object.entries(result.paths))await copyFile(source,path.join(runRoot,`JARVIS_${name.toUpperCase().replace("PATH","")}`));
    const artifactHashes=Object.fromEntries(await Promise.all(Object.entries(result.paths).map(async([name,source])=>[name,await sha256File(source)])));
    await atomicWriteFile(path.join(runRoot,"WORKER_RESULT.json"),`${JSON.stringify({schema_version:"jarvis-worker-result-v1",worker_run_path:workerRunPath,request_sha256:await sha256File(requestPath),manifest:result.manifest,artifact_sha256:artifactHashes,canonical_writes:0},null,2)}\n`);
    state.external_actions=1;
    return `Jarvis ${result.manifest.status}: ${result.manifest.shortlist_count} shortlisted candidates; immutable run ${workerRunPath}.`;
  });
  state.status=mode==="worker"?"frontier-review-ready":"handoff-ready";
  state.handoff=mode==="worker"?"Jarvis artifacts were hash-validated and copied; frontier review is the next explicit boundary. No canonical write was executed.":"REQUEST.json is ready for the bounded Jarvis worker; no network, model, or canonical write was executed.";
  await atomicWriteFile(path.join(runRoot,"HANDOFF.md"),[
    `# Handoff — ${runId}`,"",
    "## Ready","",
    "- Vault validation passed.",
    "- AI routing projections were refreshed.",
    "- A bounded literature request was generated.",
    "- Task and evidence-debt snapshots were captured.","",
    "## Not executed","",
    mode==="worker"?"- Jarvis ran within an outer deadline; its hashed immutable artifacts were preserved.":"- Jarvis was not launched.",
    "- No frontier model review was claimed.",
    "- No canonical record was created or changed.",
    "- No schedule was enabled.","",
    "## Resume","",
    mode==="worker"?"Use `JARVIS_IMPORT_PROPOSAL.JSON` only to stage the proposal, then let a frontier model conduct the governed review. Do not treat it as evidence.":`Run \`pnpm agent:daily -- --project ${projectId} --resume ${runId} --mode worker --jarvis-root \"<Jarvis root>\" --python \"<bundled Python>\"\` after the worker handoff is available.`,
  ].join("\n"));
  await saveState();
  await appendRunEvent(vaultRoot,runId,{kind:"handoff-ready",summary:state.handoff,artifacts:["HANDOFF.md"]}).catch(()=>undefined);
  console.log(`${project.name}: agent run ${runId} is ${state.status} at ${path.relative(root,runRoot)}.`);
}catch(error){
  state.error=error instanceof Error?error.message:String(error);
  const cancelled=state.error.startsWith("Run cancellation requested:");
  state.status=cancelled?"cancelled":"failed";
  await saveState().catch(()=>undefined);
  await appendRunEvent(vaultRoot,runId,{kind:cancelled?"run-cancelled":"run-failed",summary:state.error||"Unknown failure."}).catch(()=>undefined);
  throw error;
}finally{
  if(lockHeartbeat)clearInterval(lockHeartbeat);
  await releaseLock().catch(()=>undefined);
}
