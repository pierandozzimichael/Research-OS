import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {appendRunEvent,inspectRun,requestRunCancellation,writeRunContextPacket} from "../lib/agent-run-ledger.ts";

test("agent run events are append-only and inspectable without canonical records",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"research-os-run-ledger-"));
  const vault=path.join(root,"vault");
  const run="AGENT-TEST-01";
  const runRoot=path.join(vault,"14 AI Workspace","runs",run);
  try{
    await mkdir(runRoot,{recursive:true});
    await writeFile(path.join(runRoot,"RUN.json"),`${JSON.stringify({schema_version:"agent-run-v1",run_id:run,status:"initialized"})}\n`);
    const artifact=await writeRunContextPacket(vault,run,{schema_version:"research-context-packet-v1",focus:{id:"CLM-001"}});
    assert.equal(artifact,"CONTEXT_PACKET.json");
    assert.equal(JSON.parse(await readFile(path.join(runRoot,artifact),"utf8")).focus.id,"CLM-001");
    const event=await appendRunEvent(vault,run,{kind:"context-packet-created",summary:"Created bounded context.",source_hash:"a".repeat(64),artifacts:["CONTEXT_PACKET.json"]});
    assert.equal(event.kind,"context-packet-created");
    const status=await inspectRun(vault,run);
    assert.equal(status.event_count,1);
    assert.equal(status.events[0].event_id,event.event_id);
    assert.equal(status.events[0].artifacts?.[0],"CONTEXT_PACKET.json");
    const cancellation=await requestRunCancellation(vault,run,"Pause before worker launch.");
    assert.equal(cancellation.reason,"Pause before worker launch.");
    const cancelled=await inspectRun(vault,run);
    assert.equal(cancelled.cancellation?.reason,"Pause before worker launch.");
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test("agent run events reject unsafe or nonexistent run locations",async()=>{
  await assert.rejects(()=>appendRunEvent(path.resolve("vault"),"../outside",{kind:"note-added",summary:"no"}),/Run ID/);
  await assert.rejects(()=>appendRunEvent(path.resolve("vault"),"AGENT-NO-EXIST",{kind:"note-added",summary:"no"}),/Unknown run/);
});
