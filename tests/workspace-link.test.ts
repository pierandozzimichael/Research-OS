import assert from "node:assert/strict";
import test from "node:test";
import {buildWorkspaceUrl,parseWorkspaceLink} from "../lib/workspace-link.ts";

test("workspace links round-trip bounded visual state",()=>{
  const url=buildWorkspaceUrl("http://127.0.0.1:3000/anything?old=1",{
    project:"apoe-rexach",view:"map",record:"idea-003",scope:"2-hop",expanded:true,
  });
  const parsed=new URL(url);
  assert.equal(parsed.pathname,"/");
  assert.deepEqual(parseWorkspaceLink(parsed.search),{
    project:"apoe-rexach",view:"map",record:"IDEA-003",scope:"2-hop",expanded:true,
  });
});

test("workspace links ignore unknown query state and reject non-loopback targets",()=>{
  assert.deepEqual(parseWorkspaceLink("?view=admin&record=../../secret&scope=everything&expanded=0"),{});
  assert.throws(()=>buildWorkspaceUrl("https://example.com",{view:"map"}),/loopback/i);
});
