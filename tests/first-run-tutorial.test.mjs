import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const component = readFileSync(path.join(root, "app", "first-run-tutorial.tsx"), "utf8");
const styles = readFileSync(path.join(root, "app", "first-run-tutorial.module.css"), "utf8");

test("first-run tutorial is optional, keyboard-dismissible, and hydration-safe", () => {
  assert.match(component, /useSyncExternalStore/);
  assert.match(component, /Skip for now/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /localStorage\.setItem/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(component, /Open assistant/);
  assert.match(component, /See sharing tools/);
});
