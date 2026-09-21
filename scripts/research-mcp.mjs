/**
 * Local stdio MCP adapter for the canonical Research OS environment.
 *
 * This intentionally contains no second index or state store. Every request
 * loads the same source-hash-gated Markdown environment used by research:tool.
 * Logs go only to stderr because stdio MCP reserves stdout for JSON-RPC.
 */
import readline from "node:readline";
import {fileURLToPath} from "node:url";
import {
  contextPacket,evidenceDossier,exploreGraph,getRecord,loadResearchEnvironment,nextWork,projectBrief,searchRecords,
} from "../lib/research-environment.ts";
import {appendRunEvent,inspectRun,requestRunCancellation} from "../lib/agent-run-ledger.ts";
import {buildCanonicalizationRequest,summarizeCanonicalizationResult} from "../lib/governed-action.ts";
import {postLocalResearchApi} from "./local-research-api.mjs";
import {buildWorkspaceUrl,workspaceBaseUrl,workspaceViewSlugs} from "../lib/workspace-link.ts";

const protocolVersion="2025-11-25";
// Resolve the workspace from this checked-in entrypoint, not the client's cwd.
// Project MCP clients are allowed to launch servers from another directory.
const root=fileURLToPath(new URL("..",import.meta.url));
let initialized=false;
const jsonSchema={type:"object",additionalProperties:false};
const tool=(name,description,properties={},required=[],annotations={readOnlyHint:true,destructiveHint:false})=>({
  name,description,inputSchema:{...jsonSchema,properties,required},
  outputSchema:{type:"object"},annotations,
});
const project={type:"string",description:"Project ID; omit for the registry default."};
const id={type:"string",description:"Stable record ID such as CLM-004."};
const tools=[
  tool("research_brief","Compact, source-bound project orientation.",{project}),
  tool("research_search","Deterministic lexical/structural search; returns cards, never full records.",{project,query:{type:"string",minLength:1},types:{type:"array",items:{type:"string"}},statuses:{type:"array",items:{type:"string"}},limit:{type:"integer",minimum:1,maximum:25}},["query"]),
  tool("research_record","Read selected canonical sections under a character budget.",{project,id,sections:{type:"array",items:{type:"string"}},max_chars:{type:"integer",minimum:500,maximum:24000}},["id"]),
  tool("research_graph","Explore one or two hops of explicit typed connections.",{project,id,depth:{type:"integer",minimum:1,maximum:2},relations:{type:"array",items:{type:"string"}},limit:{type:"integer",minimum:1,maximum:100}},["id"]),
  tool("research_evidence","Return supporting, challenging, and contextual lanes separately.",{project,id,max_items:{type:"integer",minimum:1,maximum:50}},["id"]),
  tool("research_next","Return deterministic highest-value routing tasks.",{project,limit:{type:"integer",minimum:1,maximum:20},lane:{type:"string"}}),
  tool("research_context","Create a bounded task packet; generated context is never presented as evidence.",{project,id,decision:{type:"string"},max_chars:{type:"integer",minimum:3000,maximum:20000}}),
  tool("research_figures","Return figure manifests and provenance only; images are not injected into context.",{project,id},["id"]),
  tool("research_show_in_workspace","Create a validated local Research OS deep link. Open or reuse it in an embedded browser when available; otherwise show the URL to the user.",{project,record_id:id,view:{type:"string",enum:workspaceViewSlugs},scope:{type:"string",enum:["direct","2-hop","all"]},expanded:{type:"boolean"}}),
  tool("research_run_status","Inspect a durable agent-run checkpoint and recent events.",{project,run:{type:"string"}},["run"]),
  tool("research_run_cancel","Request a safe cancellation at the next checkpoint. It never deletes work.",{project,run:{type:"string"},reason:{type:"string"}},["run"],{readOnlyHint:false,destructiveHint:false}),
  tool("research_change_preview","Preview a governed literature canonicalization without writing.",{project,literature_run:{type:"string"},candidate:{type:"string"}},["literature_run","candidate"],{readOnlyHint:true,destructiveHint:false}),
  tool("research_change_apply","Apply only the exact plan hash from a fresh preview. Cannot attest human review or promote a claim.",{project,literature_run:{type:"string"},candidate:{type:"string"},plan_hash:{type:"string",pattern:"^[a-f0-9]{64}$"}},["literature_run","candidate","plan_hash"],{readOnlyHint:false,destructiveHint:false}),
];
const toolsByName=new Map(tools.map(item=>[item.name,item]));

