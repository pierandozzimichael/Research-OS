"use client";
/* eslint-disable @next/next/no-img-element -- local-only vault images are served by the loopback-only asset route. */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createRecordMarkdown,
  graphDefaultTypes,
  ideaDispositions,
  ideaMaturities,
  ideaPriorities,
  evidenceStrengths,
  feasibilityLevels,
  isRecordType,
  knowledgeLibraryTypes,
  nextRecordId,
  paperReviewDepths,
  parseConnections,
  parseMarkdownRecord,
  recordTypeConfig,
  recordTypes,
  relationTypes,
  replaceRecordBody,
  scalarField,
  updateRecordFields,
  wikiLinkIds,
  type RecordType,
} from "../lib/research-schema";
import type {LiteratureProposal} from "../lib/literature-intake";
import {matchesRecordSearch,scoreRecordSearch} from "../lib/record-search";
import {researchToolCatalog,type ResearchToolCatalogEntry,type ToolCategory} from "../lib/research-tool-catalog";
import {buildLabShareEmailDraft,buildLabShareHtml,buildLabShareManifest,buildLabShareSnapshot} from "../lib/lab-share";
import {buildWorkspaceUrl,parseWorkspaceLink,type WorkspaceLinkState,type WorkspaceViewSlug} from "../lib/workspace-link";
import AgentCommandDock from "./agent-command-dock";
import {FirstRunTutorial} from "./first-run-tutorial";
import type {AssistantUiAction} from "../lib/assistant-contract";
type Relation = { type: string; target: string };
type GraphMode = "flow" | "topic" | "free";
type EdgeScope = "focus" | "neighborhood" | "all";
type ThemePreference = "system" | "light" | "dark";
type AccessibilityPreferences={dyslexia:boolean;largeText:boolean;highContrast:boolean;reducedMotion:boolean};
type GuidedPresentation={steps:Array<{id:string;note:string}>;index:number;playing:boolean;reason:string};
type LibraryLens="all"|"needs-review"|"blocked"|"needs-evidence"|"unlinked";
type ReviewLane = "blocked" | "verify" | "decide" | "analyze";
type ReviewPriority = "high" | "medium" | "low";
type ReviewMeta = {
  lane: ReviewLane;
  priority: ReviewPriority;
  reason: string;
  action: string;
  exit: string;
};
type ProjectInfo = {
  id: string;
  name: string;
  description: string;
  vaultPath: string;
  createdAt: string;
  recordCount: number;
  hidden?: boolean;
};
type AiContextStatus = {
  generatedAt:string;
  sourceCount:number;
  edgeCount:number;
  current:boolean;
};
type AiReadinessReport={
  ready:boolean;
  summary:{pass:number;warn:number;fail:number};
  checks:Array<{id:string;status:"pass"|"warn"|"fail";message:string;path?:string;remediation?:string}>;
};
type ProjectDiagnostics={
  sourceFileCount:number;indexedRecordCount:number;skippedFileCount:number;
  schemaErrorCount:number;schemaWarningCount:number;
  relationshipErrorCount:number;relationshipWarningCount:number;
  duplicateIdCount:number;missingTargetCount:number;
  issues:Array<{area:"schema"|"graph";severity:"error"|"warning";code:string;message:string;id?:string;path?:string}>;
};
type ResearchRecord = {
  id: string;
  type: RecordType;
  title: string;
  summary: string;
  status: string;
  confidence: string;
  links: string[];
  relations: Relation[];
  urls: string[];
  x: number;
  y: number;
  raw: string;
  revision: string;
  body: string;
  fields: Record<string, unknown>;
  fileName?: string;
  relativePath?: string;
  handle?: FileSystemFileHandle;
};

const workspaceViewNames:Record<WorkspaceViewSlug,string>={
  map:"Graph",library:"Library",papers:"Papers",knowledge:"Knowledge",ideas:"Ideas",hypotheses:"Hypotheses",
  experiments:"Experiments",results:"Results",work:"Review Queue","paper-review":"Paper Review",
  "literature-inbox":"Literature Inbox","review-queue":"Review Queue",agent:"AI Workspace",
};
const workspaceViewSlugsByName:Record<string,WorkspaceViewSlug>={
  Graph:"map",Library:"library",Papers:"papers",Knowledge:"knowledge",Ideas:"ideas",Hypotheses:"hypotheses",
  Experiments:"experiments",Results:"results","Paper Review":"paper-review","Literature Inbox":"literature-inbox",
  "Review Queue":"review-queue","AI Workspace":"agent",
};

function initialWorkspaceLink():WorkspaceLinkState{
  return typeof window==="undefined"?{}:parseWorkspaceLink(window.location.search);
}

type SaveResult = { raw: string; revision: string };

const defaultAccessibility:AccessibilityPreferences={dyslexia:false,largeText:false,highContrast:false,reducedMotion:false};

function storedAccessibility(){
  if(typeof window==="undefined")return defaultAccessibility;
  try{return {...defaultAccessibility,...JSON.parse(window.localStorage.getItem("research-os-accessibility")||"{}")} as AccessibilityPreferences;}catch{return defaultAccessibility;}
}

class SaveConflictError extends Error {
  constructor() {
    super("This record changed outside the current editor.");
    this.name = "SaveConflictError";
  }
}

let localWriteTokenPromise: Promise<string> | null = null;

async function localWriteHeaders() {
  localWriteTokenPromise ??= fetch("/api/local-session", {cache:"no-store"})
    .then(async response => {
      const payload=await response.json() as {writeToken?:string;error?:string};
      if(!response.ok||!payload.writeToken)throw new Error(payload.error||"Local write session unavailable");
      return payload.writeToken;
    });
  return {
    "content-type":"application/json",
    "x-research-os-token":await localWriteTokenPromise,
  };
}

async function browserContentRevision(raw:string) {
  const bytes=new TextEncoder().encode(raw);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

function readableRunLabel(value:string){
  const compact=value.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z?/);
  if(!compact)return value;
  const [,year,month,day,hour,minute,second,fraction=""]=compact;
  const iso=`${year}-${month}-${day}T${hour}:${minute}:${second}.${fraction.slice(0,3).padEnd(3,"0")}Z`;
  const date=new Date(iso);
  if(Number.isNaN(date.getTime()))return value;
  return `Run · ${date.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})} · ${date.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})}`;
}

const windows1252Bytes:Record<string,number>={
  "€":0x80,"‚":0x82,"ƒ":0x83,"„":0x84,"…":0x85,"†":0x86,"‡":0x87,"ˆ":0x88,"‰":0x89,"Š":0x8a,"‹":0x8b,"Œ":0x8c,"Ž":0x8e,
  "‘":0x91,"’":0x92,"“":0x93,"”":0x94,"•":0x95,"–":0x96,"—":0x97,"˜":0x98,"™":0x99,"š":0x9a,"›":0x9b,"œ":0x9c,"ž":0x9e,"Ÿ":0x9f,
};

