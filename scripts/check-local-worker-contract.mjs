import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const workflowPath = resolve(root, "docs", "LOCAL_MODEL_WORKFLOW.md");
const schemaPath = resolve(root, "docs", "local-worker", "schemas", "local-screening-v1.json");
const [workflow, rawSchema] = await Promise.all([
  readFile(workflowPath, "utf8"),
  readFile(schemaPath, "utf8"),
]);
const schema = JSON.parse(rawSchema);
const required = ["relevance", "confidence", "reason_code", "matched_terms", "evidence_spans", "recommended_use", "abstain_reason"];

assert.equal(schema.type, "object", "Local screen schema must return an object.");
assert.equal(schema.additionalProperties, false, "Local screen schema must reject invented fields.");
assert.deepEqual(schema.required, required, "Local screen schema must require the bounded response fields.");
assert.deepEqual(schema.properties.relevance.enum, ["high", "medium", "low", "none"]);
assert.ok(schema.properties.evidence_spans, "Local screen schema must retain source spans.");
for (const phrase of [
  "Local models are high-throughput, fallible workers.",
  "atoms, not a literary paper summary.",
  "temperature: 0",
  "exact source spans",
  "Frontier models plan, choose, verify",
  "never upgrades scientific evidence",
]) assert.ok(workflow.includes(phrase), `Workflow contract is missing: ${phrase}`);

console.log("Local worker contract check passed.");
