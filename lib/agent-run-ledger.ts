import {randomUUID} from "node:crypto";
import {appendFile,mkdir,readFile} from "node:fs/promises";
import path from "node:path";
import {atomicWriteFile} from "./local-project-store.ts";

export type RunEvent={
  schema_version:"agent-run-event-v1";event_id:string;at:string;kind:string;summary:string;
  source_hash?:string;artifacts?:string[];details?:Record<string,unknown>;
};

function safeRunId(runId:string){
  if(!/^[A-Za-z0-9._-]{8,100}$/.test(runId))throw new Error("Run ID must contain 8 to 100 safe filename characters.");
  return runId;
}

export function runRoot(vaultRoot:string,runId:string){
  return path.join(vaultRoot,"14 AI Workspace","runs",safeRunId(runId));
}

export async function appendRunEvent(vaultRoot:string,runId:string,event:Omit<RunEvent,"schema_version"|"event_id"|"at">){
  const root=runRoot(vaultRoot,runId);
  const statePath=path.join(root,"RUN.json");
  try{await readFile(statePath,"utf8");}catch{throw new Error(`Unknown run ${runId}; create it with pnpm agent:daily before adding events.`);}
  const value:RunEvent={schema_version:"agent-run-event-v1",event_id:randomUUID(),at:new Date().toISOString(),...event};
  await mkdir(root,{recursive:true});
  await appendFile(path.join(root,"EVENTS.jsonl"),`${JSON.stringify(value)}\n`,"utf8");
  return value;
}

export async function writeRunContextPacket(vaultRoot:string,runId:string,packet:unknown){
  const root=runRoot(vaultRoot,runId);
  try{await readFile(path.join(root,"RUN.json"),"utf8");}catch{throw new Error(`Unknown run ${runId}; create it with pnpm agent:daily before writing a context packet.`);}
  const artifact="CONTEXT_PACKET.json";
  await atomicWriteFile(path.join(root,artifact),`${JSON.stringify(packet,null,2)}\n`);
  return artifact;
}

export async function requestRunCancellation(vaultRoot:string,runId:string,reason:string){
  const root=runRoot(vaultRoot,runId);
  try{await readFile(path.join(root,"RUN.json"),"utf8");}catch{throw new Error(`Unknown run ${runId}; create it with pnpm agent:daily before requesting cancellation.`);}
  const request={schema_version:"agent-run-cancellation-v1",run_id:runId,requested_at:new Date().toISOString(),reason:reason.trim()||"Cancellation requested by operator."};
  await atomicWriteFile(path.join(root,"CANCEL.json"),`${JSON.stringify(request,null,2)}\n`);
  return request;
}

export async function readRunCancellation(vaultRoot:string,runId:string){
  try{return JSON.parse(await readFile(path.join(runRoot(vaultRoot,runId),"CANCEL.json"),"utf8")) as Record<string,unknown>;}catch{return null;}
}

export async function inspectRun(vaultRoot:string,runId:string,{eventLimit=20}={}){
  const root=runRoot(vaultRoot,runId);
  const state=JSON.parse(await readFile(path.join(root,"RUN.json"),"utf8"));
  let events:RunEvent[]=[];
  try{
    const raw=await readFile(path.join(root,"EVENTS.jsonl"),"utf8");
    events=raw.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line) as RunEvent).slice(-Math.max(1,Math.min(100,eventLimit)));
  }catch{}
  return {schema_version:"agent-run-status-v1",run_id:runId,state,cancellation:await readRunCancellation(vaultRoot,runId),event_count:events.length,events,root};
}
