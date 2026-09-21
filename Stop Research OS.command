#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec /bin/bash "$ROOT/scripts/stop-research-os.sh"