function output(message){process.stdout.write(`${JSON.stringify(message)}\n`);}
function response(id,result){output({jsonrpc:"2.0",id,result});}
function failure(id,code,message){output({jsonrpc:"2.0",id,error:{code,message}});}
function textResult(value,isError=false){
  const text=JSON.stringify(value,null,2);
  return {content:[{type:"text",text}],structuredContent:value,isError};
}
function object(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function text(value){return typeof value==="string"?value:"";}
function stringArray(value){return Array.isArray(value)&&value.every(item=>typeof item==="string")?value:undefined;}
function integer(value){return typeof value==="number"&&Number.isInteger(value)?value:undefined;}

function validateValue(value,schema,label){
  if(schema.type==="boolean"&&typeof value!=="boolean")return `${label} must be a boolean.`;
  if(schema.type==="string"){
    if(typeof value!=="string")return `${label} must be a string.`;
    if(schema.minLength!==undefined&&value.length<schema.minLength)return `${label} must not be empty.`;
    if(schema.pattern&&!new RegExp(schema.pattern).test(value))return `${label} has an invalid format.`;
    if(schema.enum&&!schema.enum.includes(value))return `${label} must be one of: ${schema.enum.join(", ")}.`;
  }
  if(schema.type==="integer"){
    if(!Number.isInteger(value))return `${label} must be an integer.`;
    if(schema.minimum!==undefined&&value<schema.minimum)return `${label} must be at least ${schema.minimum}.`;
    if(schema.maximum!==undefined&&value>schema.maximum)return `${label} must be at most ${schema.maximum}.`;
  }
  if(schema.type==="array"){
    if(!Array.isArray(value))return `${label} must be an array.`;
    for(const [index,item] of value.entries()){
      const issue=validateValue(item,schema.items,`${label}[${index}]`);
      if(issue)return issue;
    }
  }
  return "";
}

function validateToolArguments(definition,rawArguments){
  if(rawArguments===undefined)return definition.inputSchema.required.length?`Missing required argument: ${definition.inputSchema.required[0]}.`:"";
  if(!rawArguments||typeof rawArguments!=="object"||Array.isArray(rawArguments))return "Tool arguments must be an object.";
  const properties=definition.inputSchema.properties||{};
  for(const key of Object.keys(rawArguments))if(!(key in properties))return `Unknown argument: ${key}.`;
  for(const key of definition.inputSchema.required||[])if(rawArguments[key]===undefined)return `Missing required argument: ${key}.`;
  for(const [key,value] of Object.entries(rawArguments)){
    const issue=validateValue(value,properties[key],key);
    if(issue)return issue;
  }
  return "";
}

async function environment(args){return loadResearchEnvironment(root,text(args.project)||undefined);}
async function figures(env,args){
  const record=env.records.find(item=>item.id===text(args.id).toUpperCase());
  if(!record)throw new Error(`Unknown record ${text(args.id)}.`);
  const raw=record.fields.figures;
  const manifest=Array.isArray(raw)?raw:[];
  return {
    schema_version:"research-figure-manifest-v1",record:{id:record.id,type:record.type,title:record.title,privacy:record.privacy},
    figures:manifest,policy:"Figure metadata is context, not evidence. Request a local asset only when it is decision-relevant.",
  };
}

async function callTool(name,rawArguments){
  const args=object(rawArguments);
  const env=await environment(args);
  if(name==="research_brief")return projectBrief(env);
  if(name==="research_search")return searchRecords(env,{query:text(args.query),types:stringArray(args.types),statuses:stringArray(args.statuses),limit:integer(args.limit)});
  if(name==="research_record")return getRecord(env,{id:text(args.id),sections:stringArray(args.sections),maxChars:integer(args.max_chars)});
  if(name==="research_graph")return exploreGraph(env,{id:text(args.id),depth:integer(args.depth),relations:stringArray(args.relations),limit:integer(args.limit)});
  if(name==="research_evidence")return evidenceDossier(env,{id:text(args.id),maxItems:integer(args.max_items)});
  if(name==="research_next")return nextWork(env,{limit:integer(args.limit),lane:text(args.lane)||undefined});
  if(name==="research_context")return contextPacket(env,{id:text(args.id)||undefined,decision:text(args.decision)||undefined,maxChars:integer(args.max_chars)});
  if(name==="research_figures")return {schema_version:"research-environment-result-v1",tool:"figure.manifest",project_id:env.project.id,source:{source_hash:env.sourceHash},result:await figures(env,args)};
  if(name==="research_show_in_workspace"){
    const recordId=text(args.record_id).toUpperCase();
    if(recordId&&!env.records.some(record=>record.id===recordId))throw new Error(`Unknown record ${recordId}.`);
    const state={project:env.project.id,view:text(args.view)||"map",...(recordId?{record:recordId}:{}),...(text(args.scope)?{scope:text(args.scope)}:{}),...(args.expanded===true?{expanded:true}:{})};
    return {
      schema_version:"research-workspace-link-v1",project_id:env.project.id,url:buildWorkspaceUrl(workspaceBaseUrl(process.env.RESEARCH_OS_UI_URL||undefined),state),state,
      client_action:{kind:"open_url",target:"embedded-browser-preferred",reuse_existing:true},
      fallback:"If this client cannot open an embedded browser, present the URL as a clickable link.",
      authority:"This link changes presentation only. Canonical Markdown and source-bound retrieval remain authoritative.",
    };
  }
  if(name==="research_run_status")return await inspectRun(env.vaultRoot,text(args.run),{eventLimit:20});
  if(name==="research_run_cancel"){
    const cancellation=await requestRunCancellation(env.vaultRoot,text(args.run),text(args.reason)||"Cancellation requested through MCP.");
    await appendRunEvent(env.vaultRoot,text(args.run),{kind:"cancellation-requested",summary:String(cancellation.reason),source_hash:env.sourceHash,artifacts:["CANCEL.json"]});
    return {schema_version:"research-environment-result-v1",tool:"run.cancel",project_id:env.project.id,source:{source_hash:env.sourceHash},result:cancellation};
  }
  if(name==="research_change_preview"||name==="research_change_apply"){
    const mode=name==="research_change_apply"?"apply":"preview";
    const request={projectId:env.project.id,literatureRunId:text(args.literature_run),candidateId:text(args.candidate),mode,planHash:text(args.plan_hash)||undefined};
    const operation=buildCanonicalizationRequest(request);
    const started=Date.now();
    const apiResult=await postLocalResearchApi(operation.route,operation.payload);
    return summarizeCanonicalizationResult(apiResult,request,env.sourceHash,Date.now()-started);
  }
  throw new Error(`Unknown tool ${name}.`);
}

async function handle(message){
  if(!message||message.jsonrpc!=="2.0"||typeof message.method!=="string"){failure(message?.id??null,-32600,"Invalid JSON-RPC request.");return;}
  const id=message.id;
  try{
    if(message.method==="initialize"){
      const clientVersion=text(object(message.params).protocolVersion);
      if(clientVersion&&clientVersion!==protocolVersion){failure(id,-32602,`Unsupported protocol version ${clientVersion}; this server supports ${protocolVersion}.`);return;}
      initialized=true;
      response(id,{protocolVersion,capabilities:{tools:{listChanged:false}},serverInfo:{name:"research-os",version:"0.2.0"},instructions:"Use bounded retrieval first. Canonical Markdown/YAML is authoritative. Figure manifests are context, not evidence. Governed applies require an exact plan hash and cannot attest human review."});
      return;
    }
    if(!initialized){failure(id??null,-32002,"Server not initialized. Call initialize first.");return;}
    if(message.method==="notifications/initialized")return;
    if(message.method==="tools/list"){response(id,{tools});return;}
    if(message.method==="tools/call"){
      const params=object(message.params),name=text(params.name);
      const definition=toolsByName.get(name);
      if(!definition){failure(id,-32602,`Unknown tool ${name}.`);return;}
      const argumentIssue=validateToolArguments(definition,params.arguments);
      if(argumentIssue){response(id,textResult({schema_version:"research-environment-error-v1",tool:name,error:argumentIssue},true));return;}
      try{response(id,textResult(await callTool(name,params.arguments)));}catch(error){response(id,textResult({schema_version:"research-environment-error-v1",tool:name,error:error instanceof Error?error.message:String(error)},true));}
      return;
    }
    failure(id,-32601,`Method not found: ${message.method}`);
  }catch(error){failure(id,-32603,error instanceof Error?error.message:"Internal server error.");}
}

const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of lines){
  if(!line.trim())continue;
  try{await handle(JSON.parse(line));}catch{failure(null,-32700,"Parse error.");}
}
