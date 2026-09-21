import assert from "node:assert/strict";
import test from "node:test";
import {
  contextPacket,evidenceDossier,exploreGraph,getRecord,loadResearchEnvironment,nextWork,projectBrief,searchRecords,
} from "../lib/research-environment.ts";

const root=process.cwd();

type ToolEnvelope={
  schema_version:string;tool:string;source:{source_hash:string};
  result:Record<string,unknown>|Array<Record<string,unknown>>;
};
type PacketEnvelope=ToolEnvelope&{estimated_characters:number;max_chars:number;truncated:boolean};
function resultObject(value:unknown){return (value as ToolEnvelope).result as Record<string,unknown>;}
function resultArray(value:unknown){return (value as ToolEnvelope).result as Array<Record<string,unknown>>;}

test("research environment returns compact source-bound project orientation",async()=>{
  const env=await loadResearchEnvironment(root,"apoe-rexach");
  const brief=projectBrief(env) as ToolEnvelope;
  const result=resultObject(brief);
  assert.equal(brief.schema_version,"research-environment-result-v1");
  assert.equal(brief.tool,"project.brief");
  assert.match(brief.source.source_hash,/^[a-f0-9]{64}$/);
  assert.match(String(result.central_question),/local genomic background/i);
  assert.ok((result.high_priority_tasks as unknown[]).length>0);
  const debt=result.evidence_debt_summary as Record<string,unknown>;
  assert.equal(debt.claims_without_support,4);
  assert.equal(debt.papers_without_full_review,8);
});

test("search is deterministic, filterable, and does not return complete bodies",async()=>{
  const env=await loadResearchEnvironment(root,"apoe-rexach");
  const first=resultArray(searchRecords(env,{query:"ABCA7 lipid",types:["claim","idea"],limit:5}));
  const second=resultArray(searchRecords(env,{query:"ABCA7 lipid",types:["claim","idea"],limit:5}));
  assert.deepEqual(first,second);
  assert.ok(first.length>0);
  assert.ok(first.every(item=>["claim","idea"].includes(String(item.type))));
  assert.ok(first.every(item=>item.content===undefined&&item.raw===undefined));
});

test("record reads are section-selective and bounded",async()=>{
  const env=await loadResearchEnvironment(root,"apoe-rexach");
  const result=resultObject(getRecord(env,{id:"CLM-004",sections:["Claim","Connections"],maxChars:700}));
  assert.equal(result.id,"CLM-004");
  assert.ok(String(result.content).length<=700);
  assert.doesNotMatch(String(result.content),/## Evidence needed/i);
});

test("graph exploration follows only explicit typed connections",async()=>{
  const env=await loadResearchEnvironment(root,"apoe-rexach");
  const result=resultObject(exploreGraph(env,{id:"MOD-002",depth:2,limit:40}));
  assert.equal((result.root as Record<string,unknown>).id,"MOD-002");
  const edges=result.edges as Array<Record<string,unknown>>;
  assert.ok(edges.length>0);
  assert.ok(edges.every(edge=>edge.source&&edge.type&&edge.target));
});

test("evidence dossier keeps support and contradiction lanes separate",async()=>{
  const env=await loadResearchEnvironment(root,"apoe-rexach");
  const envelope=evidenceDossier(env,{id:"CLM-004"}) as ToolEnvelope;
  const result=resultObject(envelope);
  assert.equal(envelope.tool,"evidence.dossier");
  assert.ok((result.support as Array<Record<string,unknown>>).every(item=>item.relation==="supports"));
  assert.ok((result.against as Array<Record<string,unknown>>).every(item=>["contradicts","challenges"].includes(String(item.relation))));
  assert.equal(typeof (result.gaps as Record<string,unknown>).human_reviewed_anchor_count,"number");
});

test("next work prioritizes high-priority tasks",async()=>{
  const env=await loadResearchEnvironment(root,"apoe-rexach");
  const result=resultArray(nextWork(env,{limit:4}));
  assert.equal(result.length,4);
  assert.ok(result.every(task=>task.priority==="high"));
});

test("context packets are source-bound, counterevidence-aware, and character-bounded",async()=>{
  const env=await loadResearchEnvironment(root,"apoe-rexach");
  const packet=contextPacket(env,{id:"CLM-004",maxChars:3_500}) as unknown as PacketEnvelope;
  const result=resultObject(packet);
  assert.equal(packet.tool,"context.packet");
  assert.equal(packet.estimated_characters<=packet.max_chars,true);
  assert.equal((result.focus as Record<string,unknown>).id,"CLM-004");
  assert.match(String(result.focus_detail),/Supporting evidence/i);
  assert.equal(((result.evidence as Record<string,unknown>).gaps as Record<string,unknown>).no_support,true);
});
