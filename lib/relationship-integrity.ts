import {createHash} from "node:crypto";
import {
  parseConnections,
  parseMarkdownRecord,
  type RecordType,
  type ValidationIssue,
} from "./research-schema.ts";

export type RelationshipRecord={
  id:string;
  type:RecordType;
  raw:string;
  relativePath?:string;
};

export type RelationshipChange={
  relativePath:string;
  sourceId:string;
  sourceRevision:string;
  targetId:string;
  from:string;
  to:string|null;
  reason:string;
};

type Edge={source:string;sourceType:RecordType;target:string;targetType?:RecordType;type:string;relativePath?:string};

function revision(raw:string){
  return createHash("sha256").update(raw,"utf8").digest("hex");
}

function edges(records:RelationshipRecord[]){
  const types=new Map(records.map(record=>[record.id,record.type]));
  return records.flatMap(record=>parseConnections(parseMarkdownRecord(record.raw).body).map(connection=>({
    source:record.id,
    sourceType:record.type,
    target:connection.target,
    targetType:types.get(connection.target),
    type:connection.type,
    relativePath:record.relativePath,
  } satisfies Edge)));
}

function pairKey(source:string,target:string){
  return `${source}\u0000${target}`;
}

export function validateRelationshipGraph(records:RelationshipRecord[]):ValidationIssue[] {
  const graphEdges=edges(records);
  const issues:ValidationIssue[]=[];
  const byDirection=new Map<string,Edge[]>();
  for(const edge of graphEdges){
    const list=byDirection.get(pairKey(edge.source,edge.target))||[];
    list.push(edge);
    byDirection.set(pairKey(edge.source,edge.target),list);
    if(["supports","contradicts"].includes(edge.type)&&(edge.sourceType!=="evidence"||edge.targetType!=="claim")){
      issues.push({
        severity:"error",
        code:"invalid-evidence-direction",
        id:edge.source,
        path:edge.relativePath,
        message:`${edge.type} must be stored as EVD-### -> CLM-###; use informs for provisional paper or context links.`,
      });
    }
    if(edge.type==="tests"&&(edge.sourceType!=="experiment"||edge.targetType!=="hypothesis")){
      issues.push({
        severity:"error",code:"invalid-test-direction",id:edge.source,path:edge.relativePath,
        message:"tests must be stored as EXP-### -> HYP-###.",
      });
    }
    if(edge.type==="produces"&&(edge.sourceType!=="experiment"||edge.targetType!=="result")){
      issues.push({
        severity:"error",code:"invalid-result-direction",id:edge.source,path:edge.relativePath,
        message:"produces must be stored as EXP-### -> RES-###.",
      });
    }
  }
  const seen=new Set<string>();
  for(const edge of graphEdges){
    const reverse=byDirection.get(pairKey(edge.target,edge.source))||[];
    for(const other of reverse){
      const signature=[edge.source,edge.type,edge.target,other.type].join("|");
      const inverse=[other.source,other.type,other.target,edge.type].join("|");
      if(seen.has(signature)||seen.has(inverse))continue;
      const navigationDuplicate=
        (edge.type==="generated"&&other.type==="depends-on")||
        (edge.type==="depends-on"&&other.type==="generated")||
        (edge.type==="produces"&&other.type==="generated")||
        (edge.type==="generated"&&other.type==="produces")||
        (edge.type==="related"&&other.type==="related");
      if(navigationDuplicate){
        seen.add(signature);
        issues.push({
          severity:"error",code:"reciprocal-navigation-edge",id:edge.source,path:edge.relativePath,
          message:`Store ${edge.source} -[${edge.type}]-> ${edge.target} and its reverse ${other.type} relationship only once; the UI traverses both directions.`,
        });
      }
    }
  }
  return issues;
}

