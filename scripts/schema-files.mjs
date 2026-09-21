import { readFile } from "node:fs/promises";
import path from "node:path";
import {markdownRecords} from "../lib/canonical-record-files.ts";

export {markdownRecords};

export async function projectVaults(root) {
  const registryPath=process.env.RESEARCH_OS_INTEGRATION_TEST==="1"&&process.env.RESEARCH_OS_PROJECTS_FILE
    ? path.resolve(process.env.RESEARCH_OS_PROJECTS_FILE)
    : path.join(root,"projects.json");
  const registry=JSON.parse(await readFile(registryPath,"utf8"));
  return registry.projects.map(project=>({
    ...project,
    vaultRoot:path.resolve(root,project.vaultPath),
  }));
}
