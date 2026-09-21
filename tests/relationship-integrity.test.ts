import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRelationshipChanges,
  planRelationshipRepairs,
  validateRelationshipGraph,
} from "../lib/relationship-integrity.ts";
import {createRecordMarkdown,replaceRecordBody} from "../lib/research-schema.ts";

function record(type:"paper"|"evidence"|"claim"|"experiment"|"result"|"idea",id:string,body:string){
  return {
    id,type,relativePath:`${id}.md`,
    raw:replaceRecordBody(createRecordMarkdown(type,id,id,"Summary"),`# ${id}\n\n## Connections\n\n${body}`),
  };
}

test("requires evidence-to-claim support direction",()=>{
  const invalid=[
    record("paper","PAP-001","- supports [[CLM-001]]"),
    record("claim","CLM-001","_No explicit connections._"),
  ];
  assert.ok(validateRelationshipGraph(invalid).some(issue=>issue.code==="invalid-evidence-direction"));
  const valid=[
    record("evidence","EVD-001","- supports [[CLM-001]]"),
    invalid[1],
  ];
  assert.equal(validateRelationshipGraph(valid).filter(issue=>issue.code==="invalid-evidence-direction").length,0);
});

test("previews and applies mechanical direction repairs",()=>{
  const records=[
    record("paper","PAP-001","- supports [[CLM-001]]\n- generated [[IDEA-001]]"),
    record("claim","CLM-001","_No explicit connections._"),
    record("idea","IDEA-001","- depends-on [[PAP-001]]"),
  ];
  const changes=planRelationshipRepairs(records);
  assert.deepEqual(changes.map(change=>[change.sourceId,change.from,change.to]),[
    ["IDEA-001","depends-on",null],
    ["PAP-001","supports","informs"],
  ]);
  const paper=applyRelationshipChanges(records[0].raw,changes.filter(change=>change.sourceId==="PAP-001"));
  const idea=applyRelationshipChanges(records[2].raw,changes.filter(change=>change.sourceId==="IDEA-001"));
  assert.match(paper,/- informs \[\[CLM-001\]\]/);
  assert.doesNotMatch(idea,/depends-on/);
});

test("flags experiment-result reverse navigation duplicates",()=>{
  const records=[
    record("experiment","EXP-001","- produces [[RES-001]]"),
    record("result","RES-001","- generated [[EXP-001]]"),
  ];
  assert.ok(validateRelationshipGraph(records).some(issue=>issue.code==="reciprocal-navigation-edge"));
  const changes=planRelationshipRepairs(records);
  assert.deepEqual(changes.map(change=>[change.sourceId,change.from,change.to]),[
    ["RES-001","generated",null],
  ]);
});

test("keeps unpromoted ideas as experiment dependencies rather than tested hypotheses",()=>{
  const records=[
    record("experiment","EXP-001","- tests [[IDEA-001]]"),
    record("idea","IDEA-001","_No explicit connections._"),
  ];
  const changes=planRelationshipRepairs(records);
  assert.deepEqual(changes.map(change=>[change.sourceId,change.from,change.to]),[
    ["EXP-001","tests","depends-on"],
  ]);
});
