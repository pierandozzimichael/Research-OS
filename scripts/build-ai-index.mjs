import {mkdir,readFile} from "node:fs/promises";
import path from "node:path";
import {atomicWriteFile} from "../lib/local-project-store.ts";
import {
  parseConnections,
  parseMarkdownRecord,
  scalarField,
  stringListField,
  wikiLinkIds,
} from "../lib/research-schema.ts";
import {markdownRecords,projectVaults} from "./schema-files.mjs";
import {canonicalSourceHash} from "../lib/canonical-record-files.ts";

const root=process.cwd();
const checkOnly=process.argv.includes("--check");

function recordView(record){
  const parsed=parseMarkdownRecord(record.raw);
  const section=(heading)=>{
    const match=parsed.body.match(new RegExp(`^##\\s+${heading}\\s*$`,"mi"));
    if(match?.index===undefined)return "";
    const remainder=parsed.body.slice(match.index+match[0].length);
    const next=remainder.search(/^##\s+/m);
    return (next<0?remainder:remainder.slice(0,next)).trim();
  };
  return {
    id:scalarField(parsed.fields,"id"),
    type:scalarField(parsed.fields,"type"),
    title:scalarField(parsed.fields,"title"),
    status:scalarField(parsed.fields,"status"),
    updated:scalarField(parsed.fields,"updated"),
    privacy:scalarField(parsed.fields,"privacy"),
    summary:scalarField(parsed.fields,"summary"),
    maturity:scalarField(parsed.fields,"maturity"),
    disposition:scalarField(parsed.fields,"disposition"),
    priority:scalarField(parsed.fields,"priority"),
    reviewDepth:scalarField(parsed.fields,"review_depth"),
    humanReviewed:parsed.fields.human_reviewed===true,
    reviewedBy:scalarField(parsed.fields,"reviewed_by"),
    reviewedAt:scalarField(parsed.fields,"reviewed_at"),
    methodsChecked:parsed.fields.methods_checked===true,
    figuresChecked:stringListField(parsed.fields,"figures_checked"),
    evidenceAnchors:stringListField(parsed.fields,"evidence_anchors"),
    decisionNeeded:scalarField(parsed.fields,"decision_needed"),
    nextAction:scalarField(parsed.fields,"next_action"),
    blockers:stringListField(parsed.fields,"blockers"),
    path:record.relativePath,
    connections:parseConnections(parsed.body),
    links:wikiLinkIds(parsed.body),
    centralQuestion:section("Central question"),
  };
}

function wiki(record){
  return `[[${record.id} ${record.title}]]`;
}

function groupIndex(records,rawNotes){
  const groups=new Map();
  for(const record of records){
    const values=groups.get(record.type)??[];
    values.push(record);
    groups.set(record.type,values);
  }
  const lines=[
    "# Project index",
    "",
    "> Generated routing aid. Canonical scientific content remains in the linked records.",
    "",
  ];
  for(const [type,items] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
    lines.push(`## ${type}`, "");
    for(const record of items.sort((a,b)=>a.id.localeCompare(b.id))){
      lines.push(`- ${wiki(record)} · \`${record.status}\` · ${record.summary||"No routing summary."} · \`${record.path}\``);
    }
    lines.push("");
  }
  if(rawNotes.length){
    lines.push("## Untyped inbox and working notes","");
    for(const note of rawNotes)lines.push(`- \`${note.relativePath}\` · raw note; structure before treating as canonical evidence`);
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

function activeContext(project,records,rawNotes){
  const terminal=/^(archived|retired|rejected|superseded|complete|completed|merged)$/;
  const base=records.filter(record=>{
    if(["project","policy"].includes(record.type))return true;
    if(record.type==="idea")return record.disposition==="active"&&!terminal.test(record.status);
    if(record.type==="paper")return false;
    if(record.type==="result")return !/^(reviewed|superseded)$/.test(record.status);
    return !terminal.test(record.status);
  });
  const baseIds=new Set(base.map(record=>record.id));
  const referencedPaperIds=new Set(base.flatMap(record=>record.links).filter(id=>id.startsWith("PAP-")));
  for(const paper of records.filter(record=>record.type==="paper")){
    if(paper.connections.some(connection=>baseIds.has(connection.target)))referencedPaperIds.add(paper.id);
  }
  const paperPriority=(record)=>/citation-needed|to-verify|secondary-source|reviewed-abstract/.test(record.status)?0:1;
  const papers=records.filter(record=>record.type==="paper"&&referencedPaperIds.has(record.id))
    .sort((a,b)=>paperPriority(a)-paperPriority(b)||a.id.localeCompare(b.id));
  const selected=[...base,...papers.slice(0,12)];
  const typeOrder=["project","model","claim","idea","hypothesis","experiment","result","decision","topic","entity","paper","method","evidence","source"];
  const lines=[
    `# Active context — ${project.name}`,
    "",
    "> Generated working set. Follow links to canonical records before making scientific claims.",
    "",
    "## Project question",
    "",
    selected.find(record=>record.type==="project")?.centralQuestion||
      selected.find(record=>record.type==="project")?.summary||project.description,
    "",
    "## Open decisions and blockers",
    "",
  ];
  const actionItems=selected.filter(record=>record.decisionNeeded||record.nextAction||record.blockers.length);
  if(!actionItems.length)lines.push("_No structured blockers or decisions recorded._");
  for(const record of actionItems){
    const details=[
      record.decisionNeeded&&`decision: ${record.decisionNeeded}`,
      record.nextAction&&`next: ${record.nextAction}`,
      record.blockers.length&&`blockers: ${record.blockers.join(", ")}`,
    ].filter(Boolean).join("; ");
    lines.push(`- ${wiki(record)} — ${details}`);
  }
  if(papers.length>12)lines.push("## Additional relevant papers","",`${papers.length-12} papers were omitted from this bounded context. Use PROJECT_INDEX.md to route to them.`,"");
  if(rawNotes.length){
    lines.push("## Raw inbox and working notes","");
    for(const note of rawNotes.slice(0,20))lines.push(`- \`${note.relativePath}\` — untyped working material; structure and verify before use`);
    if(rawNotes.length>20)lines.push(`- ${rawNotes.length-20} additional raw notes omitted; see PROJECT_INDEX.md.`);
    lines.push("");
  }
  lines.push("");
  for(const type of typeOrder){
    const items=selected.filter(record=>record.type===type);
    if(!items.length)continue;
    lines.push(`## Active ${type} records`, "");
    for(const record of items.sort((a,b)=>a.id.localeCompare(b.id))){
      const ideaMeta=record.type==="idea"
        ? ` · maturity \`${record.maturity||"unknown"}\` · priority \`${record.priority||"unrated"}\``
        : "";
      lines.push(`- ${wiki(record)} · \`${record.status}\`${ideaMeta} — ${record.summary||"No routing summary."}`);
    }
    lines.push("");
  }
  lines.push(
    "## Reading rule",
    "",
    "Read the relevant model first, then its linked claims, papers, ideas, hypotheses, experiments, and results. Treat this file as a map, not evidence.",
  );
  return `${lines.join("\n").trim()}\n`;
}

function paperReviewQueue(project,records){
  const papers=records.filter(record=>record.type==="paper");
  const depthOrder={unread:0,metadata:1,abstract:2,"full-text":3};
  const lines=[
    `# Paper review queue — ${project.name}`,
    "",
    "> Generated routing aid. AI extraction is provisional; only a recorded human gate can complete full review.",
    "",
    "## Review protocol",
    "",
    "1. Verify citation identity and open the primary source.",
    "2. Record whether metadata, abstract, or full text was inspected.",
    "3. For full review, inspect relevant methods, figures, sample structure, statistics, scope, and limitations.",
    "4. Create reusable EVD records for exact figure, table, page, or section anchors.",
    "5. Only then consider updating linked claims; claim promotion remains a separate human decision.",
    "",
    "## Queue",
    "",
  ];
  for(const record of papers.sort((a,b)=>
    (depthOrder[a.reviewDepth]??0)-(depthOrder[b.reviewDepth]??0)||
    Number(a.humanReviewed)-Number(b.humanReviewed)||
    a.id.localeCompare(b.id)
  )){
    const missing=[
      !record.reviewDepth||record.reviewDepth==="unread"?"reading depth":null,
      !record.humanReviewed?"human review":null,
      !record.methodsChecked?"methods check":null,
      !record.figuresChecked.length?"figure anchors":null,
      !record.evidenceAnchors.length?"EVD records":null,
    ].filter(Boolean);
    lines.push(`- ${wiki(record)} · status \`${record.status}\` · depth \`${record.reviewDepth||"unread"}\` · missing: ${missing.join(", ")||"none"}`);
  }
  if(!papers.length)lines.push("_No paper records._");
  lines.push(
    "",
    "## Agent boundary",
    "",
    "Agents may propose extraction text and candidate EVD anchors. They must not set `human_reviewed: true`, invent a reviewer/date, or promote a paper to `reviewed`.",
  );
  return `${lines.join("\n").trim()}\n`;
}

function agentTasks(records){
  const tasks=[];
  for(const record of records){
    if(record.blockers.length)tasks.push({
      id:record.id,type:record.type,lane:"resolve-blocker",priority:"high",
      reason:`Blockers: ${record.blockers.join(", ")}`,
      next_action:record.nextAction||record.decisionNeeded||"Resolve and document the blocking condition.",
    });
    if(record.type==="paper"&&["citation-needed","to-verify","secondary-source"].includes(record.status))tasks.push({
      id:record.id,type:record.type,lane:"verify-source",priority:record.status==="citation-needed"?"high":"medium",
      reason:`Paper status is ${record.status}; reusable evidence remains unverified.`,
      next_action:"Verify primary-source identity and record exact evidence anchors.",
    });
    if(record.type==="claim"&&["provisional","contested"].includes(record.status))tasks.push({
      id:record.id,type:record.type,lane:"develop-evidence",priority:record.status==="contested"?"high":"medium",
      reason:`Claim is ${record.status}.`,
      next_action:"Map supporting and contradicting EVD anchors without upgrading the claim.",
    });
    if(record.type==="idea"&&(record.decisionNeeded||record.nextAction))tasks.push({
      id:record.id,type:record.type,lane:"develop-idea",priority:record.priority==="high"?"high":"medium",
      reason:record.decisionNeeded||"Idea requires a bounded next decision.",
      next_action:record.nextAction||"Define the cheapest discriminating test and stop rule.",
    });
  }
  const rank={high:0,medium:1,low:2};
  return tasks.sort((a,b)=>(rank[a.priority]??3)-(rank[b.priority]??3)||a.id.localeCompare(b.id)||a.lane.localeCompare(b.lane));
}

function taskQueueMarkdown(project,tasks){
  const lines=[
    `# Agent task queue — ${project.name}`,"",
    "> Generated routing aid. Completing a task does not itself change scientific status.","",
  ];
  for(const priority of ["high","medium","low"]){
    const items=tasks.filter(task=>task.priority===priority);
    if(!items.length)continue;
    lines.push(`## ${priority} priority`,"");
    for(const task of items)lines.push(`- [[${task.id}]] · \`${task.lane}\` — ${task.reason} Next: ${task.next_action}`);
    lines.push("");
  }
  if(!tasks.length)lines.push("_No generated tasks._","");
  return `${lines.join("\n").trim()}\n`;
}

function evidenceDebt(records){
  const evidenceSupport=new Map();
  const evidenceContradiction=new Map();
  for(const record of records.filter(item=>item.type==="evidence")){
    for(const connection of record.connections){
      if(connection.type==="supports")evidenceSupport.set(connection.target,(evidenceSupport.get(connection.target)||0)+1);
      if(connection.type==="contradicts")evidenceContradiction.set(connection.target,(evidenceContradiction.get(connection.target)||0)+1);
    }
  }
  return {
    claims:records.filter(record=>record.type==="claim").map(record=>({
      id:record.id,status:record.status,
      supporting_evidence:evidenceSupport.get(record.id)||0,
      contradicting_evidence:evidenceContradiction.get(record.id)||0,
    })),
    papers:records.filter(record=>record.type==="paper"&&!record.evidenceAnchors.length).map(record=>({
      id:record.id,status:record.status,review_depth:record.reviewDepth||"unread",
    })),
  };
}

function agentStart(project,records,tasks,debt){
  const counts=Object.fromEntries([...new Set(records.map(record=>record.type))].sort().map(type=>[
    type,records.filter(record=>record.type===type).length,
  ]));
  return [
    `# Agent start — ${project.name}`,"",
    "> Navigation only. Follow stable IDs into canonical records before making scientific claims.","",
    "## Read order","",
    "1. Root `START_HERE.md` and `AGENTS.md`.",
    "2. Project `00 Dashboard/PROJECT.md` and `CLAIM_STATUS_RULES.md`.",
    "3. `ACTIVE_CONTEXT.md`, then the relevant mechanistic model.",
    "4. `TASK_QUEUE.md` and the canonical records named by the selected task.",
    "5. `EVIDENCE_DEBT.json` before proposing claim changes.","",
    "## Current routing state","",
    `- Canonical records: ${records.length}`,
    `- Generated tasks: ${tasks.length}`,
    `- Claims without supporting EVD anchors: ${debt.claims.filter(item=>!item.supporting_evidence).length}`,
    `- Papers without EVD anchors: ${debt.papers.length}`,
    `- Record counts: ${Object.entries(counts).map(([type,count])=>`${type} ${count}`).join(" · ")}`,"",
    "## Operational rule","",
    "Use `runs/<run-id>/` for concise plans, observations, proposals, and handoffs. Run files are non-canonical and must not be cited as evidence.",
  ].join("\n")+"\n";
}

for(const project of await projectVaults(root)){
  const files=await markdownRecords(project.vaultRoot,{includeLiteratureBriefs:true});
  const views=files.map(file=>({file,record:recordView(file)}));
  const records=views.map(item=>item.record).filter(record=>record.id&&record.type);
  const rawNotes=views.filter(item=>!item.record.id||!item.record.type).map(item=>item.file);
  const hash=canonicalSourceHash(files);
  const generatedRoot=path.join(project.vaultRoot,"14 AI Workspace","generated");
  const manifestPath=path.join(generatedRoot,"MANIFEST.json");

  if(checkOnly){
    try{
      const manifest=JSON.parse(await readFile(manifestPath,"utf8"));
      if(manifest.sourceHash!==hash||manifest.sourceCount!==records.length){
        console.error(`${project.name}: AI context is stale. Run pnpm ai:sync.`);
        process.exitCode=1;
      }else{
        console.log(`${project.name}: AI context is current (${records.length} records).`);
      }
    }catch{
      console.error(`${project.name}: AI context is missing. Run pnpm ai:sync.`);
      process.exitCode=1;
    }
    continue;
  }

  await mkdir(generatedRoot,{recursive:true});
  const graph={
    schemaVersion:2,
    project:{id:project.id,name:project.name},
    sourceHash:hash,
    nodes:records.map(record=>{
      const node={...record};
      delete node.connections;
      return node;
    }),
    edges:records.flatMap(record=>record.connections.map(connection=>({
      source:record.id,type:connection.type,target:connection.target,
    }))),
  };
  const generatedAt=new Date().toISOString();
  const tasks=agentTasks(records);
  const debt=evidenceDebt(records);
  await atomicWriteFile(path.join(generatedRoot,"PROJECT_INDEX.md"),groupIndex(records,rawNotes));
  await atomicWriteFile(path.join(generatedRoot,"ACTIVE_CONTEXT.md"),activeContext(project,records,rawNotes));
  await atomicWriteFile(path.join(generatedRoot,"PAPER_REVIEW_QUEUE.md"),paperReviewQueue(project,records));
  await atomicWriteFile(path.join(generatedRoot,"AGENT_START.md"),agentStart(project,records,tasks,debt));
  await atomicWriteFile(path.join(generatedRoot,"TASK_QUEUE.md"),taskQueueMarkdown(project,tasks));
  await atomicWriteFile(path.join(generatedRoot,"TASK_QUEUE.json"),`${JSON.stringify({schema_version:"agent-task-queue-v1",project_id:project.id,generated_at:generatedAt,tasks},null,2)}\n`);
  await atomicWriteFile(path.join(generatedRoot,"EVIDENCE_DEBT.json"),`${JSON.stringify({schema_version:"evidence-debt-v1",project_id:project.id,generated_at:generatedAt,...debt},null,2)}\n`);
  await atomicWriteFile(path.join(generatedRoot,"GRAPH.json"),`${JSON.stringify(graph,null,2)}\n`);
  await atomicWriteFile(manifestPath,`${JSON.stringify({
    schemaVersion:2,
    projectId:project.id,
    generatedAt,
    sourceHash:hash,
    sourceFileCount:files.length,
    recordCount:records.length,
    sourceCount:records.length,
    nodeCount:graph.nodes.length,
    edgeCount:graph.edges.length,
    canonicalRoot:path.relative(root,project.vaultRoot).replaceAll("\\","/"),
  },null,2)}\n`);
  console.log(`${project.name}: wrote AI context for ${records.length} records and ${graph.edges.length} edges.`);
}
