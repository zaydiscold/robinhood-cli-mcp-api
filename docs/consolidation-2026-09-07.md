# Robinhood CLI consolidation, 2026-09-07

## Source decisions

Inspected 86 open and closed pull requests and 20 issues, remote branches, local worktrees, and configured runtime paths. The source checkout was at f1f65dc, behind origin/main 0afb3a5. Integrated PR #106 (order-watch deadlines and regression coverage) and PR #98 (tax research catalog and CLI/API/MCP routing) over current main on an isolated local branch. Existing public PR state was left unchanged.

## Corrected behavior

- Exact-lot sale requests remain previews until a supported submission contract exists, including when the global live-write environment gate is enabled.
- Generic transport acceptance is explicitly mutationVerified:false. Exact order evidence requires the requested order ID and account.
- Ownership records expire after 30 seconds, invalidate on authentication changes, and fail closed after lookup failure for live writes.
- A live operation snapshots credentials before ownership lookup and uses the same snapshot for sending. Concurrent read recovery cannot switch the submitting identity. Writes do not retry after a credential refresh.
- Browser token candidates are verified individually against the accounts endpoint before atomic promotion. A rejected longer-lived candidate cannot hide a valid shorter-lived session. Normal refresh accepts a session with at least 60 seconds remaining; guardian-specific longer thresholds remain available.
- Recovery uses an asynchronous subprocess and coalesces concurrent requests by auth path. Custom auth paths are honored throughout discovery and promotion.
- MCP generic errors default to non-retryable, and cancellation reaches the order watcher.
- Each live basket leg rechecks buying power. An uncertain submission blocks later legs pending reconciliation.
- MCP uses maintained SDK 1.30.0. This is the v1 SDK line, not a claim of support for every newer protocol feature.

## Evidence and reproducibility

Automated validation: `pnpm test` passes 570 CLI tests, 18 MCP tests, and the authentication Python/script checks. `pnpm quality` passes lint ratchets, formatting ratchet, dead-code checks, generated API-map checks, agent guidance, tax catalog, portability, and write boundaries. A supported pnpm 11 audit client reports no known dependency vulnerabilities at the low threshold.

Regression tests include exact order/account mismatch, expired ownership, concurrent credential change during ownership discovery, asynchronous refresh coalescing, revoked candidate fallback, and basket reconciliation. All trade and mutation tests use injected transports or fixtures. No real orders or transfers were sent.

Live read proof used the operator-authorized Chrome session through the shared CDP browser, then exercised the built CLI and an independent stdio MCP client. Verified accounts, quotes, portfolio, margin, options holdings, history, buying power, and watchlist reads. MCP initialized and returned a structured accounts result with 93 tools in the full profile. An HTTP success or test pass is not evidence that every mapped route works for every account.

Reproduce locally after loading your own credentials:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm quality
pnpm auth:refresh
node cli/dist/index.js accounts --json
node cli/dist/index.js portfolio --json
node cli/dist/index.js margin --json
node cli/dist/index.js options holdings --json
```

Packaging proof: packed CLI and MCP tarballs installed into a separate empty directory. CLI help and MCP initialization succeeded without the source checkout. Packed files contain no .env, local/, research/, or proofs/ paths.

## Privacy and remaining limits

Replaced captured account identifiers, nickname, and financial fixture amounts with synthetic data. Exact-value checks of five active account numbers found no matches in current tracked files. Gitleaks scanned all 327 historical commits: two findings were the same deliberately synthetic redaction-test string, not live credentials. Historical commits still contain previously committed personal identifiers and fixture data. Current-file cleanup does not erase that history; the existing public history is not cleared for promotion by this report.

Raw browser tokens, cookies, account responses, and review text were not included in this document or source changes. Private captures remain local and ignored. No credentials were copied to another machine.

The remote Hermes installation is not verified: the local Tailscale service was stopped. Local source, built runtime, a fresh MCP process, and an already-running Hermes session are distinct states. Existing Hermes sessions may retain an old server until reloaded.

Watchlist/settings/recurring transport receipts without exact readback remain unverified. Account-specific endpoints can depend on entitlement or require forms that have not been exercised. Real trading, transfer, withdrawal, and enrollment paths were not live-tested. A complete route inventory is not a claim of universal live coverage.

## Expanded live read sweep

Twenty additional command invocations covered exposure/Greeks, risk, performance, dividends, option events and positions, calendar, sweep interest, Gold fees, rewards, inbox aggregates, expirations, chain statistics, earnings, ratings, and repeat portfolio/margin checks. Nineteen returned JSON successfully. Portfolio explicitly reported complete=true with no warnings. Income and calendar returned one warning each and are not counted as fully complete data. The default 90-day trade review exceeded a 45-second test budget; this is recorded as incomplete evidence, not a failed authentication diagnosis. Raw personal results were not retained in public artifacts.
