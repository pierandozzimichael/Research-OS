#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMMAND_TIMEOUT_SECONDS="${COMMAND_TIMEOUT_SECONDS:-240}"
NODE_MIN_MAJOR=22
NODE_MIN_MINOR=13

say() { printf '%s\n' "$*"; }
fail() { say "Research OS installer: $*" >&2; exit 1; }

run_bounded() {
  local label="$1"; shift
  local log_file="$ROOT/.research-os-${label//[^A-Za-z0-9._-]/-}.log"
  rm -f "$log_file"
  ( "$@" >"$log_file" 2>&1 ) &
  local pid=$!
  local started
  started="$(date +%s)"
  while kill -0 "$pid" 2>/dev/null; do
    if (( $(date +%s) - started >= COMMAND_TIMEOUT_SECONDS )); then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -KILL "$pid" 2>/dev/null || true
      fail "$label timed out after ${COMMAND_TIMEOUT_SECONDS}s. Details: $log_file"
    fi
    sleep 1
  done
  local status=0
  wait "$pid" || status=$?
  if [[ -s "$log_file" ]]; then cat "$log_file"; fi
  if (( status != 0 )); then fail "$label failed with exit code $status. Details: $log_file"; fi
}

node_version_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local version major minor
  version="$(node -p 'process.versions.node' 2>/dev/null || true)"
  major="${version%%.*}"
  minor="${version#*.}"; minor="${minor%%.*}"
  [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ ]] || return 1
  (( major > NODE_MIN_MAJOR || (major == NODE_MIN_MAJOR && minor >= NODE_MIN_MINOR) ))
}

ensure_node() {
  if node_version_ok; then return; fi
  if command -v brew >/dev/null 2>&1; then
    say "Node.js 22.13+ was not found. Installing the supported Node 22 formula with Homebrew..."
    run_bounded "brew-node-install" brew install node@22
    local brew_node
    brew_node="$(brew --prefix node@22 2>/dev/null || true)"
    if [[ -n "$brew_node" && -x "$brew_node/bin/node" ]]; then
      export PATH="$brew_node/bin:$PATH"
    fi
  fi
  node_version_ok || fail "Node.js 22.13 or newer is required. Install it from https://nodejs.org/ (or install Homebrew, then rerun this installer)."
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then return; fi
  command -v corepack >/dev/null 2>&1 || fail "pnpm was not found. Install Node.js 22.13+ from https://nodejs.org/ and rerun this installer."
  say "Enabling the locked pnpm version..."
  run_bounded "corepack-enable" corepack enable
  command -v pnpm >/dev/null 2>&1 || fail "Corepack could not expose pnpm. Run 'corepack enable' and rerun this installer."
}

ensure_node
ensure_pnpm
cd "$ROOT"
say "Research OS lab setup"
say "  Node.js $(node -p 'process.versions.node')"
say "  Project $ROOT"
say "Installing locked dependencies (bounded to ${COMMAND_TIMEOUT_SECONDS}s)..."
run_bounded "pnpm-install" pnpm install --frozen-lockfile
say "Refreshing AI navigation and checking the project..."
run_bounded "ai-sync" pnpm ai:sync
run_bounded "ai-manifest" pnpm ai:manifest
run_bounded "schema-validate" pnpm schema:validate
run_bounded "ai-doctor" pnpm ai:doctor
chmod +x "$ROOT"/*.command "$ROOT"/scripts/*.sh 2>/dev/null || true
say "Installation complete. Double-click 'Start Research OS.command' or run it from Terminal."
