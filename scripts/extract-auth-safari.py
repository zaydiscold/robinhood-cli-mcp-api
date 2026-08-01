#!/usr/bin/env python3
"""Extract Robinhood auth from Safari's origin-scoped WebKit LocalStorage.

Uses only Python stdlib. It requires an origin metadata file containing both
`https` and `robinhood.com`, reads only ItemTable['web:auth_state'], and writes
the bearer directly to the target .env without exposing it on stdout or argv.
"""
import argparse
import json
import os
import sqlite3
from pathlib import Path


def is_robinhood_origin(db_path: Path) -> bool:
    origin_path = db_path.parent.parent / "origin"
    try:
        raw = origin_path.read_bytes().lower()
    except OSError:
        return False
    return b"https" in raw and b"robinhood.com" in raw


def candidate_databases() -> list[Path]:
    root = (
        Path.home()
        / "Library"
        / "Containers"
        / "com.apple.Safari"
        / "Data"
        / "Library"
        / "WebKit"
    )
    if not root.is_dir():
        return []
    return sorted(
        root.glob("**/LocalStorage/localstorage.sqlite3"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )


def read_auth_state(db_path: Path) -> dict | None:
    if not is_robinhood_origin(db_path):
        return None
    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        row = connection.execute(
            "SELECT value FROM ItemTable WHERE key = ? LIMIT 1",
            ("web:auth_state",),
        ).fetchone()
    finally:
        connection.close()
    if not row:
        return None
    value = row[0]
    candidates: list[str] = []
    if isinstance(value, bytes):
        for encoding in ("utf-8", "utf-16le"):
            try:
                candidates.append(value.decode(encoding))
            except UnicodeDecodeError:
                continue
    elif isinstance(value, str):
        candidates.append(value)
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def write_token(env_path: Path, token: str) -> None:
    old = env_path.read_text() if env_path.exists() else ""
    keep = [
        line
        for line in old.splitlines()
        if not line.startswith("ROBINHOOD_BROKERAGE_TOKEN=")
    ]
    env_path.write_text(
        "ROBINHOOD_BROKERAGE_TOKEN="
        + token
        + "\n"
        + "\n".join(keep)
        + ("\n" if keep else "")
    )
    os.chmod(env_path, 0o600)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", type=Path, required=True)
    args = parser.parse_args()
    for database in candidate_databases():
        state = read_auth_state(database)
        token = state.get("access_token") if state else None
        if token:
            write_token(args.env, str(token))
            print("source=safari auth_state=yes token_written=yes")
            return
    print("source=safari unavailable=no_origin_scoped_auth_state", file=os.sys.stderr)
    raise SystemExit(2)


if __name__ == "__main__":
    main()