export function planRelationshipRepairs(records:RelationshipRecord[]):RelationshipChange[] {
  const graphEdges=edges(records);
  const byDirection=new Map<string,Edge[]>();
  for(const edge of graphEdges){
    const list=byDirection.get(pairKey(edge.source,edge.target))||[];
    list.push(edge);
    byDirection.set(pairKey(edge.source,edge.target),list);
  }
  const changes:RelationshipChange[]=[];
  const changeKeys=new Set<string>();
  const add=(record:RelationshipRecord,edge:Edge,to:string|null,reason:string)=>{
    if(!record.relativePath)throw new Error(`Record ${record.id} is missing a relative path.`);
    const key=`${record.id}|${edge.type}|${edge.target}`;
    if(changeKeys.has(key))return;
    changeKeys.add(key);
    changes.push({
      relativePath:record.relativePath,
      sourceId:record.id,
      sourceRevision:revision(record.raw),
      targetId:edge.target,
      from:edge.type,
      to,
      reason,
    });
  };
  for(const edge of graphEdges){
    const record=records.find(item=>item.id===edge.source);
    if(!record)continue;
    if(["supports","contradicts"].includes(edge.type)&&(edge.sourceType!=="evidence"||edge.targetType!=="claim")){
      add(record,edge,"informs","Reserve supports and contradicts for evidence-to-claim assertions.");
    }
    if(edge.type==="tests"&&edge.sourceType==="experiment"&&edge.targetType==="idea"){
      add(record,edge,"depends-on","An experiment may depend on validating an idea; tests is reserved for experiment-to-hypothesis relationships.");
    }
    const reverse=byDirection.get(pairKey(edge.target,edge.source))||[];
    if(edge.type==="depends-on"&&reverse.some(item=>item.type==="generated")){
      add(record,edge,null,"Remove reverse navigation duplicate; retain the forward generated relationship.");
    }
    if(edge.type==="generated"&&edge.sourceType==="result"&&reverse.some(item=>item.type==="produces")){
      add(record,edge,null,"Remove reverse navigation duplicate; retain experiment produces result.");
    }
    if(edge.type==="related"&&reverse.some(item=>item.type==="related")&&edge.source.localeCompare(edge.target)>0){
      add(record,edge,null,"Keep one deterministic direction for a symmetric related relationship.");
    }
  }
  return changes.sort((a,b)=>a.relativePath.localeCompare(b.relativePath)||a.targetId.localeCompare(b.targetId)||a.from.localeCompare(b.from));
}

export function applyRelationshipChanges(raw:string,changes:RelationshipChange[]){
  const parsed=parseMarkdownRecord(raw);
  if(parsed.errors.length)throw new Error(parsed.errors.join(" "));
  const heading=parsed.body.match(/^##\s+Connections\s*$/mi);
  if(heading?.index===undefined)throw new Error("Record has no Connections section.");
  const sectionStart=heading.index+heading[0].length;
  const remainder=parsed.body.slice(sectionStart);
  const nextHeading=remainder.search(/^##\s+/m);
  const sectionEnd=nextHeading<0?parsed.body.length:sectionStart+nextHeading;
  let section=parsed.body.slice(sectionStart,sectionEnd);
  for(const change of changes){
    const escapedTarget=change.targetId.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const escapedType=change.from.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const pattern=new RegExp(`^(\\s*-\\s*)${escapedType}(\\s+\\[\\[${escapedTarget}(?:[^\\]]*)\\]\\]\\s*)$`,"mi");
    if(!pattern.test(section))throw new Error(`Connection ${change.from} [[${change.targetId}]] was not found.`);
    section=change.to
      ? section.replace(pattern,`$1${change.to}$2`)
      : section.replace(pattern,"");
  }
  section=section.replace(/\n{3,}/g,"\n\n");
  return `${raw.slice(0,raw.indexOf(parsed.body))}${parsed.body.slice(0,sectionStart)}${section}${parsed.body.slice(sectionEnd)}`.replace(/\s+$/,"")+"\n";
}

export function relationshipContentRevision(raw:string){
  return revision(raw);
}
