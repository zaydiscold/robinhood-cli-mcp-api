#!/usr/bin/env python3
"""Extract the furthest-expiring Robinhood auth object from Chromium LevelDB."""
import argparse
import base64
import glob
import json
import os
import re
import sys
from pathlib import Path


def jwt_exp(token):
    try:
        part = token.split(".")[1]
        part += "=" * ((4 - len(part) % 4) % 4)
        return int(json.loads(base64.urlsafe_b64decode(part.encode("ascii"))).get("exp") or 0)
    except (IndexError, ValueError, TypeError, json.JSONDecodeError):
        return 0


def scan(bases):
    files = []
    for base in bases:
        files.extend(glob.glob(os.path.join(str(base), "*", "Local Storage", "leveldb", "*.ldb")))
        files.extend(glob.glob(os.path.join(str(base), "*", "Local Storage", "leveldb", "*.log")))
    candidates = []
    for filename in set(files):
        try:
            data = Path(filename).read_bytes()
            mtime = os.path.getmtime(filename)
        except OSError:
            continue
        for match in re.finditer(rb"access_token", data):
            start = data.rfind(b"{", max(0, match.start() - 300), match.start())
            if start < 0:
                continue
            depth = 0
            end = None
            for index in range(start, min(len(data), start + 12000)):
                char = data[index : index + 1]
                if char == b"{":
                    depth += 1
                elif char == b"}":
                    depth -= 1
                    if depth == 0:
                        end = index + 1
                        break
            if end is None:
                continue
            try:
                obj = json.loads(data[start:end].decode("latin-1"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            if not isinstance(obj, dict) or not obj.get("access_token") or not obj.get("refresh_token"):
                continue
            token = str(obj["access_token"])
            candidates.append((jwt_exp(token), mtime, len(token), Path(filename), token))
    if not candidates:
        raise RuntimeError("no Robinhood auth found in Chromium LevelDB")
    candidates.sort(key=lambda item: item[:3], reverse=True)
    return candidates[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", action="append", type=Path, default=[])
    parser.add_argument("--env", type=Path, required=True)
    args = parser.parse_args()
    try:
        exp, _mtime, _length, source, token = scan(args.base)
    except RuntimeError:
        print("source=leveldb unavailable=no_auth", file=sys.stderr)
        raise SystemExit(2) from None
    args.env.write_text("ROBINHOOD_BROKERAGE_TOKEN=" + token + "\n", encoding="utf-8")
    try:
        os.chmod(str(args.env), 0o600)
    except OSError:
        pass
    profile = source.parents[2].name
    print("source=leveldb:" + profile + " auth_state=yes token_written=yes jwt_exp=" + str(exp))


if __name__ == "__main__":
    main()
