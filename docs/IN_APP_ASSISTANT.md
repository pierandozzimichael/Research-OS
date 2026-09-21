# In-app research assistant boundary

The in-app assistant is a provider-neutral control surface over an agent the
user already configured. It is not a second scientific database and does not
make its transient conversation canonical.

## Implemented providers and presentation layer

- `Ctrl J` or **Ask AI** opens a compact project-aware drawer.
- The active project, optional focused stable ID, user question, and at most six
  recent in-memory turns form the request.
- A provider adapter launches Codex through the user's existing Codex
  authentication in a read-only sandbox with a two-minute hard limit. Before
  first use for a project, the drawer explicitly asks permission to send its
  bounded context to the configured provider.
- The same drawer detects Ollama on loopback, offers a bounded **Start local
  models** action when Ollama is installed but stopped, and exposes the actual
  installed model names instead of silently choosing an imaginary default.
- Local models receive a compact project brief, ranked canonical records, and,
  when focused, the selected record, two-hop typed graph, and evidence dossier.
  They do not receive an unbounded vault dump or filesystem write authority.
- The response is schema-bound to prose, canonical stable-ID citations, and
  presentation-only actions: open one record, reveal a one/two-hop path, or
  present an ordered two-to-eight-node evidence path.
- A guided path steps through nodes, recenters the map, illuminates completed,
  current, and upcoming records, and provides Back, Pause, Next, Finish, and
  End controls. Reduced-motion mode switches steps without animation.
- A visible **Stop** control aborts the browser request. Codex termination kills
  the complete Windows descendant process tree; Ollama cancels the in-flight
  local generation without stopping the reusable local server.
- The server discards citations and UI actions for IDs that are not present in
  the selected project.
- Closing or refreshing the browser discards the conversation. Canonical
  Markdown changes only through the existing governed record workflows.

Claude Code is detected but intentionally unavailable until the real CLI is
installed on the machine. It must produce the same response contract and pass
the same authority, privacy, timeout, and cancellation tests; provider-specific
behavior must not leak into the UI contract.

## Current provider verification

- The installed Codex CLI accepts the strict response schema after replacing an
  unsupported `oneOf` action union with a portable action envelope. A
  non-sensitive structured-output smoke test completed successfully.
- A full private-vault Codex evaluation was not transmitted automatically from
  the controlled development session. It remains a deliberate user-approved
  test because bounded project context can leave the device.
- Local `llama3.1:latest` completed a representative weak-arrow question in
  93.6 seconds and returned three validated canonical citations. The installed
  llama.cpp grammar rejected the full nested schema, so Ollama retries in JSON
  mode and the server applies the same strict allow-list validator afterward.
- The Windows cancellation fixture verifies that a stopped spawned provider and
  its descendant process are no longer running.

## Voice architecture

Voice is deliberately separate from reasoning:

1. A speech layer converts microphone audio to text.
2. The normal provider-neutral assistant request runs against Codex, Claude, or
   a future local agent.
3. The same presentation actions animate the Research OS interface.
4. An optional speech layer reads the answer aloud.

This permits local transcription or operating-system dictation without forcing
the lab to use one reasoning provider. OpenAI Realtime can later be offered as
an opt-in low-latency speech-to-speech adapter, but it requires its own API
credentials, billing, privacy disclosure, and function-call bridge; a Codex
subscription is not treated as an interchangeable Realtime API credential.

The local voice slice is implemented behind a truthful readiness check. It
requests microphone permission explicitly, records only while the user holds
the control, stops at 30 seconds, validates a bounded PCM WAV payload, sends it
only to a loopback Whisper endpoint, places the transcript in the composer for
review, and retains no audio file. The control stays disabled when the local
Whisper service is absent. See `LOCAL_VOICE_SETUP.md`.

## Not allowed

- The drawer may not mark a paper human reviewed or promote a claim.
- UI actions may not write files, apply canonicalization, or hide uncertainty.
- Provider output may not become evidence merely because it cites a stable ID.
- Voice recording may not start before the user explicitly enables a chosen
  transcription provider and sees its privacy boundary.
- A missing provider must be shown honestly; the UI may not simulate an answer.

## Next gates

1. Run a user-approved private-vault Codex evaluation and add latency/token
   measurements to the agent evaluation set.
2. Install and validate the loopback Whisper dependency on a pilot machine.
3. Implement the Claude Code adapter only after its CLI is installed and its
   current non-interactive streaming contract is tested locally.
4. Benchmark smaller local models and context packets; 93.6 seconds is a
   compatibility result, not a polished interaction target.
5. Persist only an optional non-canonical session receipt, never hidden
   chain-of-thought or a second copy of scientific state.
