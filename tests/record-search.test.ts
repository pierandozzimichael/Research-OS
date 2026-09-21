import assert from "node:assert/strict";
import test from "node:test";
import {matchesRecordSearch,scoreRecordSearch,type SearchableResearchRecord} from "../lib/record-search.ts";

function record(overrides:Partial<SearchableResearchRecord>={}):SearchableResearchRecord{
  return {id:"PAP-003",type:"paper",status:"reviewed-abstract",title:"NHE6 depletion and ApoE4 trafficking",summary:"APOE ε4 endosomal trafficking study",body:"R145C comparison",fields:{gene:"APOE"},urls:["https://doi.org/10.1/example"],links:["CLM-003"],...overrides};
}

test("record finder ranks exact stable IDs above text matches",()=>{
  const exact=scoreRecordSearch(record(),"PAP-003");
  const bodyOnly=scoreRecordSearch(record({id:"PAP-004",title:"Other paper",summary:"",body:"PAP-003"}),"PAP-003");
  assert.ok(exact>bodyOnly);
});

test("record finder supports scientific text and structured filters",()=>{
  const item=record();
  assert.ok(matchesRecordSearch(item,"ε4 trafficking"));
  assert.ok(matchesRecordSearch(item,"R145C"));
  assert.ok(matchesRecordSearch(item,"type:paper status:reviewed has:source"));
  assert.equal(matchesRecordSearch(item,"type:experiment"),false);
  assert.equal(matchesRecordSearch(item,"has:source type:paper missing-term"),false);
});
