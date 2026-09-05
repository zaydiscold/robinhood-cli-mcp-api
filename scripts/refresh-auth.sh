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
# Robinhood's web app keeps its auth in localStorage["web:auth_state"], and Chromium
# periodically flushes that state to LevelDB. This command does not renew a bearer:
# it ranks existing browser/session candidates, validates the winner live, and only
# then promotes it. A new lifetime requires Robinhood to mint a new token at login.
#
# Why not CDP / the OAuth refresh-token grant?
#   - CDP (browser-harness) needs a one-time Chrome "Allow" click on reconnect — noise.
#   - The OAuth refresh_token grant rotates the refresh token on use, which can silently
#     invalidate the live browser session. A local disk read touches neither.
# Discovery never opens a browser. The final staged bearer is verified with one
# read-only accounts request before the production .env is replaced.
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

# Native Python on Windows does not understand MSYS paths such as /c/Users/…
# (it otherwise receives them as C:\\c\\Users/…). Keep POSIX paths for Bash,
# but convert every path passed across the Bash → native-Python boundary.
native_path() {
    case "$(uname -s)" in
        MINGW*|MSYS*|CYGWIN*) cygpath -w "$1" ;;
        *) printf '%s\n' "$1" ;;
    esac
}

# Detect OS and pick the right Python binary + Chromium base paths.
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
        # Windows Chromium profiles: %LOCALAPPDATA%\\<browser>\\User Data.
        # In MSYS/git-bash, LOCALAPPDATA may be native or POSIX; normalize it first.
        if [ -n "${LOCALAPPDATA:-}" ]; then
            LOCALAPPDATA_POSIX="$(cygpath -u "$LOCALAPPDATA" 2>/dev/null || printf '%s' "$LOCALAPPDATA")"
        else
            LOCALAPPDATA_POSIX="$HOME/AppData/Local"
        fi
        CHROME_BASE="$LOCALAPPDATA_POSIX/Google/Chrome/User Data"
        BRAVE_BASE="$LOCALAPPDATA_POSIX/BraveSoftware/Brave-Browser/User Data"
        EDGE_BASE="$LOCALAPPDATA_POSIX/Microsoft/Edge/User Data"
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

# These values are consumed by native Python scripts below. On Windows they
# must be native drive paths; Bash still retains REPO_DIR for shell operations.
PYTHON_REPO_DIR="$(native_path "$REPO_DIR")"
PYTHON_ENV_PATH="$(native_path "$REPO_DIR/.env")"
CHROME_BASE="$(native_path "$CHROME_BASE")"
BRAVE_BASE="$(native_path "${BRAVE_BASE:-}")"
EDGE_BASE="$(native_path "${EDGE_BASE:-}")"
export CHROME_BASE
export BRAVE_BASE
export EDGE_BASE

# --- Collect every available auth source, then choose the furthest expiry ---
# A stale debug profile can remain reachable while the user has just logged in
# through normal Chrome or Safari. Never stop at the first valid token: collect
# private candidate env files, compare JWT exp locally, and write only the winner.
TARGET_ENV_PATH="$PYTHON_ENV_PATH"
CANDIDATE_DIR="$(mktemp -d "/tmp/robinhood-auth.XXXXXX")"
PYTHON_CANDIDATE_DIR="$(native_path "$CANDIDATE_DIR")"
trap 'rm -rf "$CANDIDATE_DIR"' EXIT

cdp_collect() {
    [ -n "${ROBINHOOD_NO_CDP:-}" ] && return 0
    local helper="$PYTHON_REPO_DIR/scripts/extract-auth-cdp.py"
    [ -f "$REPO_DIR/scripts/extract-auth-cdp.py" ] || return 0
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
        "$PYTHON_BIN" "$helper" --port "$port" --env "$PYTHON_CANDIDATE_DIR/cdp-$port.env" || true
    done
}

cdp_collect

if [ "$(uname -s)" = "Darwin" ] && [ -f "$REPO_DIR/scripts/extract-auth-safari.py" ]; then
    "$PYTHON_BIN" "$PYTHON_REPO_DIR/scripts/extract-auth-safari.py" \
        --env "$PYTHON_CANDIDATE_DIR/safari.env" || true
