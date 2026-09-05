#!/usr/bin/env python3
"""Select the longest-lived Robinhood bearer candidate without exposing it."""
import argparse
import base64
import datetime
import json
import os
import sys
from pathlib import Path


def token_from_env(path):
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("ROBINHOOD_BROKERAGE_TOKEN="):
            return line.split("=", 1)[1]
    return None


def jwt_exp(token):
    try:
        part = token.split(".")[1]
        part += "=" * ((4 - len(part) % 4) % 4)
        return int(json.loads(base64.urlsafe_b64decode(part.encode("ascii"))).get("exp") or 0)
    except (IndexError, ValueError, TypeError, json.JSONDecodeError):
        return 0


DEFAULT_MIN_REMAINING_SECONDS = 4 * 86400


def select_freshest(paths, *, now=None, min_remaining_seconds=DEFAULT_MIN_REMAINING_SECONDS):
    now = int(
        datetime.datetime.now(datetime.timezone.utc).timestamp()
        if now is None
        else now
    )
    candidates = []
    for path in paths:
        token = token_from_env(path)
        if not token:
            continue
        candidates.append((jwt_exp(token), path.stat().st_mtime, len(token), path, token))
    if not candidates:
        raise RuntimeError("no valid Robinhood auth candidates")
    candidates.sort(key=lambda item: item[:3], reverse=True)
    acceptable = [item for item in candidates if item[0] - now >= min_remaining_seconds]
    if not acceptable:
        best_remaining = candidates[0][0] - now
        raise RuntimeError(
            "no acceptable Robinhood auth candidates: "
            + f"best_remaining_seconds={best_remaining} "
            + f"minimum_remaining_seconds={min_remaining_seconds}"
        )
    return acceptable[0]


def write_target(target, token, source, exp):
    old = target.read_text(encoding="utf-8") if target.exists() else ""
    keep = []
    for line in old.splitlines():
        stripped = line.strip()
        if stripped.startswith("ROBINHOOD_BROKERAGE_TOKEN="):
            continue
        if stripped.startswith("# Robinhood brokerage auth") or stripped.startswith("# token_type="):
            continue
        keep.append(line)
    now = datetime.datetime.now(datetime.timezone.utc)
    header = (
        "# Robinhood brokerage auth — freshest verified candidate "
        + now.isoformat()
        + "\n# token_type=Bearer jwt_exp="
        + str(exp)
        + " source="
        + source
        + "\nROBINHOOD_BROKERAGE_TOKEN="
        + token
        + "\n"
    )
    body = "\n".join(keep).strip("\n")
    target.write_text(header + (body + "\n" if body else ""), encoding="utf-8")
    try:
        os.chmod(str(target), 0o600)
    except OSError:
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument(
        "--minimum-remaining-seconds",
        type=int,
        default=DEFAULT_MIN_REMAINING_SECONDS,
    )
    parser.add_argument("candidates", nargs="+", type=Path)
    args = parser.parse_args()
    existing = [path for path in args.candidates if path.exists()]
    try:
        exp, _mtime, _length, path, token = select_freshest(
            existing, min_remaining_seconds=args.minimum_remaining_seconds
        )
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(2) from None
    source = path.stem
    write_target(args.target, token, source, exp)
    now = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
    remaining = round((exp - now) / 86400, 2) if exp else "unknown"
    expires = datetime.datetime.fromtimestamp(exp, datetime.timezone.utc).isoformat() if exp else "unknown"
    print(
        "source="
        + source
        + " auth_state=yes token_selected=yes session_remaining_days="
        + str(remaining)
        + " token_expires_utc="
        + expires
    )


if __name__ == "__main__":
    main()
