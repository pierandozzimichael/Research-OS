import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";
import {
  atomicWriteFile,
  contentRevision,
  RecordConflictError,
  safeFigureAssetPath,
  safeRecordPath,
  updateRecordWithRevision,
  writeRecordWithRevision,
} from "./lib/local-project-store";
import {
  isAllowedLocalOrigin,
  isLoopbackHost,
  secureTokenMatches,
} from "./lib/local-http-security";
import {
  createRecordMarkdown,
  isRecordType,
  parseConnections,
  parseMarkdownRecord,
  recordTypeConfig,
  recordTypes,
  replaceRecordBody,
  scalarField,
  updateRecordFields,
  validateRecord,
  type RecordType,
} from "./lib/research-schema";
import {validateRelationshipGraph,type RelationshipRecord} from "./lib/relationship-integrity";
import {
  literatureProposalFileName,
  renderLiteratureDecisionBrief,
  validateAgentReview,
  validateLiteratureProposal,
  type LiteratureAgentReview,
  type LiteratureProposal,
} from "./lib/literature-intake";
import {
  buildCanonicalizationPlan,
  normalizeDoi,
  normalizePmcid,
  normalizePmid,
} from "./lib/autonomous-canonicalization";
import {
  beginCanonicalizationTransaction,
  completeCanonicalizationTransaction,
  failCanonicalizationTransaction,
  prepareCanonicalizationRetry,
} from "./lib/canonicalization-transaction";
import {inspectAiReadiness} from "./lib/ai-readiness";
import {validateAssistantRequest} from "./lib/assistant-contract";
import {localAssistantProviderStatus,runCodexAssistant,runOllamaAssistant,startOllamaServer} from "./lib/local-assistant-adapter";
import {localVoiceStatus,transcribeLocalWav} from "./lib/local-voice";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

function updateCanvasPosition(raw: string, x: number, y: number) {
  const end = raw.indexOf("\n---", 3);
  if (!raw.startsWith("---") || end < 0) throw new Error("Invalid record frontmatter");
  let frontmatter = raw.slice(4, end);
  for (const [key,value] of [["canvas_x",x],["canvas_y",y]] as const) {
    const line = `${key}: ${value}`;
    const pattern = new RegExp(`^${key}:.*$`, "m");
    frontmatter = pattern.test(frontmatter)
      ? frontmatter.replace(pattern,line)
      : `${frontmatter.trimEnd()}\n${line}`;
  }
  return `---\n${frontmatter.trim()}\n---${raw.slice(end+4)}`;
}

function canonicalFileName(id:string,title:string) {
  return `${id} ${title.replace(/[<>:"/\\|?*]/g,"").replace(/\s+/g," ").trim().slice(0,70)||"record"}.md`;
}

function canonicalRecordRaw(
  type:RecordType,
  id:string,
  title:string,
  summary:string,
  fields:Record<string,unknown>,
  body:string,
) {
  let raw=createRecordMarkdown(type,id,title,summary);
  raw=updateRecordFields(raw,fields);
  raw=replaceRecordBody(raw,body);
  const errors=validateRecord(raw).filter(issue=>issue.severity==="error");
  if(errors.length)throw new Error(`Canonicalization produced invalid ${id}: ${errors.map(issue=>issue.message).join(" ")}`);
  return raw;
}

async function writeNewCanonicalRecord(
  vaultRoot:string,
  type:RecordType,
  id:string,
  title:string,
  raw:string,
) {
  const {folder,absolute,relativePath}=canonicalTarget(vaultRoot,type,id,title);
  await mkdir(folder,{recursive:true});
  try{
    await readFile(absolute,"utf8");
    throw new Error(`Canonicalization target already exists: ${id}`);
  }catch(error){
    if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
  }
  await atomicWriteFile(absolute,raw);
  return {absolute,raw,relativePath};
}

function canonicalTarget(vaultRoot:string,type:RecordType,id:string,title:string){
  const folder=path.join(vaultRoot,recordTypeConfig[type].folder);
  const absolute=path.join(folder,canonicalFileName(id,title));
  return {folder,absolute,relativePath:path.relative(vaultRoot,absolute).replaceAll("\\","/")};
}

type LocalProject = {id:string;name:string;description:string;vaultPath:string;createdAt:string;hidden?:boolean};
const projectFolders = [
  "00 Dashboard","01 Inbox",
  ...new Set(recordTypes.map(type=>recordTypeConfig[type].folder)),
  "14 AI Workspace","16 Media","99 Templates",
];
const scaffoldReadmes = ["01 Inbox","05 Entities","06 Topics","13 Decisions","14 AI Workspace","15 Evidence"];
const localWriteToken = randomBytes(32).toString("base64url");
let projectRegistryQueue:Promise<void>=Promise.resolve();
let literatureInboxQueue:Promise<void>=Promise.resolve();
let canonicalizationQueue:Promise<void>=Promise.resolve();

async function withProjectRegistryLock<T>(work:()=>Promise<T>):Promise<T> {
  const previous=projectRegistryQueue;
  let release!:()=>void;
  projectRegistryQueue=new Promise<void>(resolve=>{release=resolve;});
  await previous;
  try{return await work();}finally{release();}
}

async function withLiteratureInboxLock<T>(work:()=>Promise<T>):Promise<T> {
  const previous=literatureInboxQueue;
  let release!:()=>void;
  literatureInboxQueue=new Promise<void>(resolve=>{release=resolve;});
  await previous;
  try{return await work();}finally{release();}
}

async function withCanonicalizationLock<T>(work:()=>Promise<T>):Promise<T> {
  const previous=canonicalizationQueue;
  let release!:()=>void;
  canonicalizationQueue=new Promise<void>(resolve=>{release=resolve;});
  await previous;
  try{return await work();}finally{release();}
}

