import assert from "node:assert/strict";
import test from "node:test";
import {buildLabShareEmailDraft, buildLabShareHtml, buildLabShareManifest, buildLabShareSnapshot} from "../lib/lab-share.ts";

const project={
  id:"PRJ-001",
  name:"Example lab project",
  centralQuestion:"Which mechanism should we test next?",
};

test("lab snapshot is explicitly read-only and omits private material and raw bodies",()=>{
  const result=buildLabShareSnapshot(project,[
    {id:"MOD-001",type:"model",title:"Working model",privacy:"public",status:"working",summary:"A compact public model.",body:"## Hidden reasoning\nDo not export this.\n\n## Connections\n- supports [[CLM-001 Public claim]]"},
    {id:"CLM-001",type:"claim",title:"Public claim",privacy:"public",status:"provisional",summary:"A testable claim.",fields:{confidence:"weak",human_reviewed:false,evidence_anchors:[]},body:"## Supporting evidence\nSecret raw text should not appear."},
    {id:"IDEA-001",type:"idea",title:"Private idea",privacy:"private",status:"active",summary:"Private material must stay private.",body:"PRIVATE RAW BODY"},
    {id:"PAP-001",type:"paper",title:"Source paper",privacy:"public",status:"reviewed",fields:{doi:"10.1000/example"},body:""},
  ],{generatedAt:"2026-08-19T12:00:00Z"});
  assert.match(result.markdown,/NONCANONICAL · READ-ONLY VIEW/);
  assert.match(result.markdown,/Which mechanism should we test next\?/);
  assert.match(result.markdown,/MOD-001/);
  assert.match(result.markdown,/CLM-001/);
  assert.doesNotMatch(result.markdown,/PRIVATE RAW BODY|Secret raw text|Hidden reasoning/);
  assert.doesNotMatch(result.markdown,/PAP-001/);
  assert.match(result.markdown,/Private records excluded: 1/);
  assert.equal(result.excludedPrivateCount,1);
  assert.deepEqual(result.includedIds,["CLM-001","MOD-001"]);
});

test("selected IDs create a small deterministic view and preserve source links",()=>{
  const result=buildLabShareSnapshot(project,[
    {id:"CLM-002",type:"claim",title:"Unselected",privacy:"public",summary:"No export."},
    {id:"PAP-002",type:"paper",title:"Referenced source",privacy:"public",fields:{doi:"10.5555/test"},body:""},
    {id:"EXP-001",type:"experiment",title:"Discriminating test",privacy:"public",status:"concept",summary:"Test the mechanism.",fields:{human_reviewed:"false"},urls:["https://example.org/protocol"]},
  ],{selectedIds:["EXP-001"],generatedAt:"2026-08-19"});
  assert.match(result.markdown,/## Experiments/);
  assert.match(result.markdown,/https:\/\/example\.org\/protocol/);
  assert.doesNotMatch(result.markdown,/CLM-002|PAP-002|10\.5555/);
  // Papers are deliberately source-link material, not a shared record lane.
  assert.equal(result.excludedUnselectedCount,1);
  assert.deepEqual(result.includedIds,["EXP-001"]);
});

test("shared records inherit public links from explicitly connected paper records",()=>{
  const result=buildLabShareSnapshot(project,[
    {id:"CLM-003",type:"claim",title:"Linked claim",privacy:"public",status:"provisional",summary:"A linked claim.",connections:[{type:"supported-by",target:"PAP-003"}]},
    {id:"PAP-003",type:"paper",title:"Public source",privacy:"public",fields:{doi:"10.7777/source"}},
    {id:"PAP-004",type:"paper",title:"Private source",privacy:"private",fields:{doi:"10.7777/private"}},
  ],{selectedIds:["CLM-003"],generatedAt:"2026-08-19"});
  assert.match(result.markdown,/https:\/\/doi\.org\/10\.7777\/source/);
  assert.doesNotMatch(result.markdown,/10\.7777\/private/);
});

test("private connection targets never appear in a public export",()=>{
  const result=buildLabShareManifest(project,[
    {id:"CLM-009",type:"claim",title:"Public claim",privacy:"public",connections:[{type:"related",target:"IDEA-009"}]},
    {id:"IDEA-009",type:"idea",title:"Private idea",privacy:"private"},
  ],{selectedIds:["CLM-009"],generatedAt:"2026-08-19"});
  assert.deepEqual(result.records[0]?.connections,[]);
  assert.equal(result.exclusions.omitted_private_connections,1);
  assert.doesNotMatch(JSON.stringify(result),/IDEA-009/);
});

test("HTML and JSON companions are deterministic, safe, and preserve the share boundary",()=>{
  const records=[
    {id:"CLM-010",type:"claim",title:"Unsafe <claim>",privacy:"public",status:"provisional",summary:"A <script>alert(1)</script> claim.",connections:[{type:"supported-by",target:"PAP-010"}]},
    {id:"PAP-010",type:"paper",title:"Public source",privacy:"public",fields:{doi:"10.1234/example"}},
    {id:"IDEA-010",type:"idea",title:"Private idea",privacy:"private",summary:"Do not expose."},
  ];
  const options={selectedIds:["CLM-010"],generatedAt:"2026-08-19T12:00:00Z",sourceHash:"abc123"};
  const html=buildLabShareHtml(project,records,options);
  const manifest=buildLabShareManifest(project,records,options);
  assert.match(html,/Content-Security-Policy/);
  assert.match(html,/Unsafe &lt;claim&gt;/);
  assert.doesNotMatch(html,/<script>alert/);
  assert.match(html,/https:\/\/doi\.org\/10\.1234\/example/);
  assert.doesNotMatch(html,/Do not expose/);
  assert.deepEqual(manifest.included_ids,["CLM-010"]);
  assert.equal(manifest.exclusions.private,1);
  assert.equal(manifest.source.hash,"abc123");
  assert.equal(manifest.records[0]?.source_links[0],"https://doi.org/10.1234/example");
});

test("email handoff is short and uses mailto only as a text fallback",()=>{
  const result=buildLabShareSnapshot(project,[{id:"CLM-011",type:"claim",title:"Claim",privacy:"public"}],{generatedAt:"2026-08-19"});
  const draft=buildLabShareEmailDraft(project,result);
  assert.match(draft.mailto,/^mailto:\?subject=/);
  assert.match(draft.mailto,/body=/);
  assert.match(draft.body,/Attach the downloaded/i);
  assert.doesNotMatch(draft.body,/<html>/i);
});
