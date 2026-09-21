# Local MCP server

`scripts/research-mcp.mjs` is a local stdio adapter over the same source-bound
Research Environment API used by `pnpm research:tool`. It does not copy the
vault into another database or make generated navigation files evidence.

The checked-in Codex configuration (`.codex/config.toml`) and Claude Code
configuration (`.mcp.json`) launch `scripts/run-research-mcp.ps1`. The launcher
resolves the repository independently of the client's working directory,
requires Node 22.13 or newer, and fails clearly when no compatible runtime is
available. Each client still applies its normal project trust and approval
flow.

To start it manually from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-research-mcp.ps1
```

Run `pnpm ai:doctor` to verify the portable instructions, adapters, commands,
and generated-state freshness before broad agent work. The server speaks
newline-delimited UTF-8 JSON-RPC and reserves stdout exclusively for protocol
messages. Diagnostic logs, if added later, must use stderr.
It requires `initialize` before any tool operation and rejects unknown,
missing, mistyped, or out-of-range tool arguments instead of silently coercing
them.

## Tool boundary

The default tool surface is deliberately small and bounded: project brief,
search, selected record sections, graph traversal, evidence dossier, next
work, task context, figures, run status, and a read-only visual-companion link.
Every normal retrieval response is source-hash bound. A stale generated index
stops the request and directs the agent to refresh it; it never falls back to
an unbounded vault dump.

`research_show_in_workspace` validates a project, stable record ID, view, graph
scope, and expanded-detail state, then returns a loopback deep link. It does
not launch a browser or server itself. Capable clients may open or reuse the
link in an embedded browser; all others should show the URL as a fallback.
See `docs/VISUAL_COMPANION.md`.

`research_change_preview` and `research_change_apply` reuse the existing local
transactional canonicalization route. Apply requires the exact SHA-256 plan
hash returned by preview and cannot assert human review or promote a claim.
The local Research OS dev server must be running for those two governed tools.

`research_run_cancel` creates a durable cancellation request only. It never
deletes an artifact or rolls back canonical material.

## Figure policy

`research_figures` returns manifest metadata only. A model should retrieve an
image only when its visual content is necessary to answer a specific question;
otherwise use caption, locator, source URL, and linked evidence records.

## Compatibility and durable state

The adapter targets MCP `2025-11-25` stdio transport. MCP task support is not
advertised because Research OS run IDs and checkpoints remain the durable
recovery mechanism while the protocol task extension is experimental.
