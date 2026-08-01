# Multi-browser Robinhood auth discovery

Robinhood's web client stores the primary bearer in the origin-scoped localStorage key `web:auth_state`. The token must never be printed, passed in argv, committed, or inferred from cookies.

## Resolution order

1. **Live Chromium CDP** (`ROBINHOOD_CDP_PORT`, default `9222`)
   - `scripts/extract-auth-cdp.py` connects directly to the browser WebSocket
   - creates a background `https://robinhood.com/` target
   - reads `localStorage.web:auth_state` from the correct origin
   - updates `.env` in-process and closes the target
   - does not depend on an already-open Robinhood tab, Node, browser-harness, or a GUI interaction
2. **On-disk Chromium LevelDB**
   - Chrome, Brave, and Edge standard profile roots
   - useful when a browser has flushed a complete auth object to disk
   - custom `--user-data-dir` profiles should use CDP or be supplied as an additional root
3. **Safari capability detection**
   - Safari stores origin data under sandboxed WebKit `WebsiteDataStore` directories
   - cache strings such as `access_token` are not proof of Robinhood auth
   - only use Safari when the `robinhood.com` origin can be mapped to an actual `web:auth_state` record or Safari remote automation provides origin-scoped JavaScript execution
   - never treat generic NetworkCache matches as credentials

## Verification contract

A refresh is successful only when all three are true:

1. extractor reports `auth_state=yes token_written=yes`
2. destination `.env` is copied/injected without exposing the token
3. a lightweight custom-CLI read (`accounts --json`) returns parseable, non-empty JSON

Exit status or file existence alone is not success.

## Frostbyte services discovered

The generic pattern is process-derived, not hostname-specific:

- a normal Chromium process with the vendor-default user data root
- any Chromium process with `--user-data-dir=<custom root>` and an optional `--remote-debugging-port=<port>`

Inspect process command lines to identify custom roots and ports. Prefer the direct CDP extractor for a live debug service; use disk discovery for non-debug services.
