import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root=process.cwd();
const port=33200+(process.pid%300);
const baseUrl=`http://127.0.0.1:${port}`;

async function waitForSession(child){
  const deadline=Date.now()+25_000;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw new Error(`Visibility test server exited with code ${child.exitCode}`);
    try{
      const response=await fetch(`${baseUrl}/api/local-session`,{signal:AbortSignal.timeout(500)});
      if(response.ok)return response.json();
    }catch{/* Bounded readiness retry. */}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error("Visibility test server did not become ready within 25 seconds");
}

async function patchProject(session,id,action){
  return fetch(`${baseUrl}/api/projects`,{
    method:"PATCH",
    headers:{"content-type":"application/json","origin":baseUrl,"x-research-os-token":session.writeToken},
    body:JSON.stringify({id,action}),
    signal:AbortSignal.timeout(10_000),
  });
}

test("projects can be hidden and restored without deleting their vault",async()=>{
  const temporary=await mkdtemp(path.join(os.tmpdir(),"research-os-project-visibility-"));
  const registryPath=path.join(temporary,"projects.json");
  const firstVault=path.join(temporary,"first","vault");
  const secondVault=path.join(temporary,"second","vault");
  const marker=path.join(secondVault,"KEEP_ME.md");
  await mkdir(firstVault,{recursive:true});
  await mkdir(secondVault,{recursive:true});
  await writeFile(marker,"This file must survive project visibility changes.\n","utf8");
  await writeFile(registryPath,`${JSON.stringify({version:1,projects:[
    {id:"first",name:"First",description:"",vaultPath:firstVault,createdAt:"2026-08-20T00:00:00.000Z"},
    {id:"second",name:"Second",description:"",vaultPath:secondVault,createdAt:"2026-08-20T00:00:00.000Z"},
  ]},null,2)}\n`,`utf8`);

  const child=spawn(process.execPath,[path.join(root,"node_modules","vinext","dist","cli.js"),"dev","--hostname","127.0.0.1","--port",String(port),"--strictPort"],{
    cwd:root,
    env:{...process.env,RESEARCH_OS_INTEGRATION_TEST:"1",RESEARCH_OS_PROJECTS_FILE:registryPath,RESEARCH_OS_TEST_ROOT:temporary},
    stdio:["ignore","ignore","ignore"],
  });

  try{
    const session=await waitForSession(child);
    const hidden=await patchProject(session,"second","hide");
    assert.equal(hidden.status,200);
    let listing=await (await fetch(`${baseUrl}/api/projects`)).json();
    assert.deepEqual(listing.projects.map(project=>project.id),["first"]);
    assert.deepEqual(listing.hiddenProjects.map(project=>project.id),["second"]);
    assert.equal(await readFile(marker,"utf8"),"This file must survive project visibility changes.\n");

    const lastVisible=await patchProject(session,"first","hide");
    assert.equal(lastVisible.status,400);
    assert.match((await lastVisible.json()).error,/at least one project visible/i);

    const restored=await patchProject(session,"second","restore");
    assert.equal(restored.status,200);
    listing=await (await fetch(`${baseUrl}/api/projects`)).json();
    assert.deepEqual(listing.projects.map(project=>project.id).sort(),["first","second"]);
    assert.deepEqual(listing.hiddenProjects,[]);
    assert.equal(await readFile(marker,"utf8"),"This file must survive project visibility changes.\n");
  }finally{
    if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once("exit",resolve));}
    await rm(temporary,{recursive:true,force:true});
  }
});
