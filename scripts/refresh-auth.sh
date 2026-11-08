#!/usr/bin/env bash
# Refresh the local Robinhood session token for robinhood-cli.
#
# This reuses the Robinhood web session you are already logged into, on your own
# machine. It does not log in for you, complete MFA, mint a new session, or touch
# your password. It looks at the sessions your own browser already holds, picks the
# one with the most remaining lifetime, verifies it with a single read-only accounts
# request, and only then promotes it into the local gitignored .env.
#
# Sources checked, in order (all local to this machine):
#   1. A running local debug browser, if one is reachable (opt out with ROBINHOOD_NO_CDP=1).
#      Useful because a freshly-rotated session may not have been written to disk yet.
#   2. The browser's own on-disk session storage (no browser launched, no network).
#
# This never renews or extends a session; a new lifetime only happens when you log in
# to Robinhood normally in your browser. Nothing is opened or clicked on your behalf. The
# selected token is verified live before the existing .env is replaced, and a failed check
# leaves your current .env untouched. The token is written from inside the Python helper
# and is kept out of the shell's stdout and argv so it does not land in logs.
#
# Usage:  scripts/refresh-auth.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROBINHOOD_ENV_PATH="${ROBINHOOD_ENV_PATH:-$REPO_DIR/.env}"

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
PYTHON_ENV_PATH="$(native_path "$ROBINHOOD_ENV_PATH")"
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
if [ -n "${ROBINHOOD_CHROMIUM_BASES:-}" ]; then
    case "$(uname -s)" in
        MINGW*|MSYS*|CYGWIN*) custom_base_separator=';' ;;
        *) custom_base_separator=':' ;;
    esac
    IFS="$custom_base_separator" read -r -a custom_bases <<< "$ROBINHOOD_CHROMIUM_BASES"
    for custom_base in "${custom_bases[@]}"; do
        [ -n "$custom_base" ] && leveldb_args+=(--base "$(native_path "$custom_base")")
    done
fi
"$PYTHON_BIN" "$PYTHON_REPO_DIR/scripts/extract-auth-leveldb.py" \
    "${leveldb_args[@]}" --env "$PYTHON_CANDIDATE_DIR/leveldb.env" || true

shopt -s nullglob
candidates=("$CANDIDATE_DIR"/*.env)
shopt -u nullglob
if [ "${#candidates[@]}" -eq 0 ] && [ ! -f "$ROBINHOOD_ENV_PATH" ]; then
    echo "[refresh-auth] no Robinhood auth found via installed state, CDP, Safari, or Chromium LevelDB" >&2
    exit 2
fi

# Build a private staged .env, rank the installed bearer alongside every
# discovered candidate, and reject anything that cannot survive until the next
# guardian window. No production file is touched before the staged bearer works.
STAGED_ENV="$CANDIDATE_DIR/selected.env"
PYTHON_STAGED_ENV="$(native_path "$STAGED_ENV")"
if [ -f "$ROBINHOOD_ENV_PATH" ]; then
    cp "$ROBINHOOD_ENV_PATH" "$STAGED_ENV"
else
    : > "$STAGED_ENV"
fi

python_candidates=()
if [ -f "$ROBINHOOD_ENV_PATH" ]; then
    python_candidates+=("$TARGET_ENV_PATH")
fi
for candidate in "${candidates[@]}"; do
    [ "$candidate" = "$STAGED_ENV" ] && continue
    python_candidates+=("$(native_path "$candidate")")
done
minimum_remaining="${ROBINHOOD_AUTH_MIN_REMAINING_SECONDS:-60}"
selection_output="$($PYTHON_BIN "$PYTHON_REPO_DIR/scripts/select-auth-candidate.py" \
    --target "$PYTHON_STAGED_ENV" --verify \
    --minimum-remaining-seconds "$minimum_remaining" \
    "${python_candidates[@]}")" || {
    echo "[refresh-auth] no acceptable bearer; production .env preserved" >&2
    exit 2
}

# Selection verifies the exact bearer without fallback auth or inherited cookies.
"$PYTHON_BIN" - "$PYTHON_STAGED_ENV" "$TARGET_ENV_PATH" <<'PYPROMOTE'
import os
import sys
import tempfile
from pathlib import Path

staged, target = sys.argv[1:]
Path(target).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
with tempfile.NamedTemporaryFile(dir=Path(target).parent, delete=False) as output:
    temporary = output.name
    output.write(Path(staged).read_bytes())
try:
    os.replace(temporary, target)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
try:
    os.chmod(target, 0o600)
except OSError:
    pass
PYPROMOTE
printf '%s auth_state=yes token_written=yes live_verified=yes\n' "$selection_output"

# Zayd Khan // cold // www.zayd.wtf
