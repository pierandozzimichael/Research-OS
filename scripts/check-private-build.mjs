import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const requestedRoots = process.argv.slice(2);
const scanRoots = requestedRoots.length ? requestedRoots : ["public"];
const textExtensions = new Set([
  ".css", ".html", ".js", ".json", ".map", ".md", ".mjs", ".svg", ".txt", ".xml",
]);

async function exists(absolute) {
  try {
    await readdir(absolute);
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
}

async function filesUnder(absolute) {
  const files = [];
  async function walk(folder) {
    for (const entry of await readdir(folder, {withFileTypes:true})) {
      const candidate = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(candidate);
      else files.push(candidate);
    }
  }
  if (await exists(absolute)) await walk(absolute);
  return files;
}

function normalized(value) {
  return value
    .replaceAll("\\r", " ")
    .replaceAll("\\n", " ")
    .replaceAll("\\t", " ")
    .replace(/\\"/g, "\"")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function privateMarkers() {
  const vaultRoots = [path.join(root, "vault")];
  const projectsRoot = path.join(root, "projects");
  if (await exists(projectsRoot)) {
    for (const entry of await readdir(projectsRoot, {withFileTypes:true})) {
      if (entry.isDirectory()) vaultRoots.push(path.join(projectsRoot, entry.name, "vault"));
    }
  }

  const markers = new Set();
  for (const vaultRoot of vaultRoots) {
    for (const file of await filesUnder(vaultRoot)) {
      if (path.extname(file).toLowerCase() !== ".md") continue;
      const raw = await readFile(file, "utf8");
      if (!/^privacy:\s*private\s*$/mi.test(raw)) continue;

      const title = raw.match(/^title:\s*["']?(.+?)["']?\s*$/mi)?.[1]?.trim();
      const summary = raw.match(/^summary:\s*["']?(.+?)["']?\s*$/mi)?.[1]?.trim();
      const body = raw.replace(/^---[\s\S]*?---\s*/m, "").replace(/^#\s+.+$/m, "").trim();
      for (const candidate of [title, summary, normalized(body).slice(0, 180)]) {
        const marker = normalized(candidate || "");
        if (marker.length >= 32) markers.add(marker);
      }
    }
  }
  return [...markers];
}

const markers = await privateMarkers();
const violations = [];

for (const relativeRoot of scanRoots) {
  const absoluteRoot = path.resolve(root, relativeRoot);
  if (!absoluteRoot.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Refusing to scan outside the project: ${relativeRoot}`);
  }
  for (const file of await filesUnder(absoluteRoot)) {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    if (relative.split("/").includes("16 Media")) {
      violations.push(`${relative}: local figure assets must never be deployable`);
      continue;
    }
    if (path.basename(file).toLowerCase() === "vault-index.json") {
      violations.push(`${relative}: forbidden vault snapshot`);
      continue;
    }
    if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
    const content = normalized(await readFile(file, "utf8"));
    const matched = markers.find(marker => content.includes(marker));
    if (matched) violations.push(`${relative}: contains private vault content`);
  }
}

if (violations.length) {
  console.error("Private research content was found in deployable assets:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(`Privacy check passed for ${scanRoots.join(", ")}.`);
}
