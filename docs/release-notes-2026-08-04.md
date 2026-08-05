# v1.1.0 — Robinhood financial-data control plane

This release is not a “privacy feature” patch. It is a broad expansion of the Robinhood CLI + MCP into a read-heavy financial-data and account-intelligence control plane, backed by one shared TypeScript engine and a 300+ route map.

## Headline capabilities

### Research-grade options data

`options snapshot` and `robinhood_options_snapshot` turn a Robinhood option chain into a machine-readable research dataset.

- one expiration or bounded `all`-expiration enumeration
- calls, puts, or both
- contract UUID, API URL, and Robinhood desktop deep link
- strike, expiry, state, spot, and ITM/ATM/OTM classification
- bid, ask, adjusted mark, midpoint, last, previous close, spread, and spread percentage
- delta, gamma, theta, vega, rho, implied volatility, volume, and open interest
- total and per-expiration call/put volume and open interest
- put/call volume and open-interest ratios
- highest-volume and highest-open-interest contracts
- ATM call/put IV skew
- ATM-straddle mark and snapshot-derived expected-move percentage
- explicit stale/missing-market-data count
- explicit truncation warnings for bounded all-expiration reads

The same `computeOptionsSnapshot` engine powers CLI and MCP. Large market-data requests are chunked through the existing bounded quote reader rather than building unbounded URLs.

```bash
robinhood-cli options snapshot GOOGL --expiration 2026-09-18 --json
robinhood-cli options snapshot ARKG --expiration all --max-expirations 12 --json
```

### Options intelligence and diagnostics

The broader options surface now includes:

- complete expiration discovery and full contract UUID enumeration
- around-the-money chain views
- single-contract inspect with complete Greeks and fill history
- held-contract inventory across all owned accounts
- contract historical OHLC/volume points
- chain-level ATM IV and Robinhood expected move by expiration
- strategy templates, multi-leg live quote composition, dry-run order bodies, rolls, closes, and workbench payoff/Greek analysis
- read-only available-contract/share quantities, maximum rollable quantity, recent-rejection state, and exercise checks with explicit `notEvaluated` prerequisites

Order-review and submission surfaces remain separate. The research snapshot and diagnostics do not submit or mutate orders.

### Account and product intelligence

The release also promotes account-service and product reads that were previously buried in route-map research:

- `account-pulse`: privacy-normalized health across the complete owned-account graph
- `ipo-access`: public offering discovery and aggregate eligibility, with **JMKE (Jersey Mike’s)** retained as the delightfully memorable documented example
- `gold-fees`: subscription-fee history
- `sweep-interest`: current displayed APY with labeled fallback provenance
- privacy-safe stock-reward metadata
- aggregate-only inbox state
- bounded account-document discovery
- buying-power and options/futures/account capability diagnostics

Privacy is an output contract for sensitive reads, not the headline of the release.

### Durable browser-session auth

The public CLI path supports humans, scripts, cron, MCP, and agents through the same invocation-agnostic auth lifecycle:

- direct CDP extraction from an independently authenticated Chromium profile
- Chrome, Brave, and Edge discovery
- durable local session import
- cold-start and one-shot `401` self-heal
- no machine-name or agent-only assumptions in the public interface

Authentication material stays local and is never part of repository evidence.

### MCP registration and profiles

Every implemented MCP tool is registered in the typed capability registry and is exposed by the default `full` profile. Narrow profiles change only what `tools/list` advertises for constrained clients; they do not create a second class of “unregistered” tools.

Protocol tests verify the exact `lean`, `core`, `trading`, `research`, `admin`, and `full` manifests. The default remains `full`.

## Evidence

Evidence labels stay deliberately strict:

- **live-verified**: exercised against an authenticated session with only sanitized structural derivatives retained
- **observed-contract**: route/request/field contract observed in public web bundles or browser runtime, pending representative-input proof
- **fixture-verified**: parser/engine behavior proven against frozen local fixtures only

A mapped path or HTTP 200 alone is never promoted to a live behavioral claim.

## Safety

- reads execute live
- writes remain dry-run unless the existing live-write gate is deliberately armed
- this release’s new research snapshot is GET-only
- the browser options pass exercised navigation, contract selection, and disabled/guarded ticket states only; no order was submitted
- order history remains the only proof a trade happened

## Version

Workspace, CLI, and MCP packages move from `1.0.0` to `1.1.0`.

- delilah 🌸
