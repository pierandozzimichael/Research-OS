import {readFile} from "node:fs/promises";
import path from "node:path";
import {canonicalSourceHash,markdownRecords} from "./canonical-record-files.ts";
import {
  parseConnections,
  parseMarkdownRecord,
  scalarField,
  stringListField,
  type Connection,
} from "./research-schema.ts";
import {scoreRecordSearch} from "./record-search.ts";

type RegistryProject={id:string;name:string;description?:string;vaultPath:string};
type CanonicalRecord={
  id:string;type:string;title:string;status:string;privacy:string;summary:string;
  updated:string;relativePath:string;raw:string;body:string;fields:Record<string,unknown>;
  connections:Connection[];
};
type Environment={
  project:RegistryProject;vaultRoot:string;records:CanonicalRecord[];sourceHash:string;
  generatedAt:string;tasks:Array<Record<string,unknown>>;evidenceDebt:Record<string,unknown>;
};

const PRIORITY_ORDER:Record<string,number>={high:0,medium:1,low:2};
const RELATION_STRENGTH:Record<string,number>={
  contradicts:0,challenges:1,supports:2,tests:3,produces:4,"depends-on":5,informs:6,updates:7,
  "derived-from":8,uses:9,measures:10,documents:11,generated:12,related:13,supersedes:14,
};

function integer(value:unknown,fallback:number,min:number,max:number){
  const parsed=Number(value);
  return Number.isInteger(parsed)?Math.min(max,Math.max(min,parsed)):fallback;
}

