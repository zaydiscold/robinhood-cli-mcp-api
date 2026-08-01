# Multi-browser Robinhood auth discovery

Robinhood's web client stores the primary bearer in the origin-scoped localStorage key `web:auth_state`. The token must never be printed, passed in argv, committed, or inferred from cookies.

This is a normal CLI capability, not an agent-only workflow. Humans, cron jobs, CLI self-heal, MCP servers, and agents all invoke the same public entrypoint:

```bash
pnpm auth:refresh
```

The command discovers available auth sources, updates the repo `.env`, and exits nonzero when no valid source exists. Callers must then verify with a lightweight authenticated command such as `node cli/dist/index.js accounts --json`.

## Resolution order

1. **Live Chromium CDP**
   - explicit ports: `ROBINHOOD_CDP_PORTS="9222 9333"` (or singular `ROBINHOOD_CDP_PORT`)
   - discovered ports: `DevToolsActivePort` in standard Chrome/Brave/Edge roots and optional `ROBINHOOD_CHROMIUM_BASES` (`os.pathsep`-delimited)
   - conventional fallback: `9222`
   - `scripts/extract-auth-cdp.py` connects directly to the browser WebSocket
   - creates a background `https://robinhood.com/` target
   - reads `localStorage.web:auth_state` from the correct origin
   - updates `.env` in-process and closes the target
   - does not depend on an already-open Robinhood tab, Node, browser-harness, an agent, or a GUI interaction
   - Python requirement: `python -m pip install websockets`; if unavailable, the command explains the dependency and continues to disk fallback
2. **Safari WebKit LocalStorage** (macOS, stdlib-only)
   - `scripts/extract-auth-safari.py` scans Safari's sandboxed WebKit `WebsiteDataStore` directories
   - requires origin metadata containing both `https` and `robinhood.com`
   - reads only `ItemTable['web:auth_state']` from `LocalStorage/localstorage.sqlite3`
   - updates `.env` in-process at mode `0600`; the value never appears on stdout or argv
   - generic NetworkCache strings such as `access_token` are never treated as credentials
3. **On-disk Chromium LevelDB fallback**
   - Chrome, Brave, and Edge standard profile roots
   - useful when a browser has flushed a complete auth object to disk
   - custom roots can be supplied through `ROBINHOOD_CHROMIUM_BASES`


## Verification contract

A refresh is successful only when all three are true:

1. extractor reports `auth_state=yes token_written=yes`
2. destination `.env` is copied/injected without exposing the token
3. a lightweight custom-CLI read (`accounts --json`) returns parseable, non-empty JSON

Exit status or file existence alone is not success.

## Thirty-day session control

Robinhood's login UI can mint a durable 30-day session when the user selects **stay logged in for 30 days**. A live Safari session verified on 2026-08-01 contained:

- `web:auth_state.access_token` and `read_only_secondary_access_token` with matching 30-day JWT expiry
- an opaque `refresh_token` in the same origin-scoped auth object
- long-lived `device_id` and `logged_in` cookies
- a short-lived `session_id` cookie that is not the durable bearer

`pnpm auth:refresh` does not click or emulate this consent control. It preserves the user's choice by extracting the server-minted `web:auth_state` from the selected browser. Successful extractors report `session_remaining_days` and `token_expires_utc` without printing token contents. If the reported remaining duration is substantially shorter than 30 days immediately after login, the user must select the 30-day option during Robinhood login; the CLI must not silently extend consent or manufacture a longer session.

## Browser services and custom profiles

The generic pattern is process-derived, not hostname-specific:

- a normal Chromium process with the vendor-default user data root
- any Chromium process with `--user-data-dir=<custom root>` and an optional `--remote-debugging-port=<port>`

Inspect process command lines to identify custom roots and ports. Prefer the direct CDP extractor for a live debug service; use disk discovery for non-debug services.
