import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";

const root=process.cwd();
const port=31800+(process.pid%500);
const baseUrl=`http://127.0.0.1:${port}`;

async function waitForSession(child) {
  const deadline=Date.now()+25_000;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw new Error(`Local test server exited with code ${child.exitCode}`);
    try{
      const response=await fetch(`${baseUrl}/api/local-session`,{signal:AbortSignal.timeout(500)});
      if(response.ok)return response;
    }catch{/* The bounded readiness loop retries until the deadline. */}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error("Local API did not become ready within 25 seconds");
}

test("local API issues a session token, rejects cross-origin writes, and serves revisioned snapshots", async () => {
  const child=spawn(process.execPath,[
    path.join(root,"node_modules","vinext","dist","cli.js"),
    "dev",
    "--hostname","127.0.0.1",
    "--port",String(port),
    "--strictPort",
  ],{
    cwd:root,
    env:{...process.env,RESEARCH_OS_INTEGRATION_TEST:"1"},
    stdio:["ignore","ignore","ignore"],
  });

  try{
    const sessionResponse=await waitForSession(child);
    const session=await sessionResponse.json();
    assert.equal(typeof session.writeToken,"string");
    assert.ok(session.writeToken.length>=32);

    // A cold vinext RSC compile can take longer on Windows, but remains bounded.
    const page=await fetch(baseUrl,{signal:AbortSignal.timeout(25_000)});
    assert.equal(page.status,200);
    const html=await page.text();
    assert.match(html,/<title>Research OS<\/title>/i);
    assert.match(html,/>Agent</);

    const noToken=await fetch(`${baseUrl}/api/project-record`,{
      method:"POST",
      headers:{"content-type":"application/json","origin":baseUrl},
      body:JSON.stringify({projectId:"missing",relativePath:"IDEA-001.md",raw:"---\n---",baseRevision:null}),
    });
    assert.equal(noToken.status,400);
    assert.match((await noToken.json()).error,/token/i);

    const crossOrigin=await fetch(`${baseUrl}/api/project-record`,{
      method:"POST",
      headers:{
        "content-type":"application/json",
        "origin":"https://attacker.example",
        "x-research-os-token":session.writeToken,
      },
      body:JSON.stringify({projectId:"missing",relativePath:"IDEA-001.md",raw:"---\n---",baseRevision:null}),
    });
    assert.equal(crossOrigin.status,400);
    assert.match((await crossOrigin.json()).error,/cross-origin/i);

    const snapshot=await fetch(`${baseUrl}/api/project-snapshot?id=apoe-rexach`);
    assert.equal(snapshot.status,200);
    const payload=await snapshot.json();
    assert.ok(payload.records.length>0);
    assert.ok(payload.records.every(record=>typeof record.revision==="string"&&record.revision.length===64));
    assert.equal(payload.aiContext.current,true);
    assert.equal(payload.diagnostics.sourceFileCount,payload.diagnostics.indexedRecordCount);
    assert.equal(payload.diagnostics.skippedFileCount,0);
    assert.equal(payload.diagnostics.schemaErrorCount,0);
    assert.equal(payload.diagnostics.relationshipErrorCount,0);
    assert.equal(payload.diagnostics.duplicateIdCount,0);
    assert.equal(payload.diagnostics.missingTargetCount,0);
    assert.deepEqual(payload.diagnostics.issues,[]);

    const literatureInbox=await fetch(`${baseUrl}/api/literature-inbox?projectId=apoe-rexach`);
    assert.equal(literatureInbox.status,200);
    assert.ok(Array.isArray((await literatureInbox.json()).proposals));

    const invalidReview=await fetch(`${baseUrl}/api/literature-review`,{
      method:"POST",
      headers:{
        "content-type":"application/json",
        "origin":baseUrl,
        "x-research-os-token":session.writeToken,
      },
      body:JSON.stringify({projectId:"apoe-rexach",runId:"missing-run",candidateId:"missing",review:{}}),
    });
    assert.equal(invalidReview.status,400);
    assert.match((await invalidReview.json()).error,/invalid frontier-agent review/i);

    const refreshed=await fetch(`${baseUrl}/api/ai-context`,{
      method:"POST",
      headers:{
        "content-type":"application/json",
        "origin":baseUrl,
        "x-research-os-token":session.writeToken,
      },
      body:JSON.stringify({projectId:"apoe-rexach"}),
    });
    assert.equal(refreshed.status,200);
    assert.equal((await refreshed.json()).aiContext.current,true);
  }finally{
    if(child.exitCode===null){
      child.kill();
      await new Promise(resolve=>child.once("exit",resolve));
    }
  }
});
