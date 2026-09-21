import {writeFile} from "node:fs/promises";
import {parseNamedArguments,postLocalResearchApi} from "./local-research-api.mjs";

const args=parseNamedArguments(process.argv);
const projectId=args.get("project");
const runId=args.get("run");
const candidateId=args.get("candidate");
const mode=args.get("mode")||"preview";
if(!projectId||!runId||!candidateId||!["preview","apply"].includes(mode)){
  throw new Error("--project, --run, --candidate, and --mode preview|apply are required");
}
const result=await postLocalResearchApi("/api/literature-canonicalize",{
  projectId,runId,candidateId,mode,planHash:args.get("plan"),
});
const raw=`${JSON.stringify(result,null,2)}\n`;
if(args.get("out")){
  await writeFile(args.get("out"),raw,"utf8");
  console.log(`Wrote canonicalization ${mode}: ${args.get("out")}`);
}else process.stdout.write(raw);
