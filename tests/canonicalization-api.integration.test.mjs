import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {access,mkdir,mkdtemp,readFile,readdir,rm,unlink,writeFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {createRecordMarkdown} from "../lib/research-schema.ts";

const root=process.cwd();
const port=32400+(process.pid%400);
const baseUrl=`http://127.0.0.1:${port}`;

async function waitForSession(child){
  const deadline=Date.now()+30_000;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw new Error(`Canonicalization test server exited with code ${child.exitCode}`);
    try{
      const response=await fetch(`${baseUrl}/api/local-session`,{signal:AbortSignal.timeout(500)});
      if(response.ok)return response.json();
    }catch{/* Bounded readiness retry. */}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error("Canonicalization test server did not become ready.");
}

function startServer(environment,faultAfter=0){
  return spawn(process.execPath,[
    path.join(root,"node_modules","vinext","dist","cli.js"),
    "dev","--hostname","127.0.0.1","--port",String(port),"--strictPort",
  ],{
    cwd:root,
    env:{
      ...process.env,
      ...environment,
      RESEARCH_OS_INTEGRATION_TEST:"1",
      RESEARCH_OS_CANONICALIZATION_EXIT_AFTER_WRITES:String(faultAfter),
    },
    stdio:["ignore","ignore","ignore"],
  });
}

async function stopServer(child){
  if(child&&child.exitCode===null){
    child.kill();
    await new Promise(resolve=>child.once("exit",resolve));
  }
}

async function waitForExit(child){
  if(child.exitCode!==null)return;
  await new Promise(resolve=>child.once("exit",resolve));
}

async function post(session,route,payload){
  return fetch(`${baseUrl}${route}`,{
    method:"POST",
    headers:{
      "content-type":"application/json",
      "origin":baseUrl,
      "x-research-os-token":session.writeToken,
    },
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(30_000),
  });
}

function candidate(seed,index){
  const url=`https://pubmed.ncbi.nlm.nih.gov/${900000+index}/`;
  return {
    candidate_id:`candidate-${seed}-${index}`,
    title:`Synthetic verified paper ${seed} ${index}`,
    abstract:"Synthetic abstract used only inside an isolated integration vault.",
    doi:`https://doi.org/10.9999/${seed}.${index}`,
    pmid:String(900000+index),
    url,
    decision:"accept",
    human_reviewed:false,
    agent_review:{
      schema_version:"frontier-review-v2",
      recommendation:"accept",
      verification_depth:"abstract",
      primary_source_checked:true,
      rationale:"Synthetic primary-source verification for the isolated canonicalization integration test.",
      reviewed_by_model:"integration-test-model",
      reviewed_at:"2026-07-29T12:00:00Z",
      checked_urls:[url],
      candidate_claims:[`Synthetic candidate claim ${seed} ${index}.`],
      claim_targets:[null],
      contradiction_signal:"none",
      novelty:"low",
      model_impact:"none",
      verified_evidence:[{
        exact_text:`Synthetic bounded evidence statement ${seed} ${index}.`,
        source_url:url,
        locator:"Abstract, synthetic sentence 1",
        epistemic_label:"AUTHOR",
        verified_at:"2026-07-29T12:00:00Z",
        claim_indices:[0],
      }],
    },
  };
}

test("canonicalization API rejects stale plans, applies idempotently, and recovers after process exit",async()=>{
  const tempParent=path.join(root,".codex_tmp");
  await mkdir(tempParent,{recursive:true});
  const testRoot=await mkdtemp(path.join(tempParent,"canonicalization-api-"));
  assert.ok(path.resolve(testRoot).startsWith(`${path.resolve(tempParent)}${path.sep}`));
  const vaultRoot=path.join(testRoot,"vault");
  const inbox=path.join(vaultRoot,"01 Inbox","Literature");
  await mkdir(path.join(vaultRoot,"00 Dashboard"),{recursive:true});
  await mkdir(inbox,{recursive:true});
  await writeFile(
    path.join(vaultRoot,"00 Dashboard","PROJECT.md"),
    createRecordMarkdown("project","PRJ-001","Synthetic integration project","Isolated API test project."),
    "utf8",
  );
  const seed=`${process.pid}${Date.now()}`;
  const runId=`RUN${seed}`;
  const proposalPath=path.join(inbox,`RUN-${runId}.json`);
  const proposal={
    schema_version:"research-intake-v1",
    run_id:runId,
    project_key:"integration",
    created_at:"2026-07-29T12:00:00Z",
    canonical_write_authorized:false,
    candidates:[candidate(seed,1),candidate(seed,2)],
  };
  await writeFile(proposalPath,`${JSON.stringify(proposal,null,2)}\n`,"utf8");
  const registryPath=path.join(testRoot,"projects.json");
  await writeFile(registryPath,`${JSON.stringify({
    version:1,
    projects:[{id:"integration",name:"Integration",description:"Isolated test",vaultPath:vaultRoot,createdAt:"2026-07-29T12:00:00Z"}],
  },null,2)}\n`,"utf8");
  const environment={
    RESEARCH_OS_PROJECTS_FILE:registryPath,
    RESEARCH_OS_TEST_ROOT:testRoot,
  };
  const journalPaths=[];
  let child;
  try{
    child=startServer(environment);
    let session=await waitForSession(child);
    const previewResponse=await post(session,"/api/literature-canonicalize",{
      projectId:"integration",runId,candidateId:proposal.candidates[0].candidate_id,mode:"preview",
    });
    assert.equal(previewResponse.status,200);
    const preview=await previewResponse.json();
    journalPaths.push(path.join(root,".research-os","transactions",`${preview.plan.plan_hash}.json`));

    const changed=JSON.parse(await readFile(proposalPath,"utf8"));
    changed.candidates[0].agent_review.rationale+=" Changed after preview.";
    await writeFile(proposalPath,`${JSON.stringify(changed,null,2)}\n`,"utf8");
    const stale=await post(session,"/api/literature-canonicalize",{
      projectId:"integration",runId,candidateId:proposal.candidates[0].candidate_id,mode:"apply",planHash:preview.plan.plan_hash,
    });
    assert.equal(stale.status,400);
    assert.match((await stale.json()).error,/Plan changed/);
    await writeFile(proposalPath,`${JSON.stringify(proposal,null,2)}\n`,"utf8");

    const freshPreview=await post(session,"/api/literature-canonicalize",{
      projectId:"integration",runId,candidateId:proposal.candidates[0].candidate_id,mode:"preview",
    });
    const freshPlan=(await freshPreview.json()).plan;
    const applied=await post(session,"/api/literature-canonicalize",{
      projectId:"integration",runId,candidateId:proposal.candidates[0].candidate_id,mode:"apply",planHash:freshPlan.plan_hash,
    });
    assert.equal(applied.status,200);
    const appliedPayload=await applied.json();
    assert.equal(appliedPayload.idempotent,false);
    assert.equal(appliedPayload.created.length,4);
    const repeated=await post(session,"/api/literature-canonicalize",{
      projectId:"integration",runId,candidateId:proposal.candidates[0].candidate_id,mode:"apply",planHash:freshPlan.plan_hash,
    });
    const repeatedPayload=await repeated.json();
    assert.equal(repeated.status,200,JSON.stringify(repeatedPayload));
    assert.equal(repeatedPayload.idempotent,true);
    await stopServer(child);
    child=undefined;

    child=startServer(environment,2);
    session=await waitForSession(child);
    const interruptedPreview=await post(session,"/api/literature-canonicalize",{
      projectId:"integration",runId,candidateId:proposal.candidates[1].candidate_id,mode:"preview",
    });
    const interruptedPlan=(await interruptedPreview.json()).plan;
    const interruptedJournal=path.join(root,".research-os","transactions",`${interruptedPlan.plan_hash}.json`);
    journalPaths.push(interruptedJournal);
    await assert.rejects(()=>post(session,"/api/literature-canonicalize",{
      projectId:"integration",runId,candidateId:proposal.candidates[1].candidate_id,mode:"apply",planHash:interruptedPlan.plan_hash,
    }));
    await waitForExit(child);
    assert.equal(child.exitCode,86);
    child=undefined;
    await access(interruptedJournal);

    child=startServer(environment);
    session=await waitForSession(child);
    const recovered=await post(session,"/api/literature-canonicalize",{
      projectId:"integration",runId,candidateId:proposal.candidates[1].candidate_id,mode:"apply",planHash:interruptedPlan.plan_hash,
    });
    const recoveredPayload=await recovered.json();
    assert.equal(recovered.status,200,JSON.stringify(recoveredPayload));
    assert.equal(recoveredPayload.idempotent,false);
    const journal=JSON.parse(await readFile(interruptedJournal,"utf8"));
    assert.equal(journal.status,"applied");
    assert.equal(journal.attempts,2);

    const canonicalFiles=(await Promise.all([
      readdir(path.join(vaultRoot,"03 Papers")),
      readdir(path.join(vaultRoot,"04 Claims")),
      readdir(path.join(vaultRoot,"13 Decisions")),
      readdir(path.join(vaultRoot,"15 Evidence")),
    ])).flat();
    for(const id of [interruptedPlan.paper_id,...interruptedPlan.claim_ids,interruptedPlan.decision_id,...interruptedPlan.evidence_ids]){
      assert.ok(canonicalFiles.some(name=>name.startsWith(id)));
    }
  }finally{
    await stopServer(child);
    for(const journalPath of journalPaths)await unlink(journalPath).catch(()=>undefined);
    if(path.resolve(testRoot).startsWith(`${path.resolve(tempParent)}${path.sep}`)){
      await rm(testRoot,{recursive:true,force:true});
    }
  }
});
