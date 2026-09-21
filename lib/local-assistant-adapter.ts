import {execFile,spawn} from "node:child_process";
import {access,mkdtemp,readFile,readdir,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {validateAssistantResponse,type AssistantRequest,type AssistantResponse} from "./assistant-contract";
import {evidenceDossier,exploreGraph,getRecord,loadResearchEnvironment,projectBrief,searchRecords} from "./research-environment";
import {runBoundedProcess} from "./bounded-process";
import {toOllamaGrammarSchema} from "./ollama-schema";

export type LocalAssistantProviderStatus={id:"codex"|"ollama"|"claude";label:string;available:boolean;detail:string;models?:string[];canStart?:boolean;localOnly?:boolean;externalContext?:boolean};

async function executableExists(candidate:string){
  try{await access(candidate);return true;}catch{return false;}
}

export async function findCodexExecutable(){
  const configured=String(process.env.RESEARCH_OS_CODEX_BIN||"").trim();
  if(configured&&await executableExists(configured))return configured;
  if(process.platform==="win32"){
    const local=process.env.LOCALAPPDATA;
    const binRoot=local?path.join(local,"OpenAI","Codex","bin"):"";
    if(binRoot){
      try{
        const builds=await readdir(binRoot,{withFileTypes:true});
        for(const build of builds.filter(item=>item.isDirectory()).sort((a,b)=>b.name.localeCompare(a.name))){
          const candidate=path.join(binRoot,build.name,"codex.exe");
          if(await executableExists(candidate))return candidate;
        }
      }catch{/* Codex is optional. */}
    }
    return "";
  }
  for(const candidate of ["/usr/local/bin/codex",path.join(os.homedir(),".local","bin","codex")]){
    if(await executableExists(candidate))return candidate;
  }
  return "";
}

export async function findOllamaExecutable(){
  const configured=String(process.env.RESEARCH_OS_OLLAMA_BIN||"").trim();
  if(configured&&await executableExists(configured))return configured;
  if(process.platform==="win32"){
    const local=process.env.LOCALAPPDATA||"";
    for(const candidate of [path.join(local,"Programs","Ollama","ollama.exe"),path.join(local,"Ollama","ollama.exe")]){
      if(await executableExists(candidate))return candidate;
    }
  }
  for(const candidate of ["/usr/local/bin/ollama",path.join(os.homedir(),".local","bin","ollama")]){
    if(await executableExists(candidate))return candidate;
  }
  return "";
}

export async function findClaudeExecutable(){
  const configured=String(process.env.RESEARCH_OS_CLAUDE_BIN||"").trim();
  if(configured&&await executableExists(configured))return configured;
  if(process.platform==="win32"){
    const home=os.homedir(),appData=process.env.APPDATA||"";
    for(const candidate of [path.join(home,".local","bin","claude.exe"),path.join(home,".claude","local","claude.exe"),path.join(appData,"npm","claude.exe")]){
      if(await executableExists(candidate))return candidate;
    }
  }
  for(const candidate of ["/usr/local/bin/claude",path.join(os.homedir(),".local","bin","claude")])if(await executableExists(candidate))return candidate;
  return "";
}

type OllamaTag={name?:unknown;model?:unknown};
async function ollamaModels(timeout=2_500,signal?:AbortSignal){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  const cancel=()=>controller.abort();
  signal?.addEventListener("abort",cancel,{once:true});
  try{
    const response=await fetch("http://127.0.0.1:11434/api/tags",{signal:controller.signal});
    if(!response.ok)throw new Error(`Ollama returned ${response.status}`);
    const payload=await response.json() as {models?:OllamaTag[]};
    return (payload.models||[]).map(item=>String(item.name||item.model||"").trim()).filter(Boolean).sort();
  }finally{
    clearTimeout(timer);signal?.removeEventListener("abort",cancel);
  }
}

export async function startOllamaServer(){
  try{const models=await ollamaModels(800);return {models,started:false};}catch{/* Start only when the loopback API is unavailable. */}
  const executable=await findOllamaExecutable();
  if(!executable)throw new Error("Ollama is not installed on this computer");
  const child=spawn(executable,["serve"],{detached:true,stdio:"ignore",windowsHide:true});
  child.unref();
  const deadline=Date.now()+10_000;
  while(Date.now()<deadline){
    try{return {models:await ollamaModels(900),started:true};}catch{await new Promise(resolve=>setTimeout(resolve,250));}
  }
  throw new Error("Ollama did not become ready within 10 seconds");
}

function execFileText(command:string,args:string[],options:{cwd:string;timeout:number;signal?:AbortSignal;maxBuffer?:number}){
  return new Promise<{stdout:string;stderr:string}>((resolve,reject)=>{
    execFile(command,args,{...options,windowsHide:true,encoding:"utf8"},(error,stdout,stderr)=>{
      if(error){
        const detail=String(stderr||stdout||error.message).trim();
        reject(new Error(detail||"Local assistant process failed"));
      }else resolve({stdout:String(stdout),stderr:String(stderr)});
    });
  });
}

export async function localAssistantProviderStatus(root:string):Promise<LocalAssistantProviderStatus[]>{
  const [codex,ollamaExecutable,claude]=await Promise.all([findCodexExecutable(),findOllamaExecutable(),findClaudeExecutable()]);
  let codexDetail="Not installed";
  if(codex){
    try{codexDetail=(await execFileText(codex,["--version"],{cwd:root,timeout:5_000,maxBuffer:64_000})).stdout.trim()||"Installed";}
    catch{codexDetail="Installed but unavailable";}
  }
  let models:string[]=[];
  try{models=await ollamaModels();}catch{/* The local service is optional. */}
  return [
    {id:"codex",label:"Codex",available:Boolean(codex)&&codexDetail!=="Installed but unavailable",detail:codexDetail,externalContext:true},
    {id:"ollama",label:"Local model",available:models.length>0,detail:models.length?`${models.length} local model${models.length===1?"":"s"} ready`:ollamaExecutable?"Ollama is installed but not running":"Ollama is not installed",models,canStart:Boolean(ollamaExecutable)&&!models.length,localOnly:true},
    {id:"claude",label:"Claude Code",available:false,detail:claude?"Claude CLI detected; execution remains disabled until its local contract passes validation":"Claude CLI is not installed on this computer",externalContext:true},
  ];
}

function assistantPrompt(request:AssistantRequest,context:string){
  const history=(request.history||[]).map(item=>`${item.role.toUpperCase()}: ${item.content}`).join("\n\n");
  return [
    "You are the read-only Research OS question surface for the active local project.",
    "The application already supplied a bounded canonical context packet. Answer from it directly; do not re-scan the repository unless the packet is insufficient.",
    "Generated indexes, inbox items, and run artifacts are routing only. Keep DIRECT, AUTHOR, INFERENCE, and SPECULATION separate.",
    "Do not edit files, attest human review, promote claims, or treat your answer as canonical evidence.",
    "Return only the requested JSON shape. Cite only canonical stable IDs you actually inspected.",
    "UI actions are optional presentation hints. Use open_record for one record, show_path for one/two hops, or present_path for an ordered two-to-eight step evidence-to-experiment explanation.",
    "Every UI action uses the same envelope: set irrelevant id/focus_id to empty strings, irrelevant depth to zero, and irrelevant steps to an empty array.",
    `Project ID: ${request.projectId}`,
    `Current focus: ${request.focusRecordId||"none"}`,
    `Bounded canonical context:\n${context}`,
    history?`Recent in-memory conversation:\n${history}`:"No prior conversation was supplied.",
    `User question: ${request.question}`,
  ].join("\n\n");
}

export async function runCodexAssistant(
  root:string,
  request:AssistantRequest,
  allowedIds:Iterable<string>,
  signal?:AbortSignal,
):Promise<AssistantResponse>{
  const codex=await findCodexExecutable();
  if(!codex)throw new Error("Codex is not installed or could not be found");
  const temporary=await mkdtemp(path.join(os.tmpdir(),"research-os-assistant-"));
  const outputPath=path.join(temporary,"answer.json");
  try{
    const schemaPath=path.join(root,"contracts","assistant-response.schema.json");
    const context=await localModelContext(root,request);
    await runBoundedProcess(codex,[
      "exec","--json","--ephemeral","--ignore-user-config","--sandbox","read-only","--skip-git-repo-check",
      // The repository has already been reduced to the bounded packet above. Running
      // from the empty request directory prevents a provider from spending the whole
      // safety window rediscovering the vault and keeps latency independent of vault size.
      "--cd",temporary,"--output-schema",schemaPath,"--output-last-message",outputPath,
      assistantPrompt(request,context),
    ],{cwd:temporary,timeout:120_000,signal,maxBuffer:2_000_000});
    const raw=await readFile(outputPath,"utf8");
    let parsed:unknown;
    try{parsed=JSON.parse(raw);}catch{throw new Error("Codex did not return valid structured JSON");}
    return validateAssistantResponse(parsed,"codex",allowedIds);
  }finally{
    await rm(temporary,{recursive:true,force:true});
  }
}

function compactJson(value:unknown,max=42_000){
  const raw=JSON.stringify(value);
  return raw.length<=max?raw:`${raw.slice(0,max)}\n[context truncated at ${max} characters]`;
}

async function localModelContext(root:string,request:AssistantRequest){
  const environment=await loadResearchEnvironment(root,request.projectId);
  const matches=searchRecords(environment,{query:request.question,limit:5}) as {result?:Array<{id?:string}>};
  const matchIds=(matches.result||[]).map(item=>String(item.id||"")).filter(Boolean).slice(0,5);
  const records=matchIds.map(id=>getRecord(environment,{id,maxChars:3_500}));
  const focus=request.focusRecordId?{
    record:getRecord(environment,{id:request.focusRecordId,maxChars:7_000}),
    graph:exploreGraph(environment,{id:request.focusRecordId,depth:2,limit:30}),
    evidence:evidenceDossier(environment,{id:request.focusRecordId,maxItems:12}),
  }:null;
  return compactJson({project:projectBrief(environment),focus,search_matches:records});
}

export async function runOllamaAssistant(
  root:string,
  request:AssistantRequest,
  allowedIds:Iterable<string>,
  signal?:AbortSignal,
):Promise<AssistantResponse>{
  const models=await ollamaModels(3_000,signal);
  const model=request.model||models[0];
  if(!model||!models.includes(model))throw new Error("Select an installed local model");
  const schema=toOllamaGrammarSchema(JSON.parse(await readFile(path.join(root,"contracts","assistant-response.schema.json"),"utf8")));
  const context=await localModelContext(root,request);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),120_000);
  const cancel=()=>controller.abort();
  signal?.addEventListener("abort",cancel,{once:true});
  try{
    const messages=[
      {role:"system",content:[
        "You are a literal, read-only scientific routing assistant. Use only the bounded canonical Research OS context supplied by the application.",
        "Separate DIRECT, AUTHOR, INFERENCE, and SPECULATION. Preserve contradictions and uncertainty. Never attest human review, promote a claim, or invent a stable ID.",
        "Return one JSON object with answer, citations, ui_actions, and boundary_note. Citations contain id and note. UI actions may only open a record, show a one/two-hop path, or present an ordered evidence path.",
        "Every UI action uses one envelope with type, id, focus_id, depth, steps, and reason. Irrelevant id/focus_id are empty strings, irrelevant depth is zero, and irrelevant steps is an empty array.",
      ].join(" ")},
      ...(request.history||[]).map(item=>({role:item.role,content:item.content})),
      {role:"user",content:`Bounded project context:\n${context}\n\nQuestion: ${request.question}`},
    ];
    const ask=(format:unknown)=>fetch("http://127.0.0.1:11434/api/chat",{
      method:"POST",signal:controller.signal,headers:{"content-type":"application/json"},
      body:JSON.stringify({model,stream:false,format,keep_alive:"5m",options:{temperature:0.1,num_predict:1_600},messages}),
    });
    let response=await ask(schema);
    if(!response.ok){
      const detail=(await response.text()).slice(0,1_000).trim();
      // Some installed llama.cpp grammars reject otherwise valid nested JSON
      // schemas. JSON mode plus the same strict post-validator is the bounded
      // compatibility path; other provider errors still fail immediately.
      if(response.status===400&&/parse grammar|initialize samplers/i.test(detail))response=await ask("json");
      else throw new Error(`Local model returned ${response.status}${detail?`: ${detail}`:""}`);
    }
    if(!response.ok){
      const detail=(await response.text()).slice(0,1_000).trim();
      throw new Error(`Local model returned ${response.status}${detail?`: ${detail}`:""}`);
    }
    const payload=await response.json() as {message?:{content?:unknown}};
    const content=String(payload.message?.content||"");
    let parsed:unknown;
    try{parsed=JSON.parse(content);}catch{throw new Error("The local model did not return valid structured JSON");}
    return validateAssistantResponse(parsed,"ollama",allowedIds);
  }catch(error){
    if(controller.signal.aborted)throw new Error("Local model timed out or was cancelled");
    throw error;
  }finally{
    clearTimeout(timer);signal?.removeEventListener("abort",cancel);
  }
}
