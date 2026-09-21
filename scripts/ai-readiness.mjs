import path from "node:path";
import {buildAiManifest,inspectAiReadiness} from "../lib/ai-readiness.ts";
import {atomicWriteFile} from "../lib/local-project-store.ts";

const root=process.cwd();
const args=new Set(process.argv.slice(2));
const writeManifest=args.has("--write-manifest");
const json=args.has("--json");
const timeoutArg=process.argv.find(argument=>argument.startsWith("--timeout-ms="));
const requested=timeoutArg?Number(timeoutArg.split("=",2)[1]):10_000;
const timeoutMs=Number.isFinite(requested)?Math.min(30_000,Math.max(1_000,requested)):10_000;

let timeoutHandle;
const timeout=new Promise((_,reject)=>{
  timeoutHandle=setTimeout(()=>reject(new Error(`AI readiness exceeded its ${timeoutMs} ms hard limit.`)),timeoutMs);
});

async function main(){
  if(writeManifest){
    const manifest=await buildAiManifest(root);
    await atomicWriteFile(path.join(root,"AI_MANIFEST.json"),`${JSON.stringify(manifest,null,2)}\n`);
    if(!json)process.stdout.write("Wrote AI_MANIFEST.json from package.json, projects.json, and the research tool catalog.\n");
  }
  const report=await inspectAiReadiness(root);
  if(json){process.stdout.write(`${JSON.stringify(report,null,2)}\n`);}
  else{
    process.stdout.write(`AI readiness: ${report.ready?"READY":"NOT READY"} · ${report.summary.pass} passed · ${report.summary.warn} warnings · ${report.summary.fail} failures\n`);
    for(const check of report.checks.filter(item=>item.status!=="pass")){
      process.stdout.write(`${check.status.toUpperCase()} ${check.id}: ${check.message}${check.remediation?` ${check.remediation}`:""}\n`);
    }
  }
  if(!report.ready)process.exitCode=1;
}

try{await Promise.race([main(),timeout]);}
catch(error){
  process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);
  process.exit(124);
}
finally{clearTimeout(timeoutHandle);}
