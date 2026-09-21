/**
 * Privacy-safe, read-only sharing projection.
 *
 * This module deliberately does not know how records are stored or written.
 * The vault remains canonical; the returned Markdown is a disposable view for
 * a PI or lab collaborator and must never be imported as evidence.
 */

export type LabShareProject = {
  id: string;
  name: string;
  description?: string;
  centralQuestion?: string;
  vaultPath?: string;
};

export type LabShareRecord = {
  id: string;
  type: string;
  title: string;
  status?: string;
  privacy?: string;
  summary?: string;
  /** Parsed frontmatter. Raw YAML is never copied into the snapshot. */
  fields?: Record<string, unknown>;
  /** Parsed body, used only to extract typed links and explicit boundaries. */
  body?: string;
  /** Already-parsed canonical connections, when available. */
  connections?: Array<{type: string; target: string}>;
  /** Optional normalized links supplied by the canonical loader. */
  urls?: string[];
  relativePath?: string;
};

export type LabShareOptions = {
  selectedIds?: string[];
  /** Keep snapshot headings stable in tests and exports. Defaults to today. */
  generatedAt?: string;
  /** Optional digest of the canonical source files used to make this view. */
  sourceHash?: string;
};

export type LabShareResult = {
  markdown: string;
  includedIds: string[];
  excludedPrivateCount: number;
  excludedRestrictedCount: number;
  excludedUnselectedCount: number;
  omittedPrivateConnectionCount: number;
};

export type LabShareManifest = {
  schema_version: "research-os-share-v1";
  kind: "read-only-share";
  project: {id: string; name: string};
  generated_at: string;
  source: {authority: "canonical-vault"; hash?: string};
  included_ids: string[];
  exclusions: {
    private: number;
    restricted: number;
    unselected: number;
    omitted_private_connections: number;
    unsupported_types: number;
  };
  records: Array<{
    id: string;
    type: string;
    title: string;
    status: string;
    summary?: string;
    source_links: string[];
    connections: string[];
  }>;
};

export type LabShareEmailDraft = {
  subject: string;
  body: string;
  /** RFC 6068-compatible fallback; it never contains an attachment. */
  mailto: string;
};

const SHARED_TYPES = ["model", "claim", "idea", "hypothesis", "experiment", "result"] as const;
type SharedType = (typeof SHARED_TYPES)[number];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
}

function field(record: LabShareRecord, key: string): string {
  return text(record.fields?.[key]);
}

function listField(record: LabShareRecord, key: string): string[] {
  const value = record.fields?.[key];
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const one = text(value);
  return one ? [one] : [];
}

