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

# --- CDP-first (live-memory) read -------------------------------------------
# The disk scan below reads Chrome's on-disk LevelDB, which Chrome flushes
# LAZILY — so a token that rotated minutes ago (or a fresh login) may not be on
# disk yet, and the scan finds nothing even though you're logged in. When a
# debug Chrome is reachable (chrome-debug / --remote-debugging-port=9222) we
# instead read localStorage["web:auth_state"] straight from the LIVE tab over
# CDP: authoritative, always current. Populates RH_CDP_JSON for the python
# below; on any failure we fall through to the disk scan (headless/offline path).
# Opt out with ROBINHOOD_NO_CDP=1.
cdp_try() {
    [ -n "${ROBINHOOD_NO_CDP:-}" ] && return 0
    command -v curl >/dev/null || return 0
    local port="${ROBINHOOD_CDP_PORT:-9222}"
    curl -fsS --max-time 2 "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1 || return 0
    command -v browser-harness-js >/dev/null || return 0
    browser-harness-js --start >/dev/null 2>&1 || return 0

    local payload repl_url log b64
    repl_url="http://127.0.0.1:${CDP_REPL_PORT:-9876}"
    log="${CDP_REPL_LOG:-/tmp/browser-harness-js.log}"
    payload='
try { await session.Target.getTargets(); } catch (e) {
  const ws = (await (await fetch("http://127.0.0.1:'"${port}"'/json/version")).json()).webSocketDebuggerUrl;
  await session.connect({wsUrl: ws, timeoutMs: 30000});
}
let ts = await session.Target.getTargets();
let rh = ts.targetInfos.find(t => t.type === "page" && t.url.includes("robinhood.com"));
let made = false;
if (!rh) {
  const {targetId} = await session.Target.createTarget({url: "https://robinhood.com/", background: true});
  made = true; await new Promise(r => setTimeout(r, 6000));
  ts = await session.Target.getTargets();
  rh = ts.targetInfos.find(t => t.targetId === targetId);
}
await session.use(rh.targetId);
const res = await session.Runtime.evaluate({expression: "localStorage.getItem(\"web:auth_state\") || \"\"", returnByValue: true});
if (made) { try { await session.Target.closeTarget({targetId: rh.targetId}); } catch (e) {} }
console.log("RHCDP_OUT:" + (res.result.value ? Buffer.from(res.result.value).toString("base64") : "MISSING"));
"done"'
    curl -fsS --max-time 60 --data-binary "$payload" "$repl_url/eval" >/dev/null 2>&1 || return 0
    b64=$(grep 'RHCDP_OUT:' "$log" 2>/dev/null | tail -1 | sed 's/.*RHCDP_OUT://')
    [ -z "$b64" ] || [ "$b64" = "MISSING" ] && return 0
    RH_CDP_JSON=$(printf '%s' "$b64" | base64 -d 2>/dev/null) || return 0
    export RH_CDP_JSON
    echo "[refresh-auth] token read live via CDP (port ${port})"
}
cdp_try || true

# Python prefers RH_CDP_JSON (live) when present; else does the disk scan. It
# writes .env, chmods it, and prints the status — so the token value never
# passes through the shell. Heredoc goes straight to python (no nesting inside
# $(), which trips macOS bash 3.2's paren scanner).
"$PYTHON_BIN" << 'PYEOF'
import re, json, glob, os, sys, datetime

env_path = os.environ["ROBINHOOD_ENV_PATH"]
base = os.environ.get("CHROME_BASE")
brave = os.environ.get("BRAVE_BASE")
edge = os.environ.get("EDGE_BASE")

# Live CDP read wins when available — it's the authoritative in-memory token,
# not the lazily-flushed disk copy. RH_CDP_JSON is the raw web:auth_state JSON.
cdp_raw = os.environ.get("RH_CDP_JSON")
cdp_best = None
if cdp_raw:
    try:
        obj = json.loads(cdp_raw)
        if isinstance(obj, dict) and obj.get("access_token"):
            cdp_best = obj
    except Exception:
        cdp_best = None

