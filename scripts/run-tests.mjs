import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const node = process.execPath;

function run(label, args, timeout) {
  console.log(`\n${label}`);
  const result = spawnSync(node, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    timeout,
  });
  if (result.error?.code === "ETIMEDOUT") {
    console.error(`${label} exceeded ${Math.round(timeout / 1000)} seconds and was stopped.`);
    process.exit(124);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("Type-checking application (45 second limit)", [
  path.join(root, "node_modules", "typescript", "bin", "tsc"),
  "--noEmit",
], 45_000);

run("Building application (90 second limit)", [
  path.join(root, "node_modules", "vinext", "dist", "cli.js"),
  "build",
], 90_000);

run("Checking deployable assets for private research (20 second limit)", [
  path.join(root, "scripts", "check-private-build.mjs"),
  "public",
  "dist",
], 20_000);

run("Checking local figure asset integrity (20 second limit)", [
  path.join(root, "scripts", "check-figure-assets.mjs"),
], 20_000);

const testNames = readdirSync(path.join(root, "tests"))
  .filter(name => /\.test\.(mjs|ts)$/.test(name));
const integrationTests = testNames
  .filter(name => name.endsWith(".integration.test.mjs"))
  .map(name => path.join(root, "tests", name));
const tests = testNames
  .filter(name => !name.endsWith(".integration.test.mjs"))
  .map(name => path.join(root, "tests", name));

run("Running tests (60 second limit)", ["--test", ...tests], 60_000);
for (const integrationTest of integrationTests) {
  run(`Running ${path.basename(integrationTest)} (150 second limit)`, ["--test", integrationTest], 150_000);
}
