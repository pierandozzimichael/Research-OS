import assert from "node:assert/strict";
import {access,readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root=process.cwd();
const generated=path.join(root,"vault","14 AI Workspace","generated");

test("AI context is a complete derived routing layer over canonical records", async()=>{
  const [manifest,graph,index,active,paperReview,agentStart,taskQueue,evidenceDebt,start]=await Promise.all([
    readFile(path.join(generated,"MANIFEST.json"),"utf8").then(JSON.parse),
    readFile(path.join(generated,"GRAPH.json"),"utf8").then(JSON.parse),
    readFile(path.join(generated,"PROJECT_INDEX.md"),"utf8"),
    readFile(path.join(generated,"ACTIVE_CONTEXT.md"),"utf8"),
    readFile(path.join(generated,"PAPER_REVIEW_QUEUE.md"),"utf8"),
    readFile(path.join(generated,"AGENT_START.md"),"utf8"),
    readFile(path.join(generated,"TASK_QUEUE.json"),"utf8").then(JSON.parse),
    readFile(path.join(generated,"EVIDENCE_DEBT.json"),"utf8").then(JSON.parse),
    readFile(path.join(root,"START_HERE.md"),"utf8"),
  ]);
  assert.equal(manifest.schemaVersion,2);
  assert.equal(manifest.sourceCount,graph.nodes.length);
  assert.equal(graph.nodes.length,manifest.nodeCount);
  assert.equal(graph.edges.length,manifest.edgeCount);
  assert.ok(graph.edges.every(edge=>edge.source&&edge.type&&edge.target));
  assert.match(index,/Generated routing aid/);
  assert.match(active,/Open decisions and blockers/);
  assert.match(active,/Treat this file as a map, not evidence/);
  assert.match(paperReview,/AI extraction is provisional/);
  assert.match(paperReview,/must not set `human_reviewed: true`/);
  assert.match(agentStart,/Run files are non-canonical/);
  assert.equal(taskQueue.schema_version,"agent-task-queue-v1");
  assert.ok(taskQueue.tasks.some(task=>task.id==="CLM-001"));
  assert.equal(evidenceDebt.schema_version,"evidence-debt-v1");
  assert.equal(evidenceDebt.claims.length,4);
  assert.equal(evidenceDebt.papers.length,8);
  assert.match(start,/pnpm ai:sync/);
  await Promise.all(graph.nodes.map(node=>access(path.join(root,"vault",node.path))));
});
