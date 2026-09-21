#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/.apoe-research-os.pid"
PORT_FILE="$ROOT/.apoe-research-os.port"
LOG_FILE="$ROOT/.apoe-research-os.log"

fail() { printf 'Research OS: %s\n' "$*" >&2; exit 1; }
port_open() {
  if command -v nc >/dev/null 2>&1; then
    nc -z -w 1 127.0.0.1 "$1" >/dev/null 2>&1
  else
    curl -sS --connect-timeout 1 --max-time 2 "http://127.0.0.1:$1/" >/dev/null 2>&1
  fi
}
site_ready() { curl -fsS --max-time 2 "http://127.0.0.1:$1/" 2>/dev/null | grep -q 'Research OS'; }
api_ready() { curl -fsS --max-time 2 "http://127.0.0.1:$1/api/local-session" 2>/dev/null | grep -q 'writeToken'; }

open_site() {
  local url="$1"
  if command -v open >/dev/null 2>&1; then open "$url"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1 & fi
}

if [[ -f "$PID_FILE" && -f "$PORT_FILE" ]]; then
  saved_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  saved_port="$(cat "$PORT_FILE" 2>/dev/null || true)"
  if [[ "$saved_pid" =~ ^[0-9]+$ && "$saved_port" =~ ^[0-9]+$ ]] && kill -0 "$saved_pid" 2>/dev/null && api_ready "$saved_port" && site_ready "$saved_port"; then
    open_site "http://127.0.0.1:$saved_port/"
    exit 0
  fi
fi
rm -f "$PID_FILE" "$PORT_FILE"

command -v node >/dev/null 2>&1 || fail "Node.js 22.13+ is required. Run 'Install Research OS.command' first."
command -v pnpm >/dev/null 2>&1 || fail "pnpm is required. Run 'Install Research OS.command' first."
node -e "const [major,minor]=process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 13)) process.exit(1)" || fail "Node.js 22.13+ is required."

port=""
for candidate in $(seq 3000 3020); do
  if ! port_open "$candidate"; then port="$candidate"; break; fi
done
[[ -n "$port" ]] || fail "No free local port was found between 3000 and 3020."

mkdir -p "$ROOT/.wrangler"
cd "$ROOT"
node scripts/check-private-build.mjs public
node scripts/build-ai-index.mjs
nohup node node_modules/vinext/dist/cli.js dev --hostname 127.0.0.1 --port "$port" >"$LOG_FILE" 2>&1 &
pid=$!
printf '%s\n' "$pid" >"$PID_FILE"
printf '%s\n' "$port" >"$PORT_FILE"

ready=0
for _ in $(seq 1 116); do
  if ! kill -0 "$pid" 2>/dev/null; then break; fi
  if port_open "$port" && api_ready "$port" && site_ready "$port"; then ready=1; break; fi
  sleep 0.5
done
if (( ready == 0 )); then
  kill "$pid" 2>/dev/null || true
  rm -f "$PID_FILE" "$PORT_FILE"
  fail "The server did not become ready within 58 seconds. Details: $LOG_FILE"
fi
open_site "http://127.0.0.1:$port/"
