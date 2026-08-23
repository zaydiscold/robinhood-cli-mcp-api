# Roadmap

Current product goals only. Completed work belongs in [`CHANGELOG.md`](./CHANGELOG.md); historical implementation plans are archived under [`docs/archive/implementation-plans-2026-07/`](./docs/archive/implementation-plans-2026-07/).

## P0 — evidence and execution safety

- [ ] Complete one tightly bounded live options-order lifecycle proof through the first-class path: far-from-market limit → order-history evidence → cancel → cancellation evidence. Never run without explicit owner approval for the exact account, contract, side, quantity, and limit.
- [ ] Re-capture and verify the options per-position P&L route shown by the web UI; keep the current output explicitly not-evaluated until the endpoint and response shape are proven.
- [ ] Re-verify stale/404 account-setting write routes before exposing them as live-capable: per-instrument DRIP, sweep enrollment, stock lending, options settings, and options buying-power preflight.

## P1 — public product quality

- [ ] Generate an API-map changelog from route-map diffs so additions, removals, method changes, and risk-tier changes are reviewable in every release.
- [ ] Continue splitting the oversized CLI/MCP adapters into typed modules without breaking the shared-engine parity contract.
- [ ] Add focused schemas for the highest-use MCP inputs and structured output for the highest-use reads, preserving compatibility content.
- [ ] Add a privacy-safe export/report command for positions, fills, income, and realized P&L.

## P2 — research surfaces

- [ ] Map price-alert and remaining useful Bonfire reads; ignore telemetry, cosmetics, identity writes, and unrelated onboarding traffic.
- [ ] Add a read-only historical-IV/term-structure surface only after a real source is captured and freshness semantics are documented.
- [ ] Extend per-account rollups where live evidence supports them; never infer missing accounts from bulk endpoints that under-report.

## Explicit non-goals

- Autonomous deposits, withdrawals, bank linking, ACATS, wallet-key handling, or any other money-movement automation.
- Silent live writes. Every order remains dry-run by default, exact-scope confirmation gated, and verified through order history.
- Treating the official Robinhood agent sandbox as a runtime fallback for this project.
- Claiming an endpoint, field, or financial calculation is supported without current route evidence and tests.

<!-- Zayd Khan // cold // www.zayd.wtf -->
