import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import path from "node:path";
import test from "node:test";
import {promisify} from "node:util";

const execute=promisify(execFile);

test("builds a bounded Jarvis request from the project and known papers",async()=>{
  const root=process.cwd();
  const {stdout}=await execute(process.execPath,[path.join(root,"scripts","build-literature-request.mjs"),"--project","apoe-rexach"],{
    cwd:root,
    timeout:10_000,
    maxBuffer:1_000_000,
  });
  const request=JSON.parse(stdout);
  assert.equal(request.schema_version,"research-intake-v1");
  assert.equal(request.project_key,"apoe_tau");
  assert.ok(request.queries.length>=3);
  assert.ok(request.known_identifiers.doi.includes("10.7554/elife.72034"));
  assert.ok(request.known_identifiers.pmid.includes("34617884"));
  assert.ok(request.limit_per_source<=500);
  assert.ok(request.shortlist_size<=100);
  assert.ok(request.local_screen_size<=100);
});
