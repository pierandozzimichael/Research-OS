import {createHash} from "node:crypto";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import {safeFigureAssetPath} from "../lib/local-project-store.ts";
import {parseMarkdownRecord,scalarField} from "../lib/research-schema.ts";
import {markdownRecords,projectVaults} from "./schema-files.mjs";

const signatures={
  "image/png":value=>value.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),
  "image/jpeg":value=>value.length>=3&&value[0]===0xff&&value[1]===0xd8&&value[2]===0xff,
  "image/gif":value=>value.subarray(0,6).toString("ascii")==="GIF87a"||value.subarray(0,6).toString("ascii")==="GIF89a",
  "image/webp":value=>value.subarray(0,4).toString("ascii")==="RIFF"&&value.subarray(8,12).toString("ascii")==="WEBP",
};
const mimeForExtension={".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".gif":"image/gif",".webp":"image/webp"};
let errors=0,checked=0;

for(const project of await projectVaults(process.cwd())){
  for(const file of await markdownRecords(project.vaultRoot)){
    const parsed=parseMarkdownRecord(file.raw);
    const recordId=scalarField(parsed.fields,"id",file.relativePath);
    const figures=Array.isArray(parsed.fields.figures)?parsed.fields.figures:[];
    for(const [index,entry] of figures.entries()){
      if(!entry||typeof entry!=="object"||Array.isArray(entry))continue;
      const figure=entry;
      const figurePath=scalarField(figure,"path");
      if(!figurePath)continue;
      checked++;
      try{
        const {absolute}=safeFigureAssetPath(project.vaultRoot,figurePath);
        const asset=await readFile(absolute);
        const mime=scalarField(figure,"mime_type")||mimeForExtension[path.extname(absolute).toLowerCase()];
        if(!mime||!signatures[mime]?.(asset))throw new Error("asset bytes do not match the declared image type");
        const expectedHash=scalarField(figure,"asset_sha256");
        if(!/^[a-f0-9]{64}$/i.test(expectedHash))throw new Error("missing a SHA-256 asset hash");
        const actualHash=createHash("sha256").update(asset).digest("hex");
        if(actualHash!==expectedHash.toLowerCase())throw new Error("asset SHA-256 does not match the canonical manifest");
        if((await stat(absolute)).size>10_000_000)throw new Error("asset exceeds 10 MB limit");
      }catch(error){
        errors++;
        console.error(`${project.id} ${recordId} figure ${index+1}: ${error instanceof Error?error.message:String(error)}`);
      }
    }
  }
}

if(errors){
  console.error(`Figure asset integrity failed: ${errors} errors across ${checked} local assets.`);
  process.exitCode=1;
}else console.log(`Figure asset integrity passed for ${checked} local assets.`);
