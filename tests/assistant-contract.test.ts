import assert from "node:assert/strict";
import test from "node:test";
import {validateAssistantRequest,validateAssistantResponse} from "../lib/assistant-contract.ts";
import {toOllamaGrammarSchema} from "../lib/ollama-schema.ts";

test("assistant requests are bounded and keep only recent in-memory turns",()=>{
  const request=validateAssistantRequest({
    provider:"codex",projectId:"apoe-rexach",focusRecordId:"CLM-004",question:"What contradicts this claim?",
    history:Array.from({length:10},(_,index)=>({role:index%2?"assistant":"user",content:`turn ${index}`})),
  });
  assert.equal(request.history?.length,6);
  assert.equal(request.history?.[0].content,"turn 4");
  assert.throws(()=>validateAssistantRequest({provider:"codex",projectId:"../outside",question:"hello"}),/project ID/i);
  assert.throws(()=>validateAssistantRequest({provider:"unknown",projectId:"apoe-rexach",question:"hello"}),/provider/i);
  assert.equal(validateAssistantRequest({provider:"ollama",projectId:"apoe-rexach",question:"hello",model:"qwen3:8b"}).model,"qwen3:8b");
  assert.throws(()=>validateAssistantRequest({provider:"ollama",projectId:"apoe-rexach",question:"hello",model:"bad model; stop"}),/model name/i);
});

test("assistant responses discard invented citations and unsafe UI actions",()=>{
  const response=validateAssistantResponse({
    answer:"The evidence remains provisional.",
    citations:[{id:"CLM-004",note:"Inspected claim"},{id:"CLM-999",note:"Invented"}],
    ui_actions:[
      {type:"show_path",focus_id:"CLM-004",depth:2,reason:"Show evidence"},
      {type:"open_record",id:"CLM-999",reason:"Invented"},
      {type:"write_record",id:"CLM-004",reason:"Not allowed"},
      {type:"present_path",reason:"Walk the evidence",steps:[{id:"PAP-006",note:"Source"},{id:"CLM-004",note:"Claim"},{id:"CLM-999",note:"Invented"}]},
    ],
    boundary_note:"Agent analysis only.",
  },"codex",["CLM-004","PAP-006"]);
  assert.deepEqual(response.citations,[{id:"CLM-004",note:"Inspected claim"}]);
  assert.deepEqual(response.ui_actions,[
    {type:"show_path",focus_id:"CLM-004",depth:2,reason:"Show evidence"},
    {type:"present_path",reason:"Walk the evidence",steps:[{id:"PAP-006",note:"Source"},{id:"CLM-004",note:"Claim"}]},
  ]);
  assert.equal(response.schema_version,"research-os-assistant-response-v1");
});

test("Ollama receives a grammar-safe projection of the shared response schema",()=>{
  const projected=JSON.stringify(toOllamaGrammarSchema({
    $schema:"draft",type:"object",additionalProperties:false,maxItems:4,
    properties:{kind:{type:"string",enum:["safe"]},id:{type:"string",pattern:"^CLM"}},
  }));
  assert.doesNotMatch(projected,/\$schema|additionalProperties|maxItems|enum|pattern/);
  assert.match(projected,/properties/);
});
