#!/usr/bin/env bash
# Refresh the brokerage bearer token for robinhood-cli — fully agentic.
#
# Token source, in priority order:
#   1. LIVE read over CDP from a running debug Chrome (chrome-debug / port 9222):
#      reads localStorage["web:auth_state"] straight from the tab's memory — the
#      authoritative, always-current value. Fixes the case where Chrome hasn't
#      flushed a freshly-rotated token to disk yet. Opt out with ROBINHOOD_NO_CDP=1.
#   2. FALLBACK: scan Chrome's on-disk localStorage LevelDB (browser-free, zero
#      network) — used headless/offline or when no debug Chrome is reachable.
#
# Robinhood's web app keeps its auth in localStorage["web:auth_state"], and Chrome
# continuously flushes that to disk as a LevelDB store. The web app rotates its own
# access_token automatically (~7.8d lifetime) while you use the site, so the freshest
# token is always sitting on disk. We read it straight from there.
#
# Why not CDP / the OAuth refresh-token grant?
#   - CDP (browser-harness) needs a one-time Chrome "Allow" click on reconnect — noise.
#   - The OAuth refresh_token grant rotates the refresh token on use, which can silently
#     invalidate the live browser session. A local disk read touches neither.
# This script makes ZERO network calls and never opens a browser.
#
# Chrome's localStorage split-encodes: the KEY (web:auth_state) is UTF-16 but the VALUE
# JSON is stored single-byte (Latin-1) because it's ASCII — so we scan bytes for the
# access_token/refresh_token object directly.
#
# The token value is written from inside the python process — it never touches stdout/argv.
#
# Usage:  scripts/refresh-auth.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROBINHOOD_ENV_PATH="$REPO_DIR/.env"

# Detect OS and pick the right Python binary + Chrome base path.
case "$(uname -s)" in
    Darwin)
        PYTHON_BIN="python3"
        CHROME_BASE="$HOME/Library/Application Support/Google/Chrome"
        BRAVE_BASE="$HOME/Library/Application Support/BraveSoftware/Brave-Browser"
        EDGE_BASE="$HOME/Library/Application Support/Microsoft Edge"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        # git-bash / MSYS2 / Cygwin on Windows
        if command -v python >/dev/null 2>&1; then
            PYTHON_BIN="python"
        elif command -v python3 >/dev/null 2>&1; then
            PYTHON_BIN="python3"
        else
            echo "ERROR: python not on PATH" >&2
            exit 1
        fi
        # Windows Chrome profile: %LOCALAPPDATA%\Google\Chrome\User Data
        # In MSYS/git-bash, LOCALAPPDATA is already set. Fall back to constructing from HOME.
        if [ -n "${LOCALAPPDATA:-}" ]; then
            CHROME_BASE="$(cygpath -u "$LOCALAPPDATA" 2>/dev/null || echo "$LOCALAPPDATA")/Google/Chrome/User Data"
        else
            CHROME_BASE="$HOME/AppData/Local/Google/Chrome/User Data"
        fi
        ;;
    Linux)
        PYTHON_BIN="python3"
        CHROME_BASE="$HOME/.config/google-chrome"
        ;;
    *)
        echo "ERROR: unsupported OS ($(uname -s))" >&2
        exit 1
        ;;
esac

# Verify the binary exists.
command -v "$PYTHON_BIN" >/dev/null || { echo "ERROR: $PYTHON_BIN not on PATH" >&2; exit 1; }

export CHROME_BASE
export BRAVE_BASE
export EDGE_BASE

# --- Collect every available auth source, then choose the furthest expiry ---
# A stale debug profile can remain reachable while the user has just logged in
# through normal Chrome or Safari. Never stop at the first valid token: collect
# private candidate env files, compare JWT exp locally, and write only the winner.
TARGET_ENV_PATH="$ROBINHOOD_ENV_PATH"
CANDIDATE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/robinhood-auth.XXXXXX")"
trap 'rm -rf "$CANDIDATE_DIR"' EXIT

cdp_collect() {
    [ -n "${ROBINHOOD_NO_CDP:-}" ] && return 0
    local helper="$REPO_DIR/scripts/extract-auth-cdp.py"
    [ -f "$helper" ] || return 0
    "$PYTHON_BIN" -c 'import websockets' >/dev/null 2>&1 || {
        echo "[refresh-auth] CDP support unavailable; continuing with other sources" >&2
        return 0
    }

    local configured="${ROBINHOOD_CDP_PORTS:-${ROBINHOOD_CDP_PORT:-}}"
    local discovered
    discovered=$(CHROMIUM_BASES="${ROBINHOOD_CHROMIUM_BASES:-}" "$PYTHON_BIN" <<'PYPORTS'
import os
roots = [os.environ.get(k) for k in ("CHROME_BASE", "BRAVE_BASE", "EDGE_BASE")]
roots += [p for p in os.environ.get("CHROMIUM_BASES", "").split(os.pathsep) if p]
seen = set()
for root in filter(None, roots):
    path = os.path.join(root, "DevToolsActivePort")
    try:
        port = int(open(path, encoding="utf-8").readline().strip())
    except (OSError, ValueError):
        continue
    if port not in seen:
        seen.add(port)
        print(port)
PYPORTS
)

    local ports="$configured $discovered 9222"
    local tried=" " port
    for port in $ports; do
        case "$port" in *[!0-9]*|'') continue ;; esac
        case "$tried" in *" $port "*) continue ;; esac
        tried="$tried$port "
        "$PYTHON_BIN" "$helper" --port "$port" --env "$CANDIDATE_DIR/cdp-$port.env" || true
    done
}

cdp_collect

if [ "$(uname -s)" = "Darwin" ] && [ -f "$REPO_DIR/scripts/extract-auth-safari.py" ]; then
    "$PYTHON_BIN" "$REPO_DIR/scripts/extract-auth-safari.py" \
        --env "$CANDIDATE_DIR/safari.env" || true
fi

leveldb_args=()
[ -n "${CHROME_BASE:-}" ] && leveldb_args+=(--base "$CHROME_BASE")
[ -n "${BRAVE_BASE:-}" ] && leveldb_args+=(--base "$BRAVE_BASE")
[ -n "${EDGE_BASE:-}" ] && leveldb_args+=(--base "$EDGE_BASE")
"$PYTHON_BIN" "$REPO_DIR/scripts/extract-auth-leveldb.py" \
    "${leveldb_args[@]}" --env "$CANDIDATE_DIR/leveldb.env" || true

shopt -s nullglob
candidates=("$CANDIDATE_DIR"/*.env)
shopt -u nullglob
if [ "${#candidates[@]}" -eq 0 ]; then
    echo "[refresh-auth] no valid Robinhood auth found via CDP, Safari, or Chromium LevelDB" >&2
    exit 2
fi
"$PYTHON_BIN" "$REPO_DIR/scripts/select-auth-candidate.py" \
    --target "$TARGET_ENV_PATH" "${candidates[@]}"

# Zayd Khan // cold // www.zayd.wtf
