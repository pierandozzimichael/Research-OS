import assert from "node:assert/strict";
import {mkdtemp,mkdir,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {buildAiManifest,inspectAiReadiness} from "../lib/ai-readiness.ts";
import {canonicalSourceHash} from "../lib/canonical-record-files.ts";

async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"research-os-readiness-"));
  const vault=path.join(root,"vault");
  const generated=path.join(vault,"14 AI Workspace","generated");
  await mkdir(path.join(vault,"00 Dashboard"),{recursive:true});
  await mkdir(generated,{recursive:true});
  await Promise.all([
    writeFile(path.join(root,"package.json"),JSON.stringify({name:"fixture",version:"1.0.0",scripts:{"ai:doctor":"x","ai:manifest":"x","ai:sync":"x","ai:check":"x","schema:validate":"x","research:tool":"x","research:mcp":"x"}})),
    writeFile(path.join(root,"projects.json"),JSON.stringify({version:1,projects:[{id:"test",name:"Test",vaultPath:"vault"}]})),
    writeFile(path.join(root,"START_HERE.md"),"start"),
    writeFile(path.join(root,"AGENTS.md"),"agents"),
    writeFile(path.join(root,"CLAUDE.md"),"claude"),
    writeFile(path.join(root,"CURRENT_STATE.md"),"current"),
    writeFile(path.join(root,"NEXT_ACTIONS.md"),"next"),
    writeFile(path.join(root,"TRAPS.md"),"traps"),
    writeFile(path.join(vault,"00 Dashboard","PROJECT.md"),"---\nid: PRJ-001\ntype: project\n---\n"),
  ]);
  const raw="---\nid: PRJ-001\ntype: project\n---\n";
  const sourceHash=canonicalSourceHash([{relativePath:"00 Dashboard/PROJECT.md",raw}]);
  await writeFile(path.join(generated,"MANIFEST.json"),JSON.stringify({sourceHash}));
  return root;
}

test("AI manifest is deterministic and separates canonical, generated, run, staging, and scratch state",async()=>{
  const root=await fixture();
  try{
    const first=await buildAiManifest(root);
    const second=await buildAiManifest(root);
    assert.deepEqual(first,second);
    assert.equal(first.schema_version,"research-os-ai-manifest-v1");
    assert.equal(first.projects[0].vault_path,"vault");
    assert.match(first.state_boundaries.generated.authority,/never evidence/);
    assert.match(first.state_boundaries.scratch.authority,/never evidence/);
    assert.ok(first.tools.some(tool=>tool.id==="change.apply"&&tool.boundary==="governed-write"));
  }finally{await rm(root,{recursive:true,force:true});}
});

test("readiness fails stale generated context but treats optional adapters as warnings",async()=>{
  const root=await fixture();
  try{
    const manifest=await buildAiManifest(root);
    await writeFile(path.join(root,"AI_MANIFEST.json"),`${JSON.stringify(manifest,null,2)}\n`);
    let report=await inspectAiReadiness(root);
    assert.equal(report.ready,true);
    assert.ok(report.checks.some(check=>check.id==="adapter:codex"&&check.status==="warn"));
    assert.ok(report.checks.some(check=>check.id==="root-manifest"&&check.status==="pass"));

    await writeFile(path.join(root,"vault","00 Dashboard","PROJECT.md"),"---\nid: PRJ-001\ntype: project\n---\nchanged\n");
    report=await inspectAiReadiness(root);
    assert.equal(report.ready,false);
    assert.ok(report.checks.some(check=>check.id==="freshness:test"&&check.status==="fail"));
  }finally{await rm(root,{recursive:true,force:true});}
});
