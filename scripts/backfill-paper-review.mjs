import {atomicWriteFile} from "../lib/local-project-store.ts";
import {
  parseMarkdownRecord,
  scalarField,
  stringListField,
  updateRecordFields,
} from "../lib/research-schema.ts";
import {markdownRecords,projectVaults} from "./schema-files.mjs";

let changed=0;
let downgraded=0;

for(const project of await projectVaults(process.cwd())){
  for(const file of await markdownRecords(project.vaultRoot)){
    const parsed=parseMarkdownRecord(file.raw);
    if(parsed.errors.length||scalarField(parsed.fields,"type")!=="paper")continue;

    const status=scalarField(parsed.fields,"status");
    const hadReviewFields=Boolean(scalarField(parsed.fields,"review_depth"));
    const reviewDepth=status==="reviewed"||status==="reviewed-abstract"
      ?"abstract"
      : status==="inbox"||status==="citation-needed"
        ?"unread"
        :"metadata";
    const updates={
      review_depth:scalarField(parsed.fields,"review_depth",reviewDepth),
      human_reviewed:parsed.fields.human_reviewed===true,
      reviewed_by:scalarField(parsed.fields,"reviewed_by"),
      reviewed_at:scalarField(parsed.fields,"reviewed_at"),
      methods_checked:parsed.fields.methods_checked===true,
      figures_checked:stringListField(parsed.fields,"figures_checked"),
      evidence_anchors:stringListField(parsed.fields,"evidence_anchors"),
      extraction_authorship:scalarField(parsed.fields,"extraction_authorship","ai-assisted"),
      updated:scalarField(parsed.fields,"updated",new Date().toISOString().slice(0,10)),
    };

    if(status==="reviewed"&&(
      updates.review_depth!=="full-text"||
      !updates.human_reviewed||
      !updates.reviewed_by||
      !/^\d{4}-\d{2}-\d{2}$/.test(updates.reviewed_at)||
      !updates.methods_checked||
      !updates.figures_checked.length
    )){
      Object.assign(updates,{
        status:"reviewed-abstract",
        legacy_status:"reviewed",
        review_gate_note:"Downgraded during Phase 3 because full-text human review provenance was not recorded.",
      });
      downgraded+=1;
    }

    if(!hadReviewFields||Object.hasOwn(updates,"status")){
      await atomicWriteFile(file.absolute,updateRecordFields(file.raw,updates));
      changed+=1;
    }
  }
}

console.log(`Backfilled paper-review provenance for ${changed} records; downgraded ${downgraded} unsupported full-review status.`);
