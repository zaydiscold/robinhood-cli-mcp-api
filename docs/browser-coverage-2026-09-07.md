# Browser coverage and production follow-up, 2026-09-07

## What changed

The authenticated Chrome pass covered 22 page visits, including Legend, classic home, portfolio overview, retirement, crypto, investing, transfers, recurring investments, statements, tax center, history, contact/security/investing/beneficiary settings, lending, crypto account settings, and the stock detail ticket.

235 successful method/path/query operations were observed. Compared with the previous map, 25 method/path pairs were new; the other additions describe query variants or richer evidence for existing paths. The brokerage inventory grew from 379 to 525 rows. These rows are not 525 independently verified product features. Response schemas contain field names and types, never account values.

The map merger now retains earlier browser coverage when importing a narrower capture, and preserves legacy named-parameter templates. Without this fix, the newest capture could hide older options coverage and remove a `{symbol}` alias. CLI, OpenAPI, curl templates, and endpoint documentation were regenerated from the merged map.

## Production fixes beyond map expansion

- The installed bin resolves real paths before dispatch, fixing silent success through npm-style symlinks. The local PATH command now targets the unified entrypoint, including tax and auth.
- Installed packages separate immutable assets from operator data. CLI and MCP use the same explicit data directory and credential path; doctor understands source and packaged layouts. First-use directories are created privately.
- `auth refresh` imports and validates an existing local browser session. Packaged auth helpers and tax/knowledge assets are included; historical research artifacts are excluded from npm runtime assets.
- Strategy validation uses shared gated writes and cancellation. It persists intent before sending, attempts cancellation even if a later receipt update fails, and stops unless order history confirms cancellation. No live strategy validation was executed.
- README highlights panic, margin, portfolio, trade review, order watch, tax research, and auth recovery.

## How the observations were obtained

1. Connected to the existing Chrome CDP endpoint on localhost port 9222 with `browser-harness-js`, using a separate audit tab in the already authenticated profile.
2. Navigated observed account links and inspected ticket dropdowns and Goodreads forms without submitting account changes.
3. Attached a CDP Network listener restricted to Robinhood-owned origins. It transformed request/response bodies to shape-only schemas in memory. Only successful HTTP responses were admitted to this merge; unknown and failed responses were excluded.
4. Ran `node scripts/merge-cdp-capture.mjs <private-sanitized-capture.json>` and `pnpm generate:api-map`.
5. Ran `pnpm test` and `pnpm quality`, plus the installed command's actual help/tax/auth output checks and a live `panic --dry-run --json` read.

Raw metadata receipts: panic exited 0, dryRun=true, candidate list read successfully, zero submissions. Existing live account, portfolio, margin, holdings, options, history, and income reads are detailed in the consolidation report. The new successful browser slice is recorded in `api-map/browser-cdp-routes-2026-09-07.json`; its cumulative contents also preserve earlier observations and their original provenance.

## Remote login diagnosis

The local Tailscale backend was stopped. Starting it restored SSH. A fresh remote account read succeeded. Three existing remote MCP processes had different in-memory sessions: one credential returned HTTP 200, two returned HTTP 401. These were credential checks, not calls through those running stdio handlers. A separate test started the installed engine with a deliberately invalid token; it recovered from the current on-disk credential and completed an accounts read. No browser credentials were transferred and no active processes were restarted.

The remote MCP points to the canonical checkout. A browser's cookie lifetime does not imply every MCP process holds the same bearer token or a newly minted 30-day token.

## Consolidation and limits

Plaintext root operator notebooks and one-off session-injection helpers were removed from tracking and added to .gitignore. Local copies and private backups are preserved; empty templates ship instead. Historical copies still require a clean-history release.

Each local project now has one worktree and one branch, main. Three redundant integration/release worktrees and two stale independent release snapshots were removed after verified local backups. On the remote host, six old worktrees were archived and removed. Two new worktrees were actively receiving auth/history edits during the audit and were preserved alongside the canonical checkout. Remote uncommitted publication work was selectively incorporated locally; older options changes were already represented by newer code and were not replayed over it.

This pass does not establish every entitlement-specific page, every dropdown state, or every mutation. Transfers, orders, withdrawals, account enrollment, destructive settings, and financial actions were not submitted. Mutation receipts still need independent readback. Existing public Git history contains previously committed personal information; cleaning current files does not erase it. No public push, merge, or publication was performed.

## Final validation

Full tests passed: 572 CLI and 18 MCP, plus auth and capture-merger checks. Quality and staged-diff secret scanning passed. Packed tarballs were installed into an isolated directory; real bin output, bundled doctor/knowledge, and both MCP initializations passed. Robinhood exposed 93 tools in that fresh packaged process. This is separate from cached remote processes.
