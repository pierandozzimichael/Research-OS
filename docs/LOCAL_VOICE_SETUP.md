# Local voice setup boundary

Research OS supports push-to-talk transcription through a loopback-only
Whisper-compatible HTTP service. Voice is optional; the microphone control
remains disabled when the service is not available.

## Expected service

- Default endpoint: `http://127.0.0.1:8080/inference`
- Override the loopback base URL with `RESEARCH_OS_WHISPER_URL` before launching
  Research OS.
- The service must accept a multipart PCM WAV file and return JSON containing a
  `text` field. The official whisper.cpp server documents this endpoint:
  <https://github.com/ggml-org/whisper.cpp/blob/master/examples/server/README.md>

## Enforced application limits

- Microphone access begins only after an explicit browser permission action.
- Capture is push-to-talk and stops automatically at 30 seconds.
- The server accepts only RIFF/WAVE PCM with bounded channels, sample rate,
  sample width, duration, and a maximum 12 MB request body.
- Audio is kept in memory, sent only to the configured loopback endpoint, and
  discarded immediately after transcription.
- The transcript is never submitted automatically. It appears in the normal
  composer for review and editing first.
- Spoken responses are not implemented. They should remain a separate opt-in
  output adapter if added later.

Do not expose the Whisper server to a LAN or the public Internet. The official
server documentation warns that uploaded audio should be treated as untrusted;
Research OS therefore validates and bounds the payload before forwarding it.
