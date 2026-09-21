import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);

test("local worker contract keeps local outputs bounded and evidence-addressable", async () => {
  const { stdout } = await run(process.execPath, ["scripts/check-local-worker-contract.mjs"], {
    cwd: process.cwd(),
    windowsHide: true,
  });
  assert.match(stdout, /Local worker contract check passed/);
});
