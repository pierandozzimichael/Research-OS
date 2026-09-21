import { parseDocument, stringify } from "yaml";

export const SCHEMA_VERSION = 2;

export const recordTypeConfig = {
  project: {prefix:"PRJ",folder:"00 Dashboard",label:"Project",defaultStatus:"active",statuses:["active","paused","completed","archived"]},
  policy: {prefix:"POL",folder:"00 Dashboard",label:"Policy",defaultStatus:"draft",statuses:["draft","canonical","retired"]},
  source: {prefix:"SRC",folder:"02 Sources",label:"Source",defaultStatus:"captured",statuses:["captured","imported","verified","superseded"]},
  paper: {prefix:"PAP",folder:"03 Papers",label:"Paper",defaultStatus:"inbox",statuses:["inbox","citation-needed","to-verify","secondary-source","reviewed-abstract","agent-verified","reviewed","superseded"]},
  claim: {prefix:"CLM",folder:"04 Claims",label:"Claim",defaultStatus:"provisional",statuses:["inbox","provisional","contested","supported","refuted","retired"]},
  entity: {prefix:"ENT",folder:"05 Entities",label:"Entity",defaultStatus:"active",statuses:["draft","active","ambiguous","retired"]},
  topic: {prefix:"TOP",folder:"06 Topics",label:"Topic",defaultStatus:"active",statuses:["draft","active","paused","retired"]},
  method: {prefix:"METHOD",folder:"07 Methods",label:"Method",defaultStatus:"unverified-draft",statuses:["unverified-draft","verified","authorized","superseded","retired"]},
  idea: {prefix:"IDEA",folder:"08 Ideas",label:"Idea",defaultStatus:"active",statuses:["active","parked","rejected","merged","retired"]},
  hypothesis: {prefix:"HYP",folder:"09 Hypotheses",label:"Hypothesis",defaultStatus:"candidate",statuses:["idea","exploratory","candidate","prioritized","source-required","testing","supported","challenged","retired"]},
  experiment: {prefix:"EXP",folder:"10 Experiments",label:"Experiment",defaultStatus:"concept",statuses:["concept","design","gated","blocked-by-source","near-term","long-term","ready","active","complete","parked","retired"]},
  result: {prefix:"RES",folder:"11 Results",label:"Result",defaultStatus:"preliminary",statuses:["awaiting-data","preliminary","preliminary-observation","analyzed","reviewed","superseded"]},
  model: {prefix:"MOD",folder:"12 Mechanistic Models",label:"Model",defaultStatus:"working",statuses:["draft","working","supported","contested","retired"]},
  decision: {prefix:"DEC",folder:"13 Decisions",label:"Decision",defaultStatus:"proposed",statuses:["proposed","accepted","rejected","superseded","revisit"]},
  evidence: {prefix:"EVD",folder:"15 Evidence",label:"Evidence",defaultStatus:"unverified",statuses:["unverified","abstract-checked","source-verified","human-reviewed","contested","superseded"]},
} as const;

export type RecordType = keyof typeof recordTypeConfig;
export const recordTypes = Object.keys(recordTypeConfig) as RecordType[];

export const coreLibraryTypes:RecordType[] = ["paper","idea","hypothesis","experiment","result"];
export const knowledgeLibraryTypes:RecordType[] = ["project","policy","source","claim","entity","topic","method","model","decision","evidence"];
export const graphDefaultTypes:RecordType[] = ["paper","claim","idea","hypothesis","experiment","result","model"];

export const relationTypes = [
  "supports","challenges","generated","tests","produces","updates","depends-on",
  "related","derived-from","informs","contradicts","supersedes","uses","measures","documents",
] as const;

export const ideaMaturities = ["captured","shaped","evidence-seeking","testable","prioritized","promoted"] as const;
export const ideaDispositions = ["active","parked","rejected","merged"] as const;
export const ideaPriorities = ["high","medium","low","unrated"] as const;
export const evidenceStrengths = ["none","weak","mixed","moderate","strong","unrated"] as const;
export const feasibilityLevels = ["unknown","low","medium","high"] as const;
export const authorshipTypes = ["human","ai-assisted","ai-suggested"] as const;
export const paperReviewDepths = ["unread","metadata","abstract","full-text"] as const;

export type ParsedMarkdownRecord = {
  fields:Record<string,unknown>;
  body:string;
  errors:string[];
};