function literatureText(value:string){
  const withoutEntities=value
    .replace(/&(lt|gt|amp|quot|apos|nbsp);/gi,(_,entity:string)=>({lt:"<",gt:">",amp:"&",quot:'"',apos:"'",nbsp:" "}[entity.toLowerCase()]||""))
    .replace(/&#x([0-9a-f]+);/gi,(_,hex:string)=>String.fromCodePoint(Number.parseInt(hex,16)))
    .replace(/&#(\d+);/g,(_,decimal:string)=>String.fromCodePoint(Number.parseInt(decimal,10)))
    .replace(/<[^>]*>/g,"");
  let repaired=withoutEntities;
  for(let pass=0;pass<2&&/[ÃÂâÎ]/u.test(repaired);pass++){
    const bytes:number[]=[];
    let convertible=true;
    for(const character of repaired){
      const code=character.codePointAt(0)!;
      const byte=code<=0xff?code:windows1252Bytes[character];
      if(byte===undefined){convertible=false;break;}
      bytes.push(byte);
    }
    if(!convertible)break;
    try{
      const decoded=new TextDecoder("utf-8",{fatal:true}).decode(new Uint8Array(bytes));
      if(decoded===repaired)break;
      repaired=decoded;
    }catch{break;}
  }
  return repaired;
}

const relationOptions = [...relationTypes];
const primaryNav = [
  {label:"Map",view:"Graph"},
  {label:"Library",view:"Library"},
  {label:"Work",view:"Review Queue"},
  {label:"Agent",view:"AI Workspace"},
] as const;
const libraryViews = ["Library","Papers","Knowledge","Ideas","Hypotheses","Experiments","Results"];
const workViews = ["Literature Inbox","Paper Review","Review Queue"];
const libraryTabs = [
  {label:"All",view:"Library"},
  {label:"Papers",view:"Papers"},
  {label:"Knowledge",view:"Knowledge"},
  {label:"Ideas",view:"Ideas"},
  {label:"Hypotheses",view:"Hypotheses"},
  {label:"Experiments",view:"Experiments"},
  {label:"Results",view:"Results"},
] as const;
const workTabs = [
  {label:"Review queue",view:"Review Queue"},
  {label:"Read papers",view:"Paper Review"},
  {label:"Literature inbox",view:"Literature Inbox"},
] as const;
const libraryLenses:Array<{value:LibraryLens;label:string;description:string}> = [
  {value:"all",label:"All records",description:"Show every record in this Library section."},
  {value:"needs-review",label:"Needs review",description:"Records with a concrete human review action."},
  {value:"blocked",label:"Blocked",description:"Records with structured blockers or a blocked status."},
  {value:"needs-evidence",label:"Needs evidence",description:"Records whose status explicitly requires a source or verification."},
  {value:"unlinked",label:"Unlinked",description:"Core scientific records with no explicit evidence-map connection."},
];
const viewTypes: Record<string, RecordType[] | null> = {
  Graph: null, Library: null, Papers: ["paper"], Ideas: ["idea"], Hypotheses: ["hypothesis"],
  "Paper Review": ["paper"],
  Experiments: ["experiment"], Results: ["result"], Knowledge: knowledgeLibraryTypes,
  "Review Queue": null,
  "Literature Inbox": null,
  "AI Workspace": null,
};
const libraryViewDescriptions:Record<string,string>={
  Library:"Browse the canonical research memory across evidence, reasoning, experiments, and results.",
  Papers:"Trace source literature into claims, evidence anchors, and the questions it can actually support.",
  Knowledge:"Inspect claims, models, entities, methods, and policies that define the project’s current understanding.",
  Ideas:"Develop possibilities without confusing novelty, maturity, evidence strength, feasibility, or priority.",
  Hypotheses:"Follow testable mechanisms into discriminating experiments, predicted outcomes, and stop rules.",
  Results:"Review observations and outcomes while preserving uncertainty, provenance, and negative evidence.",
};

const starter: ResearchRecord[] = [];

function doiUrl(value:string){
  const doi=value.trim().replace(/^doi:\s*/i,"").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,"");
  return /^10\.\d{4,9}\/[\S]+$/i.test(doi)?`https://doi.org/${doi}`:"";
}

function deduplicateUrls(values:string[]){
  const seen=new Set<string>();
  return values.filter(Boolean).filter(value=>{
    const key=value.trim().replace(/\/$/,"").toLowerCase();
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

function preferredGraphRecord(records: ResearchRecord[]) {
  const known = new Set(records.map(record => record.id));
  const degree = new Map(records.map(record => [record.id, 0]));
  for (const record of records) for (const relation of record.relations) {
    if (!known.has(relation.target)) continue;
    degree.set(record.id, (degree.get(record.id) || 0) + 1);
    degree.set(relation.target, (degree.get(relation.target) || 0) + 1);
  }
  const typeRank: Record<RecordType, number> = {
    paper: 0, claim: 1, hypothesis: 2, experiment: 3, idea: 4, result: 5,
    model: 6, evidence: 7, entity: 8, topic: 9, method: 10, decision: 11, policy: 12,
    project: 13, source: 14,
  };
  return [...records].sort((a, b) =>
    (degree.get(b.id) || 0) - (degree.get(a.id) || 0) ||
    typeRank[a.type] - typeRank[b.type] ||
    a.title.localeCompare(b.title),
  )[0];
}

function graphNeighborhoodIds(records: ResearchRecord[], focusId: string, depth: number) {
  const known = new Set(records.map(record => record.id));
  if (!focusId || !known.has(focusId)) return new Set<string>();
  const adjacent = new Map<string, Set<string>>();
  for (const record of records) {
    if (!adjacent.has(record.id)) adjacent.set(record.id, new Set());
    for (const relation of record.relations) {
      if (!known.has(relation.target)) continue;
      adjacent.get(record.id)?.add(relation.target);
      if (!adjacent.has(relation.target)) adjacent.set(relation.target, new Set());
      adjacent.get(relation.target)?.add(record.id);
    }
  }
  const visible = new Set<string>([focusId]);
  let frontier = new Set<string>([focusId]);
  for (let hop = 0; hop < depth; hop += 1) {
    const next = new Set<string>();
    for (const id of frontier) for (const neighbor of adjacent.get(id) || []) {
      if (!visible.has(neighbor)) next.add(neighbor);
      visible.add(neighbor);
    }
    frontier = next;
  }
  return visible;
}

function parseRecord(text: string, fallbackName: string, handle?: FileSystemFileHandle, relativePath?: string, revision=""): ResearchRecord | null {
  const parsed=parseMarkdownRecord(text);
  if(parsed.errors.length)return null;
  const fields=parsed.fields;
  const typeValue=scalarField(fields,"type");
  if(!isRecordType(typeValue))return null;
  const type=typeValue;
  const body=parsed.body;
  const id=scalarField(fields,"id",fallbackName.match(/[A-Z]+-\d{3,}/)?.[0]||fallbackName);
  const title=scalarField(fields,"title",body.match(/^#\s+(.+)$/m)?.[1]||fallbackName.replace(/\.md$/i,""));
  const summary=scalarField(fields,"summary",body.replace(/^#.+$/m,"").replace(/^##.+$/gm,"").replace(/\[\[([^\]]+)\]\]/g,"$1").trim().slice(0,320));
  const explicit=parseConnections(body);
  const wikiLinks=wikiLinkIds(body);
  const links = [...new Set([...explicit.map(r=>r.target), ...wikiLinks])].filter(link => link !== id);
  const bodyUrls = [...body.matchAll(/https?:\/\/[^\s)\]>]+/g)].map(m=>m[0].replace(/[.,;:]$/,""));
  const pmid=scalarField(fields,"pmid"),pmcid=scalarField(fields,"pmcid"),doi=scalarField(fields,"doi");
  const derivedUrls = [
    scalarField(fields,"source_url"),
    /^\d+$/.test(pmid) ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "",
    /^PMC\d+$/i.test(pmcid) ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid.toUpperCase()}/` : "",
    doiUrl(doi),
  ].filter(Boolean);
  const urls = deduplicateUrls([...derivedUrls, ...bodyUrls]);
  const index = Number(id.split("-")[1]) || 1;
  const typeColumn = recordTypes.indexOf(type);
  return {
    id, type, title, summary, status: scalarField(fields,"status","draft"), confidence: scalarField(fields,"confidence","unrated"),
    links, relations: explicit, urls, x: Number(scalarField(fields,"canvas_x")) || 330 + typeColumn * 410 + ((index * 47) % 120),
    y: Number(scalarField(fields,"canvas_y")) || 220 + (((index - 1) * 270 + typeColumn * 90) % 1500), raw:text, revision, body, fields,
    fileName:fallbackName, relativePath, handle,
  };
}

function recordIsBlocked(record:ResearchRecord){
  return /blocked/.test(record.status)||Boolean(Array.isArray(record.fields.blockers)&&record.fields.blockers.length);
}

function recordNeedsEvidence(record:ResearchRecord){
  return /citation-needed|to-verify|source-required|blocked-by-source|unverified/.test(record.status);
}

function recordIsUnlinked(record:ResearchRecord,records:ResearchRecord[]){
  if(!graphDefaultTypes.includes(record.type))return false;
  return record.relations.length===0&&!records.some(source=>source.relations.some(relation=>relation.target===record.id));
}

function matchesLibraryLens(record:ResearchRecord,lens:LibraryLens,records:ResearchRecord[]){
  if(lens==="needs-review")return Boolean(reviewMeta(record));
  if(lens==="blocked")return recordIsBlocked(record);
  if(lens==="needs-evidence")return recordNeedsEvidence(record);
  if(lens==="unlinked")return recordIsUnlinked(record,records);
  return true;
}


const updateFrontmatter=updateRecordFields;
const replaceBody=replaceRecordBody;

function writeConnections(body: string, relations: Relation[]) {
  const lines = relations.map(r => `- ${r.type} [[${r.target}]]`).join("\n");
  const section = `## Connections\n\n${lines || "_No explicit connections._"}`;
  const start = body.search(/^## Connections\s*$/mi);
  if (start < 0) return `${body.trim()}\n\n${section}\n`;
  const afterHeading = body.indexOf("\n", start);
  const restStart = afterHeading < 0 ? body.length : afterHeading + 1;
  const nextMatch = body.slice(restStart).match(/^##\s+/m);
  const end = nextMatch?.index == null ? body.length : restStart + nextMatch.index;
  return `${body.slice(0,start)}${section}\n\n${body.slice(end).trimStart()}`;
}

function contentSections(body: string) {
  const cleaned = body.replace(/^#\s+.+$/m, "").trim();
  const matches = [...cleaned.matchAll(/^##\s+(.+)\s*$/gm)];
  if (!matches.length) return [{title:"Notes",content:cleaned}];
  return matches.map((match,index) => ({
    title: match[1].trim(),
    content: cleaned.slice((match.index || 0) + match[0].length, matches[index+1]?.index ?? cleaned.length).trim(),
  })).filter(section => section.title.toLowerCase() !== "connections" && section.content);
}

function shortLinkLabel(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("pubmed")) return `PubMed ${parsed.pathname.split("/").filter(Boolean).pop()}`;
    if (parsed.hostname.includes("pmc.")) return `PMC ${parsed.pathname.split("/").filter(Boolean).pop()}`;
    if (parsed.hostname === "doi.org") return `DOI ${parsed.pathname.slice(1)}`;
    return parsed.hostname.replace(/^www\./,"");
  } catch {
    return url;
  }
}

function externalLinkKind(url:string){
  try{
    const host=new URL(url).hostname.toLowerCase();
    if(host.includes("pubmed")||host.includes("pmc.")||host==="doi.org")return "Publication";
    if(host.includes("github.com")||host.includes("gitlab.com"))return "Analysis";
    if(host.includes("zotero"))return "Zotero";
    if(host.includes("drive.google")||host.includes("dropbox")||host.includes("box.com")||host.includes("sharepoint"))return "Files";
    if(host.includes("protocol")||host.includes("benchling"))return "Protocol";
    return "External";
  }catch{return "External";}
}

function linkedText(content:string):ReactNode[]{
  const pattern=/https?:\/\/[^\s)\]>]+/g;
  const parts:ReactNode[]=[];
  let cursor=0;
  for(const match of content.matchAll(pattern)){
    const start=match.index??0;
    const raw=match[0];
    const url=raw.replace(/[.,;:]+$/,"");
    if(start>cursor)parts.push(content.slice(cursor,start));
    parts.push(<a className="inline-source-link" href={url} target="_blank" rel="noreferrer" key={`${start}-${url}`}>{shortLinkLabel(url)} ↗</a>);
    if(raw.length>url.length)parts.push(raw.slice(url.length));
    cursor=start+raw.length;
  }
  if(cursor<content.length)parts.push(content.slice(cursor));
  return parts;
}

const flowOrder: Partial<Record<RecordType, number>> = {
  paper: 0, claim: 1, idea: 2, hypothesis: 3, experiment: 4, result: 5, model: 2,
};
const flowLabels = ["Papers", "Claims", "Ideas", "Hypotheses", "Experiments", "Results"];
const topicLabels = ["Ancestry", "Lipid biology", "Trafficking", "Tau", "Regulation", "Other"];

function recordTopic(record: ResearchRecord) {
  const text = `${record.title} ${record.summary} ${record.body}`.toLowerCase();
  if (/\b(tau|ptau|at8|at100|bin1|picalm)\b/.test(text)) return "Tau";
  if (/\b(endosom|traffick|nhe6|cargo|vesicle|lysosom)\w*/.test(text)) return "Trafficking";
  if (/\b(lipid|abca7|apoc1|cholesterol|ldam|droplet)\w*/.test(text)) return "Lipid biology";
  if (/\b(ancestr|population|african|european|admix)\w*/.test(text)) return "Ancestry";
  if (/\b(regulat|expression|eqlt|eqtl|variant|haplotype|tomm40|rs10423769|vntr)\w*/.test(text)) return "Regulation";
  return "Other";
}

function layoutPositions(records: ResearchRecord[], mode: GraphMode) {
  const positions = new Map<string,{x:number;y:number}>();
  if (mode === "free") {
    for (const record of records) positions.set(record.id,{x:record.x,y:record.y});
    return positions;
  }
  if (mode === "flow") {
    const lanes = new Map<RecordType,ResearchRecord[]>();
    for (const type of recordTypes) lanes.set(type,records.filter(r=>r.type===type).sort((a,b)=>a.id.localeCompare(b.id)));
    for (const type of recordTypes) {
      const items=lanes.get(type)||[];
      items.forEach((record,index)=>{
        const column=flowOrder[type]??2;
        positions.set(record.id,type==="model"
          ? {x:1050+index*500,y:95}
          : {x:260+column*350,y:240+index*165});
      });
    }
    return positions;
  }
  const grouped = new Map<string,ResearchRecord[]>();
  for (const label of topicLabels) grouped.set(label,[]);
  for (const record of records) grouped.get(recordTopic(record))?.push(record);
  topicLabels.forEach((label,column)=>{
    (grouped.get(label)||[]).sort((a,b)=>a.id.localeCompare(b.id)).forEach((record,index)=>{
      positions.set(record.id,{x:260+column*350,y:240+index*165});
    });
  });
  return positions;
}

const reviewLaneInfo: Record<ReviewLane,{label:string;description:string}> = {
  blocked:{label:"Resolve blockers",description:"A missing source, prerequisite, or definition prevents safe progress."},
  verify:{label:"Verify evidence",description:"The source or claim needs deeper human evidence review."},
  decide:{label:"Make a decision",description:"The record is ready for prioritization, scoping, or approval."},
  analyze:{label:"Analyze results",description:"Data or observations need quantification and interpretation."},
};

function reviewMeta(record: ResearchRecord): ReviewMeta | null {
  const status=record.status.toLowerCase();
  if(/blocked-by-source|source-required|citation-needed|source-and-scope-needed/.test(status)){
    return {lane:"blocked",priority:"high",reason:"A primary source or exact scope is missing.",action:"Resolve the citation and verify the biological premise.",exit:"Replace the blocked/source-needed status after documenting the verified source and scope."};
  }
  if(status==="gated"){
    return {lane:"blocked",priority:"medium",reason:"A prerequisite must pass before this experiment should advance.",action:"Review the stated gate and record whether it passed, failed, or remains pending.",exit:"Change the status only after the prerequisite decision is documented."};
  }
  if(record.type==="result"&&/awaiting-data/.test(status)){
    return {lane:"analyze",priority:"high",reason:"The experiment is referenced, but its data have not been entered.",action:"Attach the result summary, analysis, controls, and data location.",exit:"Move to a result-specific reviewed status after the data are examined."};
  }
  if(record.type==="result"&&/preliminary/.test(status)){
    return {lane:"analyze",priority:"high",reason:"The observation has not been quantified or assigned a defensible interpretation.",action:"Quantify the observation, check controls, and record alternative explanations.",exit:"Update the status after human review; do not convert an observation directly into a claim."};
  }
  if(record.type==="paper"&&/to-verify|secondary-source/.test(status)){
    return {lane:"verify",priority:"high",reason:status.includes("secondary")?"Only a secondary source is recorded.":"The paper identity or source details still require verification.",action:"Open the source links and confirm citation, cohort, methods, and exact finding.",exit:"Use reviewed-abstract or reviewed only after the corresponding review depth is complete."};
  }
  if(record.type==="paper"&&status==="reviewed-abstract"){
    return {lane:"verify",priority:"medium",reason:"Only the abstract-level evidence has been reviewed.",action:"Review the full text, especially methods, figures, sample structure, statistics, and limitations.",exit:"Move to reviewed only after full-text human review."};
  }
  if(record.type==="claim"&&status==="contested"){
    return {lane:"verify",priority:"high",reason:"Credible supporting and contradicting evidence must be reconciled within a defined scope.",action:"Compare the conflicting evidence and narrow the claim if necessary.",exit:"Keep contested, or move to supported/refuted only after documented human review."};
  }
  if(record.type==="claim"&&status==="provisional"){
    return {lane:"verify",priority:"medium",reason:"The claim is structured, but source verification is incomplete.",action:"Review each supporting source and add contradicting evidence or scope limits.",exit:"A human may retain provisional or assign another governed claim status."};
  }
  if(record.type==="idea"){
    const disposition=scalarField(record.fields,"disposition","active");
    const maturity=scalarField(record.fields,"maturity","captured");
    const blockers=Array.isArray(record.fields.blockers)?record.fields.blockers.map(String).filter(Boolean):[];
    const decisionNeeded=scalarField(record.fields,"decision_needed");
    if(disposition!=="active")return null;
    if(blockers.length){
      return {lane:"blocked",priority:"high",reason:`The idea is blocked by ${blockers.join(", ")}.`,action:scalarField(record.fields,"next_action","Resolve the recorded blockers and document the outcome."),exit:"Remove resolved blockers, then advance maturity or set disposition to parked, rejected, or merged."};
    }
    if(decisionNeeded||["captured","shaped","evidence-seeking","testable","prioritized"].includes(maturity)){
      const high=["testable","prioritized"].includes(maturity);
      return {lane:"decide",priority:high?"high":"medium",reason:decisionNeeded||`The idea is ${maturity} and still needs a human disposition or promotion decision.`,action:scalarField(record.fields,"next_action","Choose a cheap first test, advance maturity, or park or reject the idea."),exit:"Record the decision, then advance maturity or set disposition to parked, rejected, or merged."};
    }
  }
  if(record.type==="hypothesis"&&/prioritized|candidate|exploratory|idea/.test(status)){
    const high=status==="prioritized";
    return {lane:"decide",priority:high?"high":"medium",reason:high?"The hypothesis is prioritized but its next test still needs approval.":"The hypothesis needs prioritization and a falsifiable first test.",action:high?"Approve the first experiment, controls, and stop rule.":"Define predictions, falsification criteria, and the cheapest discriminating test.",exit:"Move to prioritized or testing when approved, or retire it after documenting the decision."};
  }
  if(record.type==="experiment"&&/near-term|design|concept/.test(status)){
    const high=status==="near-term";
    return {lane:"decide",priority:high?"high":"medium",reason:high?"A near-term experiment needs a readiness decision.":"The experimental concept or design is not yet locked.",action:high?"Confirm materials, controls, sample structure, analysis plan, and stop conditions.":"Complete the design and decide whether it should advance.",exit:"Move to ready, active, parked, or retired after the decision is recorded."};
  }
  return null;
}

export default function ResearchOS() {
  const [initialLink] = useState(initialWorkspaceLink);
  const [view, setView] = useState("Graph");
  const [themePreference,setThemePreference]=useState<ThemePreference>(()=>{
    if(typeof window==="undefined")return "system";
    const saved=window.localStorage.getItem("research-os-theme");
    return saved==="light"||saved==="dark"||saved==="system"?saved:"system";
  });
  const [accessibility,setAccessibility]=useState<AccessibilityPreferences>(storedAccessibility);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [tutorialNonce,setTutorialNonce]=useState(0);
  const [assistantOpen,setAssistantOpen]=useState(false);
  const [guidedPresentation,setGuidedPresentation]=useState<GuidedPresentation|null>(null);
  const [records, setRecords] = useState<ResearchRecord[]>(starter);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [hiddenProjects,setHiddenProjects]=useState<ProjectInfo[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [showProjectCreate, setShowProjectCreate] = useState(false);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState("");
  const [projectRegistryError, setProjectRegistryError] = useState("");
  const [projectRegistryNonce,setProjectRegistryNonce]=useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [saveConflict, setSaveConflict] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen,setSearchOpen]=useState(false);
  const [searchIndex,setSearchIndex]=useState(0);
  const searchInputRef=useRef<HTMLInputElement>(null);
  const projectSwitcherRef=useRef<HTMLDivElement>(null);
  const typeFilterRef=useRef<HTMLDetailsElement>(null);
  const pulseMoreRef=useRef<HTMLDetailsElement>(null);
  const [libraryLens,setLibraryLens]=useState<LibraryLens>("all");
  const [connected, setConnected] = useState(false);
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);
  const [locationReady,setLocationReady]=useState(false);
  const [diagnostics,setDiagnostics]=useState<ProjectDiagnostics>({sourceFileCount:0,indexedRecordCount:0,skippedFileCount:0,schemaErrorCount:0,schemaWarningCount:0,relationshipErrorCount:0,relationshipWarningCount:0,duplicateIdCount:0,missingTargetCount:0,issues:[]});
  const [aiContext,setAiContext]=useState<AiContextStatus>({generatedAt:"",sourceCount:0,edgeCount:0,current:false});
  const [aiSyncing,setAiSyncing]=useState(false);
  const [aiSyncError,setAiSyncError]=useState("");
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [transform, setTransform] = useState({x: 20, y: 10, scale: .43});
  const [graphMode, setGraphMode] = useState<GraphMode>("flow");
  const [graphEditing,setGraphEditing]=useState(false);
  const [edgeScope, setEdgeScope] = useState<EdgeScope>("focus");
  const [hideUnresolved, setHideUnresolved] = useState(false);
  const [positionSaveState, setPositionSaveState] = useState<"ready"|"saving"|"saved"|"failed">("ready");
  const [hiddenTypes, setHiddenTypes] = useState<Set<RecordType>>(
    new Set(recordTypes.filter(type=>!graphDefaultTypes.includes(type))),
  );
  const [connectionSource, setConnectionSource] = useState<string | null>(null);
  const [relationType, setRelationType] = useState("related");
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<RecordType>("idea");
  const [editing, setEditing] = useState(false);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [reviewLane, setReviewLane] = useState<ReviewLane | "all">("all");
  const [reviewPriority, setReviewPriority] = useState<ReviewPriority | "all">("all");
  const [draftBody, setDraftBody] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSummary,setDraftSummary]=useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [draftIdeaMaturity,setDraftIdeaMaturity]=useState("captured");
  const [draftIdeaDisposition,setDraftIdeaDisposition]=useState("active");
  const [draftIdeaPriority,setDraftIdeaPriority]=useState("unrated");
  const [draftEvidenceStrength,setDraftEvidenceStrength]=useState("none");
  const [draftFeasibility,setDraftFeasibility]=useState("unknown");
  const [draftDecisionNeeded,setDraftDecisionNeeded]=useState("");
  const [draftNextAction,setDraftNextAction]=useState("");
  const [draftBlockers,setDraftBlockers]=useState("");
  const [draftHumanReviewed,setDraftHumanReviewed]=useState(false);
  const [draftReviewedBy,setDraftReviewedBy]=useState("");
  const [draftReviewedAt,setDraftReviewedAt]=useState("");
  const [draftEvidenceAnchors,setDraftEvidenceAnchors]=useState("");
  const viewportRef = useRef<HTMLDivElement>(null);
  const libraryMainRef = useRef<HTMLElement>(null);
  const activePointers = useRef<Map<number,{x:number;y:number}>>(new Map());
  const gesture = useRef<{
    kind:"pan"|"node"|"pinch"; id?:string; sx:number; sy:number; ox:number; oy:number;
    lx?:number; ly?:number; startDistance?:number; startScale?:number; worldX?:number; worldY?:number;
  } | null>(null);
  const zoomGraphAtPoint=useCallback((clientX:number,clientY:number,deltaY:number,deltaMode:number,trackpadPinch:boolean)=>{
    const rect=viewportRef.current?.getBoundingClientRect(); if(!rect)return;
    const px=clientX-rect.left, py=clientY-rect.top;
    const pixels=deltaMode===1?deltaY*16:deltaMode===2?deltaY*rect.height:deltaY;
    const bounded=Math.max(-120,Math.min(120,pixels));
    const speed=trackpadPinch?.014:.0022;
    setTransform(t=>{
      const next=Math.min(1.5,Math.max(.18,t.scale*Math.exp(-bounded*speed)));
      return {scale:next,x:px-(px-t.x)*(next/t.scale),y:py-(py-t.y)*(next/t.scale)};
    });
  },[]);

  useEffect(()=>{
    if(view!=="Graph")return;
    const viewport=viewportRef.current;
    if(!viewport)return;
    const handleWheel=(event:WheelEvent)=>{
      event.preventDefault();
      zoomGraphAtPoint(event.clientX,event.clientY,event.deltaY,event.deltaMode,event.ctrlKey);
    };
    viewport.addEventListener("wheel",handleWheel,{passive:false});
    return()=>viewport.removeEventListener("wheel",handleWheel);
  },[view,zoomGraphAtPoint]);
  const fitGraphSource = useCallback((source:ResearchRecord[],mode:GraphMode,layoutSource=source)=>{
    const rect=viewportRef.current?.getBoundingClientRect(); if(!rect||!source.length)return;
    const positions=layoutPositions(layoutSource,mode);
    const xs=source.map(record=>positions.get(record.id)?.x||record.x), ys=source.map(record=>positions.get(record.id)?.y||record.y);
    const minX=Math.min(...xs)-220,maxX=Math.max(...xs)+220,minY=Math.min(...ys)-160,maxY=Math.max(...ys)+160;
    const scale=Math.min(1,Math.max(.18,Math.min(rect.width/(maxX-minX),rect.height/(maxY-minY))));
    setTransform({scale,x:(rect.width-(minX+maxX)*scale)/2,y:(rect.height-(minY+maxY)*scale)/2});
  },[]);
  const centerGraphSource = useCallback((source:ResearchRecord[],id:string,mode:GraphMode,scale=.72)=>{
    const rect=viewportRef.current?.getBoundingClientRect(); if(!rect||!source.length)return;
    const point=layoutPositions(source,mode).get(id); if(!point)return;
    setTransform({scale,x:rect.width/2-point.x*scale,y:rect.height/2-point.y*scale});
  },[]);

  const requestedSelection=records.find(record=>record.id===selectedId);
  const selected = libraryViews.includes(view)&&(!requestedSelection||!matchesLibraryLens(requestedSelection,libraryLens,records)||!matchesRecordSearch(requestedSelection,query)||(viewTypes[view]?.length&&!viewTypes[view]?.includes(requestedSelection.type)))
    ? records.find(record=>(!viewTypes[view]||viewTypes[view]?.includes(record.type))&&matchesLibraryLens(record,libraryLens,records)&&matchesRecordSearch(record,query))
    : requestedSelection||records[0];
  const activeProject=projects.find(project=>project.id===activeProjectId);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects",{cache:"no-store"})
      .then(response=>response.ok?response.json() as Promise<{projects:ProjectInfo[];hiddenProjects?:ProjectInfo[]}>:Promise.reject(new Error("Project registry unavailable")))
      .then(payload=>{
        if(cancelled)return;
        setProjectRegistryError("");
        setProjects(payload.projects);
        setHiddenProjects(payload.hiddenProjects||[]);
        const remembered=window.localStorage.getItem("research-os-active-project");
        if(initialLink.project&&payload.projects.some(project=>project.id===initialLink.project)){
          setProjectLoading(true);
          setSnapshotLoaded(false);
          setActiveProjectId(initialLink.project);
        }else if(remembered&&payload.projects.some(project=>project.id===remembered)){
          setProjectLoading(true);
          setSnapshotLoaded(false);
          setActiveProjectId(remembered);
        }else if(!payload.projects.some(project=>project.id===activeProjectId)&&payload.projects[0]){
          setProjectLoading(true);
          setSnapshotLoaded(false);
          setActiveProjectId(payload.projects[0].id);
          window.localStorage.setItem("research-os-active-project",payload.projects[0].id);
        }
      })
      .catch(error=>{if(!cancelled)setProjectRegistryError(error instanceof Error?error.message:"Project registry unavailable");});
    return()=>{cancelled=true;};
  },[activeProjectId,projectRegistryNonce,initialLink.project]);

  useEffect(()=>{
    let cancelled=false;
    queueMicrotask(()=>{
      if(cancelled)return;
      setSidebarCollapsed(window.localStorage.getItem("research-os-sidebar-collapsed")==="1");
    });
    return()=>{cancelled=true;};
  },[]);

  useEffect(()=>{
    const media=window.matchMedia("(prefers-color-scheme: dark)");
    const apply=()=>{
      const resolved=themePreference==="system"?(media.matches?"dark":"light"):themePreference;
      document.documentElement.dataset.theme=resolved;
      document.documentElement.style.colorScheme=resolved;
    };
    apply();
    media.addEventListener("change",apply);
    return()=>media.removeEventListener("change",apply);
  },[themePreference]);

  function changeTheme(value:ThemePreference){
    setThemePreference(value);
    window.localStorage.setItem("research-os-theme",value);
  }

  useEffect(()=>{
    const root=document.documentElement;
    root.dataset.readingMode=accessibility.dyslexia?"hyperlegible":"standard";
    root.dataset.fontSize=accessibility.largeText?"large":"standard";
    root.dataset.contrast=accessibility.highContrast?"high":"standard";
    root.dataset.motion=accessibility.reducedMotion?"reduced":"standard";
    window.localStorage.setItem("research-os-accessibility",JSON.stringify(accessibility));
  },[accessibility]);
  function setAccessibilityOption(option:keyof AccessibilityPreferences,value:boolean){
    setAccessibility(current=>({...current,[option]:value}));
  }

  useEffect(() => {
    let cancelled = false;
    if(!activeProjectId){
      return()=>{cancelled=true;};
    }
    fetch(`/api/project-snapshot?id=${encodeURIComponent(activeProjectId)}`, {cache:"no-store"})
      .then(response => response.ok ? response.json() as Promise<{records:Array<{fileName:string;relativePath?:string;raw:string;revision:string}>;aiContext?:AiContextStatus;diagnostics?:ProjectDiagnostics}> : Promise.reject(new Error("Project snapshot unavailable")))
      .then(payload => {
        if (cancelled) return;
        const parsed = payload.records.map(item=>parseRecord(item.raw,item.fileName,undefined,item.relativePath,item.revision)).filter(Boolean) as ResearchRecord[];
        setDiagnostics(payload.diagnostics||{sourceFileCount:payload.records.length,indexedRecordCount:parsed.length,skippedFileCount:payload.records.length-parsed.length,schemaErrorCount:0,schemaWarningCount:0,relationshipErrorCount:0,relationshipWarningCount:0,duplicateIdCount:0,missingTargetCount:0,issues:[]});
        setRecords(parsed);
        setAiContext(payload.aiContext||{generatedAt:"",sourceCount:0,edgeCount:0,current:false});
        const initialGraphRecords=parsed.filter(record=>graphDefaultTypes.includes(record.type));
        const linkedRecord=(!initialLink.project||initialLink.project===activeProjectId)&&initialLink.record
          ? parsed.find(record=>record.id===initialLink.record)
          : undefined;
        const initial=linkedRecord||preferredGraphRecord(initialGraphRecords)||preferredGraphRecord(parsed);
        setSelectedId(initial?.id||"");
        setSaveConflict("");
        setSnapshotLoaded(true);
        setProjectError("");
        setProjectLoading(false);
        if(initial)requestAnimationFrame(()=>centerGraphSource(initialGraphRecords.length?initialGraphRecords:parsed,initial.id,"flow"));
      })
      .catch(error=>{
        if(cancelled)return;
        setSnapshotLoaded(false);
        setProjectLoading(false);
        setProjectError(error instanceof Error?error.message:"Project snapshot unavailable");
      });
    return ()=>{cancelled=true;};
    // Framing intentionally runs after the requested snapshot replaces the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId,refreshNonce]);

  useEffect(() => {
    let cancelled=false;
    queueMicrotask(()=>{
      if(cancelled)return;
      setDraftBody(selected?.body || "");
      setDraftTitle(selected?.title || "");
      setDraftSummary(selected?.summary||"");
      setDraftStatus(selected?.status || "");
      setDraftIdeaMaturity(selected?scalarField(selected.fields,"maturity","captured"):"captured");
      setDraftIdeaDisposition(selected?scalarField(selected.fields,"disposition","active"):"active");
      setDraftIdeaPriority(selected?scalarField(selected.fields,"priority","unrated"):"unrated");
      setDraftEvidenceStrength(selected?scalarField(selected.fields,"evidence_strength","none"):"none");
      setDraftFeasibility(selected?scalarField(selected.fields,"feasibility","unknown"):"unknown");
      setDraftDecisionNeeded(selected?scalarField(selected.fields,"decision_needed"):"");
      setDraftNextAction(selected?scalarField(selected.fields,"next_action"):"");
      const blockers=selected?.fields.blockers;
      setDraftBlockers(Array.isArray(blockers)?blockers.join(", "):scalarField(selected?.fields||{},"blockers"));
      setDraftHumanReviewed(selected?.fields.human_reviewed===true);
      setDraftReviewedBy(selected?scalarField(selected.fields,"reviewed_by"):"");
      setDraftReviewedAt(selected?scalarField(selected.fields,"reviewed_at"):"");
      const anchors=selected?.fields.evidence_anchors;
      setDraftEvidenceAnchors(Array.isArray(anchors)?anchors.join(", "):scalarField(selected?.fields||{},"evidence_anchors"));
      setEditing(false);
    });
    return()=>{cancelled=true;};
  }, [selected]);

  useEffect(()=>{
    if(!detailExpanded)return;
    const collapse=(event:KeyboardEvent)=>{if(event.key==="Escape")setDetailExpanded(false);};
    window.addEventListener("keydown",collapse);
    return()=>window.removeEventListener("keydown",collapse);
  },[detailExpanded]);

  useEffect(()=>{
    libraryMainRef.current?.scrollTo({top:0,left:0});
  },[view,activeProjectId]);

  useEffect(()=>{
    let cancelled=false;
    const applyLocation=()=>{
      const link=parseWorkspaceLink(window.location.search);
      if(link.project)setActiveProjectId(link.project);
      if(link.view)setView(workspaceViewNames[link.view]);
      if(link.record)setSelectedId(link.record);
      if(link.scope)setEdgeScope(link.scope==="2-hop"?"neighborhood":link.scope==="all"?"all":"focus");
      setDetailExpanded(Boolean(link.expanded));
    };
    window.addEventListener("popstate",applyLocation);
    queueMicrotask(()=>{
      if(cancelled)return;
      applyLocation();
      setLocationReady(true);
    });
    return()=>{
      cancelled=true;
      window.removeEventListener("popstate",applyLocation);
    };
  },[]);

  useEffect(()=>{
    if(!snapshotLoaded||!locationReady)return;
    const next=buildWorkspaceUrl(window.location.href,{
      project:activeProjectId,
      view:workspaceViewSlugsByName[view]||"map",
      ...(selectedId?{record:selectedId}:{}),
      ...(view==="Graph"?{scope:edgeScope==="neighborhood"?"2-hop":edgeScope==="all"?"all":"direct"}:{}),
      ...(detailExpanded?{expanded:true}:{}),
    });
    if(next!==window.location.href)window.history.replaceState(window.history.state,"",next);
  },[activeProjectId,detailExpanded,edgeScope,locationReady,selectedId,snapshotLoaded,view]);

  useEffect(()=>{
    const focusSearch=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){
        event.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="j"){
        event.preventDefault();
        setAssistantOpen(open=>!open);
      }
      if(event.key==="Escape"&&document.activeElement===searchInputRef.current){
        setQuery("");
        setSearchOpen(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown",focusSearch);
    return()=>window.removeEventListener("keydown",focusSearch);
  },[]);

  useEffect(()=>{
    const closeTransientMenus=(event:PointerEvent)=>{
      const target=event.target as Node;
      if(!projectSwitcherRef.current?.contains(target))setProjectMenuOpen(false);
      if(!typeFilterRef.current?.contains(target))typeFilterRef.current?.removeAttribute("open");
      if(!pulseMoreRef.current?.contains(target))pulseMoreRef.current?.removeAttribute("open");
    };
    const closeOnEscape=(event:KeyboardEvent)=>{
      if(event.key!=="Escape")return;
      setProjectMenuOpen(false);
      typeFilterRef.current?.removeAttribute("open");
      pulseMoreRef.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown",closeTransientMenus);
    document.addEventListener("keydown",closeOnEscape);
    return()=>{
      document.removeEventListener("pointerdown",closeTransientMenus);
      document.removeEventListener("keydown",closeOnEscape);
    };
  },[]);

  const reviewEntries = useMemo(()=>records.map(record=>({record,meta:reviewMeta(record)}))
    .filter((entry):entry is {record:ResearchRecord;meta:ReviewMeta}=>Boolean(entry.meta)),[records]);

  const filtered = useMemo(() => {
    const types = viewTypes[view];
    return records.filter(r => {
      if (types && !types.includes(r.type)) return false;
      if(libraryViews.includes(view)&&!matchesLibraryLens(r,libraryLens,records))return false;
      if (view === "Review Queue") {
        const meta=reviewMeta(r);
        if(!meta)return false;
        if(reviewLane!=="all"&&meta.lane!==reviewLane)return false;
        if(reviewPriority!=="all"&&meta.priority!==reviewPriority)return false;
      }
      return matchesRecordSearch(r,query);
    });
  }, [records, view, query, reviewLane, reviewPriority,libraryLens]);
  const visibleSelected=filtered.find(record=>record.id===selectedId)||filtered[0];
  const searchResults=useMemo(()=>query.trim()?records.map(record=>({record,score:scoreRecordSearch(record,query)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.record.id.localeCompare(b.record.id)).slice(0,8).map(item=>item.record):[],[records,query]);
  const libraryLensCounts=useMemo(()=>Object.fromEntries(libraryLenses.map(lens=>[
    lens.value,records.filter(record=>{
      const types=viewTypes[view];
      return (!types||types.includes(record.type))&&matchesLibraryLens(record,lens.value,records);
    }).length,
  ])) as Record<LibraryLens,number>,[records,view]);

  const graphRecords = filtered.filter(r => !hiddenTypes.has(r.type) && (!hideUnresolved || !/(needed|verify|pending|blocked|source|citation)/i.test(r.status)));
  const graphEdges = useMemo(()=>graphRecords.flatMap(source=>source.relations.map(relation=>({
    source:source.id,target:relation.target,type:relation.type,
  }))).filter(edge=>graphRecords.some(record=>record.id===edge.target)),[graphRecords]);
  // These are intentionally derived from the existing Markdown records. They are
  // navigation cues, not scientific scores or a second source of truth.
  const researchPulse = (()=>{
    const activeIdeas=records.filter(record=>record.type==="idea"&&scalarField(record.fields,"disposition","active")==="active");
    const uncertainClaims=records.filter(record=>record.type==="claim"&&/(provisional|contested|needs|verify|pending)/i.test(`${record.status} ${record.confidence}`));
    const activeExperiments=records.filter(record=>record.type==="experiment"&&!/(complete|parked|retired)/i.test(record.status));
    return [
      {key:"review",label:"Review now",count:reviewEntries.length,detail:"records with a defined review action",accent:"amber",action:()=>changeView("Review Queue")},
      {key:"claims",label:"Open claims",count:uncertainClaims.length,detail:"claims still needing resolution",accent:"lime",action:()=>{setSelectedId(uncertainClaims[0]?.id||"");changeView("Knowledge")}},
      {key:"ideas",label:"Active ideas",count:activeIdeas.length,detail:"ideas available for development",accent:"violet",action:()=>{setSelectedId(activeIdeas[0]?.id||"");changeView("Ideas")}},
      {key:"experiments",label:"Live experiments",count:activeExperiments.length,detail:"proposed or in-progress work",accent:"teal",action:()=>{setSelectedId(activeExperiments[0]?.id||"");changeView("Experiments")}},
    ];
  })();
  const focusNodeIds = useMemo(()=>{
    if(guidedPresentation)return new Set(guidedPresentation.steps.map(step=>step.id));
    if(edgeScope==="all") return new Set(graphRecords.map(record=>record.id));
    return graphNeighborhoodIds(graphRecords,selectedId,edgeScope==="neighborhood"?2:1);
  },[edgeScope,graphRecords,selectedId,guidedPresentation]);
  const visibleEdges = graphEdges.filter(edge=>{
    if(edgeScope==="all")return true;
    if(edgeScope==="focus")return edge.source===selectedId||edge.target===selectedId;
    return focusNodeIds.has(edge.source)&&focusNodeIds.has(edge.target);
  });
  // Scope changes emphasis, not whether the rest of the project disappears.
  // Keeping dimmed nodes on the map preserves orientation and lets a researcher
  // follow a different path with one click.
  const focusedGraphRecords = graphRecords;
  const displayPositions = useMemo(()=>layoutPositions(graphRecords,graphMode),[graphRecords,graphMode]);
  const activePresentationStep=guidedPresentation?.steps[guidedPresentation.index];

  useEffect(()=>{
    if(!activePresentationStep)return;
    let cancelled=false;
    queueMicrotask(()=>{
      if(cancelled)return;
      setSelectedId(activePresentationStep.id);
      const point=displayPositions.get(activePresentationStep.id);
      const rect=viewportRef.current?.getBoundingClientRect();
      if(point&&rect){
        const scale=.78;
        setTransform({scale,x:rect.width/2-point.x*scale,y:rect.height/2-point.y*scale});
      }
    });
    return()=>{cancelled=true;};
  },[activePresentationStep,displayPositions]);

  useEffect(()=>{
    if(!guidedPresentation?.playing||guidedPresentation.index>=guidedPresentation.steps.length-1)return;
    const timer=window.setTimeout(()=>setGuidedPresentation(current=>current?{...current,index:Math.min(current.steps.length-1,current.index+1)}:current),4_500);
    return()=>window.clearTimeout(timer);
  },[guidedPresentation]);

  function switchProject(projectId:string){
    if(projectId===activeProjectId){setProjectMenuOpen(false);return;}
    setRootHandle(null);
    setConnected(false);
    setRecords([]);
    setSelectedId("");
    setQuery("");
    setSearchOpen(false);
    setLibraryLens("all");
    setView("Graph");
    setProjectLoading(true);
    setProjectError("");
    setSnapshotLoaded(false);
    setActiveProjectId(projectId);
    setProjectMenuOpen(false);
    window.localStorage.setItem("research-os-active-project",projectId);
  }

  async function createProject(form:FormData){
    const name=String(form.get("name")||"").trim();
    const description=String(form.get("description")||"").trim();
    const response=await fetch("/api/projects",{
      method:"POST",headers:await localWriteHeaders(),body:JSON.stringify({name,description}),
    });
    const payload=await response.json() as {project?:ProjectInfo;error?:string};
    if(!response.ok||!payload.project){alert(payload.error||"Could not create project.");return;}
    setProjects(previous=>[...previous,payload.project as ProjectInfo]);
    setShowProjectCreate(false);
    switchProject(payload.project.id);
  }

  function toggleSidebar(){
    setSidebarCollapsed(current=>{
      const next=!current;
      window.localStorage.setItem("research-os-sidebar-collapsed",next?"1":"0");
      return next;
    });
  }

  async function changeProjectVisibility(project:ProjectInfo,action:"hide"|"restore"){
    if(action==="hide"&&!window.confirm(`Remove "${project.name}" from Research OS?\n\nIts vault and every file will stay on disk. You can re-add it from the project menu.`))return;
    const response=await fetch("/api/projects",{
      method:"PATCH",headers:await localWriteHeaders(),body:JSON.stringify({id:project.id,action}),
    });
    const payload=await response.json() as {project?:ProjectInfo;error?:string};
    if(!response.ok||!payload.project){alert(payload.error||"Could not update the project list.");return;}
    if(action==="hide"){
      const remaining=projects.filter(item=>item.id!==project.id);
      setProjects(remaining);
      setHiddenProjects(previous=>[...previous.filter(item=>item.id!==project.id),payload.project as ProjectInfo]);
      if(project.id===activeProjectId&&remaining[0])switchProject(remaining[0].id);
    }else{
      setHiddenProjects(previous=>previous.filter(item=>item.id!==project.id));
      setProjects(previous=>[...previous.filter(item=>item.id!==project.id),payload.project as ProjectInfo]);
    }
  }

  async function connectVault() {
    if (!("showDirectoryPicker" in window)) return alert("Folder access requires Chrome or Edge.");
    const root = await window.showDirectoryPicker({mode:"readwrite"});
    const found: ResearchRecord[] = [];
    async function walk(dir: FileSystemDirectoryHandle, parentPath="") {
      for await (const [name, handle] of dir.entries()) {
        const relativePath=parentPath?`${parentPath}/${name}`:name;
        if (handle.kind === "directory" && name !== "99 Templates") await walk(handle as FileSystemDirectoryHandle,relativePath);
        else if (handle.kind === "file" && handle.name.endsWith(".md")) {
          const fileHandle=handle as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          const raw=await file.text();
          const parsed = parseRecord(raw, fileHandle.name, fileHandle,relativePath,await browserContentRevision(raw));
          if (parsed) found.push(parsed);
        }
      }
    }
    await walk(root);
    setRootHandle(root);
    setConnected(true);
    setSaveConflict("");
    if (found.length) {
      setRecords(found);
      const initial=preferredGraphRecord(found);
      setSelectedId(initial?.id||"");
      setView("Graph");
      if(initial)requestAnimationFrame(()=>fitGraph(found));
    }
  }

  function savedRecord(record:ResearchRecord,saved:SaveResult) {
    return parseRecord(
      saved.raw,
      record.fileName||`${record.id}.md`,
      record.handle,
      record.relativePath,
      saved.revision,
    );
  }

  function reportSaveFailure(error:unknown) {
    if(error instanceof SaveConflictError){
      setSaveConflict("This record changed outside the browser. Your edit was not written. Refresh the project to review the newer file before trying again.");
      return;
    }
    setSaveConflict(error instanceof Error?error.message:"The record could not be saved.");
  }

  async function writeRecord(record: ResearchRecord, raw: string):Promise<SaveResult> {
    if (record.handle) {
      const current=await record.handle.getFile();
      const currentRaw=await current.text();
      if((await browserContentRevision(currentRaw))!==record.revision)throw new SaveConflictError();
      const writable = await record.handle.createWritable();
      await writable.write(raw);
      await writable.close();
      return {raw,revision:await browserContentRevision(raw)};
    }
    if(!record.relativePath)throw new Error("This record has no local file path.");
    const response=await fetch("/api/project-record",{
      method:"POST",headers:await localWriteHeaders(),
      body:JSON.stringify({projectId:activeProjectId,relativePath:record.relativePath,raw,baseRevision:record.revision}),
    });
    const payload=await response.json() as {revision?:string;conflict?:boolean;error?:string};
    if(response.status===409||payload.conflict)throw new SaveConflictError();
    if(!response.ok||!payload.revision)throw new Error(payload.error||"The record could not be saved.");
    return {raw,revision:payload.revision};
  }

  async function persistPosition(id: string, x: number, y: number) {
    const record = records.find(r=>r.id===id);
    if (!record) return;
    const roundedX=Math.round(x), roundedY=Math.round(y);
    const raw = updateFrontmatter(record.raw, {canvas_x:roundedX, canvas_y:roundedY});
    setPositionSaveState("saving");
    try{
      let saved:SaveResult;
      if(record.handle){
        saved=await writeRecord(record,raw);
      }else if(record.relativePath){
        const response=await fetch("/api/vault-position",{
          method:"POST",headers:await localWriteHeaders(),
          body:JSON.stringify({projectId:activeProjectId,relativePath:record.relativePath,x:roundedX,y:roundedY,baseRevision:record.revision}),
        });
        const payload=await response.json() as {raw?:string;revision?:string;conflict?:boolean;error?:string};
        if(response.status===409||payload.conflict)throw new SaveConflictError();
        if(!response.ok||!payload.raw||!payload.revision)throw new Error(payload.error||"The position could not be saved.");
        saved={raw:payload.raw,revision:payload.revision};
      }else{
        throw new Error("This record has no local file path.");
      }
      const parsed=savedRecord(record,saved);
      if(parsed)setRecords(prev=>prev.map(r=>r.id===id?parsed:r));
      setAiContext(current=>({...current,current:false}));
      setSaveConflict("");
      setPositionSaveState("saved");
    }catch(error){
      reportSaveFailure(error);
      setPositionSaveState("failed");
    }
    window.setTimeout(()=>setPositionSaveState("ready"),3000);
  }

  async function persistRelations(sourceId: string, relations: Relation[]) {
    const source = records.find(r=>r.id===sourceId);
    if (!source) return;
    const body = writeConnections(source.body, relations);
    const raw = replaceBody(source.raw, body);
    try{
      const saved=await writeRecord(source,raw);
      const parsed=savedRecord(source,saved);
      if(parsed)setRecords(prev=>prev.map(r=>r.id===sourceId?parsed:r));
      setAiContext(current=>({...current,current:false}));
      setSaveConflict("");
    }catch(error){reportSaveFailure(error);}
  }

  async function addConnection(targetId: string) {
    if (!connectionSource || connectionSource === targetId) return;
    const source = records.find(r=>r.id===connectionSource);
    if (!source) return;
    const relations = [...source.relations.filter(r=>r.target!==targetId), {type:relationType,target:targetId}];
    await persistRelations(source.id, relations);
    setSelectedId(source.id);
    setConnectionSource(null);
  }

  async function saveDetails() {
    if (!selected) return;
    const fieldUpdates:Record<string,unknown>={title:draftTitle,status:draftStatus,summary:draftSummary,updated:new Date().toISOString().slice(0,10)};
    if(selected.type==="idea"){
      Object.assign(fieldUpdates,{
        maturity:draftIdeaMaturity,
        disposition:draftIdeaDisposition,
        priority:draftIdeaPriority,
        evidence_strength:draftEvidenceStrength,
        feasibility:draftFeasibility,
        decision_needed:draftDecisionNeeded,
        next_action:draftNextAction,
        blockers:draftBlockers.split(",").map(value=>value.trim()).filter(Boolean),
        updated:new Date().toISOString().slice(0,10),
      });
    }
    if(selected.type==="claim"){
      Object.assign(fieldUpdates,{
        human_reviewed:draftHumanReviewed,
        reviewed_by:draftReviewedBy,
        reviewed_at:draftReviewedAt,
        evidence_anchors:draftEvidenceAnchors.split(",").map(value=>value.trim()).filter(Boolean),
        updated:new Date().toISOString().slice(0,10),
      });
    }
    let raw = updateFrontmatter(selected.raw,fieldUpdates);
    raw = replaceBody(raw, draftBody);
    try{
      const saved=await writeRecord(selected,raw);
      const reparsed=savedRecord(selected,saved);
      if(!reparsed)return;
      setRecords(prev=>prev.map(r=>r.id===selected.id?reparsed:r));
      setAiContext(current=>({...current,current:false}));
      setSaveConflict("");
      setEditing(false);
    }catch(error){reportSaveFailure(error);}
  }

  async function savePaperReview(record:ResearchRecord,updates:Record<string,unknown>) {
    const raw=updateFrontmatter(record.raw,{
      ...updates,
      updated:new Date().toISOString().slice(0,10),
    });
    try{
      const saved=await writeRecord(record,raw);
      const reparsed=savedRecord(record,saved);
      if(!reparsed)return false;
      setRecords(previous=>previous.map(item=>item.id===record.id?reparsed:item));
      setAiContext(current=>({...current,current:false}));
      setSaveConflict("");
      return true;
    }catch(error){
      reportSaveFailure(error);
      return false;
    }
  }

  async function saveFigures(record:ResearchRecord,figures:FigureReference[]) {
    const raw=updateFrontmatter(record.raw,{
      figures:figures.map(({id,caption,alt,sourceUrl,locator,status,path,assetSha256,mimeType})=>({
        id,caption,alt,source_url:sourceUrl,locator,evidence_status:status,path,asset_sha256:assetSha256,mime_type:mimeType,
      })),
      updated:new Date().toISOString().slice(0,10),
    });
    try{
      const saved=await writeRecord(record,raw);
      const reparsed=savedRecord(record,saved);
      if(!reparsed)return false;
      setRecords(previous=>previous.map(item=>item.id===record.id?reparsed:item));
      setAiContext(current=>({...current,current:false}));
      setSaveConflict("");
      return true;
    }catch(error){
      reportSaveFailure(error);
      return false;
    }
  }

  async function createRecord(form: FormData) {
    const typeValue=String(form.get("type"));
    if(!isRecordType(typeValue))return;
    const type=typeValue;
    const title = String(form.get("title")).trim();
    const summary = String(form.get("summary")).trim();
    const id=nextRecordId(type,records.map(record=>record.id));
    const rect = viewportRef.current?.getBoundingClientRect();
    const x = ((rect?.width || 900)/2 - transform.x)/transform.scale;
    const y = ((rect?.height || 600)/2 - transform.y)/transform.scale;
    const raw=createRecordMarkdown(type,id,title,summary,{x,y});
    let handle: FileSystemFileHandle | undefined;
    const fileName = `${id} ${title.replace(/[<>:"/\\|?*]/g,"").slice(0,70)}.md`;
    const folderName=recordTypeConfig[type].folder;
    const relativePath=`${folderName}/${fileName}`;
    let revision="";
    if (rootHandle) {
      const folder = await rootHandle.getDirectoryHandle(folderName, {create:true});
      handle = await folder.getFileHandle(fileName, {create:true});
      const existing=await handle.getFile();
      if(existing.size>0){
        reportSaveFailure(new SaveConflictError());
        return;
      }
      const writable = await handle.createWritable(); await writable.write(raw); await writable.close();
      revision=await browserContentRevision(raw);
    } else {
      const response=await fetch("/api/project-record",{
        method:"POST",headers:await localWriteHeaders(),
        body:JSON.stringify({projectId:activeProjectId,relativePath,raw,baseRevision:null}),
      });
      const payload=await response.json() as {revision?:string;conflict?:boolean;error?:string};
      if(response.status===409||payload.conflict){reportSaveFailure(new SaveConflictError());return;}
      if(!response.ok||!payload.revision){reportSaveFailure(new Error(payload.error||"The record could not be saved to this project."));return;}
      revision=payload.revision;
    }
    const parsed = parseRecord(raw,fileName,handle,relativePath,revision);
    if (parsed) {
      setRecords(prev=>[...prev,parsed]);
      setAiContext(current=>({...current,current:false}));
      setProjects(prev=>prev.map(project=>project.id===activeProjectId?{...project,recordCount:project.recordCount+1}:project));
      setSelectedId(id); setView("Graph"); setShowCreate(false);
    }
  }

  function onPointerDown(e: React.PointerEvent, id?: string) {
    if (e.button !== 0) return;
    // Always capture on the shared viewport. Capturing on a node can strand a second
    // touch on a different element and prevent the two-pointer pinch gesture from forming.
    viewportRef.current?.setPointerCapture(e.pointerId);
    if (e.pointerType === "touch") {
      activePointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if (activePointers.current.size === 2) {
        const [a,b] = [...activePointers.current.values()];
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) return;
        const midX=(a.x+b.x)/2-rect.left, midY=(a.y+b.y)/2-rect.top;
        const distance=Math.hypot(a.x-b.x,a.y-b.y);
        gesture.current={
          kind:"pinch",sx:midX,sy:midY,ox:transform.x,oy:transform.y,
          startDistance:distance,startScale:transform.scale,
          worldX:(midX-transform.x)/transform.scale,worldY:(midY-transform.y)/transform.scale,
        };
        return;
      }
    }
    if (id) {
      if(graphMode!=="free"){setSelectedId(id);return;}
      const r=records.find(x=>x.id===id), point=displayPositions.get(id); if(!r||!point)return;
      gesture.current={kind:"node",id,sx:e.clientX,sy:e.clientY,ox:point.x,oy:point.y,lx:point.x,ly:point.y};
    } else gesture.current={kind:"pan",sx:e.clientX,sy:e.clientY,ox:transform.x,oy:transform.y};
  }
  function onPointerMove(e: React.PointerEvent) {
    const g=gesture.current; if(!g)return;
    if (e.pointerType === "touch") activePointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if (g.kind==="pinch" && activePointers.current.size>=2) {
      const [a,b]=[...activePointers.current.values()];
      const rect=viewportRef.current?.getBoundingClientRect(); if(!rect)return;
      const distance=Math.hypot(a.x-b.x,a.y-b.y);
      const next=Math.min(1.5,Math.max(.18,(g.startScale||transform.scale)*(distance/(g.startDistance||distance))));
      const midX=(a.x+b.x)/2-rect.left, midY=(a.y+b.y)/2-rect.top;
      setTransform({scale:next,x:midX-(g.worldX||0)*next,y:midY-(g.worldY||0)*next});
      return;
    }
    if(g.kind==="pan") setTransform(t=>({...t,x:g.ox+e.clientX-g.sx,y:g.oy+e.clientY-g.sy}));
    else if(g.id) {
      const nx=g.ox+(e.clientX-g.sx)/transform.scale, ny=g.oy+(e.clientY-g.sy)/transform.scale;
      g.lx=nx; g.ly=ny;
      setRecords(prev=>prev.map(r=>r.id===g.id?{...r,x:nx,y:ny}:r));
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    const g=gesture.current; gesture.current=null;
    activePointers.current.delete(e.pointerId);
    if(g?.kind==="node"&&g.id) void persistPosition(g.id,g.lx ?? g.ox,g.ly ?? g.oy);
  }
  function onCanvasKeyDown(e:React.KeyboardEvent<HTMLDivElement>){
    const pan=48;
    if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){
      e.preventDefault();
      setTransform(current=>({
        ...current,
        x:current.x+(e.key==="ArrowLeft"?pan:e.key==="ArrowRight"?-pan:0),
        y:current.y+(e.key==="ArrowUp"?pan:e.key==="ArrowDown"?-pan:0),
      }));
    }
    if(e.key==="0"){e.preventDefault();fitGraph();}
  }
  function nudgeSelectedNode(dx:number,dy:number){
    if(graphMode!=="free"||!selected)return;
    const nextX=Math.round(selected.x+dx),nextY=Math.round(selected.y+dy);
    setRecords(previous=>previous.map(record=>record.id===selected.id?{...record,x:nextX,y:nextY}:record));
    void persistPosition(selected.id,nextX,nextY);
  }
  function selectRecordForReading(id:string){
    setSelectedId(id);
    if(window.matchMedia("(max-width: 640px)").matches)setDetailExpanded(true);
  }
  function focusGraphRecord(id:string){selectRecordForReading(id);}
  function changeEdgeScope(scope:EdgeScope){
    setEdgeScope(scope);
  }
  function fitGraph(source?:ResearchRecord[], mode=graphMode) {
    if(!source&&edgeScope!=="all"&&selectedId){centerGraphSource(graphRecords,selectedId,mode,transform.scale);return;}
    const framed=source||graphRecords;
    fitGraphSource(framed.length?framed:graphRecords,mode,graphRecords);
  }
  function changeGraphMode(mode:GraphMode){
    if(mode==="free"){
      const flow=layoutPositions(records,"flow");
      setRecords(prev=>prev.map(record=>{
        const point=flow.get(record.id);
        return record.fields.canvas_x&&record.fields.canvas_y||!point?record:{...record,...point};
      }));
    }
    setGraphMode(mode);
    requestAnimationFrame(()=>fitGraph(graphRecords,mode));
  }
  function zoomBy(factor:number){setTransform(t=>({...t,scale:Math.min(1.5,Math.max(.18,t.scale*factor))}));}

  const attention = reviewEntries.length;
  const viewAccentKey = view.toLowerCase().replace(/\s+/g,"-");

  function changeView(nextView:string){
    if(nextView==="Graph"){
      const graphSelection=records.find(record=>record.id===selectedId&&graphDefaultTypes.includes(record.type))
        ||preferredGraphRecord(records.filter(record=>graphDefaultTypes.includes(record.type)));
      setSelectedId(graphSelection?.id||"");
    }
    setView(nextView);
    const types=viewTypes[nextView];
    if(types?.length&&(!selected||!types.includes(selected.type))){
      setSelectedId(records.find(record=>types.includes(record.type))?.id||"");
    }else if(nextView==="Review Queue"&&!reviewEntries.some(entry=>entry.record.id===selected?.id)){
      setSelectedId(reviewEntries[0]?.record.id||"");
    }
  }

  function retryProjectLoad(){
    setProjectLoading(true);
    setProjectError("");
    setSnapshotLoaded(false);
    setProjectRegistryNonce(value=>value+1);
    setRefreshNonce(value=>value+1);
  }

  function primaryNavActive(label:string){
    if(label==="Library")return libraryViews.includes(view);
    if(label==="Work")return workViews.includes(view);
    if(label==="Map")return view==="Graph";
    return view==="AI Workspace";
  }

  function openSearchRecord(record:ResearchRecord){
    const destination:Partial<Record<RecordType,string>>={
      paper:"Papers",idea:"Ideas",hypothesis:"Hypotheses",experiment:"Experiments",result:"Results",
    };
    setSelectedId(record.id);
    setView(destination[record.type]||"Knowledge");
    if(window.matchMedia("(max-width: 640px)").matches)setDetailExpanded(true);
    setQuery("");
    setSearchOpen(false);
  }

  function openAssistantRecord(id:string){
    const record=records.find(item=>item.id===id);
    if(record)openSearchRecord(record);
  }

  function presentAssistantAction(action:AssistantUiAction){
    if(action.type==="open_record"){openAssistantRecord(action.id);return;}
    if(action.type==="present_path"){
      const stepTypes=new Set(action.steps.map(step=>records.find(record=>record.id===step.id)?.type).filter(Boolean));
      setHiddenTypes(current=>new Set([...current].filter(type=>!stepTypes.has(type))));
      setQuery("");setGraphMode("flow");setEdgeScope("neighborhood");setView("Graph");setAssistantOpen(false);
      setGuidedPresentation({steps:action.steps,index:0,playing:true,reason:action.reason});
      return;
    }
    setGuidedPresentation(null);
    setSelectedId(action.focus_id);
    setEdgeScope(action.depth===2?"neighborhood":"focus");
    setView("Graph");
  }

  function handleTutorialAction(step:{id:string}){
    if(step.id==="map"){
      changeView("Graph");
      return;
    }
    if(step.id==="path"){
      changeView("Graph");
      setEdgeScope("neighborhood");
      return;
    }
    if(step.id==="agent"){
      setAssistantOpen(true);
      return;
    }
    if(step.id==="share"||step.id==="portable"){
      changeView("AI Workspace");
    }
  }

  function replayTutorial(){
    try{window.localStorage.removeItem("research-os:first-run-tutorial:dismissed");}catch{/* best-effort reset */}
    setTutorialNonce(value=>value+1);
    setSettingsOpen(false);
    setDetailExpanded(false);
    changeView("Graph");
  }

  function onSearchKeyDown(event:React.KeyboardEvent<HTMLInputElement>){
    if(event.key==="ArrowDown"){
      event.preventDefault();
      setSearchOpen(true);
      setSearchIndex(index=>Math.min(Math.max(0,searchResults.length-1),index+1));
    }else if(event.key==="ArrowUp"){
      event.preventDefault();
      setSearchIndex(index=>Math.max(0,index-1));
    }else if(event.key==="Enter"&&searchResults[searchIndex]){
      event.preventDefault();
      openSearchRecord(searchResults[searchIndex]);
    }else if(event.key==="Escape"){
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
      setSearchOpen(false);
      searchInputRef.current?.blur();
    }
  }

  async function syncAiContext(){
    setAiSyncing(true);
    setAiSyncError("");
    try{
      const response=await fetch("/api/ai-context",{
        method:"POST",
        headers:await localWriteHeaders(),
        body:JSON.stringify({projectId:activeProjectId}),
      });
      const payload=await response.json() as {aiContext?:AiContextStatus;error?:string};
      if(!response.ok||!payload.aiContext)throw new Error(payload.error||"AI context refresh failed");
      setAiContext(payload.aiContext);
    }catch(error){
      setAiSyncError(error instanceof Error?error.message:"AI context refresh failed");
    }finally{
      setAiSyncing(false);
    }
  }

  return <div className={`shell view-${viewAccentKey} ${sidebarCollapsed?"sidebar-collapsed":""}`}>
    <aside id="primary-sidebar" className="sidebar">
      <button className="sidebar-collapse-toggle" aria-label={sidebarCollapsed?"Expand navigation":"Collapse navigation"} aria-controls="primary-sidebar" aria-expanded={!sidebarCollapsed} onClick={toggleSidebar}><span aria-hidden="true">{sidebarCollapsed?"›":"‹"}</span></button>
      <div className="brand">
        <img className="brand-wordmark" src="/branding/research-os-wordmark.png" alt="Research OS — Evidence workspace" />
        <img className="brand-mark" src="/branding/research-os-mark.png" alt="" aria-hidden="true" />
      </div>
      <div ref={projectSwitcherRef} className="project-switcher">
        <button className="project-current" aria-label={`Switch project: ${activeProject?.name||"Loading projects"}`} aria-expanded={projectMenuOpen} onClick={()=>setProjectMenuOpen(open=>!open)}>
          <span><small>Current project</small><strong>{activeProject?.name||"Loading projects…"}</strong></span><b>⌄</b>
        </button>
        {projectMenuOpen&&<div className="project-menu">
          <div className="project-menu-title">Switch project</div>
          {projects.map(project=><div className="project-menu-row" key={project.id}>
            <button className={`project-option ${project.id===activeProjectId?"active":""}`} onClick={()=>switchProject(project.id)}>
              <span><strong>{project.name}</strong><small>{project.recordCount} records</small></span>{project.id===activeProjectId&&<b>✓</b>}
            </button>
            <button className="project-remove" aria-label={`Remove ${project.name} from website`} title={projects.length<=1?"Keep at least one project visible":"Remove from website; files stay on disk"} disabled={projects.length<=1} onClick={()=>void changeProjectVisibility(project,"hide")}>−</button>
          </div>)}
          {hiddenProjects.length>0&&<><div className="project-menu-title removed">Removed from website</div>{hiddenProjects.map(project=><button key={project.id} className="project-restore" onClick={()=>void changeProjectVisibility(project,"restore")}><b>↺</b><span><strong>{project.name}</strong><small>Re-add existing vault · {project.recordCount} records</small></span></button>)}</>}
          <button onClick={()=>{setProjectMenuOpen(false);void connectVault();}}><b>↗</b><span><strong>{connected?"Refresh connected folder":"Connect a local folder"}</strong><small>Optional browser-folder fallback</small></span></button>
          <button className="new-project" onClick={()=>{setProjectMenuOpen(false);setShowProjectCreate(true);}}><b>＋</b><span><strong>Create new project</strong><small>Start a separate Markdown vault</small></span></button>
        </div>}
      </div>
      <nav className="nav primary-navigation" aria-label="Research workspace">
        <div className="nav-group"><span>Workspace</span>{primaryNav.map(item=>{
          const active=primaryNavActive(item.label);
          return <button key={item.label} title={sidebarCollapsed?item.label:undefined} aria-label={sidebarCollapsed?item.label:undefined} aria-current={active?"page":undefined} className={active?"active":""} onClick={()=>changeView(item.view)}><i className="dot"/><span>{item.label}</span>{item.label==="Work"&&<em>{attention}</em>}</button>;
        })}</div>
      </nav>
      <nav className="mobile-nav" aria-label="Primary navigation">
        {primaryNav.map(item=>{const active=primaryNavActive(item.label);return <button key={item.label} aria-current={active?"page":undefined} className={active?"active":""} onClick={()=>changeView(item.view)}><span>{item.label}</span>{item.label==="Work"&&<em>{attention}</em>}</button>;})}
      </nav>
      <div className="privacy"><b>{activeProject?.name||"Markdown is canonical."}</b><br/>{activeProject?.description||"UI and AI edit the same files."}<br/>Use coded donor IDs only.</div>
    </aside>

    <main className={`main workspace-main view-${viewAccentKey}`}>
      <header className="topbar">
        <div className={`search ${searchOpen?"open":""}`}>
          <input ref={searchInputRef} role="combobox" aria-expanded={searchOpen&&Boolean(query.trim())} aria-controls="project-search-results" aria-activedescendant={searchOpen&&searchResults[searchIndex]?`search-result-${searchResults[searchIndex].id}`:undefined} aria-label="Search this project" value={query} onKeyDown={onSearchKeyDown} onFocus={()=>setSearchOpen(true)} onBlur={()=>window.setTimeout(()=>setSearchOpen(false),120)} onChange={e=>{setQuery(e.target.value);setSearchIndex(0);setSearchOpen(true);}} placeholder="Search records or use type:paper, status:provisional…"/>
          {!query&&<kbd>Ctrl K</kbd>}
          {query&&<button className="search-clear" aria-label="Clear search" onMouseDown={event=>event.preventDefault()} onClick={()=>{setQuery("");searchInputRef.current?.focus();}}>×</button>}
          {searchOpen&&query.trim()&&<div id="project-search-results" className="search-results" role="listbox" aria-label="Project search results">
            <div className="search-results-head"><strong>{searchResults.length}{searchResults.length===8?"+":""} matches</strong><span>Across the whole project</span></div>
            {searchResults.map((record,index)=><button id={`search-result-${record.id}`} role="option" aria-selected={searchIndex===index} className={searchIndex===index?"active":""} key={record.id} onMouseEnter={()=>setSearchIndex(index)} onMouseDown={event=>event.preventDefault()} onClick={()=>openSearchRecord(record)}><span className={`tag ${record.type}`}>{record.type}</span><span><strong>{record.title}</strong><small>{record.id} · {record.status}</small></span></button>)}
            {!searchResults.length&&<p>No project record matches this search.</p>}
            <small className="search-syntax">Filters: <b>type:</b> <b>status:</b> <b>id:</b> <b>has:source</b> <b>has:links</b></small>
          </div>}
        </div>
        <div className={`status ${projectError||projectRegistryError?"error":connected||snapshotLoaded?"connected":""}`} role="status"><i/>{projectLoading?`Loading ${activeProject?.name||"project"}…`:projectError||projectRegistryError?"Project unavailable":connected?`${records.length} editable records`:snapshotLoaded?`${records.length} project records`:"Project unavailable"}</div>
        <button className="ghost ask-agent-trigger" aria-label="Ask AI" aria-expanded={assistantOpen} onClick={()=>setAssistantOpen(true)}>
          <span className="ask-agent-full">Ask AI</span>
          <span className="ask-agent-compact" aria-hidden="true">AI</span>
        </button>
        <button className="ghost settings-trigger" aria-label="Display and accessibility settings" aria-haspopup="dialog" onClick={()=>setSettingsOpen(true)}><span className="settings-full">Display</span><span className="settings-compact" aria-hidden="true">Aa</span></button>
        <button className="primary new-record-trigger" aria-label="Create new record" disabled={projectLoading} onClick={()=>setShowCreate(true)}><span className="new-record-full">+ New record</span><span className="new-record-compact" aria-hidden="true">＋</span></button>
      </header>
      {(projectError||projectRegistryError)&&<div className="project-load-error" role="alert">
        <span><strong>Research records could not be loaded.</strong> {projectError||projectRegistryError} Your project has not been treated as empty and no files were changed.</span>
        <button onClick={retryProjectLoad}>Try again</button>
      </div>}
      {saveConflict&&<div className="save-conflict" role="alert">
        <span><strong>Save stopped safely.</strong> {saveConflict}</span>
        <button onClick={retryProjectLoad}>Refresh project</button>
      </div>}

      {view==="Graph" ? <div className={`canvas-layout ${detailExpanded?"detail-expanded":""}`}>
        <section className="canvas-panel">
          <div className="canvas-toolbar">
            <div className="canvas-title map-identity"><span className="eyebrow">Scientific relationship workspace</span><strong>Evidence map</strong><small>{graphMode==="free"?"Drag nodes · positions save to Markdown":"Select a node to reveal its scientific path"}</small></div>
            <div className="scope-switch" aria-label="Connection visibility">
              <button aria-pressed={edgeScope==="focus"} className={edgeScope==="focus"?"active":""} onClick={()=>changeEdgeScope("focus")}>Direct</button>
              <button aria-pressed={edgeScope==="neighborhood"} className={edgeScope==="neighborhood"?"active":""} onClick={()=>changeEdgeScope("neighborhood")}>2 hops</button>
              <button aria-pressed={edgeScope==="all"} className={edgeScope==="all"?"active":""} onClick={()=>changeEdgeScope("all")}>All</button>
            </div>
            <details ref={typeFilterRef} className="type-filter-menu">
              <summary aria-label="Choose record types shown on the map"><span>Record types</span><span className="type-filter-dots" aria-hidden="true">{graphDefaultTypes.map(type=><i key={type} className={`${type} ${hiddenTypes.has(type)?"muted":""}`}/>)}</span><b>{graphDefaultTypes.filter(type=>!hiddenTypes.has(type)).length}/{graphDefaultTypes.length}</b></summary>
              <div className="type-filters" aria-label="Record types">{graphDefaultTypes.map(type=>{const shown=!hiddenTypes.has(type);return <button key={type} aria-pressed={shown} title={`${shown?"Hide":"Show"} ${type} records`} className={`${type} ${shown?"":"muted"}`} onClick={()=>setHiddenTypes(prev=>{const n=new Set(prev);if(n.has(type))n.delete(type);else n.add(type);return n;})}><i aria-hidden="true"/>{type[0].toUpperCase()+type.slice(1)}</button>})}</div>
            </details>
            <div className="canvas-actions">
              <button aria-label="Zoom in" title="Zoom in" onClick={()=>zoomBy(1.2)}>＋</button><button aria-label="Zoom out" title="Zoom out" onClick={()=>zoomBy(.83)}>−</button><button title={edgeScope==="all"?"Fit the full map":"Center the selected record"} onClick={()=>fitGraph()}>{edgeScope==="all"?"Fit all":"Center"}</button>
              <button className={graphEditing?"active-tool":""} aria-expanded={graphEditing} onClick={()=>setGraphEditing(value=>!value)}>{graphEditing?"Done editing":"Edit map"}</button>
            </div>
            {graphEditing&&<div className="graph-edit-tools" aria-label="Map editing tools">
              <div className="graph-mode-switch" aria-label="Graph layout">
                <button className={graphMode==="flow"?"active":""} onClick={()=>changeGraphMode("flow")}>Research flow</button>
                <button className={graphMode==="topic"?"active":""} onClick={()=>changeGraphMode("topic")}>Topic map</button>
                <button className={graphMode==="free"?"active":""} onClick={()=>changeGraphMode("free")}>Free canvas</button>
              </div>
              <button className={hideUnresolved?"active-tool":""} onClick={()=>setHideUnresolved(value=>!value)}>{hideUnresolved?"Show unresolved":"Hide unresolved"}</button>
              <select value={relationType} onChange={e=>setRelationType(e.target.value)} aria-label="Relationship type">{relationOptions.map(x=><option key={x}>{x}</option>)}</select>
              <button disabled={!selected} className={connectionSource?"active-tool":""} onClick={()=>selected&&setConnectionSource(connectionSource?null:selected.id)}>{connectionSource?"Cancel link":"Draw link"}</button>
              {graphMode==="free"&&<div className="node-nudge" aria-label="Move selected node"><button aria-label="Move selected node left" onClick={()=>nudgeSelectedNode(-20,0)}>←</button><button aria-label="Move selected node up" onClick={()=>nudgeSelectedNode(0,-20)}>↑</button><button aria-label="Move selected node down" onClick={()=>nudgeSelectedNode(0,20)}>↓</button><button aria-label="Move selected node right" onClick={()=>nudgeSelectedNode(20,0)}>→</button></div>}
            </div>}
          </div>
          <div className="research-pulse compact" aria-label="Research pulse derived from canonical Markdown">
            <span className="research-pulse-label">Project pulse</span>
            <div className="research-pulse-items">{researchPulse.slice(0,2).map(item=><button key={item.key} className={item.accent} onClick={item.action} title={item.detail} aria-label={`${item.count} ${item.label}. ${item.detail}`}><b>{item.count}</b><span>{item.label}</span></button>)}</div>
            <details ref={pulseMoreRef} className="research-pulse-more"><summary>More</summary><div>{researchPulse.slice(2).map(item=><button key={item.key} className={item.accent} onClick={item.action} title={item.detail}><b>{item.count}</b><span>{item.label}</span></button>)}</div></details>
          </div>
          {connectionSource&&<div className="connection-banner">Creating a <b>{relationType}</b> connection from <b>{connectionSource}</b>. Click a target node.</div>}
          <div ref={viewportRef} tabIndex={0} aria-label="Evidence map. Arrow keys pan. Press 0 to fit the map." className={`canvas-viewport scope-${edgeScope} zoom-${transform.scale<.43?"far":transform.scale<.72?"mid":"close"} ${guidedPresentation?"guided-presenting":""}`} onKeyDown={onCanvasKeyDown} onPointerDown={e=>onPointerDown(e)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            {!graphRecords.length&&!projectLoading&&!projectError&&!projectRegistryError&&<div className="project-empty"><span className="eyebrow">{query?"No finder matches":"Empty project"}</span><h2>{query?"No records match this search":`Start ${activeProject?.name||"this project"}`}</h2><p>{query?"Clear the finder to restore the evidence map.":"Create the first paper, idea, claim, hypothesis, experiment, result, or model. It will be saved as Markdown in this project’s separate vault."}</p>{query?<button className="ghost" onClick={e=>{e.stopPropagation();setQuery("");}}>Clear search</button>:<button className="primary" onClick={e=>{e.stopPropagation();setShowCreate(true);}}>+ Create first record</button>}</div>}
            <div className="canvas-world" style={{transform:`translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`}}>
              {graphMode==="flow"&&flowLabels.map((label,index)=><div className={`graph-zone flow-zone ${label.toLowerCase()}`} key={label} style={{left:90+index*350,top:150,width:330,height:1580}}><strong>{label}</strong></div>)}
              {graphMode==="topic"&&topicLabels.map((label,index)=><div className="graph-zone topic-zone" key={label} style={{left:90+index*350,top:150,width:330,height:1580}}><strong>{label}</strong></div>)}
              <svg className="edge-layer" width="3000" height="2000" aria-hidden="true">
                <defs><mask id="edge-node-cutouts" maskUnits="userSpaceOnUse" x="0" y="0" width="3000" height="2000"><rect width="3000" height="2000" fill="white"/>{focusedGraphRecords.map(record=>{const point=displayPositions.get(record.id)||record;const context=focusNodeIds.has(record.id);const emphasis=context?(transform.scale<.43?1.34:transform.scale<.72?1.12:1):1;return <rect key={record.id} x={point.x-(237*emphasis)/2} y={point.y-(118*emphasis)/2} width={237*emphasis} height={118*emphasis} rx={18} fill="black"/>;})}</mask></defs>
                <g mask="url(#edge-node-cutouts)">{graphEdges.map(edge=>{
                  const a=displayPositions.get(edge.source),b=displayPositions.get(edge.target);if(!a||!b)return null;
                  const midX=(a.x+b.x)/2;
                  const speculative=/^(related|generated|depends-on)$/.test(edge.type);
                  return <g className={`edge-group context-edge ${speculative?"speculative":"evidence"}`} key={`${edge.source}-${edge.target}-${edge.type}`}>
                    <path className="edge-path" d={`M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`}/>
                  </g>;
                })}</g>
              </svg>
              {focusedGraphRecords.map(r=>{const point=displayPositions.get(r.id)||r;const context=focusNodeIds.has(r.id);const guidedIndex=guidedPresentation?.steps.findIndex(step=>step.id===r.id)??-1;return <button key={r.id} className={`canvas-node ${r.type} ${context?"context-node":"dimmed"} ${selectedId===r.id?"selected":""} ${guidedIndex>=0?guidedIndex===guidedPresentation?.index?"guided-current":guidedIndex<(guidedPresentation?.index||0)?"guided-past":"guided-next":""} ${connectionSource===r.id?"source":""} ${graphMode==="free"?"movable":"auto-layout"}`} style={{left:point.x,top:point.y}} onPointerDown={e=>{e.stopPropagation();onPointerDown(e,r.id)}} onClick={e=>{e.stopPropagation(); if(connectionSource)void addConnection(r.id); else focusGraphRecord(r.id)}}><span>{r.type}</span><b>{r.title}</b><small>{r.id} · {r.status}</small></button>})}
              {edgeScope!=="all"&&<svg className="edge-layer edge-layer-active" width="3000" height="2000" aria-hidden="true">
                <defs><mask id="focus-node-cutouts" maskUnits="userSpaceOnUse" x="0" y="0" width="3000" height="2000"><rect width="3000" height="2000" fill="white"/>{focusedGraphRecords.filter(record=>focusNodeIds.has(record.id)).map(record=>{const point=displayPositions.get(record.id)||record;const emphasis=transform.scale<.43?1.34:transform.scale<.72?1.12:1;return <rect key={record.id} x={point.x-(237*emphasis)/2} y={point.y-(118*emphasis)/2} width={237*emphasis} height={118*emphasis} rx={18} fill="black"/>;})}</mask></defs>
                <g mask="url(#focus-node-cutouts)">{visibleEdges.map(edge=>{const a=displayPositions.get(edge.source),b=displayPositions.get(edge.target);if(!a||!b)return null;const midX=(a.x+b.x)/2,midY=(a.y+b.y)/2;const speculative=/^(related|generated|depends-on)$/.test(edge.type);return <g className={`edge-group focus-edge ${speculative?"speculative":"evidence"}`} key={`active-${edge.source}-${edge.target}-${edge.type}`}><path className="edge-path" d={`M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`}/><text className="edge-label" x={midX} y={midY-10}>{edge.type}</text></g>;})}</g>
              </svg>}
            </div>
            <div className="canvas-status-overlay" aria-live="polite">
              <span><b>{visibleEdges.length}</b> / {graphEdges.length} relationships</span>
              <span>{edgeScope==="all"?`${focusedGraphRecords.length} records visible`:selected?`${focusNodeIds.size} around ${selected.id}`:"Choose a record"}</span>
              {graphMode==="free"&&<span className={`save-state ${positionSaveState}`}>{positionSaveState==="saving"?"Saving…":positionSaveState==="saved"?"Position saved to Markdown":positionSaveState==="failed"?"Position not saved":"Manual layout"}</span>}
            </div>
            <div className="zoom-readout">{Math.round(transform.scale*100)}%</div>
            {guidedPresentation&&activePresentationStep&&<section className="guided-presentation" aria-live="polite" aria-label="Guided evidence presentation">
              <div><span>Evidence path · {guidedPresentation.index+1} of {guidedPresentation.steps.length}</span><strong>{records.find(record=>record.id===activePresentationStep.id)?.title||activePresentationStep.id}</strong><p>{activePresentationStep.note}</p></div>
              <nav><button disabled={guidedPresentation.index===0} onClick={()=>setGuidedPresentation(current=>current?{...current,index:Math.max(0,current.index-1),playing:false}:current)}>Back</button><button onClick={()=>setGuidedPresentation(current=>current?{...current,playing:!current.playing}:current)}>{guidedPresentation.playing?"Pause":"Play"}</button>{guidedPresentation.index<guidedPresentation.steps.length-1?<button onClick={()=>setGuidedPresentation(current=>current?{...current,index:Math.min(current.steps.length-1,current.index+1),playing:false}:current)}>Next</button>:<button onClick={()=>setGuidedPresentation(null)}>Finish</button>}<button aria-label="End presentation" onClick={()=>setGuidedPresentation(null)}>×</button></nav>
            </section>}
          </div>
        </section>
        <DetailPanel record={selected} records={records} projectId={activeProjectId} editing={editing} setEditing={setEditing} expanded={detailExpanded} setExpanded={setDetailExpanded} draftTitle={draftTitle} setDraftTitle={setDraftTitle} draftSummary={draftSummary} setDraftSummary={setDraftSummary} draftStatus={draftStatus} setDraftStatus={setDraftStatus} draftBody={draftBody} setDraftBody={setDraftBody} draftIdeaMaturity={draftIdeaMaturity} setDraftIdeaMaturity={setDraftIdeaMaturity} draftIdeaDisposition={draftIdeaDisposition} setDraftIdeaDisposition={setDraftIdeaDisposition} draftIdeaPriority={draftIdeaPriority} setDraftIdeaPriority={setDraftIdeaPriority} draftEvidenceStrength={draftEvidenceStrength} setDraftEvidenceStrength={setDraftEvidenceStrength} draftFeasibility={draftFeasibility} setDraftFeasibility={setDraftFeasibility} draftDecisionNeeded={draftDecisionNeeded} setDraftDecisionNeeded={setDraftDecisionNeeded} draftNextAction={draftNextAction} setDraftNextAction={setDraftNextAction} draftBlockers={draftBlockers} setDraftBlockers={setDraftBlockers} draftHumanReviewed={draftHumanReviewed} setDraftHumanReviewed={setDraftHumanReviewed} draftReviewedBy={draftReviewedBy} setDraftReviewedBy={setDraftReviewedBy} draftReviewedAt={draftReviewedAt} setDraftReviewedAt={setDraftReviewedAt} draftEvidenceAnchors={draftEvidenceAnchors} setDraftEvidenceAnchors={setDraftEvidenceAnchors} saveDetails={saveDetails} saveFigures={saveFigures} persistRelations={persistRelations} setSelectedId={selectRecordForReading}/>
      </div> : <div className={`library-layout ${detailExpanded?"detail-expanded":""} ${view==="AI Workspace"?"ai-workspace-layout":""}`}>
        <section ref={libraryMainRef} className="library-main">
          {libraryViews.includes(view)&&<><nav className="workspace-tabs" aria-label="Library sections">{libraryTabs.map(tab=><button key={tab.view} aria-current={view===tab.view?"page":undefined} className={view===tab.view?"active":""} onClick={()=>changeView(tab.view)}>{tab.label}</button>)}</nav><nav className="smart-views" aria-label="Smart Library views"><span>Routing views</span>{libraryLenses.map(lens=><button key={lens.value} title={lens.description} aria-pressed={libraryLens===lens.value} className={libraryLens===lens.value?"active":""} onClick={()=>setLibraryLens(lens.value)}>{lens.label}<b>{libraryLensCounts[lens.value]}</b></button>)}</nav></>}
          {workViews.includes(view)&&<nav className="workspace-tabs" aria-label="Work sections">{workTabs.map(tab=><button key={tab.view} aria-current={view===tab.view?"page":undefined} className={view===tab.view?"active":""} onClick={()=>changeView(tab.view)}>{tab.label}{tab.view==="Review Queue"&&attention>0?<em>{attention}</em>:null}</button>)}</nav>}
          {view==="Literature Inbox"
            ? <LiteratureInboxPage projectId={activeProjectId}/>
            : view==="Review Queue"
            ? <ReviewQueuePage entries={reviewEntries} visibleRecords={filtered} selected={visibleSelected} reviewLane={reviewLane} setReviewLane={setReviewLane} reviewPriority={reviewPriority} setReviewPriority={setReviewPriority} setSelectedId={selectRecordForReading}/>
            : view==="Paper Review"
              ? <PaperReviewPage key={visibleSelected?.type==="paper"?visibleSelected.id:"paper-review"} papers={filtered.filter(record=>record.type==="paper")} selected={visibleSelected?.type==="paper"?visibleSelected:undefined} setSelectedId={setSelectedId} saveReview={savePaperReview}/>
            : view==="AI Workspace"
              ? <AIWorkspacePage project={activeProject} records={records} status={aiContext} diagnostics={diagnostics} syncing={aiSyncing} syncError={aiSyncError} sync={()=>void syncAiContext()} setSelectedId={setSelectedId} setView={setView}/>
              : view==="Experiments"
                ? <ExperimentLibraryPage records={filtered} selectedId={selectedId} setSelectedId={selectRecordForReading}/>
              : <><div className="library-heading library-hero"><div><span className="eyebrow">Canonical research memory</span><h1>{view==="Library"?"Research library":`${view} library`}</h1><p>{libraryViewDescriptions[view]||"Browse the project’s canonical Markdown records and their explicit scientific relationships."}</p></div><div className="library-hero-total"><strong>{filtered.length}</strong><span>records</span></div></div>
              <div className="record-grid">{filtered.map(r=><button className={`record-card ${r.type} ${selectedId===r.id?"selected":""}`} key={r.id} onClick={()=>selectRecordForReading(r.id)}><div><span className="tag">{r.type}</span><small>{r.id}</small></div><h2>{r.title}</h2><p>{r.summary}</p><footer><span>{r.status}</span><span>{r.links.length} links</span></footer></button>)}</div>
              {!filtered.length&&!projectLoading&&!projectError&&!projectRegistryError&&<div className="library-empty"><strong>{query||libraryLens!=="all"?"No records match these filters.":`No ${view.toLowerCase()} yet.`}</strong><span>{query||libraryLens!=="all"?"Clear the finder or choose All records to restore the full Library.":`Create the first record in ${activeProject?.name||"this project"}.`}</span>{query||libraryLens!=="all"?<button className="ghost" onClick={()=>{setQuery("");setLibraryLens("all");}}>Clear filters</button>:<button className="primary" onClick={()=>setShowCreate(true)}>+ New record</button>}</div>}
            </>}
        </section>
        {!["AI Workspace","Literature Inbox"].includes(view)&&<DetailPanel record={selected} records={records} projectId={activeProjectId} editing={editing} setEditing={setEditing} expanded={detailExpanded} setExpanded={setDetailExpanded} draftTitle={draftTitle} setDraftTitle={setDraftTitle} draftSummary={draftSummary} setDraftSummary={setDraftSummary} draftStatus={draftStatus} setDraftStatus={setDraftStatus} draftBody={draftBody} setDraftBody={setDraftBody} draftIdeaMaturity={draftIdeaMaturity} setDraftIdeaMaturity={setDraftIdeaMaturity} draftIdeaDisposition={draftIdeaDisposition} setDraftIdeaDisposition={setDraftIdeaDisposition} draftIdeaPriority={draftIdeaPriority} setDraftIdeaPriority={setDraftIdeaPriority} draftEvidenceStrength={draftEvidenceStrength} setDraftEvidenceStrength={setDraftEvidenceStrength} draftFeasibility={draftFeasibility} setDraftFeasibility={setDraftFeasibility} draftDecisionNeeded={draftDecisionNeeded} setDraftDecisionNeeded={setDraftDecisionNeeded} draftNextAction={draftNextAction} setDraftNextAction={setDraftNextAction} draftBlockers={draftBlockers} setDraftBlockers={setDraftBlockers} draftHumanReviewed={draftHumanReviewed} setDraftHumanReviewed={setDraftHumanReviewed} draftReviewedBy={draftReviewedBy} setDraftReviewedBy={setDraftReviewedBy} draftReviewedAt={draftReviewedAt} setDraftReviewedAt={setDraftReviewedAt} draftEvidenceAnchors={draftEvidenceAnchors} setDraftEvidenceAnchors={setDraftEvidenceAnchors} saveDetails={saveDetails} saveFigures={saveFigures} persistRelations={persistRelations} setSelectedId={setSelectedId}/>} 
      </div>}
    </main>

    {view==="Graph"&&!assistantOpen&&!settingsOpen&&!detailExpanded&&<FirstRunTutorial key={tutorialNonce} onAction={handleTutorialAction}/>} 
    <AgentCommandDock open={assistantOpen} onClose={()=>setAssistantOpen(false)} projectId={activeProjectId} projectName={activeProject?.name||activeProjectId} focus={selected?{id:selected.id,type:selected.type,title:selected.title}:undefined} records={records.map(record=>({id:record.id,type:record.type,title:record.title}))} getAuthHeaders={localWriteHeaders} onPresent={presentAssistantAction} onOpenRecord={openAssistantRecord}/>

    {showCreate&&<div className="modal" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCreate(false)}}><form className="dialog" action={createRecord}>
      <div className="dialog-head"><div><span className="eyebrow">Create on canvas</span><h2>New research record</h2></div><button type="button" className="close" onClick={()=>setShowCreate(false)}>×</button></div>
      <div className="notice">This creates a Markdown file inside <b>{activeProject?.name||"the active project"}</b> and places it at the center of the current canvas. The active project is always the save target.</div>
      <div className="form"><div className="form-row"><label>Type<select name="type" value={createType} onChange={event=>setCreateType(event.target.value as RecordType)}>{recordTypes.filter(type=>type!=="project").map(type=><option key={type} value={type}>{recordTypeConfig[type].label}</option>)}</select></label><label>Initial status<input value={recordTypeConfig[createType].defaultStatus} readOnly/></label></div>{createType==="idea"&&<div className="project-create-preview"><strong>Structured idea incubator</strong><span>Captured maturity · active disposition · explicit evidence, assumptions, tests, falsification, promotion criteria, and decision history</span></div>}<label>Title<input name="title" required placeholder="Specific and decision-oriented"/></label><label>Summary<textarea name="summary" required placeholder="What is the evidence, inference, or proposed test?"/></label><div className="dialog-actions"><button type="button" className="ghost" onClick={()=>setShowCreate(false)}>Cancel</button><button className="primary">Create record</button></div></div>
    </form></div>}
    {showProjectCreate&&<div className="modal" onMouseDown={e=>{if(e.target===e.currentTarget)setShowProjectCreate(false)}}><form className="dialog project-dialog" action={createProject}>
      <div className="dialog-head"><div><span className="eyebrow">Separate research workspace</span><h2>Create a project</h2></div><button type="button" className="close" onClick={()=>setShowProjectCreate(false)}>×</button></div>
      <div className="notice">This creates a new local project with its own Markdown vault, scientific folders, and project-purpose document. It does not copy or modify the current APOE project.</div>
      <div className="form"><label>Project name<input name="name" required minLength={2} maxLength={80} autoFocus placeholder="Example: Microglial lipid atlas"/></label><label>Purpose and scope<textarea name="description" placeholder="What scientific question does this project organize, and what decisions should it support?"/></label><div className="project-create-preview"><strong>New project structure</strong><span>Dashboard · Sources · Papers · Claims · Ideas · Hypotheses · Experiments · Results · Models</span></div><div className="dialog-actions"><button type="button" className="ghost" onClick={()=>setShowProjectCreate(false)}>Cancel</button><button className="primary">Create and open project</button></div></div>
    </form></div>}
    {settingsOpen&&<div className="modal" onMouseDown={e=>{if(e.target===e.currentTarget)setSettingsOpen(false)}}><section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="dialog-head"><div><span className="eyebrow">Personal display</span><h2 id="settings-title">Reading settings</h2></div><button type="button" className="close" aria-label="Close settings" onClick={()=>setSettingsOpen(false)}>×</button></div>
      <p className="settings-intro">These preferences stay on this device and change only the presentation—not your Markdown files or scientific records.</p>
      <label className="settings-theme"><span><strong>Color theme</strong><small>Follow your system or choose a fixed light or dark appearance.</small></span><select aria-label="Color theme" value={themePreference} onChange={event=>changeTheme(event.target.value as ThemePreference)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <div className="settings-options">
        <label><input type="checkbox" checked={accessibility.dyslexia} onChange={event=>setAccessibilityOption("dyslexia",event.target.checked)}/><span><strong>Dyslexia-friendly reading</strong><small>Uses the Atkinson Hyperlegible font when available, plus calmer spacing and line height.</small></span></label>
        <label><input type="checkbox" checked={accessibility.largeText} onChange={event=>setAccessibilityOption("largeText",event.target.checked)}/><span><strong>Large text</strong><small>Raises the base reading size without changing the scientific content.</small></span></label>
        <label><input type="checkbox" checked={accessibility.highContrast} onChange={event=>setAccessibilityOption("highContrast",event.target.checked)}/><span><strong>High contrast</strong><small>Uses stronger foreground, border, and control contrast.</small></span></label>
        <label><input type="checkbox" checked={accessibility.reducedMotion} onChange={event=>setAccessibilityOption("reducedMotion",event.target.checked)}/><span><strong>Reduce motion</strong><small>Removes interface transitions and movement effects.</small></span></label>
      </div>
      <div className="dialog-actions"><button className="ghost" onClick={replayTutorial}>Replay orientation</button><button className="ghost" onClick={()=>setAccessibility(defaultAccessibility)}>Reset preferences</button><button className="primary" onClick={()=>setSettingsOpen(false)}>Done</button></div>
    </section></div>}
  </div>;
}

type LiteratureInboxItem={fileName:string;valid:boolean;errors:string[];proposal?:LiteratureProposal};

async function fetchLiteratureInbox(projectId:string) {
  const response=await fetch(`/api/literature-inbox?projectId=${encodeURIComponent(projectId)}`,{cache:"no-store"});
  const payload=await response.json() as {proposals?:LiteratureInboxItem[];error?:string};
  if(!response.ok||!payload.proposals)throw new Error(payload.error||"Literature inbox unavailable");
  return payload.proposals;
}

function LiteratureInboxPage(props:{projectId:string}) {
  const [items,setItems]=useState<LiteratureInboxItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [selectedRun,setSelectedRun]=useState("");
  const load=useCallback(()=>{
    setLoading(true);
    setError("");
    fetchLiteratureInbox(props.projectId)
      .then(proposals=>{
        setItems(proposals);
        setSelectedRun(current=>current&&proposals.some(item=>item.fileName===current)?current:proposals[0]?.fileName||"");
      })
      .catch(reason=>setError(reason instanceof Error?reason.message:"Literature inbox unavailable"))
      .finally(()=>setLoading(false));
  },[props.projectId]);
  useEffect(()=>{
    let cancelled=false;
    fetchLiteratureInbox(props.projectId)
      .then(proposals=>{
        if(cancelled)return;
        setItems(proposals);
        setSelectedRun(proposals[0]?.fileName||"");
      })
      .catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:"Literature inbox unavailable");})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[props.projectId]);
  const active=items.find(item=>item.fileName===selectedRun);
  const candidates=active?.proposal?.candidates||[];
  const reviewedCount=candidates.filter(candidate=>candidate.decision!=="pending").length;
  return <div className="literature-inbox">
    <div className="library-heading"><div><span className="eyebrow">Jarvis staging boundary</span><h1>Literature Inbox</h1><p>Bulk worker output enters here as a provisional proposal. Nothing on this page is canonical evidence or human-reviewed science.</p></div><button className="ghost" onClick={load} disabled={loading}>{loading?"Loading…":"Refresh runs"}</button></div>
    <div className="literature-boundary">
      <article><b>1</b><span><strong>Jarvis maps broadly</strong>Search, deduplicate, extract source spans, cluster, and rank.</span></article>
      <article><b>2</b><span><strong>Frontier agent investigates</strong>Select a bounded set and verify primary sources.</span></article>
      <article><b>3</b><span><strong>Research OS stages decisions</strong>Accept, reject, merge, or defer before canonical creation.</span></article>
    </div>
    {error&&<div className="save-conflict" role="alert"><span>{error}</span><button onClick={load}>Retry</button></div>}
    {!loading&&!items.length&&<div className="review-empty"><strong>No Jarvis proposals staged yet.</strong><span>A scheduled agent can POST a `research-intake-v1` proposal to this project’s local literature-inbox API.</span></div>}
    {items.length>0&&<div className="literature-layout">
      <aside className="literature-runs">{items.map(item=><button key={item.fileName} className={selectedRun===item.fileName?"selected":""} onClick={()=>setSelectedRun(item.fileName)}>
        <span>{item.valid?"valid proposal":"invalid proposal"}</span><strong title={item.proposal?.run_id||item.fileName}>{readableRunLabel(item.proposal?.run_id||item.fileName)}</strong><small>{item.proposal?.candidates.length||0} candidates</small>
      </button>)}</aside>
      <section className="literature-candidates">
        <div className="literature-run-head"><div><span className="eyebrow">Provisional run</span><h2 title={active?.proposal?.run_id||active?.fileName||"Unlabeled run"}>{readableRunLabel(active?.proposal?.run_id||active?.fileName||"Unlabeled run")}</h2></div><b>{reviewedCount} reviewed · {candidates.length-reviewedCount} pending</b></div>
        {!active?.valid&&<div className="save-conflict"><span>{active?.errors.join(" ")}</span></div>}
        {candidates.map(candidate=><article className={`literature-candidate recommendation-${candidate.decision}`} key={candidate.candidate_id}>
          <div className="literature-candidate-top"><span>{candidate.source_matches?.join(" + ")||"source"}</span><div><em>{candidate.decision}</em><b>{Number(candidate.deterministic_score||0).toFixed(2)}</b></div></div>
          <h3>{literatureText(candidate.title)}</h3>
          <p>{literatureText(candidate.abstract||"No abstract supplied.")}</p>
          <div className="literature-identifiers">{candidate.doi&&<span>DOI {candidate.doi}</span>}{candidate.pmid&&<span>PMID {candidate.pmid}</span>}{candidate.known_match&&<strong>Already known</strong>}</div>
          {candidate.query_matches?.length&&<div className="literature-query"><b>Found by</b>{candidate.query_matches.join(" · ")}</div>}
          {candidate.abstract_evidence_spans?.length&&<div className="literature-spans"><b>Traceable abstract spans</b>{candidate.abstract_evidence_spans.map((span,index)=><blockquote key={index}>{literatureText(span)}</blockquote>)}</div>}
          {candidate.agent_review&&<section className="frontier-review">
            <div><span>Verification</span><b>{candidate.agent_review.verification_depth}</b></div>
            <div><span>Primary source</span><b>{candidate.agent_review.primary_source_checked?"checked":"not checked"}</b></div>
            <div><span>Novelty</span><b>{candidate.agent_review.novelty}</b></div>
            <div><span>Model impact</span><b>{candidate.agent_review.model_impact}</b></div>
            <p><strong>Frontier-agent rationale</strong>{literatureText(candidate.agent_review.rationale)}</p>
            {candidate.agent_review.candidate_claims.length>0&&<p><strong>Candidate claims</strong>{candidate.agent_review.candidate_claims.join(" · ")}</p>}
            {candidate.agent_review.verified_evidence?.length&&<p><strong>Verified evidence</strong>{candidate.agent_review.verified_evidence.map(anchor=>`${anchor.epistemic_label} · ${anchor.locator}`).join(" · ")}</p>}
            {candidate.agent_review.fact_check_notes&&<p><strong>Fact-check notes</strong>{literatureText(candidate.agent_review.fact_check_notes)}</p>}
            <small>{candidate.agent_review.reviewed_by_model} · {new Date(candidate.agent_review.reviewed_at).toLocaleString()}</small>
          </section>}
          <footer><span>Decision: {candidate.decision}{candidate.canonicalization?.status==="applied"?` · canonicalized ${candidate.canonicalization.record_ids.length} records`:""}</span>{candidate.url&&<a href={candidate.url} target="_blank" rel="noreferrer">Open primary source ↗</a>}</footer>
        </article>)}
      </section>
    </div>}
  </div>;
}

function PaperReviewPage(props:{
  papers:ResearchRecord[];
  selected?:ResearchRecord;
  setSelectedId:(id:string)=>void;
  saveReview:(record:ResearchRecord,updates:Record<string,unknown>)=>Promise<boolean>;
}) {
  const {papers,setSelectedId,saveReview}=props;
  const record=props.selected||papers[0];
  const [depth,setDepth]=useState(()=>record?scalarField(record.fields,"review_depth","unread"):"unread");
  const [status,setStatus]=useState(()=>record?.status||"inbox");
  const [humanReviewed,setHumanReviewed]=useState(()=>record?.fields.human_reviewed===true);
  const [reviewedBy,setReviewedBy]=useState(()=>record?scalarField(record.fields,"reviewed_by"):"");
  const [reviewedAt,setReviewedAt]=useState(()=>record?scalarField(record.fields,"reviewed_at"):"");
  const [methodsChecked,setMethodsChecked]=useState(()=>record?.fields.methods_checked===true);
  const [figures,setFigures]=useState(()=>record&&Array.isArray(record.fields.figures_checked)?record.fields.figures_checked.map(String).join(", "):"");
  const [anchors,setAnchors]=useState(()=>record&&Array.isArray(record.fields.evidence_anchors)?record.fields.evidence_anchors.map(String).join(", "):"");
  const [saveState,setSaveState]=useState<"ready"|"saving"|"saved"|"failed">("ready");

  const counts={
    unread:papers.filter(paper=>scalarField(paper.fields,"review_depth","unread")==="unread").length,
    abstract:papers.filter(paper=>scalarField(paper.fields,"review_depth")==="abstract").length,
    full:papers.filter(paper=>scalarField(paper.fields,"review_depth")==="full-text").length,
    human:papers.filter(paper=>paper.fields.human_reviewed===true).length,
  };
  if(!record)return <div className="review-empty"><strong>No papers to review.</strong><span>Create or import a paper record first.</span></div>;

  const figureList=figures.split(",").map(value=>value.trim()).filter(Boolean);
  const anchorList=anchors.split(",").map(value=>value.trim()).filter(Boolean);
  const reviewGate=depth==="full-text"&&humanReviewed&&Boolean(reviewedBy.trim())&&/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt)&&methodsChecked&&figureList.length>0;
  const submit=async()=>{
    setSaveState("saving");
    const saved=await saveReview(record,{
      status,
      review_depth:depth,
      human_reviewed:humanReviewed,
      reviewed_by:reviewedBy.trim(),
      reviewed_at:reviewedAt,
      methods_checked:methodsChecked,
      figures_checked:figureList,
      evidence_anchors:anchorList,
    });
    setSaveState(saved?"saved":"failed");
  };

  return <div className="paper-review-page">
    <div className="library-heading"><div><span className="eyebrow">Evidence gate</span><h1>Paper review</h1><p>AI extraction stays provisional. Record exactly what you personally inspected before changing scientific status.</p></div><b>{papers.length} papers</b></div>
    <div className="paper-review-metrics">
      <div><span>Unread</span><strong>{counts.unread}</strong></div>
      <div><span>Abstract extracted</span><strong>{counts.abstract}</strong></div>
      <div><span>Full text checked</span><strong>{counts.full}</strong></div>
      <div><span>Human review recorded</span><strong>{counts.human}</strong></div>
    </div>
    <div className="paper-review-layout">
      <aside className="paper-review-list">
        {papers.map(paper=>{
          const paperDepth=scalarField(paper.fields,"review_depth","unread");
          return <button key={paper.id} className={paper.id===record.id?"selected":""} onClick={()=>setSelectedId(paper.id)}>
            <span><b>{paper.id}</b><em>{paperDepth}</em></span>
            <strong>{paper.title}</strong>
            <small>{paper.status}{paper.fields.human_reviewed===true?" · human checked":""}</small>
          </button>;
        })}
      </aside>
      <section className="paper-review-form">
        <div className="paper-review-title"><div><span className="tag paper">paper</span><small>{record.id}</small><h2>{record.title}</h2></div>{record.urls[0]&&<a href={record.urls[0]} target="_blank" rel="noreferrer">Open source ↗</a>}</div>
        <p className="paper-review-summary">{record.summary}</p>
        <div className="review-depth-row">
          {paperReviewDepths.map(value=><button key={value} className={depth===value?"active":""} onClick={()=>setDepth(value)}><b>{value}</b><span>{value==="unread"?"Captured only":value==="metadata"?"Citation checked":value==="abstract"?"Abstract inspected":"Methods and figures inspected"}</span></button>)}
        </div>
        <div className="paper-review-fields">
          <label>Paper status<select value={status} onChange={event=>setStatus(event.target.value)}>{recordTypeConfig.paper.statuses.map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Reviewer<input value={reviewedBy} onChange={event=>setReviewedBy(event.target.value)} placeholder="Initials or lab role"/></label>
          <label>Review date<input type="date" value={reviewedAt} onChange={event=>setReviewedAt(event.target.value)}/></label>
          <label>Figures checked<input value={figures} onChange={event=>setFigures(event.target.value)} placeholder="Figure 1, Extended Data 2"/></label>
          <label className="wide">Evidence anchors<input value={anchors} onChange={event=>setAnchors(event.target.value)} placeholder="EVD-001, EVD-002"/></label>
          <label className="review-check"><input type="checkbox" checked={methodsChecked} onChange={event=>setMethodsChecked(event.target.checked)}/>Relevant methods personally checked</label>
          <label className="review-check"><input type="checkbox" checked={humanReviewed} onChange={event=>setHumanReviewed(event.target.checked)}/>Human review completed</label>
        </div>
        <div className={`paper-review-gate ${reviewGate?"passed":"pending"}`}>
          <strong>{reviewGate?"Full-review gate complete":"Full-review gate incomplete"}</strong>
          <span>`reviewed` requires full text, human reviewer and date, methods, and at least one figure. Evidence anchors are strongly recommended and required before linked claims become supported.</span>
        </div>
        <div className="paper-review-actions"><span>{saveState==="saved"?"Checkpoint saved to Markdown":saveState==="failed"?"Save rejected; review the warning above":""}</span><button className="primary" disabled={saveState==="saving"||(status==="reviewed"&&!reviewGate)} onClick={()=>void submit()}>{saveState==="saving"?"Saving…":"Save review checkpoint"}</button></div>
      </section>
    </div>
  </div>;
}

function AIWorkspacePage(props:{
  project?:ProjectInfo;
  records:ResearchRecord[];
  status:AiContextStatus;
  diagnostics:ProjectDiagnostics;
  syncing:boolean;
  syncError:string;
  sync:()=>void;
  setSelectedId:(id:string)=>void;
  setView:(view:string)=>void;
}) {
  const {project,records,status,diagnostics,syncing,syncError,sync,setSelectedId,setView}=props;
  const [handoffCopied,setHandoffCopied]=useState(false);
  const [diagnosticsOpen,setDiagnosticsOpen]=useState(false);
  const [toolCategory,setToolCategory]=useState<ToolCategory|"all">("all");
  const [toolFocusId,setToolFocusId]=useState("");
  const [toolCopied,setToolCopied]=useState("");
  const [shareMode,setShareMode]=useState<"project"|"focus">("project");
  const [shareState,setShareState]=useState<"ready"|"copied"|"downloaded"|"failed">("ready");
  const [readiness,setReadiness]=useState<AiReadinessReport>();
  const [readinessError,setReadinessError]=useState("");
  useEffect(()=>{
    let active=true;
    fetch("/api/ai-readiness",{cache:"no-store"})
      .then(async response=>{
        const payload=await response.json() as AiReadinessReport&{error?:string};
        if(!response.ok)throw new Error(payload.error||"AI readiness check failed");
        if(active){setReadiness(payload);setReadinessError("");}
      })
      .catch(error=>{if(active)setReadinessError(error instanceof Error?error.message:"AI readiness check failed");});
    return()=>{active=false;};
  },[]);
  const activeIdeas=records.filter(record=>record.type==="idea"&&scalarField(record.fields,"disposition","active")==="active");
  const blockers=records.filter(record=>Array.isArray(record.fields.blockers)&&record.fields.blockers.length>0);
  const decisions=records.filter(record=>scalarField(record.fields,"decision_needed"));
  const workingModels=records.filter(record=>record.type==="model"&&!/retired|archived/.test(record.status));
  const needsEvidence=records.filter(record=>
    /citation-needed|to-verify|source-required|blocked-by-source|unverified/.test(record.status),
  );
  const actionRecords=[...new Map([...blockers,...decisions].map(record=>[record.id,record])).values()];
  const defaultToolFocus=workingModels[0]||records.find(record=>record.type==="claim")||records[0];
  const toolFocus=records.find(record=>record.id===toolFocusId)||defaultToolFocus;
  const shownTools=researchToolCatalog.filter(tool=>toolCategory==="all"||tool.category===toolCategory);
  const toolCategories:Array<{value:ToolCategory|"all";label:string}>=[
    {value:"all",label:"All tools"},{value:"orientation",label:"Orient"},{value:"retrieval",label:"Retrieve"},
    {value:"graph",label:"Graph"},{value:"workflow",label:"Reason"},{value:"agent-runs",label:"Runs"},
    {value:"governed-changes",label:"Changes"},
  ];
  const focusShareIds=toolFocus?[toolFocus.id,
    ...toolFocus.relations.map(relation=>relation.target),
    ...records.filter(record=>record.relations.some(relation=>relation.target===toolFocus.id)).map(record=>record.id),
  ]:[];
  const shareProject={
    id:project?.id||"active-project",name:project?.name||"Research OS project",description:project?.description,
  };
  const shareRecords=records.map(record=>({
    id:record.id,type:record.type,title:record.title,status:record.status,summary:record.summary,
    privacy:scalarField(record.fields,"privacy"),fields:record.fields,body:record.body,
    connections:record.relations,urls:record.urls,relativePath:record.relativePath,
  }));
  const shareOptions=shareMode==="focus"?{selectedIds:focusShareIds}:{};
  const labSnapshot=buildLabShareSnapshot(shareProject,shareRecords,shareOptions);
  const labManifest=buildLabShareManifest(shareProject,shareRecords,shareOptions);
  const labHtml=buildLabShareHtml(shareProject,shareRecords,shareOptions);
  const labEmail=buildLabShareEmailDraft(shareProject,labSnapshot);
  const handoff=`Research OS project: ${project?.name||"Active project"}\n\nRead this order:\n1. START_HERE.md and AGENTS.md\n2. projects.json, then ${project?.vaultPath||"vault"}/00 Dashboard/PROJECT.md and CLAIM_STATUS_RULES.md\n3. TRAPS.md\n4. CURRENT_STATE.md (orientation only)\n5. ${project?.vaultPath||"vault"}/14 AI Workspace/generated/AGENT_START.md\n6. Retrieve only the linked canonical models, claims, hypotheses, papers, experiments, results, and evidence needed for the task\n\nBefore broad work, run pnpm ai:doctor. Rules: canonical Markdown/YAML records are authoritative. Orientation, generated, run, staging, proposal, and scratch files are not evidence. Keep DIRECT, AUTHOR, INFERENCE, and SPECULATION distinct. Do not mark human review or promote claims automatically.`;
  const copyHandoff=async()=>{
    try{await navigator.clipboard.writeText(handoff);setHandoffCopied(true);window.setTimeout(()=>setHandoffCopied(false),1800);}catch{setHandoffCopied(false);}
  };
  const scopedToolText=(tool:ResearchToolCatalogEntry,kind:"prompt"|"command")=>{
    const replacements:Record<string,string>={
      "<record-id>":toolFocus?.id||"<record-id>","<query>":toolFocus?.title||"<query>",
      "<budget>":"7000","<count>":"5","<1-or-2>":"1",
      "<decision or question>":"the weakest supported connection and the best next discriminating test",
      "<question>":"the current evidence, counterevidence, uncertainty, and next decision",
    };
    let value=kind==="command"?(tool.cliCommand||""):tool.suggestedPrompt;
    for(const [placeholder,replacement] of Object.entries(replacements))value=value.replaceAll(placeholder,replacement);
    if(kind==="prompt")value=`Project: ${project?.id||"active project"}\nFocus: ${toolFocus?`${toolFocus.id} — ${toolFocus.title}`:"project-wide"}\nTool: ${tool.mcpName||tool.id}\n\n${value}\n\nUse canonical records as evidence, preserve contradictions and uncertainty, and do not attest human review or silently promote scientific status.`;
    return value;
  };
  const copyTool=async(tool:ResearchToolCatalogEntry,kind:"prompt"|"command")=>{
    try{
      await navigator.clipboard.writeText(scopedToolText(tool,kind));
      const key=`${tool.id}-${kind}`;setToolCopied(key);window.setTimeout(()=>setToolCopied(current=>current===key?"":current),1800);
    }catch{setToolCopied("");}
  };
  const copyLabSnapshot=async()=>{
    try{await navigator.clipboard.writeText(labSnapshot.markdown);setShareState("copied");window.setTimeout(()=>setShareState("ready"),1800);}catch{setShareState("failed");}
  };
  const downloadLabSnapshot=()=>{
    try{
      const blob=new Blob([labSnapshot.markdown],{type:"text/markdown;charset=utf-8"});
      const url=URL.createObjectURL(blob),anchor=document.createElement("a");
      anchor.href=url;anchor.download=`${(project?.id||"research-os").replace(/[^a-z0-9-]+/gi,"-")}-${shareMode}-lab-snapshot.md`;anchor.click();URL.revokeObjectURL(url);
      setShareState("downloaded");window.setTimeout(()=>setShareState("ready"),1800);
    }catch{setShareState("failed");}
  };
  const downloadShareArtifact=(content:string,extension:string,mime:string)=>{
    try{
      const blob=new Blob([content],{type:mime});
      const url=URL.createObjectURL(blob),anchor=document.createElement("a");
      anchor.href=url;anchor.download=`${(project?.id||"research-os").replace(/[^a-z0-9-]+/gi,"-")}-${shareMode}-lab-share.${extension}`;anchor.click();URL.revokeObjectURL(url);
      setShareState("downloaded");window.setTimeout(()=>setShareState("ready"),1800);
    }catch{setShareState("failed");}
  };
  const openEmailDraft=()=>{
    window.location.href=labEmail.mailto;
  };
  const openRecord=(record:ResearchRecord)=>{
    setSelectedId(record.id);
    const library:Partial<Record<RecordType,string>>={
      paper:"Papers",idea:"Ideas",hypothesis:"Hypotheses",experiment:"Experiments",result:"Results",
    };
    setView(library[record.type]||"Knowledge");
  };
  return <div className="ai-workspace">
    <div className="ai-hero">
      <div><span className="eyebrow">Shared working memory</span><h1>AI Workspace</h1><p>A live orientation layer for Codex and Claude Code. Generated files route agents into canonical records; they never replace evidence or human review.</p></div>
      <div className={`ai-health ${status.current?"current":"stale"}`}>
        <span>{status.current?"Context current":"Context needs refresh"}</span>
        <strong>{status.sourceCount||records.length} records · {status.edgeCount} explicit edges</strong>
        <small>{status.generatedAt?`Generated ${new Date(status.generatedAt).toLocaleString()}`:"No generated context found"}</small>
        {syncError&&<small className="ai-sync-error" role="alert">{syncError}</small>}
        <button className="primary" disabled={syncing} onClick={sync}>{syncing?"Refreshing…":"Refresh AI context"}</button>
      </div>
    </div>
    <section className="ai-project-brief">
      <div><span className="eyebrow">Current project</span><h2>{project?.name||"Active project"}</h2><p>{project?.description||"The active project uses a local Markdown vault as its canonical research memory."}</p></div>
      <div className="ai-project-path"><span>Canonical vault</span><code>{project?.vaultPath||"vault"}</code><small>{records.length} records available to the agent</small></div>
      <div className="ai-project-actions"><button className="primary" onClick={()=>void copyHandoff()}>{handoffCopied?"Handoff copied":"Copy agent handoff"}</button><button className="ghost" onClick={()=>setView("Graph")}>Open evidence map</button><button className="ghost" onClick={()=>setView("Review Queue")}>Open review queue</button></div>
    </section>
    <section className="agent-diagnostics" aria-label="Agent environment diagnostics">
      <div className="agent-diagnostics-heading"><span className="eyebrow">Environment integrity</span><small>File and graph routing checks—not scientific confidence</small></div>
      <div className={diagnostics.skippedFileCount?"attention":"ok"}><span>Files indexed</span><strong>{diagnostics.indexedRecordCount}/{diagnostics.sourceFileCount}</strong><small>{diagnostics.skippedFileCount?`${diagnostics.skippedFileCount} Markdown file(s) skipped`:`All canonical Markdown indexed`}</small></div>
      <div className={diagnostics.schemaErrorCount?"attention":"ok"}><span>Schema</span><strong>{diagnostics.schemaErrorCount} errors</strong><small>{diagnostics.schemaWarningCount} warnings</small></div>
      <div className={diagnostics.relationshipErrorCount||diagnostics.missingTargetCount||diagnostics.duplicateIdCount?"attention":"ok"}><span>Graph integrity</span><strong>{diagnostics.relationshipErrorCount+diagnostics.missingTargetCount+diagnostics.duplicateIdCount} issues</strong><small>{diagnostics.missingTargetCount} missing targets · {diagnostics.duplicateIdCount} duplicate IDs</small></div>
      <div className={status.current?"ok":"attention"}><span>Generated context</span><strong>{status.current?"Current":"Stale"}</strong><small>{status.edgeCount} explicit edges in the agent map</small></div>
      <div className={readiness?.ready?"ok":"attention"}><span>Agent readiness</span><strong>{readiness?readiness.ready?"Ready":"Needs attention":"Checking…"}</strong><small>{readiness?`${readiness.summary.pass} passed · ${readiness.summary.warn} warnings · ${readiness.summary.fail} failures`:readinessError||"Checking portable instructions and adapters"}</small></div>
    </section>
    {diagnostics.issues.length>0&&<section className="agent-issues" aria-label="Agent environment issues">
      <button className="agent-issues-toggle" aria-expanded={diagnosticsOpen} onClick={()=>setDiagnosticsOpen(open=>!open)}>
        <span><strong>{diagnostics.issues.length} integrity issue{diagnostics.issues.length===1?"":"s"}</strong><small>Open the exact file, code, and repair message.</small></span>
        <b>{diagnosticsOpen?"Hide details":"Review details"}</b>
      </button>
      {diagnosticsOpen&&<div className="agent-issue-list">{diagnostics.issues.map((issue,index)=><div key={`${issue.code}-${issue.path||issue.id||index}-${index}`} className={issue.severity}>
        <span><b>{issue.area}</b><em>{issue.code}</em></span>
        <strong>{issue.message}</strong>
        {(issue.path||issue.id)&&<small>{[issue.id,issue.path].filter(Boolean).join(" · ")}</small>}
      </div>)}</div>}
    </section>}
    <section className="agent-tool-suite" aria-label="Research OS agent tools">
      <div className="agent-tool-heading">
        <div><span className="eyebrow">Frontier model toolbelt</span><h2>Agent command center</h2><p>Every card maps to a real local Research OS operation. Copy a scoped task for Codex or Claude, or copy the exact local command when one is available.</p></div>
        <label>Focus record<select value={toolFocus?.id||""} onChange={event=>setToolFocusId(event.target.value)}>{records.map(record=><option key={record.id} value={record.id}>{record.id} · {record.title}</option>)}</select></label>
      </div>
      <nav className="agent-tool-filters" aria-label="Agent tool categories">{toolCategories.map(category=><button key={category.value} aria-pressed={toolCategory===category.value} className={toolCategory===category.value?"active":""} onClick={()=>setToolCategory(category.value)}>{category.label}<b>{category.value==="all"?researchToolCatalog.length:researchToolCatalog.filter(tool=>tool.category===category.value).length}</b></button>)}</nav>
      <div className="agent-tool-grid">{shownTools.map(tool=><article key={tool.id} className={`agent-tool-card boundary-${tool.boundary}`}>
        <header><span>{tool.category.replace("-"," ")}</span><em>{tool.boundary.replace("-"," ")}</em></header>
        <h3>{tool.label}</h3><code>{tool.mcpName||tool.id}</code><p>{tool.purpose}</p>
        <footer><button className="primary" onClick={()=>void copyTool(tool,"prompt")}>{toolCopied===`${tool.id}-prompt`?"Task copied":"Copy AI task"}</button>{tool.cliCommand&&<button className="ghost" onClick={()=>void copyTool(tool,"command")}>{toolCopied===`${tool.id}-command`?"Command copied":"Copy command"}</button>}</footer>
      </article>)}</div>
    </section>
    <section className="lab-share" aria-label="Lab sharing snapshot">
      <div className="lab-share-copy"><span className="eyebrow">PI and lab sharing</span><h2>Share the reasoning, not the private vault</h2><p>Create a disposable Markdown view for discussion or handoff. It contains record IDs, concise summaries, explicit connections, uncertainty boundaries, and available source links while excluding private records, raw bodies, and literature staging files.</p></div>
      <div className="lab-share-controls">
        <div className="lab-share-mode" role="group" aria-label="Lab snapshot scope"><button className={shareMode==="focus"?"active":""} aria-pressed={shareMode==="focus"} onClick={()=>setShareMode("focus")}>Focused path</button><button className={shareMode==="project"?"active":""} aria-pressed={shareMode==="project"} onClick={()=>setShareMode("project")}>Project overview</button></div>
        <div className="lab-share-stats"><span><b>{labSnapshot.includedIds.length}</b> records shared</span><span><b>{labSnapshot.excludedPrivateCount+labSnapshot.excludedRestrictedCount}</b> private or restricted excluded</span><span><b>Read-only</b> noncanonical export</span></div>
        <div className="lab-share-actions"><button className="primary" onClick={()=>void copyLabSnapshot()}>{shareState==="copied"?"Snapshot copied":"Copy snapshot"}</button><button className="ghost" onClick={downloadLabSnapshot}>{shareState==="downloaded"?"Downloaded":"Download .md"}</button><details className="lab-share-more"><summary>More formats</summary><div><button className="ghost" onClick={()=>downloadShareArtifact(labHtml,"html","text/html;charset=utf-8")}>Download HTML</button><button className="ghost" onClick={()=>downloadShareArtifact(JSON.stringify(labManifest,null,2),"json","application/json;charset=utf-8")}>Download JSON</button><button className="ghost" onClick={openEmailDraft}>Open email draft</button></div></details></div>
        {labSnapshot.omittedPrivateConnectionCount>0&&<small className="lab-share-boundary-note">{labSnapshot.omittedPrivateConnectionCount} private or restricted connection target{labSnapshot.omittedPrivateConnectionCount===1?"":"s"} hidden from this export.</small>}
        {labSnapshot.includedIds.length===0&&<small className="lab-share-warning">This scope contains no public shareable records. Choose Project overview or change the focus record; private records stay excluded.</small>}
        {shareState==="failed"&&<small role="alert">The snapshot could not be exported. Try again from this local browser.</small>}
      </div>
    </section>
    <div className="ai-metrics">
      <div><span>Working models</span><strong>{workingModels.length}</strong><small>Read these before proposing mechanisms.</small></div>
      <div><span>Active ideas</span><strong>{activeIdeas.length}</strong><small>Structured alternatives and test gates.</small></div>
      <div><span>Open decisions</span><strong>{decisions.length}</strong><small>Human judgment still required.</small></div>
      <div><span>Evidence gaps</span><strong>{needsEvidence.length}</strong><small>Sources or verification remain incomplete.</small></div>
    </div>
    <div className="ai-columns">
      <section className="ai-read-order">
        <div><span className="eyebrow">Agent entrypoint</span><h2>Read in this order</h2></div>
        {[
          ["1","START_HERE.md","Repository map, project routing, and information-state boundaries."],
          ["2","AGENTS.md + project policy","Scientific reasoning, privacy, evidence, claim authority, and brainstorming contract."],
          ["3","TRAPS.md","Active scientific and operational failure modes to avoid."],
          ["4","CURRENT_STATE.md","Concise human-readable orientation; never independent evidence."],
          ["5","AGENT_START.md","Compact, source-hash-gated project routing."],
          ["6","Canonical linked records","Retrieve only the models, claims, papers, evidence, hypotheses, experiments, and results needed now."],
        ].map(([number,title,description])=><div className="ai-read-step" key={number}><b>{number}</b><span><strong>{title}</strong><small>{description}</small></span></div>)}
      </section>
      <section className="ai-actions">
        <div><span className="eyebrow">Attention map</span><h2>Decisions and blockers</h2></div>
        {!actionRecords.length&&<p className="ai-empty">No structured blockers or decisions are recorded.</p>}
        {actionRecords.slice(0,8).map(record=><button key={record.id} onClick={()=>openRecord(record)}>
          <span><b>{record.id}</b><em>{record.type}</em></span>
          <strong>{record.title}</strong>
          <small>{scalarField(record.fields,"decision_needed")||`Blocked by ${(record.fields.blockers as unknown[]).join(", ")}`}</small>
        </button>)}
      </section>
    </div>
    <div className="ai-boundary"><strong>Evidence boundary</strong><span>Generated indexes are maps. Scientific state changes only when canonical Markdown records are edited under the claim-status and human-review rules.</span></div>
  </div>;
}

function ReviewQueuePage(props:{
  entries:Array<{record:ResearchRecord;meta:ReviewMeta}>;visibleRecords:ResearchRecord[];
  selected?:ResearchRecord;reviewLane:ReviewLane|"all";
  setReviewLane:(lane:ReviewLane|"all")=>void;reviewPriority:ReviewPriority|"all";
  setReviewPriority:(priority:ReviewPriority|"all")=>void;setSelectedId:(id:string)=>void;
}) {
  const {entries,visibleRecords,selected,reviewLane,setReviewLane,reviewPriority,setReviewPriority,setSelectedId}=props;
  const visibleIds=new Set(visibleRecords.map(record=>record.id));
  const shown=entries.filter(entry=>visibleIds.has(entry.record.id));
  const laneOrder:ReviewLane[]=["blocked","verify","decide","analyze"];
  const priorityRank:Record<ReviewPriority,number>={high:0,medium:1,low:2};
  const ordered=[...shown].sort((a,b)=>laneOrder.indexOf(a.meta.lane)-laneOrder.indexOf(b.meta.lane)||priorityRank[a.meta.priority]-priorityRank[b.meta.priority]||a.record.id.localeCompare(b.record.id));
  const focusedIndex=Math.max(0,ordered.findIndex(entry=>entry.record.id===selected?.id));
  const focusedEntry=ordered[focusedIndex]||ordered[0];
  const countLane=(lane:ReviewLane)=>entries.filter(entry=>entry.meta.lane===lane).length;
  return <div className="review-workspace">
    <div className="review-hero">
      <div><span className="eyebrow">Human decision workspace</span><h1>Review Queue</h1><p>This is not a list of “bad” or low-confidence science. It collects records that have a specific next human decision, evidence check, prerequisite, or analysis task.</p></div>
      <div className="review-total"><strong>{entries.length}</strong><span>actionable records</span></div>
    </div>
    <div className="review-controls">
      <div className="review-lane-tabs">
        <button className={reviewLane==="all"?"active":""} onClick={()=>setReviewLane("all")}><b>{entries.length}</b><span>All actions</span></button>
        {laneOrder.map(lane=><button key={lane} className={`${lane} ${reviewLane===lane?"active":""}`} onClick={()=>setReviewLane(lane)}><b>{countLane(lane)}</b><span>{reviewLaneInfo[lane].label}</span></button>)}
      </div>
      <div className="priority-filter"><span>Priority</span>{(["all","high","medium","low"] as const).map(priority=><button key={priority} className={reviewPriority===priority?"active":""} onClick={()=>setReviewPriority(priority)}>{priority}</button>)}</div>
    </div>
    {focusedEntry&&<section className={`review-focus ${focusedEntry.meta.lane}`}>
      <div className="review-focus-top"><div><span className="eyebrow">Review focus {focusedIndex+1} of {ordered.length}</span><h2>{focusedEntry.record.title}</h2></div><div><span className={`tag ${focusedEntry.record.type}`}>{focusedEntry.record.type}</span><b>{focusedEntry.record.id}</b><em className={`priority ${focusedEntry.meta.priority}`}>{focusedEntry.meta.priority}</em></div></div>
      <div className="review-focus-grid"><article><span>Why it needs review</span><p>{focusedEntry.meta.reason}</p></article><article><span>Next human action</span><p>{focusedEntry.meta.action}</p></article><article><span>Exit condition</span><p>{focusedEntry.meta.exit}</p></article></div>
      <div className="review-focus-actions"><small>Its record, sources, and connected path are open in the reader on the right. Claims are never promoted automatically.</small><div><button className="ghost" disabled={focusedIndex===0} onClick={()=>setSelectedId(ordered[focusedIndex-1].record.id)}>Previous</button><button className="primary" disabled={focusedIndex>=ordered.length-1} onClick={()=>setSelectedId(ordered[focusedIndex+1].record.id)}>Next review</button></div></div>
    </section>}
    <div className="review-groups">
      {laneOrder.map(lane=>{
        const laneEntries=shown.filter(entry=>entry.meta.lane===lane)
          .sort((a,b)=>({high:0,medium:1,low:2}[a.meta.priority]-{high:0,medium:1,low:2}[b.meta.priority])||a.record.id.localeCompare(b.record.id));
        if(!laneEntries.length)return null;
        return <section className={`review-group ${lane}`} key={lane}>
          <div className="review-group-heading"><div><span className="review-lane-dot"/><h2>{reviewLaneInfo[lane].label}</h2></div><p>{reviewLaneInfo[lane].description}</p><b>{laneEntries.length}</b></div>
          <div className="review-list">{laneEntries.map(({record,meta})=><button className={`review-item ${selected?.id===record.id?"selected":""}`} key={record.id} onClick={()=>setSelectedId(record.id)}>
            <div className="review-item-id"><span className={`tag ${record.type}`}>{record.type}</span><b>{record.id}</b><em className={`priority ${meta.priority}`}>{meta.priority}</em></div>
            <div className="review-item-main"><h3>{record.title}</h3><p>{record.summary}</p><div><span><b>Why it’s here</b>{meta.reason}</span><span><b>Next human action</b>{meta.action}</span></div></div>
            <div className="review-item-exit"><span>Current status</span><b>{record.status}</b><p><strong>Leaves this queue when:</strong> {meta.exit}</p><em>Open review →</em></div>
          </button>)}</div>
        </section>;
      })}
      {!shown.length&&<div className="review-empty"><strong>No records match these filters.</strong><span>Choose another lane or priority.</span></div>}
    </div>
  </div>;
}

// Kept as a compatibility component for saved browser sessions created before the focused reader redesign.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function BranchExplorer(props:{record?:ResearchRecord;records:ResearchRecord[];setSelectedId:(id:string)=>void}) {
  const {record,records,setSelectedId}=props;
  if(!record)return null;
  const incoming=records.flatMap(source=>source.relations
    .filter(relation=>relation.target===record.id)
    .map(relation=>({record:source,relation:relation.type})));
  const outgoing=record.relations.map(relation=>({
    record:records.find(candidate=>candidate.id===relation.target),
    relation:relation.type,
  })).filter((item):item is {record:ResearchRecord;relation:string}=>Boolean(item.record));
  const referenced=record.links
    .filter(id=>!record.relations.some(relation=>relation.target===id))
    .map(id=>records.find(candidate=>candidate.id===id))
    .filter((item):item is ResearchRecord=>Boolean(item))
    .map(item=>({record:item,relation:"references"}));
  const forward=outgoing.length?outgoing:referenced;
  const branchButton=(item:{record:ResearchRecord;relation:string},direction:"in"|"out")=><button key={`${direction}-${item.record.id}-${item.relation}`} className={`branch-card ${item.record.type}`} onClick={()=>setSelectedId(item.record.id)}>
    <span><b>{item.relation}</b>{direction==="in"?" →":" ↗"}</span>
    <strong>{item.record.title}</strong>
    <small>{item.record.type} · {item.record.id}</small>
  </button>;
  return <section className="branch-explorer">
    <div className="branch-heading"><div><span className="eyebrow">Follow the evidence</span><h2>Connected research path</h2></div><small>Choose any branch to continue</small></div>
    <div className="branch-flow">
      <div className="branch-column">
        <h3>Leads into <span>{incoming.length}</span></h3>
        <div className="branch-stack">{incoming.length?incoming.map(item=>branchButton(item,"in")):<p>No incoming typed relationships yet.</p>}</div>
      </div>
      <article className={`branch-current ${record.type}`}>
        <span className={`tag ${record.type}`}>{record.type}</span>
        <small>{record.id}</small>
        <h3>{record.title}</h3>
        <p>{record.summary}</p>
      </article>
      <div className="branch-column">
        <h3>{outgoing.length?"Branches to":"Referenced records"} <span>{forward.length}</span></h3>
        <div className="branch-stack">{forward.length?forward.map(item=>branchButton(item,"out")):<p>No outgoing relationships or references yet.</p>}</div>
      </div>
    </div>
  </section>;
}

function RecordConnections(props:{record:ResearchRecord;records:ResearchRecord[];setSelectedId:(id:string)=>void}) {
  const {record,records,setSelectedId}=props;
  const incoming=records.flatMap(source=>source.relations
    .filter(relation=>relation.target===record.id)
    .map(relation=>({record:source,relation:relation.type})));
  const outgoing=record.relations.map(relation=>({
    record:records.find(candidate=>candidate.id===relation.target), relation:relation.type,
  })).filter((item):item is {record:ResearchRecord;relation:string}=>Boolean(item.record));
  const referenced=record.links
    .filter(id=>!record.relations.some(relation=>relation.target===id))
    .map(id=>records.find(candidate=>candidate.id===id))
    .filter((item):item is ResearchRecord=>Boolean(item))
    .map(item=>({record:item,relation:"reference"}));
  const connectionButton=(item:{record:ResearchRecord;relation:string},direction:"in"|"out"|"reference")=><button key={`${direction}-${item.record.id}-${item.relation}`} className={`connection-card ${item.record.type}`} onClick={()=>setSelectedId(item.record.id)}>
    <span><b>{direction==="in"?"Connects into this record":direction==="out"?"This record connects to":"Reference"}</b><em>{item.relation}</em></span>
    <strong>{item.record.title}</strong>
    <small>{item.record.type} · {item.record.id}</small>
  </button>;
  const lane=(label:string,items:{record:ResearchRecord;relation:string}[],direction:"in"|"out"|"reference",empty:string)=><section className="connection-lane"><h3>{label}<span>{items.length}</span></h3><div>{items.length?items.map(item=>connectionButton(item,direction)):<p>{empty}</p>}</div></section>;
  return <section className="record-connections" aria-label="Connected research path">
    <div className="connection-heading"><div><span className="eyebrow">Follow the evidence</span><h3>Connected path</h3></div><small>Typed links are map edges; references are navigation only.</small></div>
    <div className="connection-lanes">
      {lane("Connects into this record",incoming,"in","No incoming typed relationships yet.")}
      {lane("This record connects to",outgoing,"out","No outgoing typed relationships yet.")}
      {lane("Other referenced records",referenced,"reference","No additional record references.")}
    </div>
  </section>;
}

function RecordCard(props:{record:ResearchRecord;selected:boolean;setSelectedId:(id:string)=>void}){
  const {record,selected,setSelectedId}=props;
  return <button className={`record-card ${record.type} ${selected?"selected":""}`} onClick={()=>setSelectedId(record.id)}><div><span className="tag">{record.type}</span><small>{record.id}</small></div><h2>{record.title}</h2><p>{record.summary}</p><footer><span>{record.status}</span><span>{record.links.length} links</span></footer></button>;
}

type FigureReference={id:string;caption:string;alt:string;sourceUrl:string;locator:string;status:string;path:string;assetSha256:string;mimeType:string};

function figureReferences(record:ResearchRecord):FigureReference[]{
  const raw=record.fields.figures;
  if(!Array.isArray(raw))return [];
  return raw.map((entry,index)=>{
    if(typeof entry==="string")return {id:`FIG-${record.id}-${index+1}`,caption:entry,alt:"",sourceUrl:"",locator:"",status:"staged",path:"",assetSha256:"",mimeType:""};
    const value=entry&&typeof entry==="object"?entry as Record<string,unknown>:{};
    return {
      id:scalarField(value,"id",`FIG-${record.id}-${index+1}`), caption:scalarField(value,"caption"), alt:scalarField(value,"alt"),
      sourceUrl:scalarField(value,"source_url"), locator:scalarField(value,"locator"), status:scalarField(value,"evidence_status","staged"), path:scalarField(value,"path"), assetSha256:scalarField(value,"asset_sha256"), mimeType:scalarField(value,"mime_type"),
    };
  }).filter(figure=>figure.caption||figure.sourceUrl||figure.path);
}

function RecordAtAGlance({record,records}:{record:ResearchRecord;records:ResearchRecord[]}){
  const direct=record.relations.length+records.filter(candidate=>candidate.id!==record.id&&candidate.relations.some(relation=>relation.target===record.id)).length;
  const blockers=record.fields.blockers;
  const blockerCount=Array.isArray(blockers)?blockers.filter(Boolean).length:scalarField(record.fields,"blockers")?1:0;
  const nextAction=scalarField(record.fields,"next_action")||scalarField(record.fields,"decision_needed")||"Not recorded";
  const review=record.type==="paper"?scalarField(record.fields,"review_depth","unread"):record.type==="claim"?(record.fields.human_reviewed===true?"human reviewed":"not human reviewed"):record.status;
  const figures=figureReferences(record).length;
  return <section className="record-glance" aria-label="Record at a glance">
    <div><span>Connections</span><b>{direct}</b></div><div><span>{record.type==="paper"?"Review depth":"State"}</span><b>{review}</b></div>{blockerCount>0&&<div><span>Blockers</span><b>{blockerCount}</b></div>}{figures>0&&<div><span>Figures</span><b>{figures}</b></div>}
    <div className="record-glance-next"><span>Next action</span><b>{nextAction}</b></div>
  </section>;
}

function figureAssetUrl(projectId:string,figurePath:string){
  return `/api/figure-asset?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(figurePath)}`;
}

async function encodeFigureFile(file:File){
  const bytes=new Uint8Array(await file.arrayBuffer());
  let binary="";
  for(let index=0;index<bytes.length;index+=0x8000)binary+=String.fromCharCode(...bytes.subarray(index,index+0x8000));
  return btoa(binary);
}

function FigureComposer({record,projectId,saveFigures}:{record:ResearchRecord;projectId:string;saveFigures:(record:ResearchRecord,figures:FigureReference[])=>Promise<boolean>}){
  const [caption,setCaption]=useState(""); const [alt,setAlt]=useState(""); const [locator,setLocator]=useState(""); const [sourceUrl,setSourceUrl]=useState("");
  const [file,setFile]=useState<File|null>(null); const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  const figures=figureReferences(record);
  async function addFigure(){
    if(!caption.trim()&&!sourceUrl.trim()&&!file){setError("Add a caption, a source link, or a local image.");return;}
    if(sourceUrl.trim()&&!/^https?:\/\//i.test(sourceUrl.trim())){setError("Source links must start with http:// or https://.");return;}
    if(file&&(!["image/png","image/jpeg","image/webp","image/gif"].includes(file.type)||file.size>10_000_000)){setError("Choose a PNG, JPEG, WebP, or GIF under 10 MB.");return;}
    setSaving(true);setError("");
    try{
      let assetPath="",assetSha256="",mimeType="";
      if(file){
        const response=await fetch("/api/figure-asset",{method:"POST",headers:await localWriteHeaders(),body:JSON.stringify({projectId,fileName:file.name,mimeType:file.type,base64:await encodeFigureFile(file)})});
        const payload=await response.json() as {path?:string;sha256?:string;mimeType?:string;error?:string};
        if(!response.ok||!payload.path)throw new Error(payload.error||"Could not save the local figure asset.");
        assetPath=payload.path;assetSha256=String(payload.sha256||"");mimeType=String(payload.mimeType||"");
      }
      const figure:FigureReference={id:`FIG-${record.id}-${String(figures.length+1).padStart(2,"0")}`,caption:caption.trim(),alt:alt.trim(),sourceUrl:sourceUrl.trim(),locator:locator.trim(),status:sourceUrl.trim()?"source-linked":"staged",path:assetPath,assetSha256,mimeType};
      if(!await saveFigures(record,[...figures,figure]))throw new Error("The figure metadata was not saved.");
      setCaption("");setAlt("");setLocator("");setSourceUrl("");setFile(null);
      const input=document.getElementById(`figure-file-${record.id}`) as HTMLInputElement|null;if(input)input.value="";
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not add the figure.");}finally{setSaving(false);}
  }
  async function removeFigure(id:string){
    setSaving(true);setError("");
    try{if(!await saveFigures(record,figures.filter(figure=>figure.id!==id)))throw new Error("The figure reference was not removed.");}catch(reason){setError(reason instanceof Error?reason.message:"Could not remove the figure reference.");}finally{setSaving(false);}
  }
  return <section className="figure-composer" aria-label="Add a source-aware figure">
    <div className="section-title"><strong>Add figure context</strong><span>Optional</span></div>
    <p>Use only decision-relevant figures. The source, caption, and review state remain in canonical Markdown; this never marks a record as human reviewed.</p>
    <div className="figure-composer-fields"><label>Caption<input value={caption} onChange={event=>setCaption(event.target.value)} placeholder="What the figure shows"/></label><label>Source URL<input value={sourceUrl} onChange={event=>setSourceUrl(event.target.value)} placeholder="https://doi.org/..."/></label><label>Locator<input value={locator} onChange={event=>setLocator(event.target.value)} placeholder="Figure 2C"/></label><label>Alt text<input value={alt} onChange={event=>setAlt(event.target.value)} placeholder="Accessible description"/></label><label className="wide">Local image <input id={`figure-file-${record.id}`} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event=>setFile(event.target.files?.[0]||null)}/><small>Optional; stored under this project’s private <code>16 Media</code> folder.</small></label></div>
    {error&&<p className="figure-error" role="alert">{error}</p>}<div className="figure-composer-actions"><button className="ghost" disabled={saving} onClick={()=>void addFigure()}>{saving?"Saving…":"Add figure reference"}</button></div>
    {figures.length>0&&<div className="figure-reference-actions">{figures.map(figure=><button key={figure.id} disabled={saving} onClick={()=>void removeFigure(figure.id)}><span>{figure.locator||figure.id}</span><b>Remove</b></button>)}</div>}
  </section>;
}

function RecordFigureReferences({record,projectId}:{record:ResearchRecord;projectId:string}){
  const figures=figureReferences(record);
  if(!figures.length)return null;
  return <section className="figure-references" aria-label="Figure references">
    <div className="section-title"><strong>Figure references</strong><span>{figures.length}</span></div>
    <p>Source-linked figures are context for reading. Their presence does not establish a claim or human review.</p>
    {figures.some(figure=>figure.path)&&<div className="figure-previews">{figures.filter(figure=>figure.path).map(figure=><figure key={`${figure.id}-preview`}><img src={figureAssetUrl(projectId,figure.path)} alt={figure.alt||figure.caption||`Figure reference ${figure.id}`}/><figcaption>{figure.locator||figure.id}</figcaption></figure>)}</div>}
    <div>{figures.map(figure=><article key={figure.id}><div><b>{figure.locator||figure.id}</b><span>{figure.status}</span></div><strong>{figure.caption||"Untitled figure reference"}</strong>{figure.alt&&<small>Alt text: {figure.alt}</small>}{figure.path&&<small>Local asset: {figure.path}</small>}{figure.sourceUrl&&<a href={figure.sourceUrl} target="_blank" rel="noreferrer">Open source figure ↗</a>}</article>)}</div>
  </section>;
}

function ExperimentLibraryPage(props:{records:ResearchRecord[];selectedId:string;setSelectedId:(id:string)=>void}){
  const {records,selectedId,setSelectedId}=props;
  const groups=[
    {key:"proposed",title:"Proposed and in progress",description:"Concepts, designs, gates, ready work, and active runs. These are not completed evidence.",records:records.filter(record=>!["complete","parked","retired"].includes(record.status))},
    {key:"completed",title:"Completed experiments",description:"Experiment records marked complete. Read their linked results before treating an outcome as established.",records:records.filter(record=>record.status==="complete")},
    {key:"archived",title:"Parked or retired",description:"Kept for scientific provenance, but not currently proposed work.",records:records.filter(record=>["parked","retired"].includes(record.status))},
  ];
  return <div className="experiment-library">
    <div className="library-heading"><div><span className="eyebrow">Experiments</span><h1>Experiment pipeline</h1><p>Status stays canonical in Markdown; this view separates planning from completed work without rewriting any scientific record.</p></div><b>{records.length} records</b></div>
    {groups.map(group=><section className={`experiment-group ${group.key}`} key={group.key}>
      <header><div><span className="eyebrow">{group.key==="proposed"?"Plan":group.key==="completed"?"Completed":"Archive"}</span><h2>{group.title}</h2><p>{group.description}</p></div><b>{group.records.length}</b></header>
      {group.records.length?<div className="record-grid">{group.records.map(record=><RecordCard key={record.id} record={record} selected={selectedId===record.id} setSelectedId={setSelectedId}/>)}</div>:<p className="experiment-empty">No experiments in this stage yet.</p>}
    </section>)}
  </div>;
}

function RecordDisclosure({children,className="",initiallyOpen=false,meta,title}:{children:ReactNode;className?:string;initiallyOpen?:boolean;meta:ReactNode;title:string}){
  const [open,setOpen]=useState(initiallyOpen);
  return <details className={`reader-disclosure ${className}`} open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><span>{title}</span><small>{meta}</small></summary>
    <div className="reader-disclosure-body">{children}</div>
  </details>;
}

function DetailPanel(props: {
  record?:ResearchRecord; records:ResearchRecord[]; projectId:string; editing:boolean; setEditing:(x:boolean)=>void;
  expanded:boolean; setExpanded:(x:boolean)=>void;
  draftTitle:string; setDraftTitle:(x:string)=>void;draftSummary:string;setDraftSummary:(x:string)=>void;
  draftStatus:string; setDraftStatus:(x:string)=>void;
  draftBody:string; setDraftBody:(x:string)=>void; saveDetails:()=>void;
  draftIdeaMaturity:string;setDraftIdeaMaturity:(x:string)=>void;
  draftIdeaDisposition:string;setDraftIdeaDisposition:(x:string)=>void;
  draftIdeaPriority:string;setDraftIdeaPriority:(x:string)=>void;
  draftEvidenceStrength:string;setDraftEvidenceStrength:(x:string)=>void;
  draftFeasibility:string;setDraftFeasibility:(x:string)=>void;
  draftDecisionNeeded:string;setDraftDecisionNeeded:(x:string)=>void;
  draftNextAction:string;setDraftNextAction:(x:string)=>void;
  draftBlockers:string;setDraftBlockers:(x:string)=>void;
  draftHumanReviewed:boolean;setDraftHumanReviewed:(x:boolean)=>void;
  draftReviewedBy:string;setDraftReviewedBy:(x:string)=>void;
  draftReviewedAt:string;setDraftReviewedAt:(x:string)=>void;
  draftEvidenceAnchors:string;setDraftEvidenceAnchors:(x:string)=>void; saveFigures:(record:ResearchRecord,figures:FigureReference[])=>Promise<boolean>;
  persistRelations:(id:string, relations:Relation[])=>Promise<void>; setSelectedId:(id:string)=>void;
}) {
  const {record,records,projectId,editing,setEditing,expanded,setExpanded,draftTitle,setDraftTitle,draftSummary,setDraftSummary,draftStatus,setDraftStatus,draftBody,setDraftBody,draftIdeaMaturity,setDraftIdeaMaturity,draftIdeaDisposition,setDraftIdeaDisposition,draftIdeaPriority,setDraftIdeaPriority,draftEvidenceStrength,setDraftEvidenceStrength,draftFeasibility,setDraftFeasibility,draftDecisionNeeded,setDraftDecisionNeeded,draftNextAction,setDraftNextAction,draftBlockers,setDraftBlockers,draftHumanReviewed,setDraftHumanReviewed,draftReviewedBy,setDraftReviewedBy,draftReviewedAt,setDraftReviewedAt,draftEvidenceAnchors,setDraftEvidenceAnchors,saveDetails,saveFigures,persistRelations,setSelectedId}=props;
  const [managingRecordId,setManagingRecordId]=useState("");
  const panelRef=useRef<HTMLElement>(null);
  useEffect(()=>{
    panelRef.current?.scrollTo({top:0,left:0});
  },[record?.id,expanded]);
  if(!record)return <aside ref={panelRef} className="detail-panel"><div className="empty">Select a record.</div></aside>;
  const sections=contentSections(record.body);
  const referencedPapers=record.links.map(id=>records.find(r=>r.id===id)).filter((r):r is ResearchRecord=>Boolean(r&&r.type==="paper"));
  const figures=figureReferences(record);
  const hasEvidence=record.urls.length>0||referencedPapers.length>0||figures.length>0;
  const manageConnections=managingRecordId===record.id;
  return <aside ref={panelRef} className={`detail-panel ${record.type}`}>
    <div className="detail-top"><div><span className={`tag ${record.type}`}>{record.type}</span><small>{record.id}</small></div><div className="detail-actions"><button className="ghost expand-detail" aria-label={expanded?"Back to map or list":"Open record reader"} aria-pressed={expanded} onClick={()=>setExpanded(!expanded)}><span className="expand-detail-full">{expanded?"Collapse":"Expand"}</span><span className="expand-detail-compact" aria-hidden="true">{expanded?"Back to list":"Read"}</span></button><button className="ghost" onClick={()=>setEditing(!editing)}>{editing?"Cancel":"Edit file"}</button></div></div>
    {editing&&<label className="summary-editor">Summary<textarea value={draftSummary} onChange={event=>setDraftSummary(event.target.value)}/></label>}
    {editing?<div className="detail-editor"><label>Title<input value={draftTitle} onChange={e=>setDraftTitle(e.target.value)}/></label><label>Status<select value={draftStatus} onChange={e=>setDraftStatus(e.target.value)}>{recordTypeConfig[record.type].statuses.map(value=><option key={value}>{value}</option>)}</select></label>{record.type==="idea"&&<div className="idea-editor-grid"><label>Maturity<select value={draftIdeaMaturity} onChange={e=>setDraftIdeaMaturity(e.target.value)}>{ideaMaturities.map(value=><option key={value}>{value}</option>)}</select></label><label>Disposition<select value={draftIdeaDisposition} onChange={e=>setDraftIdeaDisposition(e.target.value)}>{ideaDispositions.map(value=><option key={value}>{value}</option>)}</select></label><label>Priority<select value={draftIdeaPriority} onChange={e=>setDraftIdeaPriority(e.target.value)}>{ideaPriorities.map(value=><option key={value}>{value}</option>)}</select></label><label>Evidence strength<select value={draftEvidenceStrength} onChange={e=>setDraftEvidenceStrength(e.target.value)}>{evidenceStrengths.map(value=><option key={value}>{value}</option>)}</select></label><label>Feasibility<select value={draftFeasibility} onChange={e=>setDraftFeasibility(e.target.value)}>{feasibilityLevels.map(value=><option key={value}>{value}</option>)}</select></label><label>Blockers, comma separated<input value={draftBlockers} onChange={e=>setDraftBlockers(e.target.value)}/></label><label className="wide">Decision needed<textarea value={draftDecisionNeeded} onChange={e=>setDraftDecisionNeeded(e.target.value)}/></label><label className="wide">Next action<textarea value={draftNextAction} onChange={e=>setDraftNextAction(e.target.value)}/></label></div>}{record.type==="claim"&&<div className="idea-editor-grid claim-review-editor"><label className="review-check"><input type="checkbox" checked={draftHumanReviewed} onChange={e=>setDraftHumanReviewed(e.target.checked)}/>Human review completed</label><label>Reviewed by<input value={draftReviewedBy} onChange={e=>setDraftReviewedBy(e.target.value)} placeholder="Initials or lab role"/></label><label>Review date<input type="date" value={draftReviewedAt} onChange={e=>setDraftReviewedAt(e.target.value)}/></label><label>Evidence anchors<input value={draftEvidenceAnchors} onChange={e=>setDraftEvidenceAnchors(e.target.value)} placeholder="EVD-001, EVD-002"/></label><p className="wide review-gate-note">The supported status is accepted only when human review, reviewer, date, and at least one EVD evidence anchor are recorded.</p></div>}<label>Markdown body<textarea value={draftBody} onChange={e=>setDraftBody(e.target.value)}/></label><button className="primary" onClick={saveDetails}>Save Markdown</button></div>:<>
      <h2>{record.title}</h2><div className="detail-meta"><span>Status <b>{record.status}</b></span><span>Confidence <b>{record.confidence}</b></span></div>
      <div className="detail-summary"><span>Summary</span><p>{linkedText(record.summary)}</p></div>
      <RecordAtAGlance record={record} records={records}/>
      {record.type==="idea"&&(Number(scalarField(record.fields,"schema_version","0"))===2?<section className="idea-lens"><div><span>Maturity</span><b>{scalarField(record.fields,"maturity")}</b></div><div><span>Disposition</span><b>{scalarField(record.fields,"disposition")}</b></div><div><span>Priority</span><b>{scalarField(record.fields,"priority")}</b></div><div><span>Evidence</span><b>{scalarField(record.fields,"evidence_strength")}</b></div><div><span>Feasibility</span><b>{scalarField(record.fields,"feasibility")}</b></div>{scalarField(record.fields,"decision_needed")&&<p><strong>Decision needed</strong>{scalarField(record.fields,"decision_needed")}</p>}{scalarField(record.fields,"next_action")&&<p><strong>Next action</strong>{scalarField(record.fields,"next_action")}</p>}</section>:<div className="legacy-schema-note"><strong>Legacy idea structure</strong><span>This idea is included in the schema v2 migration preview. Its scientific text has not been rewritten.</span></div>)}
      {hasEvidence&&<RecordDisclosure key={`${record.id}-evidence`} className="evidence-disclosure" initiallyOpen meta={figures.length+record.urls.length+referencedPapers.length} title="Evidence & sources">
          <RecordFigureReferences record={record} projectId={projectId}/>
          {(record.urls.length>0||referencedPapers.length>0)&&<section className="source-panel">
            {record.urls.length>0&&<div><strong>Source links</strong>{record.urls.map(url=><a key={url} href={url} target="_blank" rel="noreferrer"><span><em>{externalLinkKind(url)}</em>{shortLinkLabel(url)}</span><b>Open ↗</b></a>)}</div>}
            {referencedPapers.length>0&&<div><strong>Referenced papers</strong>{referencedPapers.map(paper=><button key={paper.id} onClick={()=>setSelectedId(paper.id)}><span><b>{paper.id}</b>{paper.title}</span><em>{paper.urls.length?"Links available":"Open record"}</em></button>)}</div>}
          </section>}
      </RecordDisclosure>}
      <RecordDisclosure key={`${record.id}-path`} className="connected-disclosure" meta={record.relations.length+records.filter(candidate=>candidate.id!==record.id&&candidate.relations.some(relation=>relation.target===record.id)).length} title="Connected path">
        <RecordConnections record={record} records={records} setSelectedId={setSelectedId}/>
      </RecordDisclosure>
      {["paper","hypothesis","experiment","result","model"].includes(record.type)&&<RecordDisclosure key={`${record.id}-figures`} className="figure-disclosure" meta="Optional" title="Add figure context">
        <FigureComposer key={record.id} record={record} projectId={projectId} saveFigures={saveFigures}/>
      </RecordDisclosure>}
      {sections.length>0&&<RecordDisclosure key={`${record.id}-full-${expanded}`} className="full-record-disclosure" initiallyOpen={expanded} meta={`${sections.length} sections`} title="Full record">
        <div className="section-cards">{sections.map(section=><section key={section.title}><h3>{section.title}</h3><div>{linkedText(section.content)}</div></section>)}</div>
      </RecordDisclosure>}
      <RecordDisclosure key={`${record.id}-explicit`} className="explicit-disclosure" meta={record.relations.length} title="Explicit connections">
        <section className="relation-list">
          <div className="section-title"><strong>Explicit connections</strong><div><span>{record.relations.length}</span><button className="ghost manage-connections" aria-expanded={manageConnections} onClick={()=>setManagingRecordId(manageConnections?"":record.id)}>{manageConnections?"Done":"Manage connections"}</button></div></div>
          <p className="muted-copy">Changes save immediately.</p>
          {record.relations.length?record.relations.map((rel,i)=><div className="relation-row" key={`${rel.target}-${i}`}><button onClick={()=>setSelectedId(rel.target)}><b>{rel.type}</b><span>{rel.target}: {records.find(r=>r.id===rel.target)?.title||"missing record"}</span></button>{manageConnections&&<button className="remove" title="Remove connection" onClick={()=>void persistRelations(record.id,record.relations.filter((_,idx)=>idx!==i))}>×</button>}</div>):<p className="muted-copy">No typed relationships yet. Use “Draw link” on the canvas.</p>}
        </section>
      </RecordDisclosure>
    </>}
  </aside>;
}

declare global {
  interface Window { showDirectoryPicker(options?:{mode?:"read"|"readwrite"}):Promise<FileSystemDirectoryHandle>; }
  interface FileSystemDirectoryHandle { entries():AsyncIterableIterator<[string,FileSystemHandle]>; }
}