fi

leveldb_args=()
[ -n "${CHROME_BASE:-}" ] && leveldb_args+=(--base "$CHROME_BASE")
[ -n "${BRAVE_BASE:-}" ] && leveldb_args+=(--base "$BRAVE_BASE")
[ -n "${EDGE_BASE:-}" ] && leveldb_args+=(--base "$EDGE_BASE")
"$PYTHON_BIN" "$PYTHON_REPO_DIR/scripts/extract-auth-leveldb.py" \
    "${leveldb_args[@]}" --env "$PYTHON_CANDIDATE_DIR/leveldb.env" || true

shopt -s nullglob
candidates=("$CANDIDATE_DIR"/*.env)
shopt -u nullglob
if [ "${#candidates[@]}" -eq 0 ] && [ ! -f "$REPO_DIR/.env" ]; then
    echo "[refresh-auth] no Robinhood auth found via installed state, CDP, Safari, or Chromium LevelDB" >&2
    exit 2
fi

# Build a private staged .env, rank the installed bearer alongside every
# discovered candidate, and reject anything that cannot survive until the next
# guardian window. No production file is touched before the staged bearer works.
STAGED_ENV="$CANDIDATE_DIR/selected.env"
PYTHON_STAGED_ENV="$(native_path "$STAGED_ENV")"
if [ -f "$REPO_DIR/.env" ]; then
    cp "$REPO_DIR/.env" "$STAGED_ENV"
else
    : > "$STAGED_ENV"
fi

python_candidates=()
if [ -f "$REPO_DIR/.env" ]; then
    python_candidates+=("$TARGET_ENV_PATH")
fi
for candidate in "${candidates[@]}"; do
    [ "$candidate" = "$STAGED_ENV" ] && continue
    python_candidates+=("$(native_path "$candidate")")
done
minimum_remaining="${ROBINHOOD_AUTH_MIN_REMAINING_SECONDS:-345600}"
selection_output="$($PYTHON_BIN "$PYTHON_REPO_DIR/scripts/select-auth-candidate.py" \
    --target "$PYTHON_STAGED_ENV" \
    --minimum-remaining-seconds "$minimum_remaining" \
    "${python_candidates[@]}")" || {
    echo "[refresh-auth] no acceptable bearer; production .env preserved" >&2
    exit 2
}

# Live validation uses the staged bearer through the environment. dotenv does
# not override it, so the repo's current .env remains untouched during proof.
set -a
# shellcheck disable=SC1090
source "$STAGED_ENV"
set +a
VERIFY_JSON="$CANDIDATE_DIR/accounts.json"
VERIFY_ERR="$CANDIDATE_DIR/accounts.err"
if ! node "$REPO_DIR/cli/dist/index.js" accounts --json >"$VERIFY_JSON" 2>"$VERIFY_ERR"; then
    echo "[refresh-auth] staged bearer failed live accounts read; production .env preserved" >&2
    exit 3
fi
"$PYTHON_BIN" - "$PYTHON_CANDIDATE_DIR/accounts.json" <<'PYVERIFY' || {
import json
import sys

path = sys.argv[1]
try:
    value = json.load(open(path, encoding="utf-8"))
except (OSError, json.JSONDecodeError) as exc:
    raise SystemExit(f"invalid accounts verification: {type(exc).__name__}")
if not isinstance(value, list) or not value:
    raise SystemExit("accounts verification returned no accounts")
print(f"accounts_verified={len(value)}")
PYVERIFY
    echo "[refresh-auth] staged bearer returned invalid account data; production .env preserved" >&2
    exit 3
}

"$PYTHON_BIN" - "$PYTHON_STAGED_ENV" "$TARGET_ENV_PATH" <<'PYPROMOTE'
import os
import sys

staged, target = sys.argv[1:]
os.replace(staged, target)
try:
    os.chmod(target, 0o600)
except OSError:
    pass
PYPROMOTE
printf '%s auth_state=yes token_written=yes live_verified=yes\n' "$selection_output"

# Zayd Khan // cold // www.zayd.wtf
