# Visual companion

Research OS can act as the visible half of an agent conversation without
embedding or replacing the user's AI provider. The agent reasons through the
canonical Markdown and bounded MCP tools; when a visual would help, it can ask
the client to open the relevant workspace state.

## Deep-link contract

Workspace links are loopback-only and use these optional query parameters:

| Parameter | Meaning | Example |
| --- | --- | --- |
| `project` | Project ID from `projects.json` | `demo-evidence` |
| `view` | Stable workspace view slug | `map`, `library`, `work`, `agent` |
| `record` | Stable record ID | `IDEA-003` |
| `scope` | Map neighborhood | `direct`, `2-hop`, `all` |
| `expanded` | Expanded detail panel | `1` |

Example:

```text
http://127.0.0.1:3000/?project=demo-evidence&view=map&record=PAP-901&scope=direct&expanded=1
```

The browser also keeps these parameters synchronized as the user changes the
active project, view, record, scope, or detail state. This makes the current
visual state shareable and recoverable without creating a second database.

## Agent behavior

Call `research_show_in_workspace` only when a visual map, record, or evidence
sequence materially improves the answer. The tool validates the requested
record against the selected project and returns:

- a local URL;
- the normalized workspace state;
- a client action that prefers reusing an embedded browser;
- fallback text for clients that cannot open it.

Clients should follow this order:

1. Reuse an existing Research OS embedded-browser tab when possible.
2. Otherwise open the returned link in an embedded browser.
3. Otherwise show a clickable URL and continue the answer.

Opening the visual companion is never required for scientific retrieval. Do
not open a tab for every MCP call, do not block indefinitely waiting for the
website, and do not silently start duplicate development servers.

## Authority and privacy

The URL contains stable IDs and UI state, not record bodies. It is restricted
to `localhost`, `127.0.0.1`, or loopback IPv6. The browser remains a view and
editor over canonical Markdown. A highlighted path is a presentation aid, not
new evidence or a scientific status change.

## Current limitation

Whether a link opens inside ChatGPT, Codex, Claude, or another client depends
on that client's browser capabilities and user permissions. The checked-in
instructions can request and normalize the behavior, but cannot guarantee the
same window layout in every client. A dedicated ChatGPT App is therefore a
possible future adapter, not a requirement for this provider-neutral core.