export type ValidationIssue = {
  severity:"error"|"warning";
  code:string;
  message:string;
  id?:string;
  path?:string;
};

export type Connection = {type:string;target:string};

export function isRecordType(value:unknown):value is RecordType {
  return typeof value==="string"&&recordTypes.includes(value as RecordType);
}

export function scalarField(fields:Record<string,unknown>,key:string,fallback="") {
  const value=fields[key];
  if(value===null||value===undefined)return fallback;
  if(typeof value==="string"||typeof value==="number"||typeof value==="boolean")return String(value);
  return fallback;
}

export function stringListField(fields:Record<string,unknown>,key:string):string[] {
  const value=fields[key];
  if(Array.isArray(value))return value.map(String).filter(Boolean);
  if(typeof value==="string"&&value.trim())return [value.trim()];
  return [];
}

export function parseMarkdownRecord(raw:string):ParsedMarkdownRecord {
  const block=raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if(!block)return {fields:{},body:raw.trim(),errors:["Missing or malformed YAML frontmatter."]};
  const document=parseDocument(block[1],{
    prettyErrors:true,
    strict:true,
    uniqueKeys:true,
  });
  const errors=document.errors.map(error=>error.message);
  const value=errors.length?{}:document.toJS({maxAliasCount:20});
  const fields=value&&typeof value==="object"&&!Array.isArray(value)
    ? value as Record<string,unknown>
    : {};
  if(!Object.keys(fields).length&&!errors.length)errors.push("Frontmatter must be a YAML mapping.");
  return {fields,body:block[2].trim(),errors};
}

export function renderMarkdownRecord(fields:Record<string,unknown>,body:string) {
  const frontmatter=stringify(fields,{lineWidth:0}).trimEnd();
  return `---\n${frontmatter}\n---\n\n${body.trim()}\n`;
}

export function updateRecordFields(raw:string,updates:Record<string,unknown>) {
  const parsed=parseMarkdownRecord(raw);
  if(parsed.errors.length)return raw;
  return renderMarkdownRecord({...parsed.fields,...updates},parsed.body);
}

export function replaceRecordBody(raw:string,body:string) {
  const parsed=parseMarkdownRecord(raw);
  if(parsed.errors.length)return raw;
  return renderMarkdownRecord(parsed.fields,body);
}

export function parseConnections(body:string):Connection[] {
  const heading=body.match(/^##\s+Connections\s*$/mi);
  if(heading?.index===undefined)return [];
  const start=heading.index+heading[0].length;
  const remainder=body.slice(start);
  const nextHeading=remainder.search(/^##\s+/m);
  const section=nextHeading<0?remainder:remainder.slice(0,nextHeading);
  return [...section.matchAll(/^\s*-\s*([a-z-]+)\s+\[\[([A-Z]+-\d{3,})[^\]]*\]\]/gmi)]
    .map(match=>({type:match[1].toLowerCase(),target:match[2]}));
}

export function wikiLinkIds(body:string) {
  return [...body.matchAll(/\[\[([A-Z]+-\d{3,})[^\]]*\]\]/g)].map(match=>match[1]);
}

function commonFields(type:RecordType,id:string,title:string,summary:string) {
  const config=recordTypeConfig[type];
  const fields:Record<string,unknown>={
    schema_version:SCHEMA_VERSION,
    type,
    id,
    title,
    status:config.defaultStatus,
    privacy:type==="paper"||type==="claim"||type==="policy"?"public":"private",
    summary,
    created:new Date().toISOString().slice(0,10),
    updated:new Date().toISOString().slice(0,10),
  };
  if(["paper","claim","idea","hypothesis","experiment","result","model","evidence"].includes(type)){
    fields.confidence=type==="experiment"?"n/a":"unrated";
  }
  return fields;
}

