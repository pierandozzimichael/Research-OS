import {createHash} from "node:crypto";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, ".research-os", "backups", stamp);
const registryPath = path.join(root, "projects.json");
const registry = JSON.parse(await readFile(registryPath, "utf8"));

async function filesUnder(folder) {
  const files=[];
  async function walk(current) {
    for(const entry of await readdir(current,{withFileTypes:true})){
      const absolute=path.join(current,entry.name);
      if(entry.isDirectory())await walk(absolute);
      else if(entry.isFile())files.push(absolute);
    }
  }
  await walk(folder);
  return files.sort();
}

async function fileDigest(absolute){
  const content=await readFile(absolute);
  return {size:(await stat(absolute)).size,sha256:createHash("sha256").update(content).digest("hex")};
}

await mkdir(backupRoot, {recursive:true});
await cp(registryPath, path.join(backupRoot, "projects.json"));

for (const project of registry.projects) {
  const source = path.resolve(root, project.vaultPath);
  if (
    source !== path.join(root, "vault") &&
    !source.startsWith(`${path.join(root, "projects")}${path.sep}`)
  ) {
    throw new Error(`Refusing to back up an invalid vault path: ${project.vaultPath}`);
  }
  await cp(source, path.join(backupRoot, "vaults", project.id), {recursive:true});
}

const manifestFiles=await Promise.all((await filesUnder(backupRoot)).map(async absolute=>({
  path:path.relative(backupRoot,absolute).replaceAll("\\","/"),...(await fileDigest(absolute)),
})));

await writeFile(
  path.join(backupRoot, "manifest.json"),
  `${JSON.stringify({
    schema_version:"research-os-backup-v2",createdAt:new Date().toISOString(),projects:registry.projects,
    files:manifestFiles,
  },null,2)}\n`,
  "utf8",
);
console.log(`Backup created at ${backupRoot}`);
