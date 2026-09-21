import assert from "node:assert/strict";
import test from "node:test";
import {
  getResearchToolCatalogEntry,
  listResearchToolCatalog,
  researchToolCatalog,
} from "../lib/research-tool-catalog.ts";

test("research tool catalog has unique stable IDs and bounded metadata", () => {
  assert.ok(researchToolCatalog.length >= 12);
  const ids = researchToolCatalog.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of researchToolCatalog) {
    assert.match(entry.id, /^[a-z]+\.[a-z]+$/);
    assert.ok(entry.label.length > 0);
    assert.ok(entry.purpose.length > 0);
    assert.ok(entry.suggestedPrompt.length > 0);
    if (entry.boundary === "read-only") assert.ok(entry.cliCommand === null || entry.cliCommand.includes("--"));
  }
});

test("catalog distinguishes read, operational, and governed writes", () => {
  assert.equal(getResearchToolCatalogEntry("record.get")?.boundary, "read-only");
  assert.equal(getResearchToolCatalogEntry("run.event")?.boundary, "operational-write");
  assert.equal(getResearchToolCatalogEntry("change.apply")?.boundary, "governed-write");
  assert.equal(getResearchToolCatalogEntry("change.apply")?.mcpName, "research_change_apply");
});

test("catalog filters without mutating the authoritative list", () => {
  const readTools = listResearchToolCatalog({ boundary: "read-only" });
  assert.ok(readTools.length > 0);
  assert.ok(readTools.every((entry) => entry.boundary === "read-only"));
  assert.ok(listResearchToolCatalog({ category: "graph" }).every((entry) => entry.category === "graph"));
  assert.equal(listResearchToolCatalog({ category: "graph" })[0]?.id, "graph.explore");
  assert.equal(researchToolCatalog.length, 14);
});

test("visual companion is a read-only MCP action", () => {
  const entry = getResearchToolCatalogEntry("workspace.show");
  assert.equal(entry?.boundary, "read-only");
  assert.equal(entry?.mcpName, "research_show_in_workspace");
  assert.equal(entry?.cliCommand, null);
});

test("figure manifest is explicitly marked as MCP-only", () => {
  const entry = getResearchToolCatalogEntry("figure.manifest");
  assert.equal(entry?.mcpName, "research_figures");
  assert.equal(entry?.cliCommand, null);
});