# Try Chrome first, then Brave, then Edge
bases = [b for b in [base, brave, edge] if b]
if not bases:
    home = os.path.expanduser("~")
    if sys.platform == "darwin":
        base = os.path.join(home, "Library/Application Support/Google/Chrome")
    elif sys.platform == "win32":
        base = os.path.join(os.environ.get("LOCALAPPDATA", os.path.join(home, "AppData/Local")),
                            "Google", "Chrome", "User Data")
    else:
        base = os.path.join(home, ".config/google-chrome")

# On Windows, the base IS "User Data" and profiles are direct children.
# On macOS/Linux, profiles are direct children of the Chrome base.
# The glob below handles both: "<base>/*/Local Storage/leveldb"
# Try all browser bases (Chrome, Brave, Edge) in order
files = []
for b in bases:
    for prof in glob.glob(os.path.join(b, "*", "Local Storage", "leveldb")):
        files += glob.glob(os.path.join(prof, "*.ldb"))
        files += glob.glob(os.path.join(prof, "*.log"))
files = sorted(set(files), key=lambda p: os.path.getmtime(p), reverse=True)

candidates = []
for f in files:
    try:
        data = open(f, "rb").read()
    except OSError:
        continue
    for m in re.finditer(rb"access_token", data):
        start = data.rfind(b"{", max(0, m.start() - 200), m.start())
        if start == -1:
            continue
        depth = 0
        end = None
        for i in range(start, min(len(data), start + 8000)):
            c = data[i:i + 1]
            if c == b"{":
                depth += 1
            elif c == b"}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end is None:
            continue
        try:
            obj = json.loads(data[start:end].decode("latin-1"))
        except Exception:
            continue
        if isinstance(obj, dict) and obj.get("access_token") and obj.get("refresh_token"):
            candidates.append((os.path.getmtime(f), obj))

if cdp_best is not None:
    best = cdp_best
    source = "live CDP (localStorage)"
elif candidates:
    candidates.sort(key=lambda c: (c[0], len(str(c[1]["access_token"]))), reverse=True)
    best = candidates[0][1]
    source = "on-disk localStorage"
else:
    sys.stderr.write(
        "[refresh-auth] no Robinhood auth found via CDP or in any Chrome profile's "
        "on-disk localStorage. Log in to robinhood.com in Chrome (or start chrome-debug) "
        "and retry.\n")
    sys.exit(2)

tok = str(best["access_token"])
exp = int(best.get("expires_in", 0) or 0)
ttype = best.get("token_type", "Bearer")

header = (
    "# Robinhood brokerage auth — " + source + " "
    + datetime.datetime.utcnow().isoformat() + "Z\n"
    + "# token_type=" + str(ttype) + " expires_in=" + str(exp)
    + "s (~%.1fd)\n" % (exp / 86400)
    + "ROBINHOOD_BROKERAGE_TOKEN=" + tok + "\n"
)
# Surgical write: refresh ONLY the token (+ its auto-generated header comments) and
# PRESERVE every other line (ROBINHOOD_WEB_APP_VERSION, crypto keys, etc.). A full
# overwrite would clobber sibling keys — the same "refresh one field, destroy others"
# bug class we're stamping out.
keep = []
if os.path.exists(env_path):
    with open(env_path) as fh:
        for ln in fh.read().split("\n"):
            s = ln.strip()
            if s.startswith("ROBINHOOD_BROKERAGE_TOKEN="):
                continue
            if s.startswith("# Robinhood brokerage auth") or s.startswith("# token_type="):
                continue
            keep.append(ln)
while keep and keep[0].strip() == "":
    keep.pop(0)
while keep and keep[-1].strip() == "":
    keep.pop()
content = header + ("\n".join(keep).rstrip("\n") + "\n" if keep else "")
with open(env_path, "w") as fh:
    fh.write(content)
try:
    os.chmod(env_path, 0o600)
except OSError:
    pass  # chmod on Windows is no-op; ignore
print("[refresh-auth] wrote %s (OK len=%d type=%s exp_days=%.1f, %d other line(s) preserved)"
      % (env_path, len(tok), ttype, exp / 86400, len(keep)))
PYEOF

# Zayd Khan // cold // www.zayd.wtf
