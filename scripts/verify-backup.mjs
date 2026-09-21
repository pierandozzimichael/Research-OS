import {createHash} from "node:crypto";
import {readFile,readdir,stat} from "node:fs/promises";
import path from "node:path";

const root=process.cwd();
const backupRoot=path.resolve(root,".research-os","backups");
const requested=process.argv.slice(2).find(value=>value.startsWith("--path="))?.slice("--path=".length);
const candidates=(await readdir(backupRoot,{withFileTypes:true})).filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort().reverse();
const selected=requested?path.resolve(backupRoot,requested):path.join(backupRoot,candidates[0]||"");
if(!selected.startsWith(`${backupRoot}${path.sep}`))throw new Error("Backup path must stay under .research-os/backups.");
const manifest=JSON.parse(await readFile(path.join(selected,"manifest.json"),"utf8"));
if(manifest.schema_version!=="research-os-backup-v2"||!Array.isArray(manifest.files))throw new Error("Backup uses an unsupported or unverifiable manifest.");
let failures=0;
for(const item of manifest.files){
  if(!item||typeof item.path!=="string"||!item.path||item.path.includes("..")){failures++;continue;}
  const absolute=path.resolve(selected,...item.path.split("/"));
  if(!absolute.startsWith(`${selected}${path.sep}`)){failures++;continue;}
  try{
    const content=await readFile(absolute),details=await stat(absolute);
    const hash=createHash("sha256").update(content).digest("hex");
    if(hash!==item.sha256||details.size!==item.size){console.error(`Mismatch: ${item.path}`);failures++;}
  }catch{console.error(`Missing: ${item.path}`);failures++;}
}
if(failures){process.exitCode=1;throw new Error(`Backup verification failed for ${failures} file(s).`);}
console.log(`Verified ${manifest.files.length} files in ${path.relative(root,selected)}.`);
