import assert from "node:assert/strict";
import test from "node:test";
import {cp,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {contextPacket,evidenceDossier,loadResearchEnvironment,searchRecords} from "../lib/research-environment.ts";

const root=process.cwd();

test("agent evaluation baseline preserves bounded retrieval and separate contradiction lanes",async()=>{
  const env=await loadResearchEnvironment(root,"apoe-rexach");
  const search=searchRecords(env,{query:"ABCA7 lipid",limit:5}) as {source:{source_hash:string};result:Array<Record<string,unknown>>};
  assert.match(search.source.source_hash,/^[a-f0-9]{64}$/);
  assert.ok(search.result.length>0);
  assert.ok(search.result.every(item=>item.raw===undefined&&item.body===undefined&&item.content===undefined));
  const dossier=evidenceDossier(env,{id:"CLM-004"}) as {result:{support:Array<{relation:string}>;against:Array<{relation:string}>}};
  assert.ok(dossier.result.support.every(item=>item.relation==="supports"));
  assert.ok(dossier.result.against.every(item=>["contradicts","challenges"].includes(item.relation)));
  const packet=contextPacket(env,{id:"CLM-004",maxChars:3500}) as unknown as {estimated_characters:number;max_chars:number};
  assert.ok(packet.estimated_characters<=packet.max_chars);
});

test("agent evaluation baseline fails closed when generated context is stale",async()=>{
  const temporary=await mkdtemp(path.join(os.tmpdir(),"research-os-stale-eval-"));
  try{
    await cp(path.join(root,"vault"),path.join(temporary,"vault"),{recursive:true});
    await writeFile(path.join(temporary,"projects.json"),`${JSON.stringify({version:1,projects:[{id:"apoe-rexach",name:"Eval",description:"",vaultPath:"vault"}]})}\n`);
    const manifestPath=path.join(temporary,"vault","14 AI Workspace","generated","MANIFEST.json");
    const manifest=JSON.parse(await readFile(manifestPath,"utf8"));
    manifest.sourceHash="0".repeat(64);
    await writeFile(manifestPath,`${JSON.stringify(manifest)}\n`);
    await assert.rejects(()=>loadResearchEnvironment(temporary,"apoe-rexach"),/Generated AI context is stale/);
  }finally{await rm(temporary,{recursive:true,force:true});}
});