async function readProjects() {
  const registryPath=process.env.RESEARCH_OS_INTEGRATION_TEST==="1"&&process.env.RESEARCH_OS_PROJECTS_FILE
    ? path.resolve(process.env.RESEARCH_OS_PROJECTS_FILE)
    : path.resolve(process.cwd(),"projects.json");
  const registry=JSON.parse(await readFile(registryPath,"utf8")) as {version:number;projects:LocalProject[]};
  return {registryPath,registry};
}

async function resolveProjectVault(projectId:string) {
  const {registry}=await readProjects();
  const project=registry.projects.find(item=>item.id===projectId)??(projectId?undefined:registry.projects[0]);
  if(!project)throw new Error("Unknown project");
  const root=path.resolve(process.cwd());
  const vaultRoot=path.resolve(root,project.vaultPath);
  const testRoot=process.env.RESEARCH_OS_INTEGRATION_TEST==="1"&&process.env.RESEARCH_OS_TEST_ROOT
    ? path.resolve(process.env.RESEARCH_OS_TEST_ROOT)
    : "";
  const allowedTestVault=testRoot&&(vaultRoot===testRoot||vaultRoot.startsWith(`${testRoot}${path.sep}`));
  if(vaultRoot!==path.resolve(root,"vault")&&!vaultRoot.startsWith(`${path.resolve(root,"projects")}${path.sep}`)&&!allowedTestVault)throw new Error("Invalid project vault");
  return {project,vaultRoot};
}

async function collectVaultSourceMarkdown(vaultRoot:string) {
  const files:Array<{fileName:string;relativePath:string;raw:string}>=[];
  async function walk(folder:string) {
    const entries=await readdir(folder,{withFileTypes:true});
    for(const entry of entries){
      const absolute=path.join(folder,entry.name);
      const relativePath=path.relative(vaultRoot,absolute).replaceAll("\\","/");
      if(entry.isDirectory()&&(relativePath==="99 Templates"||relativePath==="14 AI Workspace/generated"||relativePath==="14 AI Workspace/runs"))continue;
      if(entry.isDirectory())await walk(absolute);
      else if(entry.name.toLowerCase().endsWith(".md")&&entry.name.toLowerCase()!=="readme.md"){
        const raw=await readFile(absolute,"utf8");
        files.push({fileName:entry.name,relativePath,raw});
      }
    }
  }
  await walk(vaultRoot);
  return files.sort((a,b)=>a.relativePath.localeCompare(b.relativePath));
}

async function collectVaultRecords(vaultRoot:string) {
  const files=await collectVaultSourceMarkdown(vaultRoot);
  return files.flatMap(file=>{
    const parsed=parseMarkdownRecord(file.raw);
    return !parsed.errors.length&&isRecordType(scalarField(parsed.fields,"type"))
      ? [{...file,revision:contentRevision(file.raw)}]
      : [];
  });
}

async function projectDiagnostics(vaultRoot:string) {
  // Literature inbox briefs are provisional staging artifacts, not canonical records.
  const files=(await collectVaultSourceMarkdown(vaultRoot)).filter(file=>!file.relativePath.startsWith("01 Inbox/Literature/"));
  const issues=files.flatMap(file=>validateRecord(file.raw,file.relativePath));
  const relationshipRecords:RelationshipRecord[]=files.flatMap(file=>{
    const parsed=parseMarkdownRecord(file.raw);
    const type=scalarField(parsed.fields,"type"),id=scalarField(parsed.fields,"id");
    return !parsed.errors.length&&id&&isRecordType(type)?[{id,type,raw:file.raw,relativePath:file.relativePath}]:[];
  });
  const ids=new Set(relationshipRecords.map(record=>record.id));
  const duplicateIdCount=relationshipRecords.length-ids.size;
  const missingTargetCount=relationshipRecords.reduce((count,record)=>{
    const body=parseMarkdownRecord(record.raw).body;
    return count+parseConnections(body).filter(connection=>!ids.has(connection.target)).length;
  },0);
  const relationshipIssues=validateRelationshipGraph(relationshipRecords);
  const duplicateIds=[...new Set(relationshipRecords
    .map(record=>record.id)
    .filter((id,index,all)=>all.indexOf(id)!==index))];
  const missingTargets=relationshipRecords.flatMap(record=>{
    const body=parseMarkdownRecord(record.raw).body;
    return parseConnections(body)
      .filter(connection=>!ids.has(connection.target))
      .map(connection=>({
        severity:"error" as const,
        code:"missing-target",
        message:`${record.id} points to missing record ${connection.target} (${connection.type}).`,
        id:record.id,
        path:record.relativePath,
      }));
  });
  const diagnosticIssues=[
    ...issues.map(issue=>({...issue,area:"schema" as const})),
    ...relationshipIssues.map(issue=>({...issue,area:"graph" as const})),
    ...duplicateIds.map(id=>({
      area:"graph" as const,severity:"error" as const,code:"duplicate-id",
      message:`Stable ID ${id} is used by more than one canonical record.`,id,
    })),
    ...missingTargets.map(issue=>({...issue,area:"graph" as const})),
  ].slice(0,100);
  return {
    sourceFileCount:files.length,
    indexedRecordCount:relationshipRecords.length,
    skippedFileCount:files.length-relationshipRecords.length,
    schemaErrorCount:issues.filter(issue=>issue.severity==="error").length,
    schemaWarningCount:issues.filter(issue=>issue.severity==="warning").length,
    relationshipErrorCount:relationshipIssues.filter(issue=>issue.severity==="error").length,
    relationshipWarningCount:relationshipIssues.filter(issue=>issue.severity==="warning").length,
    duplicateIdCount,
    missingTargetCount,
    issues:diagnosticIssues,
  };
}

