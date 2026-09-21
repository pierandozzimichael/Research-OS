import {readFile} from "node:fs/promises";
import path from "node:path";
import {atomicWriteFile} from "../lib/local-project-store.ts";
import {parseMarkdownRecord,scalarField} from "../lib/research-schema.ts";
import {markdownRecords} from "./schema-files.mjs";
import {parseNamedArguments} from "./local-research-api.mjs";

const argumentsMap=parseNamedArguments(process.argv);

const registry=JSON.parse(await readFile(path.resolve("projects.json"),"utf8"));
const projectId=argumentsMap.get("project")||registry.projects[0]?.id;
const project=registry.projects.find(item=>item.id===projectId);
if(!project)throw new Error(`Unknown project ${projectId}`);
if(!project.workerProjectKey)throw new Error(`Project ${projectId} does not define workerProjectKey`);
if(!Array.isArray(project.literatureQueries)||!project.literatureQueries.length){
  throw new Error(`Project ${projectId} does not define literatureQueries`);
}

const records=await markdownRecords(path.resolve(project.vaultPath));
const doi=new Set();
const pmid=new Set();
for(const file of records){
  const parsed=parseMarkdownRecord(file.raw);
  if(scalarField(parsed.fields,"type")!=="paper")continue;
  const paperDoi=scalarField(parsed.fields,"doi").trim().toLowerCase();
  const paperPmid=scalarField(parsed.fields,"pmid").trim();
  if(paperDoi)doi.add(paperDoi);
  if(paperPmid)pmid.add(paperPmid);
}

const request={
  schema_version:"research-intake-v1",
  project_key:project.workerProjectKey,
  queries:project.literatureQueries,
  sources:["pubmed","europepmc"],
  limit_per_source:100,
  shortlist_size:25,
  local_screen_size:10,
  source_timeout_seconds:30,
  local_timeout_seconds:90,
  known_identifiers:{doi:[...doi].sort(),pmid:[...pmid].sort()},
};
const raw=`${JSON.stringify(request,null,2)}\n`;
const output=argumentsMap.get("out");
if(output){
  const target=path.resolve(output);
  await atomicWriteFile(target,raw);
  console.log(`Wrote Jarvis request: ${target}`);
}else{
  process.stdout.write(raw);
}
