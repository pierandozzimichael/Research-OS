import {
  parseMarkdownRecord,
  scalarField,
  stringListField,
  validateRecord,
  wikiLinkIds,
} from "../lib/research-schema.ts";
import { validateRelationshipGraph } from "../lib/relationship-integrity.ts";
import { markdownRecords, projectVaults } from "./schema-files.mjs";

const root=process.cwd();
let errorCount=0;
let warningCount=0;

for(const project of await projectVaults(root)){
  const records=await markdownRecords(project.vaultRoot);
  const ids=new Map();
  const idTypes=new Map();
  const parsedRecords=[];
  const issues=[];

  for(const record of records){
    const parsed=parseMarkdownRecord(record.raw);
    const id=scalarField(parsed.fields,"id");
    parsedRecords.push({...record,id,parsed});
    issues.push(...validateRecord(record.raw,record.relativePath));
    if(id){
      const paths=ids.get(id)??[];
      paths.push(record.relativePath);
      ids.set(id,paths);
      idTypes.set(id,scalarField(parsed.fields,"type"));
    }
  }

  for(const [id,paths] of ids){
    if(paths.length>1)issues.push({
      severity:"error",code:"duplicate-id",id,
      message:`Duplicate ID appears in: ${paths.join(", ")}`,
    });
  }
  for(const record of parsedRecords){
    for(const target of wikiLinkIds(record.parsed.body)){
      if(!ids.has(target))issues.push({
        severity:"error",code:"dangling-link",id:record.id,path:record.relativePath,
        message:`Link target ${target} does not exist in project ${project.id}.`,
      });
    }
    for(const anchor of stringListField(record.parsed.fields,"evidence_anchors")){
      if(!ids.has(anchor))issues.push({
        severity:"error",code:"dangling-evidence-anchor",id:record.id,path:record.relativePath,
        message:`Evidence anchor ${anchor} does not exist in project ${project.id}.`,
      });
      else if(idTypes.get(anchor)!=="evidence")issues.push({
        severity:"error",code:"wrong-evidence-anchor-type",id:record.id,path:record.relativePath,
        message:`Evidence anchor ${anchor} does not identify an evidence record.`,
      });
    }
    const sourcePaper=scalarField(record.parsed.fields,"source_paper");
    if(sourcePaper&&(!ids.has(sourcePaper)||idTypes.get(sourcePaper)!=="paper"))issues.push({
      severity:"error",code:"invalid-evidence-source-paper",id:record.id,path:record.relativePath,
      message:`source_paper ${sourcePaper} does not identify an existing paper.`,
    });
  }
  issues.push(...validateRelationshipGraph(parsedRecords.map(record=>({
    id:record.id,
    type:scalarField(record.parsed.fields,"type"),
    raw:record.raw,
    relativePath:record.relativePath,
  })).filter(record=>record.id)));

  const errors=issues.filter(issue=>issue.severity==="error");
  const warnings=issues.filter(issue=>issue.severity==="warning");
  errorCount+=errors.length;
  warningCount+=warnings.length;
  console.log(`\n${project.name}: ${records.length} records, ${errors.length} errors, ${warnings.length} warnings`);
  for(const issue of issues){
    console.log(`- ${issue.severity.toUpperCase()} ${issue.path||issue.id||project.id}: ${issue.message}`);
  }
}

console.log(`\nVault validation complete: ${errorCount} errors, ${warningCount} warnings.`);
if(errorCount)process.exitCode=1;
