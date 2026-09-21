import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../app/ui-primitives.tsx", import.meta.url);

test("UI primitives expose a bounded, semantic contract", async () => {
  const source = await readFile(sourceUrl, "utf8");

  for (const name of ["Button", "IconButton", "StatusBadge", "SectionHeader", "EmptyState", "InlineNotice", "ProgressStatus"]) {
    assert.match(source, new RegExp(`(?:export const|export function) ${name}\\b`));
  }
  assert.match(source, /ButtonVariant = "primary" \| "secondary" \| "ghost" \| "danger"/);
  assert.match(source, /`ui-button--\$\{variant\}`/);
  assert.match(source, /aria-label=\{label\}/);
  assert.match(source, /<h2 className="ui-section-header__title">/);
  assert.match(source, /<section className=\{cx\("ui-empty-state"/);
  assert.match(source, /role=\{kind === "danger" \? "alert" : "status"\}/);
  assert.match(source, /<progress className="ui-progress-status__bar"/);
  assert.match(source, /ui-status-badge__marker/);
  assert.doesNotMatch(source, /style=\{/);
});

test("IconButton requires an accessible label and ProgressStatus supports cancellation", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /export interface IconButtonProps[\s\S]*?label: string/);
  assert.match(source, /onCancel\?: \(\) => void/);
  assert.match(source, /onClick=\{onCancel\}/);
  assert.match(source, />Stop<\/Button>/);
});
