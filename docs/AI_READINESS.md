# AI readiness contract

Research OS exposes a bounded, machine-readable readiness check so a supported
agent can establish whether the workspace is safe to use before loading broad
scientific context.

## Commands

- `pnpm ai:doctor` reports required instructions, registered projects,
  generated-context freshness, schema and tool commands, state boundaries, and
  optional client adapters.
- `pnpm ai:doctor -- --json` returns the same result as
  `research-os-readiness-v1` JSON.
- `pnpm ai:manifest` atomically regenerates root `AI_MANIFEST.json` from
  `package.json`, `projects.json`, and the research tool catalog, then runs the
  readiness check.

The check performs local file reads only. It does not launch the application,
connect to the network, start an MCP server, or mutate scientific records. Its
default hard limit is 10 seconds. `--timeout-ms=<milliseconds>` may set a value
from 1,000 through 30,000 milliseconds; a timeout exits with status 124.

## Status semantics

- `pass` confirms a required local contract is available.
- `warn` identifies a recommended orientation file or optional client adapter.
  Warnings do not make the workspace unusable.
- `fail` identifies a missing required instruction, missing project/dashboard,
  unavailable command, or stale generated navigation. Any failure makes
  `ready` false and exits nonzero.

Client adapters remain warnings until that client is deliberately supported and
tested. Their absence must not encourage an agent to invent configuration.

## Information-state boundary

`AI_MANIFEST.json` is a routing contract, not scientific evidence. It labels
canonical, generated, operational, staging, proposal, and scratch state, and
enumerates tool write boundaries. It intentionally has no generated timestamp,
so identical canonical configuration produces an identical manifest.

The per-project generated `MANIFEST.json` remains the freshness gate for the
canonical Markdown source hash. If the readiness check reports it stale, run
`pnpm ai:sync` before using the research tools.