const bodyTemplates:Record<RecordType,string> = {
  project:`# {{title}}

## Purpose

{{summary}}

## Central question

## Decisions this project supports

## Scope

## Guardrails

## Current state

## Connections

_No explicit connections._`,
  policy:`# {{title}}

## Policy

{{summary}}

## Scope

## Rules

## Exceptions

## Review cadence

## Connections

_No explicit connections._`,
  source:`# {{title}}

## Provenance

{{summary}}

## Source description

## Import or collection method

## Integrity and privacy notes

## Derived records

## Connections

_No explicit connections._`,
  paper:`# {{title}}

## One-sentence question

## Why this paper matters

{{summary}}

## Study design

## DIRECT — what the data show

## AUTHOR — authors' interpretation

## INFERENCE — my interpretation

## SPECULATION — ideas generated

## Ancestry definition

- Self-identified population:
- Global ancestry:
- Local ancestry:
- APOE genotype:
- APOE haplotype:
- Specific variants:

## Figures supporting each claim

## Methods personally checked

## Evidence anchors created

## Strengths

## Limitations

## Connections

_No explicit connections._`,
  claim:`# {{title}}

## Exact claim

{{summary}}

## Supporting evidence

## Contradicting evidence

## Scope conditions

## Possible mechanisms

## Alternative explanations

## Experiment that would discriminate

## Current assessment

## Human review

- Reviewer:
- Review date:
- Evidence anchors:
- Methods, figures, sample structure, statistics, and scope checked:

## Connections

_No explicit connections._`,
  entity:`# {{title}}

## Definition

{{summary}}

## Identifiers and aliases

## Project relevance

## Ambiguities

## Connections

_No explicit connections._`,
  topic:`# {{title}}

## Scope

{{summary}}

## Current synthesis

## Key claims

## Contradictions

## Open questions

## Connections

_No explicit connections._`,
  method:`# {{title}}

## Purpose

{{summary}}

## Authorized source

## Inputs and prerequisites

## Procedure summary

## Quality control

## Limitations and safety boundaries

## Connections

_No explicit connections._`,
  idea:`# {{title}}

## One-sentence idea

{{summary}}

## Problem or decision addressed

## Origin and derivation

## Mechanistic rationale

## Evidence for

## Evidence against

## Assumptions

## Competing explanations

## Predictions

## Cheapest discriminating test

## Stronger follow-up

## Controls and confounders

## Falsification and stop criteria

## Dependencies and resources

## Promotion criteria

## AI critique history

## Human decision history

## Connections

_No explicit connections._`,
  hypothesis:`# {{title}}

## Exact hypothesis

{{summary}}

## Mechanistic rationale

## Evidence that generated it

## Predicted observations

## Competing hypotheses

## Necessary controls

## Suitable model and assays

## Confounders

## Falsification criteria

## Cheapest first test

## Scientific value and feasibility

## Connections

_No explicit connections._`,
  experiment:`# {{title}}

## Question and primary endpoint

{{summary}}

## Biological model

## Comparison groups

## Biological replicates

## Technical replicates

## Randomization and blinding

## Inclusion and exclusion criteria

## Covariates

## Analysis plan

## Predicted outcomes

## Falsification and stop criteria

## Interpretation boundaries

## Connections

_No explicit connections._`,
  result:`# {{title}}

## DIRECT observation

{{summary}}

## Analysis provenance

## Quality-control status

## INFERENCE

## Alternative explanations

## Decision

## Records to update

## Connections

_No explicit connections._`,
  model:`# {{title}}

## Model summary

{{summary}}

## Nodes and proposed relationships

## Supporting evidence

## Weak or contested arrows

## Alternative models

## Predictions

## Discriminating experiments

## Connections

_No explicit connections._`,
  decision:`# {{title}}

## Decision

{{summary}}

## Context

## Options considered

## Rationale

## Consequences

## Revisit conditions

## Connections

_No explicit connections._`,
  evidence:`# {{title}}

## Evidence statement

{{summary}}

## Source anchor

- Source record:
- Figure, table, page, or section:
- Exact scope:

## Epistemic label

DIRECT, AUTHOR, INFERENCE, or SPECULATION:

## Supports or challenges

## Extraction provenance

## Human review

## Connections

_No explicit connections._`,
};

