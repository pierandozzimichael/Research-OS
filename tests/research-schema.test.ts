import assert from "node:assert/strict";
import test from "node:test";
import {
  SCHEMA_VERSION,
  createRecordMarkdown,
  migrateRecordToV2,
  nextRecordId,
  parseConnections,
  parseMarkdownRecord,
  recordTypes,
  updateRecordFields,
  validateRecord,
} from "../lib/research-schema.ts";

test("every schema type creates a valid versioned Markdown record", () => {
  for (const type of recordTypes) {
    const prefix = type === "method" ? "METHOD" : {
      project:"PRJ", policy:"POL", source:"SRC", paper:"PAP", claim:"CLM",
      entity:"ENT", topic:"TOP", idea:"IDEA", hypothesis:"HYP",
      experiment:"EXP", result:"RES", model:"MOD", decision:"DEC", evidence:"EVD",
    }[type];
    const raw = createRecordMarkdown(type, `${prefix}-001`, "Test title", "Test summary");
    const parsed = parseMarkdownRecord(raw);
    assert.equal(parsed.fields.schema_version, SCHEMA_VERSION);
    assert.deepEqual(validateRecord(raw), [], `${type} template should validate`);
  }
});

test("idea records expose AI-readable reasoning gates", () => {
  const raw = createRecordMarkdown("idea", "IDEA-010", "A testable idea", "A cautious summary");
  const parsed = parseMarkdownRecord(raw);
  assert.equal(parsed.fields.maturity, "captured");
  assert.equal(parsed.fields.disposition, "active");
  for (const heading of [
    "One-sentence idea",
    "Evidence for",
    "Evidence against",
    "Assumptions",
    "Cheapest discriminating test",
    "Falsification and stop criteria",
    "Promotion criteria",
  ]) {
    assert.match(parsed.body, new RegExp(`^## ${heading}$`, "m"));
  }
});

test("legacy migration preserves body text while versioning fields and relations", () => {
  const legacy = `---
type: idea
id: IDEA-001
title: Legacy
status: exploratory
privacy: private
summary: Original summary
---

# Legacy

Original scientific wording.

## Connections

- test [[EXP-001 Pilot]]
`;
  const migrated = migrateRecordToV2(legacy);
  assert.deepEqual(migrated.errors, []);
  assert.match(migrated.raw, /Original scientific wording\./);
  assert.match(migrated.raw, /- tests \[\[EXP-001 Pilot\]\]/);
  const parsed = parseMarkdownRecord(migrated.raw);
  assert.equal(parsed.fields.schema_version, 2);
  assert.equal(parsed.fields.legacy_status, "exploratory");
  assert.equal(parsed.fields.status, "active");
  assert.deepEqual(parseConnections(parsed.body), [{type:"tests", target:"EXP-001"}]);
});

test("next IDs are scoped to their type prefix", () => {
  assert.equal(nextRecordId("idea", ["IDEA-002", "PAP-099", "IDEA-010"]), "IDEA-011");
  assert.equal(nextRecordId("method", []), "METHOD-001");
});

test("typed-looking bullets outside Connections remain references, not graph edges", () => {
  const body=`# Record

## Design

- tests [[HYP-001 Hypothesis]]

## Connections

- produces [[RES-001 Result]]
`;
  assert.deepEqual(parseConnections(body),[{type:"produces",target:"RES-001"}]);
});

test("supported claims require a documented human evidence gate", () => {
  const base=createRecordMarkdown("claim","CLM-010","A bounded claim","A cautious claim summary");
  const unsupported=updateRecordFields(base,{status:"supported"});
  assert.ok(validateRecord(unsupported).some(issue=>issue.code==="claim-review-gate"&&issue.severity==="error"));

  const reviewed=updateRecordFields(unsupported,{
    human_reviewed:true,
    reviewed_by:"PI",
    reviewed_at:"2026-07-26",
    evidence_anchors:["EVD-001"],
  });
  assert.equal(validateRecord(reviewed).filter(issue=>issue.severity==="error").length,0);
});

test("fully reviewed papers require human methods and figure provenance", () => {
  const base=createRecordMarkdown("paper","PAP-901","Review gate paper","A test paper.");
  const invalid=updateRecordFields(base,{status:"reviewed",review_depth:"full-text"});
  assert.ok(validateRecord(invalid).some(issue=>issue.code==="paper-review-gate"&&issue.severity==="error"));

  const valid=updateRecordFields(invalid,{
    human_reviewed:true,
    reviewed_by:"researcher",
    reviewed_at:"2026-07-26",
    methods_checked:true,
    figures_checked:["Figure 1"],
  });
  assert.equal(validateRecord(valid).filter(issue=>issue.severity==="error").length,0);
});
