#!/usr/bin/env python3
"""Extract Robinhood web auth from a live Chromium CDP endpoint.

Creates a temporary background robinhood.com target, reads web:auth_state from
that origin, updates the target .env without exposing the token on stdout or in
argv, and closes the target. Requires the Python `websockets` package.
"""
import argparse
import asyncio
import json
import os
import sys
import urllib.request
from pathlib import Path

import websockets

from auth_session import describe_session_token


async def extract(port: int, env_path: Path) -> None:
    version = json.load(
        urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=5)
    )
    async with websockets.connect(
        version["webSocketDebuggerUrl"], origin=None, max_size=2**24
    ) as ws:
        seq = 0

        async def call(method, params=None, session=None):
            nonlocal seq
            seq += 1
            request_id = seq
            msg = {"id": request_id, "method": method, "params": params or {}}
            if session:
                msg["sessionId"] = session
            await ws.send(json.dumps(msg))
            while True:
                reply = json.loads(await ws.recv())
                if reply.get("id") == request_id:
                    if "error" in reply:
                        raise RuntimeError(reply["error"])
                    return reply["result"]

        target = (
            await call(
                "Target.createTarget",
                {"url": "https://robinhood.com/", "background": True},
            )
        )["targetId"]
        try:
            session = (
                await call(
                    "Target.attachToTarget", {"targetId": target, "flatten": True}
                )
            )["sessionId"]
            await call("Runtime.enable", session=session)
            state = ""
            for _ in range(30):
                await asyncio.sleep(1)
                result = await call(
                    "Runtime.evaluate",
                    {
                        "expression": (
                            "JSON.stringify({origin:location.origin,"
                            "state:localStorage.getItem('web:auth_state')||''})"
                        ),
                        "returnByValue": True,
                    },
                    session,
                )
                wrapped = json.loads(result.get("result", {}).get("value", "{}"))
                if (
                    wrapped.get("origin") == "https://robinhood.com"
                    and wrapped.get("state")
                ):
                    state = wrapped["state"]
                    break
            if not state:
                raise RuntimeError(
                    "live debug Chromium has no web:auth_state for robinhood.com"
                )
            obj = json.loads(state)
            token = obj.get("access_token")
            if not token:
                raise RuntimeError("web:auth_state missing access_token")

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
            metadata = describe_session_token(token)
            suffix = " ".join(f"{key}={value}" for key, value in metadata.items())
            print(
                f"source=cdp:{port} auth_state=yes token_written=yes"
                + (f" {suffix}" if suffix else "")
            )
        finally:
            await call("Target.closeTarget", {"targetId": target})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=9222)
    parser.add_argument("--env", type=Path, required=True)
    args = parser.parse_args()
    try:
        asyncio.run(extract(args.port, args.env))
    except Exception as exc:
        print(f"source=cdp:{args.port} unavailable={type(exc).__name__}", file=sys.stderr)
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
