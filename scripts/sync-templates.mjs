import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createTemplateMarkdown,
  recordTypes,
} from "../lib/research-schema.ts";

const target=path.join(process.cwd(),"vault","99 Templates");
await mkdir(target,{recursive:true});
for(const type of recordTypes){
  const filename=`${type.toUpperCase()}_TEMPLATE.md`;
  await writeFile(path.join(target,filename),createTemplateMarkdown(type),"utf8");
}
console.log(`Synchronized ${recordTypes.length} schema v2 templates.`);
