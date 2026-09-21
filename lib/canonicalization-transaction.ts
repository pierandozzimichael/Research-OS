import {readFile,unlink} from "node:fs/promises";
import path from "node:path";
import {atomicWriteFile,contentRevision} from "./local-project-store.ts";

export type PlannedCanonicalFile={
  relative_path:string;
  content_hash:string;
};

export type CanonicalizationJournal={
  schema_version:"canonicalization-transaction-v1";
  plan_hash:string;
  project_id:string;
  run_id:string;
  candidate_id:string;
  status:"applying"|"applied"|"recovered"|"recovery-blocked";
  attempts:number;
  started_at:string;
  updated_at:string;
  planned_files:PlannedCanonicalFile[];
  error?:string;
};

function transactionPath(root:string,planHash:string){
  if(!/^[a-f0-9]{64}$/.test(planHash))throw new Error("Invalid canonicalization plan hash.");
  return path.join(root,".research-os","transactions",`${planHash}.json`);
}

function safeWorkspaceFile(root:string,relativePath:string){
  const resolvedRoot=path.resolve(root);
  const absolute=path.resolve(resolvedRoot,...relativePath.replaceAll("\\","/").split("/"));
  if(!absolute.startsWith(`${resolvedRoot}${path.sep}`))throw new Error("Transaction file escaped the workspace.");
  return absolute;
}

async function readJournal(root:string,planHash:string):Promise<CanonicalizationJournal|null>{
  try{return JSON.parse(await readFile(transactionPath(root,planHash),"utf8")) as CanonicalizationJournal;}
  catch(error){
    if((error as NodeJS.ErrnoException).code==="ENOENT")return null;
    throw error;
  }
}

async function writeJournal(root:string,journal:CanonicalizationJournal){
  journal.updated_at=new Date().toISOString();
  await atomicWriteFile(transactionPath(root,journal.plan_hash),`${JSON.stringify(journal,null,2)}\n`);
}

export async function recoverCanonicalizationFiles(root:string,journal:CanonicalizationJournal){
  const blocked:string[]=[];
  for(const item of journal.planned_files){
    const absolute=safeWorkspaceFile(root,item.relative_path);
    try{
      const current=await readFile(absolute,"utf8");
      if(contentRevision(current)!==item.content_hash){
        blocked.push(item.relative_path);
        continue;
      }
      await unlink(absolute);
    }catch(error){
      if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
    }
  }
  return blocked;
}

export async function prepareCanonicalizationRetry(root:string,planHash:string){
  const journal=await readJournal(root,planHash);
  if(!journal||journal.status==="applied")return journal;
  const blocked=await recoverCanonicalizationFiles(root,journal);
  journal.status=blocked.length?"recovery-blocked":"recovered";
  journal.error=blocked.length
    ? `Preserved files changed after interruption: ${blocked.join(", ")}`
    : "Recovered interrupted canonicalization before rebuilding its plan.";
  await writeJournal(root,journal);
  if(blocked.length)throw new Error(journal.error);
  return journal;
}

export async function beginCanonicalizationTransaction(
  root:string,
  details:Omit<CanonicalizationJournal,"schema_version"|"status"|"attempts"|"started_at"|"updated_at">,
){
  const previous=await readJournal(root,details.plan_hash);
  if(previous?.status==="applied")return {journal:previous,idempotent:true};
  if(previous){
    const blocked=await recoverCanonicalizationFiles(root,previous);
    if(blocked.length){
      previous.status="recovery-blocked";
      previous.error=`Preserved files changed after interruption: ${blocked.join(", ")}`;
      await writeJournal(root,previous);
      throw new Error(previous.error);
    }
  }
  const now=new Date().toISOString();
  const journal:CanonicalizationJournal={
    schema_version:"canonicalization-transaction-v1",
    ...details,
    status:"applying",
    attempts:(previous?.attempts||0)+1,
    started_at:previous?.started_at||now,
    updated_at:now,
  };
  await writeJournal(root,journal);
  return {journal,idempotent:false};
}

export async function failCanonicalizationTransaction(root:string,journal:CanonicalizationJournal,error:unknown){
  const blocked=await recoverCanonicalizationFiles(root,journal);
  journal.status=blocked.length?"recovery-blocked":"recovered";
  journal.error=blocked.length
    ? `Preserved files changed after interruption: ${blocked.join(", ")}`
    : error instanceof Error?error.message:String(error);
  await writeJournal(root,journal);
  return blocked;
}

export async function completeCanonicalizationTransaction(root:string,journal:CanonicalizationJournal){
  journal.status="applied";
  delete journal.error;
  await writeJournal(root,journal);
}