export function createRecordMarkdown(
  type:RecordType,
  id:string,
  title:string,
  summary:string,
  canvas?:{x:number;y:number},
) {
  const fields=commonFields(type,id,title,summary);
  if(canvas){
    fields.canvas_x=Math.round(canvas.x);
    fields.canvas_y=Math.round(canvas.y);
  }
  if(type==="paper"){
    Object.assign(fields,{
      doi:"",pmid:"",pmcid:"",year:"",journal:"",source_url:"",
      review_depth:"unread",
      human_reviewed:false,
      reviewed_by:"",
      reviewed_at:"",
      methods_checked:false,
      figures_checked:[],
      figures:[],
      evidence_anchors:[],
      extraction_authorship:"human",
      agent_reviewed:false,
      agent_reviewed_by_model:"",
      agent_reviewed_at:"",
    });
  }
  if(type==="claim"){
    Object.assign(fields,{
      human_reviewed:false,
      reviewed_by:"",
      reviewed_at:"",
      evidence_anchors:[],
    });
  }
  if(type==="evidence"){
    Object.assign(fields,{
      source_paper:"",
      source_url:"",
      source_locator:"",
      epistemic_label:"",
      verified_at:"",
      agent_extracted:false,
      human_reviewed:false,
      reviewed_by:"",
      reviewed_at:"",
    });
  }
  if(type==="idea"){
    Object.assign(fields,{
      maturity:"captured",
      disposition:"active",
      priority:"unrated",
      evidence_strength:"none",
      feasibility:"unknown",
      authorship:"human",
      decision_needed:"",
      next_action:"",
      review_by:"",
      blockers:[],
      tags:[],
      entities:[],
    });
  }
  const body=bodyTemplates[type]
    .replaceAll("{{title}}",title)
    .replaceAll("{{summary}}",summary);
  return renderMarkdownRecord(fields,body);
}

export function createTemplateMarkdown(type:RecordType) {
  const config=recordTypeConfig[type];
  const parsed=parseMarkdownRecord(
    createRecordMarkdown(type,`${config.prefix}-###`,config.label,""),
  );
  const fields={
    ...parsed.fields,
    title:"",
    summary:"",
    created:"",
    updated:"",
  };
  return renderMarkdownRecord(fields,parsed.body);
}

