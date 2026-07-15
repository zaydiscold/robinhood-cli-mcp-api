# Changelog

All notable changes to the Robinhood CLI and MCP are documented here.

## [1.0.0] - 2026-07-14

### Added

- Authenticated, value-free Chrome/CDP evidence for 214 method-specific operation templates across
  seven Robinhood API hosts, with observed status codes, content types, provenance, request shapes,
  and status-specific response shapes.
- Shared CLI/MCP route descriptions that expose captured evidence without exposing account values,
  credentials, cookies, or raw bodies.
- Exact `lean`, `core`, `trading`, `research`, `admin`, and `full` capability manifests with loud
  validation for invalid profile names.
- Quality, coverage, dependency, generated-map, skill-integrity, and multi-platform CI gates.

### Changed

- The complete 78-tool `full` profile is the personal default. The 15-tool `lean` profile remains an
  explicit opt-in that reduces discovery payload by 83.03% in exact `o200k_base` tokens for
  constrained agents.
- The incorporated operating skill is restored and expanded to 31,544 `o200k_base` tokens, 7.48x
  the rejected compact router, with a completeness floor and no maximum-size benchmark.
- Large route, recipe, workflow, knowledge, and Crypto catalogs paginate by default so full tool
  availability does not require unlimited result payloads.
- Route catalogs default to compact routing summaries while preserving every captured field/schema
  behind `detail: "full"`; the 25-row default is 73.27% lighter by exact tokens than 25 full rows.
- Patch/minor development dependencies are current and the actionable esbuild advisory is removed.

### Fixed

- MCP handler failures now use protocol-level error results instead of successful `{error}` payloads.
- Write annotations distinguish safe automatic UI/telemetry writes from destructive financial or
  account mutations.
- Invalid profiles fail at startup and in Doctor instead of producing a misleading empty server.
- API-map copying is safe when builds run concurrently.
- Generated OpenAPI operations include observed request and response schemas and authentication
  evidence without persisting secrets.
- Consolidated CDP route-map entries retain approved templated query strings at execution time;
  direct `quote AAPL` API verification caught and proved the fix without enabling writes.

### Safety

- Live writes remain dry-run gated unless `ROBINHOOD_ALLOW_LIVE_WRITE=1` is explicitly present, and
  the gate never substitutes for exact user authorization of a trade or account mutation.
- The authenticated mapping pass performed no trade, transfer, cancellation, watchlist change,
  recurring change, or account-setting save.
