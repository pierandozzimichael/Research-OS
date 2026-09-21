import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

export type RevisionedRecord = {
  raw: string;
  revision: string;
};

export class RecordConflictError extends Error {
  currentRevision: string | null;

  constructor(currentRevision: string | null) {
    super("This record changed outside the current editor.");
    this.name = "RecordConflictError";
    this.currentRevision = currentRevision;
  }
}

export function contentRevision(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function safeRecordPath(vaultRoot: string, relativePath: string) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.split("/").includes("..") ||
    !normalized.toLowerCase().endsWith(".md")
  ) {
    throw new Error("Invalid record path");
  }

  const resolvedVault = path.resolve(vaultRoot);
  const absolute = path.resolve(resolvedVault, ...normalized.split("/"));
  if (!absolute.startsWith(`${resolvedVault}${path.sep}`)) {
    throw new Error("Invalid record path");
  }
  return { normalized, absolute };
}

/**
 * Figure assets deliberately live in the vault rather than public/. This keeps
 * unpublished lab material out of static builds and limits the local preview
 * route to a narrow, auditable directory.
 */
export function safeFigureAssetPath(vaultRoot:string, relativePath:string) {
  const normalized=relativePath.replaceAll("\\", "/");
  const allowedExtensions=new Set([".png",".jpg",".jpeg",".webp",".gif"]);
  const extension=path.extname(normalized).toLowerCase();
  if(
    !normalized || normalized.startsWith("/") || normalized.split("/").includes("..") ||
    !normalized.startsWith("16 Media/") || !allowedExtensions.has(extension)
  )throw new Error("Invalid figure asset path");
  const resolvedVault=path.resolve(vaultRoot);
  const absolute=path.resolve(resolvedVault,...normalized.split("/"));
  if(!absolute.startsWith(`${resolvedVault}${path.sep}`))throw new Error("Invalid figure asset path");
  return {normalized,absolute};
}

export async function readRevisionedRecord(absolute: string): Promise<RevisionedRecord> {
  const raw = await readFile(absolute, "utf8");
  return { raw, revision: contentRevision(raw) };
}

const writeQueues = new Map<string, Promise<void>>();

async function withRecordQueue<T>(absolute: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(absolute) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  writeQueues.set(absolute, queued);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (writeQueues.get(absolute) === queued) {
      writeQueues.delete(absolute);
    }
  }
}

export async function atomicWriteFile(absolute: string, content: string): Promise<void> {
  await mkdir(path.dirname(absolute), { recursive: true });
  const temporary = path.join(
    path.dirname(absolute),
    `.${path.basename(absolute)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let fileHandle;
  try {
    fileHandle = await open(temporary, "wx", 0o600);
    await fileHandle.writeFile(content, "utf8");
    await fileHandle.sync();
    await fileHandle.close();
    fileHandle = undefined;
    let renamed=false;
    const retryDelays=[0,20,50,100,200];
    for(const delay of retryDelays){
      if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      try{
        await rename(temporary, absolute);
        renamed=true;
        break;
      }catch(error){
        const code=(error as NodeJS.ErrnoException).code;
        if(!["EPERM","EBUSY","EACCES"].includes(String(code))||delay===retryDelays.at(-1))throw error;
      }
    }
    if(!renamed)throw new Error(`Atomic replacement failed for ${path.basename(absolute)}.`);
  } finally {
    await fileHandle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function currentRecord(absolute: string): Promise<RevisionedRecord | null> {
  try {
    return await readRevisionedRecord(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeRecordWithRevision(
  absolute: string,
  raw: string,
  baseRevision: string | null,
): Promise<RevisionedRecord> {
  return withRecordQueue(absolute, async () => {
    const current = await currentRecord(absolute);
    const matchesExisting =
      typeof baseRevision === "string" &&
      current !== null &&
      current.revision === baseRevision;
    const matchesCreation = baseRevision === null && current === null;

    if (!matchesExisting && !matchesCreation) {
      throw new RecordConflictError(current?.revision ?? null);
    }

    await atomicWriteFile(absolute, raw);
    return { raw, revision: contentRevision(raw) };
  });
}

export async function updateRecordWithRevision(
  absolute: string,
  baseRevision: string,
  update: (raw: string) => string,
): Promise<RevisionedRecord> {
  return withRecordQueue(absolute, async () => {
    const current = await currentRecord(absolute);
    if (!current || current.revision !== baseRevision) {
      throw new RecordConflictError(current?.revision ?? null);
    }

    const raw = update(current.raw);
    await atomicWriteFile(absolute, raw);
    return { raw, revision: contentRevision(raw) };
  });
}
