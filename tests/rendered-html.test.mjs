import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the APOE evidence workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Research OS<\/title>/i);
  assert.match(html, /Current project/);
  assert.match(html, /Evidence map/);
  assert.match(html, />Map</);
  assert.match(html, />Library</);
  assert.match(html, />Work</);
  assert.match(html, />Agent</);
  assert.match(html, /Edit map/);
  assert.match(html, />Direct</);
  assert.match(html, />2 hops</);
  assert.match(html, /Display/);
  assert.match(html, /Ask AI/);
});

test("keeps private project records out of public assets", async () => {
  const projectsRaw = await readFile(new URL("../projects.json", import.meta.url),"utf8");
  const projectRegistry = JSON.parse(projectsRaw);

  assert.equal(projectRegistry.version, 1);
  assert.ok(projectRegistry.projects.some(({ id, vaultPath }) => id === "apoe-rexach" && vaultPath === "vault"));
  await assert.rejects(access(new URL("../public/vault-index.json", import.meta.url)));
  await assert.rejects(access(new URL("../dist/.openai/hosting.json", import.meta.url)));
  const localOnly=JSON.parse(await readFile(new URL("../dist/.openai/LOCAL_ONLY.json",import.meta.url),"utf8"));
  assert.equal(localOnly.deploymentDisabled,true);
});