function vaultSourceHash(records:Array<{relativePath:string;raw:string}>) {
  const hash=createHash("sha256");
  for(const record of records){
    hash.update(record.relativePath);
    hash.update("\0");
    hash.update(record.raw);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function aiContextStatus(vaultRoot:string,records:Array<{relativePath:string;raw:string}>) {
  try{
    const manifest=JSON.parse(await readFile(path.join(vaultRoot,"14 AI Workspace","generated","MANIFEST.json"),"utf8")) as {
      generatedAt?:string;sourceHash?:string;recordCount?:number;sourceCount?:number;edgeCount?:number;
    };
    const sourceFiles=await collectVaultSourceMarkdown(vaultRoot);
    return {
      generatedAt:String(manifest.generatedAt||""),
      sourceCount:Number(manifest.recordCount??manifest.sourceCount??0),
      edgeCount:Number(manifest.edgeCount||0),
      current:manifest.sourceHash===vaultSourceHash(sourceFiles)&&
        Number(manifest.recordCount??manifest.sourceCount??0)===records.length,
    };
  }catch{
    return {generatedAt:"",sourceCount:0,edgeCount:0,current:false};
  }
}

function rebuildAiContext() {
  return new Promise<void>((resolve,reject)=>{
    execFile(process.execPath,[path.resolve(process.cwd(),"scripts","build-ai-index.mjs")],{
      cwd:process.cwd(),
      timeout:10_000,
      windowsHide:true,
    },error=>error?reject(error):resolve());
  });
}

function readJsonBody(request:IncomingMessage,maxBytes=2_000_000) {
  return new Promise<unknown>((resolve,reject)=>{
    let body="";
    request.on("data",(chunk:Buffer)=>{
      body+=chunk.toString("utf8");
      if(body.length>maxBytes){reject(new Error("Request too large"));request.destroy();}
    });
    request.on("end",()=>{try{resolve(JSON.parse(body||"{}"));}catch{reject(new Error("Invalid JSON"));}});
    request.on("error",reject);
  });
}

function readBinaryBody(request:IncomingMessage,maxBytes=12_000_000){
  return new Promise<Buffer>((resolve,reject)=>{
    const chunks:Buffer[]=[];let size=0;
    request.on("data",(chunk:Buffer)=>{const bytes=Buffer.from(chunk);size+=bytes.length;if(size>maxBytes){reject(new Error("Request too large"));request.destroy();return;}chunks.push(bytes);});
    request.on("end",()=>resolve(Buffer.concat(chunks)));
    request.on("error",reject);
  });
}

function sendJson(response:ServerResponse,status:number,payload:unknown) {
  if(response.destroyed||response.writableEnded)return;
  response.statusCode=status;
  response.setHeader("content-type","application/json");
  response.setHeader("cache-control","no-store");
  response.end(JSON.stringify(payload));
}

function requireLocalWrite(request:IncomingMessage) {
  const host=String(request.headers.host||"");
  const origin=String(request.headers.origin||"");
  if(!isAllowedLocalOrigin(host,origin||undefined))throw new Error("Cross-origin write rejected");
  if(!secureTokenMatches(localWriteToken,request.headers["x-research-os-token"] as string|undefined)){
    throw new Error("Local write token is missing or invalid");
  }
}

function localProjectPersistence(): Plugin {
  return {
    name: "local-project-persistence",
    enforce: "pre" as const,
    configureServer(server) {
      server.middlewares.use("/api/local-session",(request,response,next)=>{
        if(request.method!=="GET"){next();return;}
        if(!isLoopbackHost(request.headers.host)){
          sendJson(response,403,{error:"Local session unavailable"});return;
        }
        sendJson(response,200,{writeToken:localWriteToken});
      });

      server.middlewares.use("/api/ai-readiness",async(request,response,next)=>{
        if(request.method!=="GET"){next();return;}
        try{sendJson(response,200,await inspectAiReadiness(process.cwd()));}
        catch(error){sendJson(response,500,{error:error instanceof Error?error.message:"AI readiness check failed"});}
      });

      server.middlewares.use("/api/assistant/providers",async(request,response,next)=>{
        if(request.method!=="GET"){next();return;}
        if(!isLoopbackHost(request.headers.host)){sendJson(response,403,{error:"Local assistant unavailable"});return;}
        try{sendJson(response,200,{providers:await localAssistantProviderStatus(process.cwd())});}
        catch(error){sendJson(response,500,{error:error instanceof Error?error.message:"Provider check failed"});}
      });

      server.middlewares.use("/api/assistant/ollama/start",async(request,response,next)=>{
        if(request.method!=="POST"){next();return;}
        try{requireLocalWrite(request);sendJson(response,200,await startOllamaServer());}
        catch(error){sendJson(response,400,{error:error instanceof Error?error.message:"Local models could not be started"});}
      });

      server.middlewares.use("/api/assistant/voice/status",async(request,response,next)=>{
        if(request.method!=="GET"){next();return;}
        if(!isLoopbackHost(request.headers.host)){sendJson(response,403,{error:"Local voice unavailable"});return;}
        sendJson(response,200,await localVoiceStatus());
      });

      server.middlewares.use("/api/assistant/voice/transcribe",async(request,response,next)=>{
        if(request.method!=="POST"){next();return;}
        const aborter=new AbortController();response.on("close",()=>{if(!response.writableEnded)aborter.abort();});
        try{
          requireLocalWrite(request);
          if(!String(request.headers["content-type"]||"").toLowerCase().startsWith("audio/wav"))throw new Error("Voice input must use audio/wav");
          sendJson(response,200,await transcribeLocalWav(await readBinaryBody(request),aborter.signal));
        }catch(error){sendJson(response,400,{error:error instanceof Error?error.message:"Local transcription failed"});}
      });

      server.middlewares.use("/api/assistant/ask",async(request,response,next)=>{
        if(request.method!=="POST"){next();return;}
        const aborter=new AbortController();
        response.on("close",()=>{if(!response.writableEnded)aborter.abort();});
        try{
          requireLocalWrite(request);
          const payload=validateAssistantRequest(await readJsonBody(request,32_768));
          const {project,vaultRoot}=await resolveProjectVault(payload.projectId);
          const records=await collectVaultRecords(vaultRoot);
          const recordIds=records.map(record=>scalarField(parseMarkdownRecord(record.raw).fields,"id")).filter(Boolean);
          if(payload.focusRecordId&&!recordIds.includes(payload.focusRecordId))throw new Error("Focus record does not exist in this project");
          if(payload.provider==="claude")throw new Error("Claude Code is not connected on this computer");
          const result=payload.provider==="ollama"
            ? await runOllamaAssistant(process.cwd(),payload,recordIds,aborter.signal)
            : await runCodexAssistant(process.cwd(),payload,recordIds,aborter.signal);
          sendJson(response,200,{project:{id:project.id,name:project.name},result});
        }catch(error){
          const message=error instanceof Error?error.message:"Assistant request failed";
          const timedOut=/timed out|timeout|ETIMEDOUT/i.test(message);
          sendJson(response,timedOut?408:400,{error:timedOut?"The assistant reached its two-minute safety limit.":message});
        }
      });

      server.middlewares.use("/api/projects",async(request,response,next)=>{
        if(request.method!=="GET"&&request.method!=="POST"&&request.method!=="PATCH"){next();return;}
        try{
          if(request.method==="GET"){
            const {registry}=await readProjects();
            const projects=await Promise.all(registry.projects.map(async project=>{
              const {vaultRoot}=await resolveProjectVault(project.id);
              const records=await collectVaultRecords(vaultRoot);
              return {...project,recordCount:records.length};
            }));
            sendJson(response,200,{projects:projects.filter(project=>!project.hidden),hiddenProjects:projects.filter(project=>project.hidden)});return;
          }
          if(request.method==="PATCH"){
            requireLocalWrite(request);
            const payload=await readJsonBody(request,8_192) as {id?:string;action?:string};
            const projectId=String(payload.id||"").trim();
            const action=String(payload.action||"").trim();
            if(!projectId||!["hide","restore"].includes(action))throw new Error("Project action must be hide or restore");
            const project=await withProjectRegistryLock(async()=>{
              const {registryPath,registry}=await readProjects();
              const found=registry.projects.find(item=>item.id===projectId);
              if(!found)throw new Error("Unknown project");
              if(action==="hide"){
                if(found.hidden)return found;
                if(registry.projects.filter(item=>!item.hidden).length<=1)throw new Error("Keep at least one project visible before removing this one from the website");
                found.hidden=true;
              }else{
                delete found.hidden;
              }
              await atomicWriteFile(registryPath,`${JSON.stringify(registry,null,2)}\n`);
              return found;
            });
            const {vaultRoot}=await resolveProjectVault(project.id);
            const records=await collectVaultRecords(vaultRoot);
            sendJson(response,200,{project:{...project,recordCount:records.length}});return;
          }
          requireLocalWrite(request);
          const payload=await readJsonBody(request,32_768) as {name?:string;description?:string};
          const name=String(payload.name||"").trim();
          const description=String(payload.description||"").trim();
          if(name.length<2||name.length>80)throw new Error("Project name must be 2 to 80 characters");
          await withProjectRegistryLock(async()=>{
            const {registryPath,registry}=await readProjects();
            const base=name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"research-project";
            let id=base,index=2;
            while(registry.projects.some(project=>project.id===id))id=`${base}-${index++}`;
            const vaultPath=`projects/${id}/vault`;
            const vaultRoot=path.resolve(process.cwd(),vaultPath);
            for(const folder of projectFolders)await mkdir(path.join(vaultRoot,folder),{recursive:true});
            const templateSource=path.resolve(process.cwd(),"vault","99 Templates");
            for(const template of await readdir(templateSource,{withFileTypes:true})){
              if(template.isFile()&&template.name.toLowerCase().endsWith(".md")){
                await writeFile(path.join(vaultRoot,"99 Templates",template.name),await readFile(path.join(templateSource,template.name),"utf8"),"utf8");
              }
            }
            for(const folder of scaffoldReadmes){
              const source=path.resolve(process.cwd(),"vault",folder,"README.md");
              await atomicWriteFile(path.join(vaultRoot,folder,"README.md"),await readFile(source,"utf8"));
            }
            const claimRulesSource=path.resolve(process.cwd(),"vault","00 Dashboard","CLAIM_STATUS_RULES.md");
            await writeFile(path.join(vaultRoot,"00 Dashboard","CLAIM_STATUS_RULES.md"),await readFile(claimRulesSource,"utf8"),"utf8");
            const createdAt=new Date().toISOString();
            const project:LocalProject={id,name,description,vaultPath,createdAt};
            const projectDoc=createRecordMarkdown(
              "project","PRJ-001",name,
              description||"Define this project's scientific purpose, scope, and decisions.",
            );
            await atomicWriteFile(path.join(vaultRoot,"00 Dashboard","PROJECT.md"),projectDoc);
            await atomicWriteFile(path.resolve(process.cwd(),"projects",id,"README.md"),`# ${name}\n\nCanonical research records live under \`vault/\`.\n\n${description}\n`);
            registry.projects.push(project);
            await atomicWriteFile(registryPath,`${JSON.stringify(registry,null,2)}\n`);
            sendJson(response,201,{project:{...project,recordCount:0},records:[]});
          });
        }catch(error){sendJson(response,400,{error:error instanceof Error?error.message:"Project operation failed"});}
      });

      server.middlewares.use("/api/project-snapshot",async(request,response,next)=>{
        if(request.method!=="GET"){next();return;}
        try{
          const url=new URL(request.url||"/","http://local");
          const projectId=String(url.searchParams.get("id")||"");
          const {project,vaultRoot}=await resolveProjectVault(projectId);
          const records=await collectVaultRecords(vaultRoot);
          const aiContext=await aiContextStatus(vaultRoot,records);
          const diagnostics=await projectDiagnostics(vaultRoot);
          sendJson(response,200,{project,generatedAt:new Date().toISOString(),records,aiContext,diagnostics});
        }catch(error){sendJson(response,404,{error:error instanceof Error?error.message:"Project not found"});}
      });

      server.middlewares.use("/api/literature-inbox",async(request,response,next)=>{
        if(request.method!=="GET"&&request.method!=="POST"){next();return;}
        try{
          const url=new URL(request.url||"/","http://local");
          if(request.method==="GET"){
            const {vaultRoot}=await resolveProjectVault(String(url.searchParams.get("projectId")||""));
            const inboxRoot=path.join(vaultRoot,"01 Inbox","Literature");
            await mkdir(inboxRoot,{recursive:true});
            const proposals=[];
            for(const entry of await readdir(inboxRoot,{withFileTypes:true})){
              if(!entry.isFile()||!/^RUN-.*\.json$/i.test(entry.name))continue;
              try{
                const proposal=JSON.parse(await readFile(path.join(inboxRoot,entry.name),"utf8")) as LiteratureProposal;
                const errors=validateLiteratureProposal(proposal,"stored");
                proposals.push({
                  fileName:entry.name,
                  valid:errors.length===0,
                  errors,
                  proposal,
                });
              }catch(error){
                proposals.push({
                  fileName:entry.name,
                  valid:false,
                  errors:[error instanceof Error?error.message:"Invalid proposal JSON"],
                });
              }
            }
            proposals.sort((a,b)=>b.fileName.localeCompare(a.fileName));
            sendJson(response,200,{proposals});return;
          }

          requireLocalWrite(request);
          const payload=await readJsonBody(request,5_000_000) as {projectId?:string;proposal?:unknown};
          const {vaultRoot}=await resolveProjectVault(String(payload.projectId||""));
          const errors=validateLiteratureProposal(payload.proposal);
          if(errors.length){sendJson(response,400,{error:"Invalid literature proposal",errors});return;}
          const proposal=payload.proposal as LiteratureProposal;
          const inboxRoot=path.join(vaultRoot,"01 Inbox","Literature");
          await mkdir(inboxRoot,{recursive:true});
          const target=path.join(inboxRoot,literatureProposalFileName(proposal.run_id));
          const raw=`${JSON.stringify(proposal,null,2)}\n`;
          try{
            const existing=await readFile(target,"utf8");
            if(existing===raw){sendJson(response,200,{fileName:path.basename(target),idempotent:true});return;}
            sendJson(response,409,{error:"A different proposal already uses this run ID."});return;
          }catch(error){
            const code=(error as NodeJS.ErrnoException).code;
            if(code&&code!=="ENOENT")throw error;
          }
          await atomicWriteFile(target,raw);
          sendJson(response,201,{fileName:path.basename(target),idempotent:false});
        }catch(error){sendJson(response,400,{error:error instanceof Error?error.message:"Literature inbox operation failed"});}
      });

      server.middlewares.use("/api/literature-review",async(request,response,next)=>{
        if(request.method!=="POST"){next();return;}
        try{
          requireLocalWrite(request);
          const payload=await readJsonBody(request,256_000) as {
            projectId?:string;runId?:string;candidateId?:string;review?:unknown;
          };
          const runId=String(payload.runId||"");
          const candidateId=String(payload.candidateId||"");
          const reviewErrors=validateAgentReview(payload.review);
          if(reviewErrors.length){sendJson(response,400,{error:"Invalid frontier-agent review",errors:reviewErrors});return;}
          const {vaultRoot}=await resolveProjectVault(String(payload.projectId||""));
          const result=await withLiteratureInboxLock(async()=>{
            const inboxRoot=path.join(vaultRoot,"01 Inbox","Literature");
            const proposalPath=path.join(inboxRoot,literatureProposalFileName(runId));
            const proposal=JSON.parse(await readFile(proposalPath,"utf8")) as LiteratureProposal;
            const existingErrors=validateLiteratureProposal(proposal,"stored");
            if(existingErrors.length)throw new Error(`Stored proposal is invalid: ${existingErrors.join(" ")}`);
            const candidate=proposal.candidates.find(item=>item.candidate_id===candidateId);
            if(!candidate)throw new Error("Unknown literature candidate");
            const review=payload.review as LiteratureAgentReview;
            candidate.decision=review.recommendation;
            candidate.agent_review=review;
            candidate.human_reviewed=false;
            const updatedErrors=validateLiteratureProposal(proposal,"stored");
            if(updatedErrors.length)throw new Error(`Updated proposal is invalid: ${updatedErrors.join(" ")}`);
            await atomicWriteFile(proposalPath,`${JSON.stringify(proposal,null,2)}\n`);
            const briefName=`BRIEF-${runId}.md`;
            await atomicWriteFile(path.join(inboxRoot,briefName),renderLiteratureDecisionBrief(proposal));
            return {proposal,briefName};
          });
          await rebuildAiContext();
          sendJson(response,200,{
            saved:true,
            recommendation:(payload.review as LiteratureAgentReview).recommendation,
            briefFileName:result.briefName,
            proposal:result.proposal,
          });
        }catch(error){sendJson(response,400,{saved:false,error:error instanceof Error?error.message:"Literature review failed"});}
      });

      server.middlewares.use("/api/literature-canonicalize",async(request,response,next)=>{
        if(request.method!=="POST"){next();return;}
        try{
          requireLocalWrite(request);
          const payload=await readJsonBody(request,256_000) as {
            projectId?:string;runId?:string;candidateId?:string;mode?:"preview"|"apply";planHash?:string;
          };
          const mode=payload.mode||"preview";
          if(mode!=="preview"&&mode!=="apply")throw new Error("mode must be preview or apply");
          const runId=String(payload.runId||"");
          const candidateId=String(payload.candidateId||"");
          const {vaultRoot}=await resolveProjectVault(String(payload.projectId||""));
          const execute=async()=>{
            const inboxRoot=path.join(vaultRoot,"01 Inbox","Literature");
            const proposalPath=path.join(inboxRoot,literatureProposalFileName(runId));
            const proposal=JSON.parse(await readFile(proposalPath,"utf8")) as LiteratureProposal & {canonicalization?:unknown};
            const proposalErrors=validateLiteratureProposal(proposal,"stored");
            if(proposalErrors.length)throw new Error(`Stored proposal is invalid: ${proposalErrors.join(" ")}`);
            const candidate=proposal.candidates.find(item=>item.candidate_id===candidateId) as (typeof proposal.candidates[number] & {canonicalization?:{status?:string;plan_hash?:string;record_ids?:string[];applied_at?:string;applied_by_model?:string;plan?:unknown}})|undefined;
            if(!candidate)throw new Error("Unknown literature candidate");
            if(candidate.canonicalization?.status==="applied"){
              if(mode==="apply"&&payload.planHash!==candidate.canonicalization.plan_hash){
                throw new Error("This candidate was already applied under a different plan hash.");
              }
              return {
                plan:candidate.canonicalization.plan||{plan_hash:candidate.canonicalization.plan_hash,status:"applied"},
                proposal,
                created:candidate.canonicalization.record_ids||[],
                idempotent:true,
              };
            }
            if(mode==="apply"&&payload.planHash){
              await prepareCanonicalizationRetry(process.cwd(),payload.planHash);
            }
            const records=await collectVaultRecords(vaultRoot);
            const views=records.map(record=>({
              id:scalarField(parseMarkdownRecord(record.raw).fields,"id"),
              type:scalarField(parseMarkdownRecord(record.raw).fields,"type") as RecordType,
              title:scalarField(parseMarkdownRecord(record.raw).fields,"title"),
              raw:record.raw,
            }));
            const plan=buildCanonicalizationPlan(candidate,views);
            if(mode==="preview")return {plan,proposal,created:[] as string[]};
            if(payload.planHash!==plan.plan_hash)throw new Error("Plan changed or was not acknowledged. Request a fresh preview before applying.");

            const planned:Array<{type:RecordType;id:string;title:string;raw:string;absolute:string;relativePath:string}>=[];
            const addPlanned=(type:RecordType,id:string,title:string,raw:string)=>{
              const target=canonicalTarget(vaultRoot,type,id,title);
              planned.push({type,id,title,raw,absolute:target.absolute,relativePath:target.relativePath});
            };
            const verifiedEvidence=candidate.agent_review?.schema_version==="frontier-review-v2"
              ? candidate.agent_review.verified_evidence||[]
              : [];
            try{
              const paperBody=[
                `# ${candidate.title}`,
                "",
                "## Agent verification",
                "",
                candidate.agent_review?.rationale||"",
                "",
                "## Source metadata",
                "",
                `- DOI: ${normalizeDoi(candidate.doi||"")||"not supplied"}`,
                `- PMID: ${normalizePmid(candidate.pmid||"")||"not supplied"}`,
                `- PMCID: ${normalizePmcid(candidate.pmcid||"")||"not supplied"}`,
                `- Primary URL: ${candidate.url||"not supplied"}`,
                "",
                "## Connections",
                "",
                ...plan.claim_ids.map(id=>`- informs [[${id}]]`),
                "",
              ].join("\n");
              if(plan.mode==="create"){
                const paperRaw=canonicalRecordRaw("paper",plan.paper_id,candidate.title,candidate.abstract||candidate.agent_review?.rationale||"",{
                  status:"agent-verified",
                  doi:normalizeDoi(candidate.doi||""),pmid:normalizePmid(candidate.pmid||""),pmcid:normalizePmcid(candidate.pmcid||""),year:candidate.year||"",journal:candidate.journal||"",source_url:candidate.url||"",
                  review_depth:candidate.agent_review?.verification_depth||"metadata",
                  human_reviewed:false,
                  agent_reviewed:true,
                  agent_reviewed_by_model:candidate.agent_review?.reviewed_by_model||"",
                  agent_reviewed_at:candidate.agent_review?.reviewed_at||"",
                  extraction_authorship:"ai-assisted",
                  evidence_anchors:plan.evidence_ids,
                  canonicalization_plan_hash:plan.plan_hash,
                },paperBody);
                addPlanned("paper",plan.paper_id,candidate.title,paperRaw);
              }
              for(const [index,evidenceId] of plan.evidence_ids.entries()){
                const anchor=verifiedEvidence[index];
                if(!anchor)throw new Error(`Verified evidence ${index+1} is missing from the acknowledged review.`);
                const evidenceTitle=`${candidate.title}: verified anchor ${index+1}`;
                const evidenceRaw=canonicalRecordRaw("evidence",evidenceId,evidenceTitle,anchor.exact_text,{
                  status:candidate.agent_review?.verification_depth==="full-text"?"source-verified":"abstract-checked",
                  confidence:"low",
                  agent_extracted:true,
                  agent_reviewed_by_model:candidate.agent_review?.reviewed_by_model||"",
                  source_paper:plan.paper_id,
                  source_url:anchor.source_url,
                  source_locator:anchor.locator,
                  epistemic_label:anchor.epistemic_label,
                  verified_at:anchor.verified_at,
                  canonicalization_plan_hash:plan.plan_hash,
                },[
                  `# ${evidenceTitle}`,"","## Evidence statement","",anchor.exact_text,
                  "","## Source anchor","",`- Source record: [[${plan.paper_id}]]`,
                  `- Primary URL: ${anchor.source_url}`,`- Figure, table, page, or section: ${anchor.locator}`,
                  "","## Epistemic label","",anchor.epistemic_label,
                  "","## Extraction provenance","",`- Verified by: ${candidate.agent_review?.reviewed_by_model||"frontier agent"}`,
                  `- Verified at: ${anchor.verified_at}`,`- Canonicalization plan: ${plan.plan_hash}`,
                  "","## Human review","","Not human reviewed.","","## Connections","",
                  `- derived-from [[${plan.paper_id}]]`,
                  ...(plan.evidence_claim_ids[evidenceId]||[]).map(id=>`- supports [[${id}]]`),"",
                ].join("\n"));
                addPlanned("evidence",evidenceId,evidenceTitle,evidenceRaw);
              }
              for(const [index,claimId] of plan.claim_ids.entries()){
                if(records.some(record=>scalarField(parseMarkdownRecord(record.raw).fields,"id")===claimId))continue;
                const statement=candidate.agent_review?.candidate_claims[index]||`Candidate claim from ${plan.paper_id}`;
                const claimEvidence=plan.evidence_ids.filter(id=>(plan.evidence_claim_ids[id]||[]).includes(claimId));
                const claimRaw=canonicalRecordRaw("claim",claimId,statement,`Agent-proposed provisional claim informed by ${plan.paper_id}.`,{
                  status:"provisional",confidence:"low",human_reviewed:false,agent_generated:true,agent_reviewed_by_model:candidate.agent_review?.reviewed_by_model||"",evidence_anchors:claimEvidence,canonicalization_plan_hash:plan.plan_hash,
                },[
                  `# ${statement}`,"","## Claim","",statement,"","## Agent assessment","",candidate.agent_review?.rationale||"","","## Scope and limits","","This is an agent-generated provisional claim. It is not human reviewed and must not be represented as established.","","## Connections","","_No explicit outgoing connections._","",
                ].join("\n"));
                addPlanned("claim",claimId,statement,claimRaw);
              }
              const decisionTitle=`Agent canonicalization for ${plan.paper_id}`;
              const decisionRaw=canonicalRecordRaw("decision",plan.decision_id,decisionTitle,`Autonomous canonicalization ledger for ${candidate.title}.`,{
                status:"accepted",privacy:"private",agent_action:true,agent_model:candidate.agent_review?.reviewed_by_model||"",risk:plan.risk,canonicalization_plan_hash:plan.plan_hash,candidate_revision:plan.candidate_revision,
              },[
                `# ${decisionTitle}`,"","## Decision","",`Applied autonomous ${plan.risk=== "notify"?"notify-only":"low-risk"} canonicalization from Jarvis run ${runId}.`,"","## Why","",candidate.agent_review?.rationale||"","","## Guardrails","","- No human review was asserted.","- No supported claim was created.","- Model text was not rewritten; material impact is surfaced through this ledger.","","## Records created or linked","",...plan.actions.map(action=>`- ${action.operation}: [[${action.id} ${action.title}]] — ${action.reason}`),"","## Connections","",`- documents [[${plan.paper_id}]]`,...plan.evidence_ids.map(id=>`- documents [[${id}]]`),...plan.claim_ids.map(id=>`- documents [[${id}]]`),"",
              ].join("\n"));
              addPlanned("decision",plan.decision_id,decisionTitle,decisionRaw);
            }catch(error){
              throw error;
            }
            const transaction=await beginCanonicalizationTransaction(process.cwd(),{
              plan_hash:plan.plan_hash,
              project_id:String(payload.projectId||""),
              run_id:runId,
              candidate_id:candidateId,
              planned_files:planned.map(item=>({
                relative_path:path.relative(process.cwd(),item.absolute).replaceAll("\\","/"),
                content_hash:contentRevision(item.raw),
              })),
            });
            if(transaction.idempotent){
              return {plan,proposal,created:planned.map(item=>item.relativePath),idempotent:true};
            }
            let proposalCommitted=false;
            try{
              let transactionWriteCount=0;
              const integrationFaultAfter=process.env.RESEARCH_OS_INTEGRATION_TEST==="1"
                ? Number(process.env.RESEARCH_OS_CANONICALIZATION_EXIT_AFTER_WRITES||"0")
                : 0;
              for(const item of planned){
                await writeNewCanonicalRecord(vaultRoot,item.type,item.id,item.title,item.raw);
                transactionWriteCount+=1;
                if(integrationFaultAfter>0&&transactionWriteCount===integrationFaultAfter){
                  process.exit(86);
                }
              }
              candidate.canonicalization={
                status:"applied",plan_hash:plan.plan_hash,
                record_ids:[plan.paper_id,...plan.evidence_ids,...plan.claim_ids,plan.decision_id],
                applied_at:new Date().toISOString(),
                applied_by_model:candidate.agent_review?.reviewed_by_model||"",
                plan,
              };
              await atomicWriteFile(path.join(inboxRoot,`BRIEF-${runId}.md`),renderLiteratureDecisionBrief(proposal));
              await atomicWriteFile(proposalPath,`${JSON.stringify(proposal,null,2)}\n`);
              proposalCommitted=true;
              await completeCanonicalizationTransaction(process.cwd(),transaction.journal);
            }catch(error){
              if(!proposalCommitted)await failCanonicalizationTransaction(process.cwd(),transaction.journal,error);
              throw error;
            }
            return {plan,proposal,created:planned.map(item=>item.relativePath),idempotent:false};
          };
          const result=await withCanonicalizationLock(execute);
          if(mode==="apply")await rebuildAiContext();
          sendJson(response,200,{mode,plan:result.plan,created:result.created,idempotent:"idempotent" in result?result.idempotent:false});
        }catch(error){sendJson(response,400,{error:error instanceof Error?error.message:"Canonicalization failed"});}
      });

      server.middlewares.use("/api/ai-context",async(request,response,next)=>{
        if(request.method!=="POST"){next();return;}
        try{
          requireLocalWrite(request);
          const payload=await readJsonBody(request,32_768) as {projectId?:string};
          const {vaultRoot}=await resolveProjectVault(String(payload.projectId||""));
          await rebuildAiContext();
          const records=await collectVaultRecords(vaultRoot);
          sendJson(response,200,{aiContext:await aiContextStatus(vaultRoot,records)});
        }catch(error){sendJson(response,400,{error:error instanceof Error?error.message:"AI context refresh failed"});}
      });

      server.middlewares.use("/api/project-record",async(request,response,next)=>{
        if(request.method!=="POST"){next();return;}
        try{
          requireLocalWrite(request);
          const payload=await readJsonBody(request) as {projectId?:string;relativePath?:string;raw?:string;baseRevision?:string|null};
          const {vaultRoot}=await resolveProjectVault(String(payload.projectId||""));
          const {normalized,absolute}=safeRecordPath(vaultRoot,String(payload.relativePath||""));
          const raw=String(payload.raw||"");
          if(!raw.startsWith("---")||raw.length>1_900_000)throw new Error("Invalid Markdown record");
          const validationErrors=validateRecord(raw,normalized).filter(issue=>issue.severity==="error");
          if(validationErrors.length)throw new Error(`Schema validation failed: ${validationErrors.map(issue=>issue.message).join(" ")}`);
          if(payload.baseRevision!==null&&typeof payload.baseRevision!=="string")throw new Error("A base revision is required");
          const saved=await writeRecordWithRevision(absolute,raw,payload.baseRevision);
          sendJson(response,200,{saved:true,relativePath:normalized,revision:saved.revision});
        }catch(error){
          const conflict=error instanceof RecordConflictError;
          sendJson(response,conflict?409:400,{
            saved:false,
            conflict,
            currentRevision:conflict?error.currentRevision:undefined,
            error:error instanceof Error?error.message:"Record save failed",
          });
        }
      });

      server.middlewares.use("/api/figure-asset",async(request,response,next)=>{
        try{
          const url=new URL(request.url||"/","http://local");
          const projectId=String(url.searchParams.get("projectId")||"");
          const figurePath=String(url.searchParams.get("path")||"");
          const {vaultRoot}=await resolveProjectVault(projectId);
          if(request.method==="GET"){
            if(!isLoopbackHost(request.headers.host)){sendJson(response,403,{error:"Local figure access only"});return;}
            const {absolute}=safeFigureAssetPath(vaultRoot,figurePath);
            const asset=await readFile(absolute);
            const extension=path.extname(absolute).toLowerCase();
            const contentType:{[key:string]:string}={".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".gif":"image/gif"};
            response.statusCode=200;
            response.setHeader("content-type",contentType[extension]||"application/octet-stream");
            response.setHeader("cache-control","private, max-age=300");
            response.setHeader("x-content-type-options","nosniff");
            response.end(asset);
            return;
          }
          if(request.method!=="POST"){next();return;}
          requireLocalWrite(request);
          const payload=await readJsonBody(request,16_000_000) as {fileName?:string;mimeType?:string;base64?:string};
          const mime=String(payload.mimeType||"").toLowerCase();
          const extensionByMime:{[key:string]:string}={"image/png":".png","image/jpeg":".jpg","image/webp":".webp","image/gif":".gif"};
          const extension=extensionByMime[mime];
          if(!extension)throw new Error("Only PNG, JPEG, WebP, and GIF figure assets are supported");
          const base64=String(payload.base64||"");
          if(!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new Error("Invalid figure payload");
          const content=Buffer.from(base64,"base64");
          if(!content.length||content.length>10_000_000)throw new Error("Figure assets must be between 1 byte and 10 MB");
          const signatures:{[key:string]:(value:Buffer)=>boolean}={
            "image/png":value=>value.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),
            "image/jpeg":value=>value.length>=3&&value[0]===0xff&&value[1]===0xd8&&value[2]===0xff,
            "image/gif":value=>value.subarray(0,6).toString("ascii")==="GIF87a"||value.subarray(0,6).toString("ascii")==="GIF89a",
            "image/webp":value=>value.subarray(0,4).toString("ascii")==="RIFF"&&value.subarray(8,12).toString("ascii")==="WEBP",
          };
          if(!signatures[mime](content))throw new Error("Figure bytes do not match the declared image type");
          const label=String(payload.fileName||"figure").replace(/[^a-z0-9_-]+/gi,"-").replace(/^-+|-+$/g,"").slice(0,72)||"figure";
          const fileName=`${new Date().toISOString().replace(/[:.]/g,"-")}-${randomBytes(4).toString("hex")}-${label}${extension}`;
          const {normalized,absolute}=safeFigureAssetPath(vaultRoot,`16 Media/${fileName}`);
          await mkdir(path.dirname(absolute),{recursive:true});
          await writeFile(absolute,content,{flag:"wx",mode:0o600});
          sendJson(response,201,{saved:true,path:normalized,size:(await stat(absolute)).size,sha256:createHash("sha256").update(content).digest("hex"),mimeType:mime});
        }catch(error){sendJson(response,400,{saved:false,error:error instanceof Error?error.message:"Figure asset operation failed"});}
      });

      server.middlewares.use("/api/vault-position",(request,response,next)=>{
        if(request.method!=="POST"){next();return;}
        void (async()=>{
          try{
            requireLocalWrite(request);
            const payload=await readJsonBody(request,32_768) as {projectId?:string;relativePath?:string;x?:number;y?:number;baseRevision?:string};
            const relativePath=String(payload.relativePath||"").replaceAll("\\","/");
            const x=Math.round(Number(payload.x)),y=Math.round(Number(payload.y));
            if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error("Invalid position request");
            if(typeof payload.baseRevision!=="string")throw new Error("A base revision is required");
            const {vaultRoot}=await resolveProjectVault(String(payload.projectId||""));
            const {absolute}=safeRecordPath(vaultRoot,relativePath);
            const saved=await updateRecordWithRevision(
              absolute,
              payload.baseRevision,
              raw=>updateCanvasPosition(raw,x,y),
            );
            sendJson(response,200,{saved:true,x,y,raw:saved.raw,revision:saved.revision});
          }catch(error){
            const conflict=error instanceof RecordConflictError;
            sendJson(response,conflict?409:400,{
              saved:false,
              conflict,
              currentRevision:conflict?error.currentRevision:undefined,
              error:error instanceof Error?error.message:"Save failed",
            });
          }
        })();
      });
    },
  };
}

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const isIntegrationTest = process.env.RESEARCH_OS_INTEGRATION_TEST === "1";
  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    cacheDir:isIntegrationTest?"node_modules/.vite-integration":"node_modules/.vite",
    server: {
      host: "127.0.0.1",
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    optimizeDeps:isIntegrationTest?{noDiscovery:true,exclude:["yaml"]}:{exclude:["yaml"]},
    plugins: isIntegrationTest
      ? [localProjectPersistence(),vinext()]
      : [
          localProjectPersistence(),
          vinext(),
          sites(),
          cloudflare({
            viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
            config: localBindingConfig,
          }),
        ],
  };
});
