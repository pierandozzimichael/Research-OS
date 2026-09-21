import {readFile} from "node:fs/promises";
import path from "node:path";
import {parseNamedArguments,postLocalResearchApi} from "./local-research-api.mjs";

const args=parseNamedArguments(process.argv);
const projectId=args.get("project");
const proposalPath=args.get("proposal");
if(!projectId||!proposalPath)throw new Error("--project and --proposal are required");
const proposal=JSON.parse(await readFile(path.resolve(proposalPath),"utf8"));
const result=await postLocalResearchApi("/api/literature-inbox",{projectId,proposal});
console.log(JSON.stringify(result,null,2));
