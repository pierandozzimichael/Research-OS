#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/.apoe-research-os.pid"
PORT_FILE="$ROOT/.apoe-research-os.port"
if [[ -f "$PID_FILE" ]]; then
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ "$pid" =~ ^[0-9]+$ ]]; then kill "$pid" 2>/dev/null || true; fi
fi
rm -f "$PID_FILE" "$PORT_FILE"
printf '%s\n' 'Research OS stopped.'