test("keeps gestures, graph focus, sources, and Markdown position saving wired in", async () => {
  const [client, dock, css, vite, schema, canonicalizer, transaction] = await Promise.all([
    readFile(new URL("../app/research-os.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/agent-command-dock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/research-schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/autonomous-canonicalization.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/canonicalization-transaction.ts", import.meta.url), "utf8"),
  ]);

  assert.match(client, /activePointers/);
  assert.match(client, /kind:"pinch"/);
  assert.match(client, /startDistance/);
  assert.match(client, /function graphNeighborhoodIds/);
  assert.match(client, /centerGraphSource\(initialGraphRecords\.length\?initialGraphRecords:parsed,initial\.id,"flow"\)/);
  assert.match(client, /aria-pressed=\{edgeScope==="focus"\}/);
  assert.match(client, /edgeScope==="all"\?"Fit all":"Center"/);
  assert.match(client, /\/api\/project-snapshot/);
  assert.match(client, /Source links/);
  assert.match(client, /Referenced papers/);
  assert.match(client, /source\.relations/);
  assert.match(client, /Position saved to Markdown/);
  assert.match(client, /\/api\/vault-position/);
  assert.match(client, /function BranchExplorer/);
  assert.match(client, /Leads into/);
  assert.match(client, /Branches to/);
  assert.match(client, /relation\.target===record\.id/);
  assert.match(client, /detailExpanded/);
  assert.match(client, /setExpanded/);
  assert.match(client, /panelRef\.current\?\.scrollTo\(\{top:0,left:0\}\)/);
  assert.match(client, /libraryMainRef\.current\?\.scrollTo\(\{top:0,left:0\}\)/);
  assert.match(client, /function reviewMeta/);
  assert.match(client, /function ReviewQueuePage/);
  assert.match(client, /Resolve blockers/);
  assert.match(client, /Verify evidence/);
  assert.match(client, /Make a decision/);
  assert.match(client, /Analyze results/);
  assert.match(client, /Next human action/);
  assert.match(client, /Claims are never promoted automatically|claims are never promoted automatically/i);
  assert.match(client, /research-os-active-project/);
  assert.match(client, /\/api\/projects/);
  assert.match(client, /\/api\/project-snapshot/);
  assert.match(client, /\/api\/project-record/);
  assert.match(client, /\/api\/local-session/);
  assert.match(client, /x-research-os-token/);
  assert.match(client, /SaveConflictError/);
  assert.match(client, /Refresh project/);
  assert.match(client, /Research records could not be loaded/);
  assert.match(client, /Your project has not been treated as empty/);
  assert.match(client, /const primaryNav/);
  assert.match(client, /const libraryTabs/);
  assert.match(client, /const workTabs/);
  assert.match(client, /graphEditing/);
  assert.match(client, /Map editing tools/);
  assert.match(client, /className="type-filter-menu"/);
  assert.match(client, /Record types/);
  assert.match(client, /className="type-filter-dots"/);
  assert.match(client, /closeTransientMenus/);
  assert.match(client, /removeAttribute\("open"\)/);
  assert.match(client, /researchPulse\.slice\(0,2\)/);
  assert.match(client, /nextView==="Graph"/);
  assert.match(client, /preferredGraphRecord\(records\.filter\(record=>graphDefaultTypes\.includes\(record\.type\)\)\)/);
  assert.match(client, /Across the whole project/);
  assert.match(client, /Smart Library views/);
  assert.match(client, /Environment integrity/);
  assert.match(client, /not scientific confidence/i);
  assert.match(client, /Agent readiness/);
  assert.match(client, /TRAPS\.md/);
  assert.match(client, /AGENT_START\.md/);
  assert.match(client, /\/api\/ai-readiness/);
  assert.match(vite, /\/api\/ai-readiness/);
  assert.match(client, /AgentCommandDock/);
  assert.match(client, /presentAssistantAction/);
  assert.match(vite, /\/api\/assistant\/providers/);
  assert.match(vite, /\/api\/assistant\/ask/);
  assert.match(vite, /\/api\/assistant\/ollama\/start/);
  assert.match(vite, /\/api\/assistant\/voice\/status/);
  assert.match(vite, /\/api\/assistant\/voice\/transcribe/);
  assert.match(dock, /Reasoning agent/);
  assert.match(dock, /Start local models/);
  assert.match(dock, />Stop</);
  assert.match(dock, /Hold to talk/);
  assert.match(client, /guided-presentation/);
  assert.match(vite, /response\.destroyed\|\|response\.writableEnded/);
  assert.match(client, /externalLinkKind/);
  assert.match(client, /Connect a local folder/);
  assert.match(client, /Create and open project/);
  assert.match(client, /knowledgeLibraryTypes/);
  assert.match(client, /createRecordMarkdown/);
  assert.match(client, /idea-lens/);
  assert.match(client, /function AIWorkspacePage/);
  assert.match(client, /function PaperReviewPage/);
  assert.match(client, /function LiteratureInboxPage/);
  assert.match(client, /Frontier-agent rationale/);
  assert.match(schema, /agent-verified/);
  assert.match(client, /Save review checkpoint/);
  assert.match(client, /Refresh AI context/);
  assert.match(client, /Shared working memory/);
  assert.match(client, /Agent command center/);
  assert.match(client, /Copy AI task/);
  assert.match(client, /Share the reasoning, not the private vault/);
  assert.match(client, /Open the exact file, code, and repair message/);
  assert.doesNotMatch(client, /function MeetingWorkspacePage|function DecisionLogPage/);
  assert.match(css, /\.agent-tool-grid/);
  assert.match(css, /\.agent-command-dock/);
  assert.match(css, /grid-template-rows: auto auto auto minmax\(0,1fr\) auto/);
  assert.match(css, /\.research-pulse\.compact \.research-pulse-items \{[\s\S]*display: flex; flex: 0 1 auto/);
  assert.match(css, /\.type-filter-menu \.type-filters \{/);
  assert.match(css, /\.type-filter-dots \{/);
  assert.match(css, /:root\[data-theme="dark"\] \.summary-editor textarea/);
  assert.match(css, /\.canvas-status-overlay \{/);
  assert.match(css, /grid-template-columns: minmax\(0,1fr\) 344px/);
  assert.match(css, /\.lab-share/);
  assert.match(schema, /Cheapest discriminating test/);
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /\.edge-group\.speculative/);
  assert.match(css, /\.canvas-node\.dimmed/);
  assert.match(css, /\.zoom-far/);
  assert.match(client, /libraryViewDescriptions/);
  assert.match(client, /library-heading library-hero/);
  assert.match(client, /edge-node-cutouts/);
  assert.match(client, /centerGraphSource\(graphRecords,selectedId,mode,transform\.scale\)/);
  assert.match(css, /--focus-scale/);
  assert.match(css, /\.zoom-far \.canvas-node\.context-node/);
  assert.match(css, /\.source-panel/);
  assert.match(css, /\.detail-summary/);
  assert.match(css, /\.branch-explorer/);
  assert.match(css, /\.branch-flow/);
  assert.match(css, /\.detail-expanded \.detail-panel/);
  assert.match(css, /\.review-workspace/);
  assert.match(css, /\.review-lane-tabs/);
  assert.match(css, /\.review-item-exit/);
  assert.match(css, /\.project-switcher/);
  assert.match(css, /\.project-menu/);
  assert.match(css, /\.sidebar \{ z-index: 50; overflow: visible; \}/);
  assert.match(css, /\.reader-disclosure > summary::after \{[\s\S]*content: "↓"/);
  assert.match(css, /\.reader-disclosure\[open\] > summary::after \{ content: "↑"; \}/);
  assert.match(client, /addEventListener\("wheel",handleWheel,\{passive:false\}\)/);
  assert.match(client, /focus-node-cutouts/);
  assert.match(css, /\.edge-layer-active \{ z-index: 4; \}/);
  assert.match(client, /label\.toLowerCase\(\)/);
  assert.match(client, /\[record\?\.id,expanded\]/);
  assert.match(client, /parseWorkspaceLink/);
  assert.match(client, /buildWorkspaceUrl/);
  assert.match(client, /applyLocation\(\);/);
  assert.match(client, /!snapshotLoaded\|\|!locationReady/);
  assert.match(client, /sidebarCollapsed/);
  assert.match(client, /research-os-sidebar-collapsed/);
  assert.match(client, /changeProjectVisibility/);
  assert.match(client, /Its vault and every file will stay on disk/);
  assert.match(css, /\.shell\.sidebar-collapsed/);
  assert.match(css, /\.sidebar-collapse-toggle/);
  assert.match(css, /:root\[data-theme="dark"\] \.review-focus-grid span \{ color: var\(--accent-teal\); \}/);
  assert.match(css, /@keyframes menu-enter/);
  assert.match(css, /html\[data-motion="reduced"\][\s\S]*animation: none !important/);
  assert.match(css, /\.project-empty/);
  assert.match(css, /\.ai-workspace/);
  assert.match(css, /\.paper-review-page/);
  assert.match(css, /\.literature-inbox/);
  assert.match(css, /\.frontier-review/);
  assert.match(vite, /localProjectPersistence/);
  assert.match(vite, /requireLocalWrite/);
  assert.match(vite, /RecordConflictError/);
  assert.match(vite, /writeRecordWithRevision/);
  assert.match(vite, /collectVaultRecords/);
  assert.match(vite, /projects\.json/);
  assert.match(vite, /projectFolders/);
  assert.match(vite, /canvas_x/);
  assert.match(vite, /canvas_y/);
  assert.match(vite, /\/api\/ai-context/);
  assert.match(vite, /\/api\/literature-inbox/);
  assert.match(vite, /\/api\/literature-review/);
  assert.match(vite, /\/api\/literature-canonicalize/);
  assert.match(vite, /verifiedEvidence/);
  assert.match(canonicalizer, /autonomous-canonicalization-v2/);
  assert.match(canonicalizer, /explicit reviewed merge target/);
  assert.match(transaction, /\.research-os","transactions/);
  assert.match(transaction, /recovery-blocked/);
  assert.match(vite, /rebuildAiContext/);
  assert.match(vite, /timeout:10_000/);
  assert.match(schema, /createTemplateMarkdown/);
});
