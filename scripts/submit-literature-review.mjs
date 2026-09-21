import {readFile} from "node:fs/promises";
import path from "node:path";
import {parseNamedArguments,postLocalResearchApi} from "./local-research-api.mjs";

const args=parseNamedArguments(process.argv);
const projectId=args.get("project");
const runId=args.get("run");
const candidateId=args.get("candidate");
const reviewPath=args.get("review");
if(!projectId||!runId||!candidateId||!reviewPath){
  throw new Error("--project, --run, --candidate, and --review are required");
}
const review=JSON.parse(await readFile(path.resolve(reviewPath),"utf8"));
const result=await postLocalResearchApi("/api/literature-review",{
  projectId,runId,candidateId,review,
});
console.log(JSON.stringify({
  saved:result.saved,
  recommendation:result.recommendation,
  briefFileName:result.briefFileName,
},null,2));
