import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  atomicWriteFile,
  contentRevision,
  RecordConflictError,
  safeRecordPath,
  updateRecordWithRevision,
  writeRecordWithRevision,
} from "../lib/local-project-store.ts";
import {
  isAllowedLocalOrigin,
  isLoopbackHost,
  secureTokenMatches,
} from "../lib/local-http-security.ts";

test("revision-aware writes reject a stale browser edit without changing the file", async () => {
  const temporary=await mkdtemp(path.join(os.tmpdir(),"research-os-store-"));
  try{
    const record=path.join(temporary,"08 Ideas","IDEA-001.md");
    const initial="---\ntype: idea\n---\n\nInitial\n";
    const external="---\ntype: idea\n---\n\nExternal AI edit\n";
    await mkdir(path.dirname(record),{recursive:true});
    await writeFile(record,initial,"utf8");
    const staleRevision=contentRevision(initial);
    await writeFile(record,external,"utf8");

    await assert.rejects(
      writeRecordWithRevision(record,"---\ntype: idea\n---\n\nBrowser edit\n",staleRevision),
      RecordConflictError,
    );
    assert.equal(await readFile(record,"utf8"),external);
  }finally{
    await rm(temporary,{recursive:true,force:true});
  }
});

test("position updates preserve the current Markdown body and advance the revision", async () => {
  const temporary=await mkdtemp(path.join(os.tmpdir(),"research-os-position-"));
  try{
    const record=path.join(temporary,"IDEA-001.md");
    const initial="---\ntype: idea\ncanvas_x: 10\ncanvas_y: 20\n---\n\nKeep this body.\n";
    await writeFile(record,initial,"utf8");
    const saved=await updateRecordWithRevision(
      record,
      contentRevision(initial),
      raw=>raw.replace("canvas_x: 10","canvas_x: 55").replace("canvas_y: 20","canvas_y: 89"),
    );
    assert.match(saved.raw,/canvas_x: 55/);
    assert.match(saved.raw,/canvas_y: 89/);
    assert.match(saved.raw,/Keep this body\./);
    assert.notEqual(saved.revision,contentRevision(initial));
  }finally{
    await rm(temporary,{recursive:true,force:true});
  }
});

test("new record creation refuses to overwrite an existing path", async () => {
  const temporary=await mkdtemp(path.join(os.tmpdir(),"research-os-create-"));
  try{
    const record=path.join(temporary,"PAP-001.md");
    await writeFile(record,"existing","utf8");
    await assert.rejects(
      writeRecordWithRevision(record,"replacement",null),
      RecordConflictError,
    );
    assert.equal(await readFile(record,"utf8"),"existing");
  }finally{
    await rm(temporary,{recursive:true,force:true});
  }
});

test("atomic writes replace an existing file without exposing partial content",async()=>{
  const temporary=await mkdtemp(path.join(os.tmpdir(),"research-os-atomic-"));
  try{
    const record=path.join(temporary,"generated","ACTIVE_CONTEXT.md");
    await atomicWriteFile(record,"first\n");
    await atomicWriteFile(record,"second\n");
    assert.equal(await readFile(record,"utf8"),"second\n");
  }finally{
    await rm(temporary,{recursive:true,force:true});
  }
});

test("record paths cannot escape the selected project vault", () => {
  const vault=path.resolve("C:/research/projects/example/vault");
  assert.throws(()=>safeRecordPath(vault,"../other/vault/secret.md"));
  assert.throws(()=>safeRecordPath(vault,"/absolute.md"));
  assert.doesNotThrow(()=>safeRecordPath(vault,"08 Ideas/IDEA-001.md"));
});

test("write security accepts only a matching loopback origin and token", () => {
  assert.equal(isLoopbackHost("127.0.0.1:3000"),true);
  assert.equal(isLoopbackHost("localhost:3001"),true);
  assert.equal(isLoopbackHost("research.example.com"),false);
  assert.equal(isAllowedLocalOrigin("127.0.0.1:3000","http://127.0.0.1:3000"),true);
  assert.equal(isAllowedLocalOrigin("127.0.0.1:3000","https://attacker.example"),false);
  assert.equal(isAllowedLocalOrigin("research.example.com","https://research.example.com"),false);
  assert.equal(secureTokenMatches("correct-token","correct-token"),true);
  assert.equal(secureTokenMatches("correct-token","incorrect-token"),false);
  assert.equal(secureTokenMatches("correct-token",undefined),false);
});