function section(body:string,heading:string){
  const escaped=heading.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const match=body.match(new RegExp(`^##\\s+${escaped}\\s*$`,"mi"));
  if(match?.index===undefined)return "";
  const remainder=body.slice(match.index+match[0].length);
  const next=remainder.search(/^##\s+/m);
  return (next<0?remainder:remainder.slice(0,next)).trim();
}

function headings(body:string){
  return [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map(match=>match[1]);
}

function compactText(value:string,maxChars:number){
  const normalized=value.replace(/\r/g,"").trim();
  if(normalized.length<=maxChars)return {text:normalized,truncated:false};
  const slice=normalized.slice(0,Math.max(0,maxChars-1));
  const boundary=Math.max(slice.lastIndexOf("\n"),slice.lastIndexOf(". "));
  return {text:`${slice.slice(0,boundary>maxChars*0.55?boundary:slice.length).trimEnd()}…`,truncated:true};
}

async function optionalJson(file:string,fallback:unknown){
  try{return JSON.parse(await readFile(file,"utf8"));}catch{return fallback;}
}

export async function loadResearchEnvironment(root:string,projectId?:string):Promise<Environment>{
  const registry=JSON.parse(await readFile(path.join(root,"projects.json"),"utf8"));
  const project:RegistryProject|undefined=registry.projects.find((item:RegistryProject)=>item.id===(projectId||registry.projects[0]?.id));
  if(!project)throw new Error(`Unknown project ${projectId||"(default)"}.`);
  const vaultRoot=path.resolve(root,project.vaultPath);
  // Match the generated-context manifest exactly, including untyped literature
  // briefs in the source hash while excluding them from canonical record tools.
  const files=await markdownRecords(vaultRoot,{includeLiteratureBriefs:true});
  const records:CanonicalRecord[]=[];
  for(const file of files){
    const parsed=parseMarkdownRecord(file.raw);
    const id=scalarField(parsed.fields,"id");
    const type=scalarField(parsed.fields,"type");
    if(parsed.errors.length||!id||!type)continue;
    records.push({
      id,type,title:scalarField(parsed.fields,"title"),status:scalarField(parsed.fields,"status"),
      privacy:scalarField(parsed.fields,"privacy"),summary:scalarField(parsed.fields,"summary"),
      updated:scalarField(parsed.fields,"updated"),relativePath:file.relativePath,raw:file.raw,
      body:parsed.body,fields:parsed.fields,connections:parseConnections(parsed.body),
    });
  }
  const generated=path.join(vaultRoot,"14 AI Workspace","generated");
  const [manifest,taskQueue,evidenceDebt]=await Promise.all([
    optionalJson(path.join(generated,"MANIFEST.json"),{}),
    optionalJson(path.join(generated,"TASK_QUEUE.json"),{tasks:[]}),
    optionalJson(path.join(generated,"EVIDENCE_DEBT.json"),{}),
  ]) as [Record<string,unknown>,{tasks?:Array<Record<string,unknown>>},Record<string,unknown>];
  const sourceHash=canonicalSourceHash(files);
  if(manifest.sourceHash!==sourceHash)throw new Error(`Generated AI context is stale (${String(manifest.sourceHash||"missing").slice(0,12)} != ${sourceHash.slice(0,12)}). Run pnpm ai:sync before using research tools.`);
  return {project,vaultRoot,records,sourceHash,generatedAt:String(manifest.generatedAt||""),tasks:taskQueue.tasks||[],evidenceDebt};
}

function recordCard(record:CanonicalRecord){
  return {
    id:record.id,type:record.type,title:record.title,status:record.status,privacy:record.privacy,
    summary:record.summary,updated:record.updated,path:record.relativePath,
  };
}

function source(env:Environment){
  return {source_hash:env.sourceHash,generated_at:env.generatedAt,record_count:env.records.length,canonical_root:env.project.vaultPath};
}

function envelope(env:Environment,tool:string,result:unknown,meta:Record<string,unknown>={}){
  return {schema_version:"research-environment-result-v1",tool,project_id:env.project.id,source:source(env),...meta,result};
}

function recordMap(env:Environment){return new Map(env.records.map(record=>[record.id,record]));}

export function projectBrief(env:Environment){
  const project=env.records.find(record=>record.type==="project");
  const models=env.records.filter(record=>record.type==="model"&&!["retired"].includes(record.status)).map(recordCard);
  const highTasks=env.tasks
    .filter(task=>task.priority==="high")
    .sort((a,b)=>String(a.id).localeCompare(String(b.id))).slice(0,8);
  const counts=Object.fromEntries([...new Set(env.records.map(record=>record.type))].sort().map(type=>[type,env.records.filter(record=>record.type===type).length]));
  const debtClaims=Array.isArray(env.evidenceDebt.claims)?env.evidenceDebt.claims as Array<Record<string,unknown>>:[];
  const debtPapers=Array.isArray(env.evidenceDebt.papers)?env.evidenceDebt.papers as Array<Record<string,unknown>>:[];
  return envelope(env,"project.brief",{
    name:env.project.name,description:env.project.description||"",
    central_question:project?section(project.body,"Central question"):"",
    active_models:models,high_priority_tasks:highTasks,
    evidence_debt_summary:{
      claims_without_support:debtClaims.filter(item=>Number(item.supporting_evidence||0)===0).length,
      claims_without_contradiction_search:debtClaims.filter(item=>Number(item.contradicting_evidence||0)===0).length,
      papers_without_full_review:debtPapers.filter(item=>item.review_depth!=="full-text").length,
    },record_counts:counts,
  });
}

export function searchRecords(env:Environment,options:{query:string;types?:string[];statuses?:string[];limit?:number}){
  const query=options.query.trim().toLowerCase();
  if(!query)throw new Error("search.records requires a non-empty query.");
  const limit=integer(options.limit,10,1,25);
  const scored=env.records.flatMap(record=>{
    if(options.types?.length&&!options.types.includes(record.type))return [];
    if(options.statuses?.length&&!options.statuses.includes(record.status))return [];
    const score=scoreRecordSearch(record,query);
    return score?[{record,score}]:[];
  }).sort((a,b)=>b.score-a.score||a.record.id.localeCompare(b.record.id)).slice(0,limit);
  return envelope(env,"search.records",scored.map(({record,score})=>({...recordCard(record),score,headings:headings(record.body)})),{query,limit});
}

export function getRecord(env:Environment,options:{id:string;sections?:string[];maxChars?:number}){
  const record=recordMap(env).get(options.id.toUpperCase());
  if(!record)throw new Error(`Unknown record ${options.id}.`);
  const maxChars=integer(options.maxChars,8_000,500,24_000);
  const selected=options.sections?.length
    ? options.sections.map(name=>({heading:name,content:section(record.body,name)})).filter(item=>item.content)
    : headings(record.body).map(name=>({heading:name,content:section(record.body,name)}));
  const compact=compactText(selected.map(item=>`## ${item.heading}\n\n${item.content}`).join("\n\n"),maxChars);
  return envelope(env,"record.get",{...recordCard(record),frontmatter:record.fields,available_sections:headings(record.body),content:compact.text},{truncated:compact.truncated,max_chars:maxChars});
}

export function exploreGraph(env:Environment,options:{id:string;depth?:number;relations?:string[];limit?:number}){
  const rootId=options.id.toUpperCase();
  const records=recordMap(env);
  if(!records.has(rootId))throw new Error(`Unknown record ${options.id}.`);
  const depth=integer(options.depth,1,1,2),limit=integer(options.limit,40,1,100);
  const allEdges=env.records.flatMap(record=>record.connections.map(connection=>({source:record.id,type:connection.type,target:connection.target})))
    .filter(edge=>!options.relations?.length||options.relations.includes(edge.type));
  const discovered=new Set([rootId]);
  let frontier=new Set([rootId]);
  for(let hop=0;hop<depth;hop++){
    const next=new Set<string>();
    for(const edge of allEdges){
      if(frontier.has(edge.source)&&records.has(edge.target)&&!discovered.has(edge.target))next.add(edge.target);
      if(frontier.has(edge.target)&&records.has(edge.source)&&!discovered.has(edge.source))next.add(edge.source);
    }
    for(const id of next)discovered.add(id);
    frontier=next;
  }
  const ids=[rootId,...[...discovered].filter(id=>id!==rootId).sort()].slice(0,limit);
  const included=new Set(ids);
  const edges=allEdges.filter(edge=>included.has(edge.source)&&included.has(edge.target))
    .sort((a,b)=>(RELATION_STRENGTH[a.type]??99)-(RELATION_STRENGTH[b.type]??99)||a.source.localeCompare(b.source)||a.target.localeCompare(b.target));
  return envelope(env,"graph.explore",{root:recordCard(records.get(rootId)!),nodes:ids.map(id=>recordCard(records.get(id)!)),edges},{depth,limit,truncated:discovered.size>ids.length});
}

export function evidenceDossier(env:Environment,options:{id:string;maxItems?:number}){
  const id=options.id.toUpperCase(),records=recordMap(env),target=records.get(id);
  if(!target)throw new Error(`Unknown record ${options.id}.`);
  const maxItems=integer(options.maxItems,20,1,50);
  const edges=env.records.flatMap(record=>record.connections.map(connection=>({source:record.id,type:connection.type,target:connection.target})))
    .filter(edge=>edge.source===id||edge.target===id)
    .sort((a,b)=>(RELATION_STRENGTH[a.type]??99)-(RELATION_STRENGTH[b.type]??99));
  const entries=edges.flatMap(edge=>{
    const relatedId=edge.source===id?edge.target:edge.source;
    const related=records.get(relatedId);
    return related?[{direction:edge.source===id?"outgoing":"incoming",relation:edge.type,record:recordCard(related),
      review:{human_reviewed:related.fields.human_reviewed===true,review_depth:scalarField(related.fields,"review_depth"),evidence_anchors:stringListField(related.fields,"evidence_anchors")}}]:[];
  });
  const support=entries.filter(item=>item.relation==="supports");
  const against=entries.filter(item=>["contradicts","challenges"].includes(item.relation));
  const contextual=entries.filter(item=>!["supports","contradicts","challenges"].includes(item.relation));
  return envelope(env,"evidence.dossier",{
    target:recordCard(target),support:support.slice(0,maxItems),against:against.slice(0,maxItems),
    contextual:contextual.slice(0,maxItems),gaps:{
      no_support:support.length===0,no_contradiction_search:against.length===0,
      human_reviewed_anchor_count:entries.filter(item=>item.record.type==="evidence"&&item.review.human_reviewed).length,
    },
  },{max_items:maxItems,truncated:entries.length>maxItems*3});
}

export function nextWork(env:Environment,options:{limit?:number;lane?:string}){
  const limit=integer(options.limit,5,1,20);
  const tasks=env.tasks.filter(task=>!options.lane||task.lane===options.lane)
    .sort((a,b)=>(PRIORITY_ORDER[String(a.priority)]??9)-(PRIORITY_ORDER[String(b.priority)]??9)||String(a.id).localeCompare(String(b.id)))
    .slice(0,limit);
  return envelope(env,"work.next",tasks,{limit,lane:options.lane||"all"});
}

export function contextPacket(env:Environment,options:{id?:string;decision?:string;maxChars?:number}){
  const records=recordMap(env);
  const inferred=String(env.tasks[0]?.id||"");
  const id=(options.id||inferred).toUpperCase();
  const focus=records.get(id);
  if(!focus)throw new Error("context.packet requires --id or a current task with a canonical record ID.");
  const maxChars=integer(options.maxChars,7_000,3_000,20_000);
  const matchingTask=env.tasks.find(task=>task.id===id);
  const dossier=evidenceDossier(env,{id,maxItems:5}).result as Record<string,unknown>;
  const graph=exploreGraph(env,{id,depth:1,limit:12}).result as Record<string,unknown>;
  const evidence={...dossier};delete evidence.target;
  const localGraph={
    nodes:(graph.nodes as Array<Record<string,unknown>>).filter(node=>node.id!==id),
    edges:graph.edges as Array<Record<string,unknown>>,
  };
  const focusHeadings=headings(focus.body);
  const preferred=[
    "Supporting evidence","What this does not establish","Evidence against","Evidence needed","Next split","Human review",
    "Rationale","Predictions","Falsification criteria","Stop rule","Next action","Experiment","Result","Connections",
  ];
  const selected=preferred.filter(name=>focusHeadings.includes(name));
  const fallback=focusHeadings.slice(0,4);
  const detail=compactText((selected.length?selected:fallback).map(name=>`## ${name}\n\n${section(focus.body,name)}`).join("\n\n"),Math.floor(maxChars*0.55));
  const central=env.records.find(record=>record.type==="project");
  const packet:{
    schema_version:string;project_id:string;source:ReturnType<typeof source>;focus:ReturnType<typeof recordCard>;
    objective:string;central_question:string;focus_detail:string;task:Record<string,unknown>|null;
    evidence:Record<string,unknown>;local_graph:{nodes:Array<Record<string,unknown>>;edges:Array<Record<string,unknown>>};rules:string[];next_tool_hint:string;
  }={
    schema_version:"research-context-packet-v1",
    project_id:env.project.id,source:source(env),
    focus:recordCard(focus),
    objective:compactText(options.decision?.trim()||String(matchingTask?.next_action||matchingTask?.reason||"Investigate the current evidence gap and prepare a governed next step."),Math.floor(maxChars*0.14)).text,
    central_question:compactText(central?section(central.body,"Central question"):"",Math.floor(maxChars*0.12)).text,
    focus_detail:detail.text,
    task:matchingTask||null,
    evidence,
    local_graph:localGraph,
    rules:[
      "Canonical Markdown/YAML records are evidence; generated files and run artifacts are navigation only.",
      "Keep DIRECT, AUTHOR, INFERENCE, and SPECULATION separate.",
      "Do not attest human review or promote claims to supported.",
    ],
    next_tool_hint:(dossier.gaps as Record<string,unknown>).no_support===true?"Search for primary evidence, then use record.get only for selected candidate records.":"Inspect the explicit graph path and evidence locators before proposing a next action.",
  };
  let trimmed=detail.truncated;
  const size=()=>JSON.stringify(packet).length;
  while(size()>maxChars&&(packet.evidence.contextual as unknown[]).length){
    (packet.evidence.contextual as unknown[]).pop();trimmed=true;
  }
  while(size()>maxChars&&(packet.local_graph.nodes as unknown[]).length>1){
    const removed=(packet.local_graph.nodes as Array<Record<string,unknown>>).pop();
    packet.local_graph.edges=(packet.local_graph.edges as Array<Record<string,unknown>>).filter(edge=>edge.source!==removed?.id&&edge.target!==removed?.id);
    trimmed=true;
  }
  while(size()>maxChars&&packet.focus_detail.length>300){
    const allowed=Math.max(300,packet.focus_detail.length-(size()-maxChars)-64);
    packet.focus_detail=compactText(packet.focus_detail,allowed).text;trimmed=true;
  }
  if(size()>maxChars){
    packet.rules=packet.rules.slice(0,2);trimmed=true;
  }
  if(size()>maxChars){packet.task=null;trimmed=true;}
  if(size()>maxChars)packet.central_question=compactText(packet.central_question,120).text;
  const estimated=size();
  return envelope(env,"context.packet",packet,{max_chars:maxChars,estimated_characters:estimated,truncated:trimmed});
}
