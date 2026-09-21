/**
 * Bounded catalog of the tools currently exposed by Research OS.
 *
 * This is deliberately a presentation/agent-routing module, not the source
 * of the MCP schemas or CLI parser. Keep entries synchronized with
 * scripts/research-mcp.mjs, scripts/research-tool.mjs, and
 * docs/RESEARCH_ENVIRONMENT_API.md when those interfaces change.
 */

export type ToolBoundary = "read-only" | "operational-write" | "governed-write";
export type ToolCategory =
  | "orientation"
  | "retrieval"
  | "graph"
  | "workflow"
  | "agent-runs"
  | "governed-changes";

export type ResearchToolCatalogEntry = {
  /** Stable operation identifier, matching the API operation where possible. */
  id: string;
  label: string;
  category: ToolCategory;
  purpose: string;
  boundary: ToolBoundary;
  /** MCP name when this operation is exposed by the stdio adapter. */
  mcpName?: string;
  /** CLI invocation template; placeholders are intentionally descriptive. */
  cliCommand: string | null;
  suggestedPrompt: string;
};

const entries: ResearchToolCatalogEntry[] = [
  {
    id: "project.brief",
    label: "Project brief",
    category: "orientation",
    purpose: "Get compact, source-bound project orientation, active models, urgent tasks, and evidence debt.",
    boundary: "read-only",
    mcpName: "research_brief",
    cliCommand: "pnpm research:tool -- brief",
    suggestedPrompt: "Orient me to the project using the current source-bound brief. Separate evidence debt from scientific confidence.",
  },
  {
    id: "search.records",
    label: "Search records",
    category: "retrieval",
    purpose: "Find canonical record cards with deterministic lexical and structural ranking without returning full bodies.",
    boundary: "read-only",
    mcpName: "research_search",
    cliCommand: "pnpm research:tool -- search --query \"<query>\"",
    suggestedPrompt: "Search the canonical records for <query>, then inspect only the most relevant record IDs.",
  },
  {
    id: "record.get",
    label: "Read record",
    category: "retrieval",
    purpose: "Read selected sections of one canonical record under an explicit character budget.",
    boundary: "read-only",
    mcpName: "research_record",
    cliCommand: "pnpm research:tool -- record --id <record-id> --max-chars <budget>",
    suggestedPrompt: "Read <record-id> with a bounded budget and focus on the sections needed for this question: <question>.",
  },
  {
    id: "graph.explore",
    label: "Explore graph",
    category: "graph",
    purpose: "Traverse one or two hops of explicit, typed canonical connections.",
    boundary: "read-only",
    mcpName: "research_graph",
    cliCommand: "pnpm research:tool -- graph --id <record-id> --depth <1-or-2>",
    suggestedPrompt: "Explore the explicit one-hop path from <record-id>; report relation types and do not infer unrecorded edges.",
  },
  {
    id: "evidence.dossier",
    label: "Evidence dossier",
    category: "workflow",
    purpose: "Separate supporting, challenging, and contextual relationships while exposing evidence gaps.",
    boundary: "read-only",
    mcpName: "research_evidence",
    cliCommand: "pnpm research:tool -- evidence --id <record-id>",
    suggestedPrompt: "Build an evidence dossier for <record-id>. Keep support, contradiction, and context in separate lanes.",
  },
  {
    id: "work.next",
    label: "Next work",
    category: "workflow",
    purpose: "Route deterministically to the highest-priority available work items.",
    boundary: "read-only",
    mcpName: "research_next",
    cliCommand: "pnpm research:tool -- next --limit <count>",
    suggestedPrompt: "Return the highest-value next work items and explain the evidence gap each one addresses.",
  },
  {
    id: "context.packet",
    label: "Context packet",
    category: "workflow",
    purpose: "Create a bounded task packet containing one focus record, relevant sections, local graph, and separate evidence lanes.",
    boundary: "read-only",
    mcpName: "research_context",
    cliCommand: "pnpm research:tool -- context --id <record-id> --max-chars <budget>",
    suggestedPrompt: "Create a bounded context packet for <record-id> to investigate <decision or question>; treat it as orientation, not evidence.",
  },
  {
    id: "figure.manifest",
    label: "Figure manifest",
    category: "retrieval",
    purpose: "Read figure metadata and provenance for a record without injecting image assets into model context.",
    boundary: "read-only",
    mcpName: "research_figures",
    cliCommand: null,
    suggestedPrompt: "List the decision-relevant figure metadata for <record-id> and state what local asset, if any, should be opened.",
  },
  {
    id: "workspace.show",
    label: "Show in workspace",
    category: "orientation",
    purpose: "Create a validated local deep link to a project view or record for an embedded browser, with a clickable-link fallback.",
    boundary: "read-only",
    mcpName: "research_show_in_workspace",
    cliCommand: null,
    suggestedPrompt: "Show <record-id> on the evidence map with <direct, 2-hop, or all> connection scope; reuse an embedded Research OS tab when available.",
  },
  {
    id: "run.status",
    label: "Run status",
    category: "agent-runs",
    purpose: "Inspect a durable agent-run checkpoint and recent operational events.",
    boundary: "read-only",
    mcpName: "research_run_status",
    cliCommand: "pnpm research:tool -- run-status --run <run-id>",
    suggestedPrompt: "Inspect run <run-id>; summarize its checkpoint, recent events, and whether it can safely resume.",
  },
  {
    id: "run.event",
    label: "Record run event",
    category: "agent-runs",
    purpose: "Append a non-canonical operational event to an existing agent run.",
    boundary: "operational-write",
    cliCommand: "pnpm research:tool -- run-event --run <run-id> --kind <event-kind> --summary \"<summary>\"",
    suggestedPrompt: "Record this operational note on run <run-id>: <summary>. Do not treat it as canonical scientific evidence.",
  },
  {
    id: "run.cancel",
    label: "Cancel run",
    category: "agent-runs",
    purpose: "Request safe cancellation at the next checkpoint without deleting work or rolling back canonical science.",
    boundary: "operational-write",
    mcpName: "research_run_cancel",
    cliCommand: "pnpm research:tool -- run-cancel --run <run-id> --reason \"<reason>\"",
    suggestedPrompt: "Request safe cancellation of run <run-id> because <reason>; preserve its checkpoint and event trail.",
  },
  {
    id: "change.preview",
    label: "Preview governed change",
    category: "governed-changes",
    purpose: "Preview the existing transactional literature canonicalization plan without writing canonical science.",
    boundary: "read-only",
    mcpName: "research_change_preview",
    cliCommand: "pnpm research:tool -- canonicalize --literature-run <run-id> --candidate <candidate-id> --mode preview",
    suggestedPrompt: "Preview canonicalization for <candidate-id> from literature run <run-id>; list proposed records, links, provenance, and risks without applying.",
  },
  {
    id: "change.apply",
    label: "Apply governed change",
    category: "governed-changes",
    purpose: "Apply only an exact, fresh canonicalization plan hash; cannot attest human review or promote a claim to supported.",
    boundary: "governed-write",
    mcpName: "research_change_apply",
    cliCommand: "pnpm research:tool -- canonicalize --literature-run <run-id> --candidate <candidate-id> --mode apply --plan <64-char-plan-hash>",
    suggestedPrompt: "Apply only the exact reviewed plan hash <plan-hash> for <candidate-id>. Preserve provisional status and do not attest human review.",
  },
];

export const researchToolCatalog: readonly ResearchToolCatalogEntry[] = entries;

export function getResearchToolCatalogEntry(id: string): ResearchToolCatalogEntry | undefined {
  return researchToolCatalog.find((entry) => entry.id === id);
}

export function listResearchToolCatalog(options?: { category?: ToolCategory; boundary?: ToolBoundary }): ResearchToolCatalogEntry[] {
  return researchToolCatalog.filter((entry) =>
    (!options?.category || entry.category === options.category) &&
    (!options?.boundary || entry.boundary === options.boundary),
  );
}
