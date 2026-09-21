import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  beginCanonicalizationTransaction,
  completeCanonicalizationTransaction,
  failCanonicalizationTransaction,
  prepareCanonicalizationRetry,
} from "../lib/canonicalization-transaction.ts";
import {contentRevision} from "../lib/local-project-store.ts";

const planHash="a".repeat(64);

test("recovers only transaction-created files that still match their planned hash",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"research-os-transaction-"));
  const raw="planned content\n";
  const relative="vault/03 Papers/PAP-001 Test.md";
  const details={
    plan_hash:planHash,project_id:"test",run_id:"run-12345678",candidate_id:"candidate",
    planned_files:[{relative_path:relative,content_hash:contentRevision(raw)}],
  };
  const started=await beginCanonicalizationTransaction(root,details);
  const absolute=path.join(root,...relative.split("/"));
  await import("node:fs/promises").then(fs=>fs.mkdir(path.dirname(absolute),{recursive:true}));
  await writeFile(absolute,raw,"utf8");
  await failCanonicalizationTransaction(root,started.journal,new Error("simulated failure"));
  await assert.rejects(()=>readFile(absolute,"utf8"),{code:"ENOENT"});
  const resumed=await beginCanonicalizationTransaction(root,details);
  assert.equal(resumed.journal.attempts,2);
});

test("preserves externally changed files and blocks automatic recovery",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"research-os-transaction-"));
  const relative="vault/03 Papers/PAP-001 Test.md";
  const details={
    plan_hash:"b".repeat(64),project_id:"test",run_id:"run-12345678",candidate_id:"candidate",
    planned_files:[{relative_path:relative,content_hash:contentRevision("planned\n")}],
  };
  const started=await beginCanonicalizationTransaction(root,details);
  const absolute=path.join(root,...relative.split("/"));
  await import("node:fs/promises").then(fs=>fs.mkdir(path.dirname(absolute),{recursive:true}));
  await writeFile(absolute,"externally changed\n","utf8");
  const blocked=await failCanonicalizationTransaction(root,started.journal,new Error("simulated failure"));
  assert.deepEqual(blocked,[relative]);
  assert.equal(await readFile(absolute,"utf8"),"externally changed\n");
  await assert.rejects(()=>beginCanonicalizationTransaction(root,details),/Preserved files changed/);
});

test("completed transactions are idempotent",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"research-os-transaction-"));
  const details={
    plan_hash:"c".repeat(64),project_id:"test",run_id:"run-12345678",candidate_id:"candidate",planned_files:[],
  };
  const started=await beginCanonicalizationTransaction(root,details);
  await completeCanonicalizationTransaction(root,started.journal);
  const repeated=await beginCanonicalizationTransaction(root,details);
  assert.equal(repeated.idempotent,true);
});

test("prepares a retry by removing interrupted writes before plan reconstruction",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"research-os-transaction-"));
  const relative="vault/03 Papers/PAP-001 Test.md";
  const raw="partial transaction output\n";
  const details={
    plan_hash:"d".repeat(64),project_id:"test",run_id:"run-12345678",candidate_id:"candidate",
    planned_files:[{relative_path:relative,content_hash:contentRevision(raw)}],
  };
  await beginCanonicalizationTransaction(root,details);
  const absolute=path.join(root,...relative.split("/"));
  await import("node:fs/promises").then(fs=>fs.mkdir(path.dirname(absolute),{recursive:true}));
  await writeFile(absolute,raw,"utf8");
  const recovered=await prepareCanonicalizationRetry(root,details.plan_hash);
  assert.equal(recovered?.status,"recovered");
  await assert.rejects(()=>readFile(absolute,"utf8"),{code:"ENOENT"});
});
