import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/agent-command-dock.tsx", import.meta.url), "utf8");

test("assistant drawer has an isolated accessible dialog lifecycle", () => {
  assert.match(source, /if\(!open\)return null/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby="agent-command-dock-title"/);
  assert.match(source, /id="agent-command-dock-title"/);
  assert.match(source, /openerRef/);
  assert.match(source, /opener\.isConnected/);
  assert.match(source, /handleDialogKeyDown/);
  assert.match(source, /event\.key==="Escape"/);
  assert.match(source, /event\.key!=="Tab"/);
  assert.match(source, /event\.shiftKey\?last:first/);
  assert.match(source, /inputRef\.current\.focus\(\)/);
  assert.match(source, /dialogRef\.current\?\.focus\(\)/);
});

