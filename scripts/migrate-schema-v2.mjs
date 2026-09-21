import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { atomicWriteFile } from "../lib/local-project-store.ts";
import { migrateRecordToV2, scalarField, parseMarkdownRecord } from "../lib/research-schema.ts";
import { markdownRecords, projectVaults } from "./schema-files.mjs";

const root=process.cwd();
const args=process.argv.slice(2);
const applyIndex=args.indexOf("--apply");

function revision(raw) {
  return createHash("sha256").update(raw,"utf8").digest("hex");
}

if(applyIndex>=0){
  const planArgument=args[applyIndex+1];
  if(!planArgument)throw new Error("Usage: node scripts/migrate-schema-v2.mjs --apply <plan.json>");
  const planPath=path.resolve(root,planArgument);
  const migrationRoot=path.join(root,".research-os","migrations");
  if(!planPath.startsWith(`${migrationRoot}${path.sep}`))throw new Error("Migration plans must come from .research-os/migrations.");
  const plan=JSON.parse(await readFile(planPath,"utf8"));

  for(const change of plan.changes){
    const current=await readFile(change.absolute,"utf8");
    if(revision(current)!==change.baseRevision){
      throw new Error(`Migration stopped: ${change.relativePath} changed after the preview.`);
    }
  }

  const backup=spawnSync(process.execPath,[path.join(root,"scripts","backup-projects.mjs")],{
    cwd:root,stdio:"inherit",timeout:30_000,
  });
  if(backup.error?.code==="ETIMEDOUT")throw new Error("Backup exceeded 30 seconds; migration was not started.");
  if(backup.status!==0)throw new Error("Backup failed; migration was not started.");

  for(const change of plan.changes)await atomicWriteFile(change.absolute,change.raw);
  console.log(`Applied schema v2 migration to ${plan.changes.length} records after creating a backup.`);
  process.exit(0);
}

const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const migrationRoot=path.join(root,".research-os","migrations");
await mkdir(migrationRoot,{recursive:true});
const changes=[];
const errors=[];

for(const project of await projectVaults(root)){
  for(const record of await markdownRecords(project.vaultRoot)){
    const migrated=migrateRecordToV2(record.raw);
    if(migrated.errors.length){
      errors.push({projectId:project.id,relativePath:record.relativePath,errors:migrated.errors});
      continue;
    }
    if(!migrated.changes.length)continue;
    const parsed=parseMarkdownRecord(record.raw);
    changes.push({
      projectId:project.id,
      id:scalarField(parsed.fields,"id"),
      relativePath:record.relativePath,
      absolute:record.absolute,
      baseRevision:revision(record.raw),
      changes:migrated.changes,
      raw:migrated.raw,
    });
  }
}

const plan={schemaVersion:2,createdAt:new Date().toISOString(),changes,errors};
const jsonPath=path.join(migrationRoot,`${stamp}-schema-v2.json`);
const markdownPath=path.join(migrationRoot,`${stamp}-schema-v2-preview.md`);
await writeFile(jsonPath,`${JSON.stringify(plan,null,2)}\n`,"utf8");

const lines=[
  "# Schema v2 migration preview",
  "",
  `Created: ${plan.createdAt}`,
  `Records that would change: ${changes.length}`,
  `Records blocked by parse errors: ${errors.length}`,
  "",
  "Nothing has been written to the vault.",
  "",
  "## Proposed changes",
  "",
];
for(const change of changes){
  lines.push(`### ${change.id||"(no ID)"} — ${change.relativePath}`,"");
  for(const description of change.changes)lines.push(`- ${description}`);
  lines.push("");
}
if(errors.length){
  lines.push("## Blocked records","");
  for(const error of errors)lines.push(`- ${error.relativePath}: ${error.errors.join("; ")}`);
  lines.push("");
}
lines.push(
  "## Apply command",
  "",
  "Applying this exact plan first verifies that none of the records changed, then creates a timestamped backup.",
  "",
  `node scripts/migrate-schema-v2.mjs --apply "${path.relative(root,jsonPath)}"`,
  "",
);
await writeFile(markdownPath,`${lines.join("\n")}\n`,"utf8");
console.log(`Migration preview created:\n${markdownPath}\n${jsonPath}`);