export function validateRecord(raw:string,pathName?:string):ValidationIssue[] {
  const parsed=parseMarkdownRecord(raw);
  const issues:ValidationIssue[]=parsed.errors.map(message=>({
    severity:"error",code:"frontmatter",message,path:pathName,
  }));
  if(parsed.errors.length)return issues;

  const typeValue=scalarField(parsed.fields,"type");
  const id=scalarField(parsed.fields,"id");
  const type=isRecordType(typeValue)?typeValue:null;
  if(!type){
    issues.push({severity:"error",code:"unknown-type",message:`Unknown record type "${typeValue||"(missing)"}".`,id,path:pathName});
    return issues;
  }
  const config=recordTypeConfig[type];
  if(!new RegExp(`^${config.prefix}-\\d{3,}$`).test(id)){
    issues.push({severity:"error",code:"invalid-id",message:`${type} IDs must match ${config.prefix}-###.`,id,path:pathName});
  }
  if(!scalarField(parsed.fields,"title").trim()){
    issues.push({severity:"error",code:"missing-title",message:"A title is required.",id,path:pathName});
  }
  const schemaVersion=Number(scalarField(parsed.fields,"schema_version","0"));
  if(schemaVersion!==SCHEMA_VERSION){
    issues.push({severity:"warning",code:"legacy-schema",message:`Record uses schema ${schemaVersion||"legacy"}; schema ${SCHEMA_VERSION} is current.`,id,path:pathName});
  }
  const status=scalarField(parsed.fields,"status");
  if(!config.statuses.some(value=>value.toLowerCase()===status.toLowerCase())){
    issues.push({severity:"warning",code:"unknown-status",message:`Status "${status||"(missing)"}" is not in the ${type} vocabulary.`,id,path:pathName});
  }
  const privacy=scalarField(parsed.fields,"privacy");
  if(!["public","private","restricted"].includes(privacy)){
    issues.push({severity:"error",code:"invalid-privacy",message:"Privacy must be public, private, or restricted.",id,path:pathName});
  }
  if(["paper","claim","idea","hypothesis","experiment","result","model","evidence"].includes(type)&&!scalarField(parsed.fields,"summary").trim()){
    issues.push({severity:"warning",code:"missing-summary",message:"A routing summary is recommended.",id,path:pathName});
  }
  for(const field of ["created","updated"]){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(scalarField(parsed.fields,field))){
      issues.push({severity:"error",code:"missing-provenance",message:`${field} is required in YYYY-MM-DD form.`,id,path:pathName});
    }
  }
  for(const connection of parseConnections(parsed.body)){
    if(connection.type==="test"){
      issues.push({severity:"warning",code:"legacy-relation",message:'Use "tests" rather than "test".',id,path:pathName});
    }else if(!relationTypes.includes(connection.type as typeof relationTypes[number])){
      issues.push({severity:"warning",code:"unknown-relation",message:`Unknown relationship "${connection.type}".`,id,path:pathName});
    }
  }
  if(type==="idea"&&schemaVersion===SCHEMA_VERSION){
    const checks:[string,readonly string[]][]=[
      ["maturity",ideaMaturities],["disposition",ideaDispositions],["priority",ideaPriorities],
      ["evidence_strength",evidenceStrengths],["feasibility",feasibilityLevels],["authorship",authorshipTypes],
    ];
    for(const [field,allowed] of checks){
      const value=scalarField(parsed.fields,field);
      if(!allowed.includes(value as never)){
        issues.push({severity:"error",code:"invalid-idea-field",message:`Idea ${field} must be one of: ${allowed.join(", ")}.`,id,path:pathName});
      }
    }
    for(const heading of ["One-sentence idea","Evidence for","Evidence against","Assumptions","Cheapest discriminating test","Falsification and stop criteria","Promotion criteria"]){
      if(!new RegExp(`^##\\s+${heading}\\s*$`,"mi").test(parsed.body)){
        issues.push({severity:"warning",code:"missing-idea-section",message:`Idea is missing "## ${heading}".`,id,path:pathName});
      }
    }
  }
  if(type==="paper"&&schemaVersion===SCHEMA_VERSION){
    const depth=scalarField(parsed.fields,"review_depth");
    if(!paperReviewDepths.includes(depth as typeof paperReviewDepths[number])){
      issues.push({severity:"error",code:"invalid-paper-review-depth",message:`Paper review_depth must be one of: ${paperReviewDepths.join(", ")}.`,id,path:pathName});
    }
    const anchors=stringListField(parsed.fields,"evidence_anchors");
    if(anchors.some(anchor=>!/^EVD-\d{3,}$/.test(anchor))){
      issues.push({severity:"error",code:"invalid-evidence-anchor",message:"Paper evidence_anchors must contain only EVD-### IDs.",id,path:pathName});
    }
    if(status==="reviewed"){
      if(depth!=="full-text"){
        issues.push({severity:"error",code:"paper-review-gate",message:"A reviewed paper requires review_depth: full-text.",id,path:pathName});
      }
      if(parsed.fields.human_reviewed!==true){
        issues.push({severity:"error",code:"paper-review-gate",message:"A reviewed paper requires human_reviewed: true.",id,path:pathName});
      }
      if(!scalarField(parsed.fields,"reviewed_by").trim()){
        issues.push({severity:"error",code:"paper-review-gate",message:"A reviewed paper requires reviewed_by.",id,path:pathName});
      }
      if(!/^\d{4}-\d{2}-\d{2}$/.test(scalarField(parsed.fields,"reviewed_at"))){
        issues.push({severity:"error",code:"paper-review-gate",message:"A reviewed paper requires reviewed_at in YYYY-MM-DD form.",id,path:pathName});
      }
      if(parsed.fields.methods_checked!==true){
        issues.push({severity:"error",code:"paper-review-gate",message:"A reviewed paper requires methods_checked: true.",id,path:pathName});
      }
      if(!stringListField(parsed.fields,"figures_checked").length){
        issues.push({severity:"error",code:"paper-review-gate",message:"A reviewed paper requires one or more figures_checked entries.",id,path:pathName});
      }
    }
  }
  if(parsed.fields.figures!==undefined){
    if(!Array.isArray(parsed.fields.figures)){
      issues.push({severity:"error",code:"invalid-figure-manifest",message:"figures must be a YAML list.",id,path:pathName});
    }else{
      for(const [index,entry] of parsed.fields.figures.entries()){
        const prefix=`Figure ${index+1}`;
        if(typeof entry==="string"){
          issues.push({severity:"warning",code:"legacy-figure-manifest",message:`${prefix} is a legacy string; add caption, alt, source_url, locator, and evidence_status.`,id,path:pathName});
          continue;
        }
        if(!entry||typeof entry!=="object"||Array.isArray(entry)){
          issues.push({severity:"error",code:"invalid-figure-manifest",message:`${prefix} must be a YAML mapping.`,id,path:pathName});
          continue;
        }
        const figure=entry as Record<string,unknown>;
        const caption=scalarField(figure,"caption");
        const sourceUrl=scalarField(figure,"source_url");
        const assetPath=scalarField(figure,"path");
        if(!caption.trim())issues.push({severity:"warning",code:"missing-figure-caption",message:`${prefix} should include a factual caption.`,id,path:pathName});
        if(!scalarField(figure,"alt").trim())issues.push({severity:"warning",code:"missing-figure-alt",message:`${prefix} should include alt text for readers and agents.`,id,path:pathName});
        if(!sourceUrl&&!assetPath)issues.push({severity:"error",code:"missing-figure-provenance",message:`${prefix} requires a source_url or local path.`,id,path:pathName});
        if(sourceUrl&&!/^https?:\/\//i.test(sourceUrl))issues.push({severity:"error",code:"invalid-figure-source",message:`${prefix} source_url must be HTTP(S).`,id,path:pathName});
        if(assetPath&&!/^16 Media\/[a-zA-Z0-9_.-]+\.(png|jpe?g|webp|gif)$/i.test(assetPath))issues.push({severity:"error",code:"invalid-figure-path",message:`${prefix} local path must be a safe asset under 16 Media/.`,id,path:pathName});
        const figureStatus=scalarField(figure,"evidence_status","staged");
        if(!["staged","source-linked","human-reviewed"].includes(figureStatus))issues.push({severity:"error",code:"invalid-figure-status",message:`${prefix} evidence_status must be staged, source-linked, or human-reviewed.`,id,path:pathName});
      }
    }
  }
  if(type==="claim"&&status==="supported"){
    if(parsed.fields.human_reviewed!==true){
      issues.push({severity:"error",code:"claim-review-gate",message:"A supported claim requires human_reviewed: true.",id,path:pathName});
    }
    if(!scalarField(parsed.fields,"reviewed_by").trim()){
      issues.push({severity:"error",code:"claim-review-gate",message:"A supported claim requires reviewed_by.",id,path:pathName});
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(scalarField(parsed.fields,"reviewed_at"))){
      issues.push({severity:"error",code:"claim-review-gate",message:"A supported claim requires reviewed_at in YYYY-MM-DD form.",id,path:pathName});
    }
    const anchors=stringListField(parsed.fields,"evidence_anchors");
    if(!anchors.length||anchors.some(anchor=>!/^EVD-\d{3,}$/.test(anchor))){
      issues.push({severity:"error",code:"claim-review-gate",message:"A supported claim requires one or more EVD-### evidence_anchors.",id,path:pathName});
    }
  }
  if(type==="evidence"&&schemaVersion===SCHEMA_VERSION){
    const checked=["abstract-checked","source-verified","human-reviewed","contested"].includes(status);
    if(checked){
      if(!/^PAP-\d{3,}$/.test(scalarField(parsed.fields,"source_paper"))){
        issues.push({severity:"error",code:"evidence-source",message:"Checked evidence requires a PAP-### source_paper.",id,path:pathName});
      }
      if(!/^https?:\/\//i.test(scalarField(parsed.fields,"source_url"))){
        issues.push({severity:"error",code:"evidence-source",message:"Checked evidence requires an HTTP(S) source_url.",id,path:pathName});
      }
      if(!scalarField(parsed.fields,"source_locator").trim()){
        issues.push({severity:"error",code:"evidence-source",message:"Checked evidence requires a precise source_locator.",id,path:pathName});
      }
      if(!["DIRECT","AUTHOR"].includes(scalarField(parsed.fields,"epistemic_label"))){
        issues.push({severity:"error",code:"evidence-label",message:"Checked evidence must use DIRECT or AUTHOR; inference and speculation belong outside evidence anchors.",id,path:pathName});
      }
      if(!scalarField(parsed.fields,"verified_at").trim()||Number.isNaN(Date.parse(scalarField(parsed.fields,"verified_at")))){
        issues.push({severity:"error",code:"evidence-source",message:"Checked evidence requires an ISO-compatible verified_at timestamp.",id,path:pathName});
      }
    }
    if(status==="human-reviewed"){
      if(parsed.fields.human_reviewed!==true||!scalarField(parsed.fields,"reviewed_by").trim()||!/^\d{4}-\d{2}-\d{2}$/.test(scalarField(parsed.fields,"reviewed_at"))){
        issues.push({severity:"error",code:"evidence-review-gate",message:"Human-reviewed evidence requires human_reviewed, reviewed_by, and reviewed_at.",id,path:pathName});
      }
    }
  }
  return issues;
}