function clean(value: string): string {
  return value.replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

function markdownSafe(value: string): string {
  return clean(value).replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/** Escape untrusted record/project content for an HTML text or attribute context. */
function htmlSafe(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function safeExternalUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function section(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`^##\\s+${escaped}\\s*$`, "im"));
  if (!match || match.index === undefined) return "";
  const remainder = body.slice(match.index + match[0].length);
  const next = remainder.search(/^##\s+/m);
  return (next < 0 ? remainder : remainder.slice(0, next)).trim();
}

function markdownLinks(value: string): string[] {
  return [...value.matchAll(/\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/gi)]
    .map(match => match[1].replace(/[.,;]+$/, ""));
}

function externalUrls(record: LabShareRecord): string[] {
  const urls = [
    ...(record.urls || []),
    ...listField(record, "urls"),
    ...listField(record, "links"),
    field(record, "url"), field(record, "source_url"), field(record, "paper_url"),
    ...markdownLinks(record.body || ""),
  ];
  const doi = field(record, "doi");
  const pmid = field(record, "pmid");
  const pmcid = field(record, "pmcid");
  if (doi) urls.push(`https://doi.org/${doi.replace(/^https?:\/\/doi.org\//i, "")}`);
  if (pmid) urls.push(`https://pubmed.ncbi.nlm.nih.gov/${pmid.replace(/\D/g, "")}/`);
  if (pmcid) urls.push(`https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid.replace(/^PMC/i, "PMC")}/`);
  return [...new Set(urls.map(clean).map(safeExternalUrl).filter((url): url is string => Boolean(url)))].sort();
}

function evidenceBoundary(record: LabShareRecord): string[] {
  const result: string[] = [];
  const confidence = field(record, "confidence");
  const humanReviewed = field(record, "human_reviewed");
  const anchors = listField(record, "evidence_anchors");
  if (confidence) result.push(`Confidence recorded: ${confidence}.`);
  if (humanReviewed.toLowerCase() === "true") result.push("Human review is recorded in the canonical record.");
  else if (["claim", "hypothesis", "model", "result"].includes(record.type)) result.push("Human review is not recorded; treat this as provisional.");
  if (anchors.length) result.push(`Evidence anchors: ${anchors.join(", ")}.`);
  const explicit = section(record.body || "", "What this does not establish") || section(record.body || "", "Evidence needed") || section(record.body || "", "Limitations");
  if (explicit) result.push(`Boundary noted in the record: ${clean(explicit).slice(0, 500)}`);
  return result;
}

function connections(record: LabShareRecord): string[] {
  if (record.connections?.length) return record.connections.map(item => `${item.type} → ${item.target}`);
  const body = section(record.body || "", "Connections");
  return [...body.matchAll(/^\s*-\s*([a-z-]+)\s+\[\[([A-Z]+-\d{3,})[^\]]*\]\]/gim)].map(match => `${match[1]} → ${match[2]}`);
}

function connectionTargetId(edge: string): string | undefined {
  const target = edge.split("→")[1]?.trim().toUpperCase();
  return target && /^[A-Z]+-\d{3,}$/.test(target) ? target : undefined;
}

function visibleConnections(record: LabShareRecord, recordsById: Map<string, LabShareRecord>): {edges: string[]; omittedPrivateCount: number} {
  let omittedPrivateCount = 0;
  const edges = connections(record).filter(edge => {
    const target = connectionTargetId(edge) ? recordsById.get(connectionTargetId(edge)!) : undefined;
    if (target && ["private", "restricted"].includes(privacyOf(target))) {
      omittedPrivateCount += 1;
      return false;
    }
    return true;
  });
  return {edges, omittedPrivateCount};
}

function byType(records: LabShareRecord[], type: SharedType): LabShareRecord[] {
  return records.filter(record => record.type === type).sort((a, b) => a.id.localeCompare(b.id));
}

function normalizedGeneratedAt(value?: string): string {
  const candidate = value || new Date().toISOString();
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function shareManifest(project: LabShareProject, records: LabShareRecord[], options: LabShareOptions, result: LabShareResult): LabShareManifest {
  const eligible = new Set(result.includedIds.map(id => id.toUpperCase()));
  const publicRecords = new Map(records.filter(record => !["private", "restricted"].includes(privacyOf(record))).map(record => [record.id.toUpperCase(), record]));
  const recordsById = new Map(records.map(record => [record.id.toUpperCase(), record]));
  const sharedRecords = records.filter(record => eligible.has(record.id.toUpperCase())).sort((a, b) => a.id.localeCompare(b.id));
  return {
    schema_version: "research-os-share-v1",
    kind: "read-only-share",
    project: {id: project.id, name: project.name},
    generated_at: normalizedGeneratedAt(options.generatedAt),
    source: {authority: "canonical-vault", ...(options.sourceHash ? {hash: options.sourceHash} : {})},
    included_ids: [...result.includedIds],
    exclusions: {
      private: result.excludedPrivateCount,
      restricted: result.excludedRestrictedCount,
      unselected: result.excludedUnselectedCount,
      omitted_private_connections: result.omittedPrivateConnectionCount,
      unsupported_types: records.filter(record => !SHARED_TYPES.includes(record.type as SharedType) && !["private", "restricted"].includes(privacyOf(record))).length,
    },
    records: sharedRecords.map(record => {
        const edges = visibleConnections(record, recordsById).edges;
      const inheritedLinks = edges.flatMap(edge => {
        const target = publicRecords.get(edge.split("→")[1]?.trim().toUpperCase() || "");
        return target && ["paper", "source", "evidence"].includes(target.type) ? externalUrls(target) : [];
      });
      const links = [...new Set([...externalUrls(record), ...inheritedLinks])].sort();
      const summary = text(record.summary) || field(record, "summary");
      return {
        id: record.id,
        type: record.type,
        title: record.title,
        status: text(record.status) || "unrecorded",
        ...(summary ? {summary} : {}),
        source_links: links,
        connections: edges,
      };
    }),
  };
}

function privacyOf(record: LabShareRecord): string {
  return (text(record.privacy) || field(record, "privacy")).toLowerCase();
}

/** Build a noncanonical Markdown view without exposing private material or raw bodies. */
export function buildLabShareSnapshot(project: LabShareProject, records: LabShareRecord[], options: LabShareOptions = {}): LabShareResult {
  const selected = options.selectedIds?.length ? new Set(options.selectedIds.map(id => id.toUpperCase())) : null;
  const excludedPrivateCount = records.filter(record => privacyOf(record) === "private").length;
  const excludedRestrictedCount = records.filter(record => privacyOf(record) === "restricted").length;
  const publicRecordsById=new Map(records
    .filter(record=>!['private','restricted'].includes(privacyOf(record)))
    .map(record=>[record.id.toUpperCase(),record]));
  const recordsById = new Map(records.map(record=>[record.id.toUpperCase(),record]));
  const eligible = records.filter(record => {
    if (["private", "restricted"].includes(privacyOf(record))) return false;
    if (!SHARED_TYPES.includes(record.type as SharedType)) return false;
    return !selected || selected.has(record.id.toUpperCase());
  });
  const excludedUnselectedCount = selected ? records.filter(record => SHARED_TYPES.includes(record.type as SharedType) && !selected.has(record.id.toUpperCase()) && !["private", "restricted"].includes(privacyOf(record))).length : 0;
  const includedIds = eligible.map(record => record.id).sort();
  let omittedPrivateConnectionCount = 0;
  const date = (options.generatedAt || new Date().toISOString()).slice(0, 10);
  const lines: string[] = [
    "# Research OS Lab Snapshot",
    "",
    "> **NONCANONICAL · READ-ONLY VIEW** — This export is a navigation and discussion aid. The Markdown vault remains the source of truth; do not cite or import this snapshot as evidence.",
    "",
    `- Project: ${markdownSafe(project.name)} (${project.id})`,
    `- Generated: ${date}`,
    `- Included records: ${includedIds.length}`,
    `- Private records excluded: ${excludedPrivateCount}`,
    `- Restricted records excluded: ${excludedRestrictedCount}`,
    "",
    "## Project question",
    "",
    markdownSafe(project.centralQuestion || project.description || "No project question was supplied."),
    "",
  ];
  for (const type of SHARED_TYPES) {
    const group = byType(eligible, type);
    if (!group.length) continue;
    lines.push(`## ${type[0].toUpperCase()}${type.slice(1)}s`, "");
    for (const record of group) {
      lines.push(`### ${markdownSafe(record.id)} — ${markdownSafe(record.title)}`);
      const status = text(record.status) || "unrecorded";
      lines.push(`- Status: ${markdownSafe(status)}`);
      const summary = text(record.summary) || field(record, "summary");
      if (summary) lines.push(`- Summary: ${markdownSafe(summary)}`);
      for (const boundary of evidenceBoundary(record)) lines.push(`- Evidence boundary: ${markdownSafe(boundary)}`);
      const visible = visibleConnections(record, recordsById);
      omittedPrivateConnectionCount += visible.omittedPrivateCount;
      const linkedSourceUrls=visible.edges.flatMap(edge=>{
        const targetId=edge.split("→")[1]?.trim().toUpperCase();
        const target=targetId?publicRecordsById.get(targetId):undefined;
        return target&&["paper","source","evidence"].includes(target.type)?externalUrls(target):[];
      });
      const links = [...new Set([...externalUrls(record),...linkedSourceUrls])];
      if (links.length) {
        lines.push("- Source links:");
        for (const link of links) lines.push(`  - ${link}`);
      }
      const edges = visible.edges;
      if (edges.length) lines.push(`- Explicit connections: ${edges.map(markdownSafe).join("; ")}`);
      lines.push("");
    }
  }
  lines.push("## Sharing boundary", "", "This view intentionally omits private and restricted records, private connection targets, raw record bodies, staging literature runs, hidden reasoning, and unselected records. Verify methods, figures, sample structure, statistics, and scope in the canonical records before treating any statement as established.", "");
  return {markdown: `${lines.join("\n").trimEnd()}\n`, includedIds, excludedPrivateCount, excludedRestrictedCount, excludedUnselectedCount, omittedPrivateConnectionCount};
}

/** Build a deterministic machine-readable companion to the Markdown snapshot. */
export function buildLabShareManifest(project: LabShareProject, records: LabShareRecord[], options: LabShareOptions = {}): LabShareManifest {
  const result = buildLabShareSnapshot(project, records, options);
  return shareManifest(project, records, options, result);
}

/**
 * Build a self-contained, script-free HTML presentation.
 *
 * It intentionally renders escaped text, allows only http(s) source links, and
 * uses a restrictive document CSP. The artifact is disposable presentation
 * material; the canonical vault remains authoritative.
 */
export function buildLabShareHtml(project: LabShareProject, records: LabShareRecord[], options: LabShareOptions = {}): string {
  const result = buildLabShareSnapshot(project, records, options);
  const manifest = shareManifest(project, records, options, result);
  const grouped = manifest.records.reduce<Record<string, LabShareManifest["records"]>>((acc, record) => {
    (acc[record.type] ||= []).push(record);
    return acc;
  }, {});
  const cards = Object.entries(grouped).map(([type, group]) => `
    <section class="lane" aria-labelledby="lane-${htmlSafe(type)}">
      <h2 id="lane-${htmlSafe(type)}">${htmlSafe(type[0].toUpperCase() + type.slice(1))}s <span>${group.length}</span></h2>
      <div class="cards">${group.map(record => {
        const links = record.source_links.length ? `<div class="sources"><strong>Sources</strong>${record.source_links.map(url => `<a href="${htmlSafe(url)}" rel="noreferrer noopener">${htmlSafe(url)}</a>`).join("")}</div>` : "";
        const edges = record.connections.length ? `<p class="connections"><strong>Connections:</strong> ${record.connections.map(htmlSafe).join(" · ")}</p>` : "";
        return `<article class="card" id="${htmlSafe(record.id)}"><div class="eyebrow">${htmlSafe(record.id)} · ${htmlSafe(record.status)}</div><h3>${htmlSafe(record.title)}</h3>${record.summary ? `<p>${htmlSafe(record.summary)}</p>` : ""}${edges}${links}</article>`;
      }).join("")}</div>
    </section>`).join("");
  const manifestText = htmlSafe(JSON.stringify(manifest, null, 2));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
<title>${htmlSafe(project.name)} — Research OS share</title>
<style>
:root{color-scheme:light;--ink:#18332d;--muted:#5b706b;--line:#d8e5df;--surface:#fff;--wash:#f1f7f4;--accent:#167c68}*{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1120px;margin:0 auto;padding:48px 24px 72px}.masthead{background:var(--ink);color:#f7fffb;border-radius:24px;padding:32px 36px;margin-bottom:32px}.kicker,.eyebrow{letter-spacing:.12em;text-transform:uppercase;font-size:.75rem;font-weight:700;color:#62d6b4}.masthead h1{margin:.25rem 0 .5rem;font:clamp(2rem,5vw,4rem)/1.05 Georgia,serif}.meta{color:#c8dbd4}.lane{margin:30px 0}.lane h2{font:1.45rem Georgia,serif;border-bottom:1px solid var(--line);padding-bottom:10px}.lane h2 span{color:var(--muted);font:700 .8rem system-ui}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px}.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;box-shadow:0 5px 18px #1233260d}.card h3{margin:.35rem 0 .65rem;font:1.35rem/1.15 Georgia,serif}.card p{margin:.5rem 0;color:var(--muted)}.sources{border-top:1px solid var(--line);margin-top:16px;padding-top:12px;display:grid;gap:5px;font-size:.9rem}.sources a{color:var(--accent);overflow-wrap:anywhere}.connections{font-size:.9rem}.notice{background:#fff9e8;border-left:4px solid #d8a11e;border-radius:8px;padding:14px 16px;color:#5f4b1a}details{margin-top:32px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px}pre{overflow:auto;font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}footer{color:var(--muted);font-size:.85rem;margin-top:32px}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--ink:#e9fff7;--muted:#a7c2b9;--line:#29473e;--surface:#10251f;--wash:#081813;--accent:#6fe3be}.masthead{background:#183d32}.notice{background:#3a3118;color:#fceec3}}
</style></head><body><main><header class="masthead"><div class="kicker">Research OS · read-only share</div><h1>${htmlSafe(project.name)}</h1><div class="meta">Generated ${htmlSafe(manifest.generated_at)} · ${manifest.records.length} records · canonical vault remains authoritative</div></header>
<p class="notice"><strong>Sharing boundary:</strong> Private and restricted records, raw record bodies, hidden reasoning, staging literature runs, and unselected records were omitted. Verify methods, figures, sample structure, statistics, and scope in the canonical records.</p>
${cards || "<p>No shareable records were selected.</p>"}
<details><summary>Machine-readable manifest</summary><pre>${manifestText}</pre></details>
<footer>Research OS share artifact · noncanonical presentation · source authority: canonical Markdown vault</footer></main></body></html>`;
}

/** Build a short, plain-text email handoff; attachments remain an explicit user action. */
export function buildLabShareEmailDraft(project: LabShareProject, result: LabShareResult): LabShareEmailDraft {
  const subject = `Research OS share — ${project.name}`;
  const body = [`Research OS read-only share: ${project.name}`, `Included records: ${result.includedIds.length}`, `Records: ${result.includedIds.join(", ") || "none"}`, "", "Attach the downloaded HTML, Markdown, or JSON export before sending. It is a noncanonical discussion aid; verify claims in the canonical vault before citing them."].join("\n");
  return {subject, body, mailto: `mailto:?${new URLSearchParams({subject, body}).toString()}`};
}

export const generateLabShareSnapshot = buildLabShareSnapshot;
