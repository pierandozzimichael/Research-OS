import {createHash} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import path from "node:path";

export type MarkdownRecordFile={absolute:string;relativePath:string;raw:string};

export async function markdownRecords(vaultRoot:string,{includeTemplates=false,includeLiteratureBriefs=false}={}){
  const records:MarkdownRecordFile[]=[];
  async function walk(folder:string){
    for(const entry of await readdir(folder,{withFileTypes:true})){
      const absolute=path.join(folder,entry.name);
      const relativePath=path.relative(vaultRoot,absolute).replaceAll("\\","/");
      if(entry.isDirectory()&&!includeTemplates&&relativePath==="99 Templates")continue;
      if(entry.isDirectory()&&relativePath==="14 AI Workspace/generated")continue;
      if(entry.isDirectory()&&relativePath==="14 AI Workspace/runs")continue;
      if(entry.isDirectory())await walk(absolute);
      else if(
        entry.name.toLowerCase().endsWith(".md")&&
        entry.name.toLowerCase()!=="readme.md"&&
        (includeLiteratureBriefs||!/^01 Inbox\/Literature\/BRIEF-.*\.md$/i.test(relativePath))
      )records.push({absolute,relativePath,raw:await readFile(absolute,"utf8")});
    }
  }
  await walk(vaultRoot);
  return records.sort((a,b)=>a.relativePath.localeCompare(b.relativePath));
}

export function canonicalSourceHash(records:Array<{relativePath:string;raw:string}>){
  const hash=createHash("sha256");
  for(const record of records){
    hash.update(record.relativePath);hash.update("\0");hash.update(record.raw);hash.update("\0");
  }
  return hash.digest("hex");
}