export function nextRecordId(type:RecordType,ids:string[]) {
  const prefix=recordTypeConfig[type].prefix;
  const maximum=ids
    .filter(id=>id.startsWith(`${prefix}-`))
    .reduce((current,id)=>Math.max(current,Number(id.slice(prefix.length+1))||0),0);
  return `${prefix}-${String(maximum+1).padStart(3,"0")}`;
}

const legacyIdeaMigration:Record<string,{
  maturity:typeof ideaMaturities[number];
  blockers:string[];
  decisionNeeded:string;
  nextAction:string;
}> = {
  exploratory:{
    maturity:"shaped",
    blockers:[],
    decisionNeeded:"Decide whether this idea is worth evidence development or should be parked.",
    nextAction:"Identify the cheapest discriminating test and the evidence needed for promotion.",
  },
  "discuss-with-PI":{
    maturity:"shaped",
    blockers:["scope-or-ownership-decision"],
    decisionNeeded:"Resolve scope, ownership, permissions, authorship, and the decision this work would change.",
    nextAction:"Discuss the governance questions with the PI and record the outcome.",
  },
  "assay-warning":{
    maturity:"shaped",
    blockers:["assay-validation"],
    decisionNeeded:"Decide which validation control is required before relying on this assay assumption.",
    nextAction:"Define and run the cheapest validation control.",
  },
  "source-and-scope-needed":{
    maturity:"evidence-seeking",
    blockers:["primary-source","scope-definition"],
    decisionNeeded:"Select the primary source and define the exact biological and analytical scope.",
    nextAction:"Verify the source, coordinates or construct, assay limitation, and decision impact.",
  },
};

