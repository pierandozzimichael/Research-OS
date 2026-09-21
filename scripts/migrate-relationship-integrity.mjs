import {readFile} from "node:fs/promises";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {
  applyRelationshipChanges,
  planRelationshipRepairs,
  relationshipContentRevision,
} from "../lib/relationship-integrity.ts";
import {atomicWriteFile} from "../lib/local-project-store.ts";
import {parseMarkdownRecord,scalarField} from "../lib/research-schema.ts";
import {markdownRecords,projectVaults} from "./schema-files.mjs";

const root=process.cwd();
const args=process.argv.slice(2);
const apply=args.includes("--apply");
const planIndex=args.indexOf("--plan");
const suppliedPlan=planIndex>=0?args[planIndex+1]:"";
const migrationRoot=path.join(root,".research-os","relationship-migrations");

function safePlanPath(value){
  const resolved=path.resolve(root,value);
  if(!resolved.startsWith(`${migrationRoot}${path.sep}`))throw new Error("Relationship plans must come from .research-os/relationship-migrations.");
  return resolved;
}

if(apply){
  if(!suppliedPlan)throw new Error("--apply requires --plan <path>.");
  const planPath=safePlanPath(suppliedPlan);
  const plan=JSON.parse(await readFile(planPath,"utf8"));
  const projects=await projectVaults(root);
  const project=projects.find(item=>item.id===plan.project_id);
  if(!project)throw new Error(`Unknown project ${plan.project_id}.`);
  const grouped=Map.groupBy(plan.changes,change=>change.relativePath);
  const prepared=[];
  for(const [relativePath,changes] of grouped){
    const absolute=path.resolve(project.vaultRoot,...relativePath.split("/"));
    if(!absolute.startsWith(`${project.vaultRoot}${path.sep}`))throw new Error("Migration path escaped the vault.");
    const raw=await readFile(absolute,"utf8");
    if(relationshipContentRevision(raw)!==changes[0].sourceRevision)throw new Error(`${relativePath} changed after preview; create a new plan.`);
    prepared.push({absolute,raw:applyRelationshipChanges(raw,changes)});
  }
  const backup=spawnSync(process.execPath,[path.join(root,"scripts","backup-projects.mjs")],{cwd:root,encoding:"utf8",timeout:30_000});
  if(backup.status!==0)throw new Error(`Backup failed: ${backup.stderr||backup.stdout}`);
  for(const item of prepared)await atomicWriteFile(item.absolute,item.raw);
  console.log(`Applied ${plan.changes.length} relationship repairs from ${path.relative(root,planPath)}.`);
}else{
  const projects=await projectVaults(root);
  for(const project of projects){
    const records=(await markdownRecords(project.vaultRoot)).map(record=>{
      const parsed=parseMarkdownRecord(record.raw);
      return {
        ...record,
        id:scalarField(parsed.fields,"id"),
        type:scalarField(parsed.fields,"type"),
      };
    }).filter(record=>record.id);
    const changes=planRelationshipRepairs(records);
    const stamp=new Date().toISOString().replace(/[:.]/g,"-");
    const planPath=path.join(migrationRoot,`${stamp}-${project.id}.json`);
    await atomicWriteFile(planPath,`${JSON.stringify({
      schema_version:"relationship-integrity-v1",
      project_id:project.id,
      created_at:new Date().toISOString(),
      changes,
    },null,2)}\n`);
    console.log(`${project.name}: ${changes.length} repairs previewed at ${path.relative(root,planPath)}`);
  }
}

