import {stat} from "node:fs/promises";
import {atomicWriteFile} from "../lib/local-project-store.ts";
import {
  isRecordType,
  parseMarkdownRecord,
  scalarField,
  updateRecordFields,
} from "../lib/research-schema.ts";
import {markdownRecords,projectVaults} from "./schema-files.mjs";

let changed=0;
for(const project of await projectVaults(process.cwd())){
  for(const file of await markdownRecords(project.vaultRoot)){
    const parsed=parseMarkdownRecord(file.raw);
    if(parsed.errors.length||!isRecordType(scalarField(parsed.fields,"type")))continue;
    if(scalarField(parsed.fields,"created")&&scalarField(parsed.fields,"updated"))continue;
    const metadata=await stat(file.absolute);
    const created=scalarField(parsed.fields,"created",metadata.birthtime.toISOString().slice(0,10));
    const updated=scalarField(parsed.fields,"updated",metadata.mtime.toISOString().slice(0,10));
    const raw=updateRecordFields(file.raw,{
      created,
      updated,
      timestamp_provenance:"filesystem-backfill; not a scientific review date",
    });
    await atomicWriteFile(file.absolute,raw);
    changed+=1;
  }
}
console.log(`Backfilled provenance timestamps for ${changed} records.`);
