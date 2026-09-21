import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {runBoundedProcess} from "../lib/bounded-process.ts";

async function waitFor<T>(read:()=>Promise<T>,timeout=4_000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){try{return await read();}catch{await new Promise(resolve=>setTimeout(resolve,40));}}
  throw new Error("Timed out waiting for process fixture");
}

test("stopping a Windows assistant terminates its descendant process",{skip:process.platform!=="win32"},async()=>{
  const temporary=await mkdtemp(path.join(os.tmpdir(),"research-os-process-test-"));
  const pidFile=path.join(temporary,"grandchild.pid");
  const controller=new AbortController();
  const script=[
    "const {spawn}=require('node:child_process');",
    "const {writeFileSync}=require('node:fs');",
    "const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});",
    "writeFileSync(process.argv[1],String(child.pid));",
    "setInterval(()=>{},1000);",
  ].join("");
  try{
    const running=runBoundedProcess(process.execPath,["-e",script,pidFile],{cwd:temporary,timeout:10_000,signal:controller.signal});
    const grandchildPid=Number(await waitFor(()=>readFile(pidFile,"utf8")));
    controller.abort();
    await assert.rejects(running,/stopped/i);
    await waitFor(async()=>{
      try{process.kill(grandchildPid,0);throw new Error("still running");}
      catch(error){if(error instanceof Error&&error.message==="still running")throw error;return true;}
    });
  }finally{await rm(temporary,{recursive:true,force:true});}
});
