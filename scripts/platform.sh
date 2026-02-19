#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/apps/desktop"
DEFAULT_WEB_PORT=5173

usage() {
  cat <<'EOF'
Usage:
  scripts/platform.sh mac-build
  scripts/platform.sh web-dev [--port <port>]

Commands:
  mac-build             Build macOS app via Tauri and open bundle directory.
  web-dev               Start local web dev server with port-occupancy check.

Examples:
  scripts/platform.sh mac-build
  scripts/platform.sh web-dev
  scripts/platform.sh web-dev --port 5186
EOF
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

ensure_desktop_dir() {
  [[ -d "$DESKTOP_DIR" ]] || fail "Desktop project not found: $DESKTOP_DIR"
}

port_in_use() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

print_port_usage() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN || true
}

run_mac_build() {
  ensure_desktop_dir

  printf '[platform] Building macOS app...\n'
  npm --prefix "$DESKTOP_DIR" run tauri:build

  local bundle_dir="$DESKTOP_DIR/src-tauri/target/release/bundle"
  if [[ -d "$bundle_dir" ]]; then
    printf '[platform] Opening build directory: %s\n' "$bundle_dir"
    open "$bundle_dir"
  else
    fail "Build bundle directory not found: $bundle_dir"
  fi
}

run_web_dev() {
  ensure_desktop_dir

  local port="$DEFAULT_WEB_PORT"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --port)
        shift
        [[ $# -gt 0 ]] || fail "Missing value for --port"
        port="$1"
        ;;
      *)
        fail "Unknown option for web-dev: $1"
        ;;
    esac
    shift
  done

  [[ "$port" =~ ^[0-9]+$ ]] || fail "Port must be a number: $port"
  (( port > 0 && port < 65536 )) || fail "Port out of range: $port"

  if port_in_use "$port"; then
    printf 'Error: Port %s is already in use.\n' "$port" >&2
    print_port_usage "$port"
    exit 1
  fi

  printf '[platform] Starting web dev server on http://127.0.0.1:%s\n' "$port"
  npm --prefix "$DESKTOP_DIR" run dev -- --host 127.0.0.1 --port "$port"
}

main() {
  local command="${1:-}"
  case "$command" in
    mac-build)
      shift
      run_mac_build "$@"
      ;;
    web-dev)
      shift
      run_web_dev "$@"
      ;;
    -h|--help|help)
      usage
      ;;
    "")
      usage
      exit 1
      ;;
    *)
      fail "Unknown command: $command"
      ;;
  esac
}

main "$@"
