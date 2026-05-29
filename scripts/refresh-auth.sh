#!/usr/bin/env bash
# Refresh the brokerage bearer token for robinhood-cli — fully agentic, browser-free.
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

command -v python3 >/dev/null || { echo "ERROR: python3 not on PATH" >&2; exit 1; }

# Python does the disk scan, writes .env, chmods it, and prints the status — so the
# token value never passes through the shell. Heredoc goes straight to python3 (no
# nesting inside $(), which trips macOS bash 3.2's paren scanner).
python3 << 'PYEOF'
import re, json, glob, os, sys, datetime

env_path = os.environ["ROBINHOOD_ENV_PATH"]
home = os.path.expanduser("~")
base = os.path.join(home, "Library/Application Support/Google/Chrome")

files = []
for prof in glob.glob(os.path.join(base, "*", "Local Storage", "leveldb")):
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

if not candidates:
    sys.stderr.write(
        "[refresh-auth] no Robinhood auth found in any Chrome profile's localStorage. "
        "Log in to robinhood.com in Chrome and retry.\n")
    sys.exit(2)

candidates.sort(key=lambda c: (c[0], len(str(c[1]["access_token"]))), reverse=True)
best = candidates[0][1]
tok = str(best["access_token"])
exp = int(best.get("expires_in", 0) or 0)
ttype = best.get("token_type", "Bearer")

env = (
    "# Robinhood brokerage auth — read from Chrome's on-disk localStorage "
    + datetime.datetime.utcnow().isoformat() + "Z\n"
    + "# token_type=" + str(ttype) + " expires_in=" + str(exp)
    + "s (~%.1fd)\n" % (exp / 86400)
    + "ROBINHOOD_BROKERAGE_TOKEN=" + tok + "\n"
)
with open(env_path, "w") as fh:
    fh.write(env)
os.chmod(env_path, 0o600)
print("[refresh-auth] wrote %s (OK len=%d type=%s exp_days=%.1f)"
      % (env_path, len(tok), ttype, exp / 86400))
PYEOF