export function migrateRecordToV2(raw:string) {
  const parsed=parseMarkdownRecord(raw);
  if(parsed.errors.length)return {raw,changes:[],errors:parsed.errors};
  const typeValue=scalarField(parsed.fields,"type");
  if(!isRecordType(typeValue))return {raw,changes:[],errors:[`Unknown record type "${typeValue}".`]};

  const changes:string[]=[];
  let fields={...parsed.fields};
  if(Number(scalarField(fields,"schema_version","0"))!==SCHEMA_VERSION){
    fields={schema_version:SCHEMA_VERSION,...fields};
    changes.push(`Set schema_version to ${SCHEMA_VERSION}`);
  }
  const migrationDate=new Date().toISOString().slice(0,10);
  if(!scalarField(fields,"created")){
    fields.created=migrationDate;
    fields.timestamp_provenance="schema-migration-date; not a scientific review date";
    changes.push("Add created date from schema migration");
  }
  if(!scalarField(fields,"updated")){
    fields.updated=migrationDate;
    changes.push("Add updated date from schema migration");
  }

  if(typeValue==="idea"){
    const legacyStatus=scalarField(fields,"status","exploratory");
    const mapping=legacyIdeaMigration[legacyStatus]??legacyIdeaMigration.exploratory;
    if(!ideaDispositions.includes(scalarField(fields,"disposition") as typeof ideaDispositions[number])){
      fields.disposition="active";
      changes.push("Add idea disposition: active");
    }
    if(!ideaMaturities.includes(scalarField(fields,"maturity") as typeof ideaMaturities[number])){
      fields.maturity=mapping.maturity;
      changes.push(`Add idea maturity: ${mapping.maturity}`);
    }
    const defaults:Record<string,unknown>={
      priority:"unrated",
      evidence_strength:"unrated",
      feasibility:"unknown",
      authorship:"human",
      decision_needed:mapping.decisionNeeded,
      next_action:mapping.nextAction,
      review_by:"",
      blockers:mapping.blockers,
      tags:[],
      entities:[],
    };
    for(const [key,value] of Object.entries(defaults)){
      if(fields[key]===undefined){
        fields[key]=value;
        changes.push(`Add idea field: ${key}`);
      }
    }
    if(!ideaDispositions.includes(legacyStatus as typeof ideaDispositions[number])){
      fields.legacy_status=legacyStatus;
      fields.status="active";
      changes.push(`Preserve legacy status "${legacyStatus}" and set workflow status to active`);
    }
  }

  let body=parsed.body;
  const normalizedBody=body.replace(/^(\s*-\s*)test(\s+\[\[[A-Z]+-\d{3,}[^\]]*\]\])/gmi,"$1tests$2");
  if(normalizedBody!==body){
    body=normalizedBody;
    changes.push('Normalize relationship "test" to "tests"');
  }

  return {
    raw:changes.length?renderMarkdownRecord(fields,body):raw,
    changes,
    errors:[],
  };
}
