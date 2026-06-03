# Round-Table Roadmap — 2026-06-03

A four-lens panel (security, options/quant, API-architecture, product/OSS) reviewed the project
and converged on a clear picture. This is the synthesized, prioritized roadmap.

## The consensus (where ≥2 lenses agreed)

1. **`api-streaming.robinhood.com` is the #1 untapped capability** (architecture + security top-pick).
   The entire map is REST/poll-only; RH's web app uses an envoy WebSocket for live quotes/greeks.
   Capturing the ws handshake (subprotocol, auth ticket, subscribe/heartbeat frames) and adding a
   `stream` reader turns the tool from snapshot → live, dodges the fractional 429 throttle, and
   delivers on the "speed of inference" tagline. **Effort L** (new transport).

2. **Wire the sentiment → contract pipeline into a runnable command** (options + product, 4 ideas).
   The signal→deeplink→order loop is sold in prose but isn't a command. The pieces all exist
   (`midlands/news|ratings|tags` mapped, `options-contract-links` resolves the UUID + desktop
   deeplink, `options enumerate` now bulk-lists). Ship: `options signal <SYM>` (normalize
   sentiment → suggest contract) and **`rh share "SPY 1000c 2026-12-18"`** (resolve → emit the
   clickable `robinhood.com/options/instruments/{uuid}/` link + a tweet-ready card). **The headline
   product** — the only artifact that escapes the install/auth wall and travels on its own. **M.**

3. **Move hard-won error knowledge into the shared engine** (architecture #4). 429 backoff /
   min-tick / overnight-BP / version-gate / OTC-market / insufficient-BP are documented as prose
   and live only in `scripts/equity-buy.mjs`. Add `classifyRobinhoodError()` to `lib.ts` so the
   MCP path gets the same retry/backoff discipline as the script. **M.**

## Per-lens highest-conviction pick

- **Security:** extract the Chrome-LevelDB localStorage scraper (`refresh-auth.sh`) into a standalone
  `capture-web-session` primitive — silent, network-free, no CDP "Allow" prompt; reusable across
  every browser-auth project (bird, the sibling *-cli repos). The single most generalizable artifact.
- **Options:** `options signal` — the runnable signal→contract pipeline (see consensus #2).
- **Architecture:** map `api-streaming` as a first-class WebSocket surface (consensus #1).
- **Product:** `rh share` — clickable trade-idea links as the thing the project is *known for*,
  and lead the README with the equity/access mission, not a referral link + coverage table.

## Full idea bank (by lens, with effort)

### Security & session research
- S/M Token-lifecycle: decode the bearer (issued-at/expiry/scope) → `auth-status` with a TTL gauge (proactive vs reactive refresh).
- **M Standalone `capture-web-session` LevelDB scraper (top pick; portable across repos).**
- S Document the web-header version-gate as a parameterized bypass profile + auto-staleness detector (bisect necessary vs sufficient headers).
- M/L Capture `api-streaming` ws handshake; check if the ws auth ticket is replayable / longer-lived than the REST bearer.
- S Map the VGS tokenization boundary (prove the CLI touches aliases, never raw PAN/PII) — the defensive story for the mission.
- M Automate the `?account_number=` propagation regression harness (IDOR-adjacent context-confusion test).
- S Harden the `ref_id` idempotency / 429-and-401 replay assumptions (avoid double-submit on retry).
- M Use `*.testnet.chain.robinhood.com` (rpc/faucet) as a zero-risk live-write proving ground for the signed Crypto path.
- S Rate-limit fingerprint across route families (record per-family ceilings + Retry-After headers as map metadata).
- S Cookie-vs-bearer auth-mode divergence audit (which routes accept which; is the cookie session longer-lived?).

### Options & quant
- **M `options signal` — wire midlands sentiment → normalized score → contract suggestion (top pick).**
- M `options surface` — full-chain IV skew + term structure (today's chain reader is one expiry/one type).
- M Book-level net Greeks + expiration/assignment calendar in `options positions --greeks`.
- S/M `options expected-move` + earnings-aware strike helper (ATM IV × √(T/365); join the mapped earnings route).
- M `options watch` — polling read loop with threshold alerts (% return, delta band, IV rank, short-ITM, DTE roll trigger).
- M Multi-leg roll detection + "what should I roll" advisor (recognize verticals/condors from aggregate_positions).
- S/M Cross-account options risk + buying-power roll-up (net Greeks per + across the 5 accounts; capability flags).
- S Liquidity/execution-quality gate on every `strategy-quote` (spread %, OI, volume, stale-quote block).
- M IV rank / IV percentile via `marketdata/options/historicals/`.

### API mapping & architecture
- **L Map `api-streaming` WebSocket surface + `stream` command (top pick; consensus #1).**
- **S Fix `selectRouteByQueryAndMethod` `?? pool[0]` fallback (silent wrong-verb on a forced write — contradicts the documented safety claim). DOING NOW.**
- M On-disk TTL cache for symbol→instrument_id→chain_id (cuts 2-3 calls off every options flow; eases the 429 burst risk; per-contract UUIDs stay un-cached).
- M `classifyRobinhoodError()` in the engine + move the 429 backoff from the script into `lib.ts` (consensus #3).
- M `doctor` command + CI: diff source vs dist map, validate url/url_template, assert route counts (3 docs cite 3 different counts).
- M `capture <url>` that attaches to chrome-debug, records the page's XHR/fetch routes, sanitizes, pipes into merge-cdp-capture.mjs (self-extending map).
- M Prioritize capturing the 4-5 highest-value WRITE bodies (recurring create/edit, watchlist item add/remove, DRIP) over more read routes — the map is ~95% read.
- M MCP task-verbs: add `robinhood_quote/_positions/_options_chain/_search/_history` (the agent path is weaker than the CLI today).
- S Make `requiresAuth` an explicit captured route property, not a host/risk heuristic.
- S Tests for route selection edge cases + the 401 self-heal + error classification.

### Product, growth & the equity mission
- **M `rh share` — clickable trade-idea link as the headline product (top pick; consensus #2).**
- S/M `rh sentiment <SYM>` — news + ratings + crowd, joined; `--watchlist`/`--portfolio` modes; screenshot-safe top-of-funnel.
- L Sentiment-tracker daemon → emits signed trade-idea links to webhook/Discord/X draft (the full dream loop; webhook-lab R&D already in info/).
- S Trust-as-a-feature: README asciinema of a write *blocked* by the double gate + `--explain` on writes.
- S Mission-first README rewrite ("Robinhood gives you no API; this gives your account back").
- S/M npm publish (`npx @zaydiscold/robinhood-cli`) + a top-of-README `claude mcp add` one-liner (kill the 4-step clone/build wall).
- S Cross-link the ~18 sibling `*-cli` repos under one "zaydiscold api-map" brand; robinhood-cli as flagship.
- M `rh portfolio` agent-narrated daily brief (recurring-engagement hook; screenshot-safe).
- M A static "trade-idea card" web page (`?contract=...` → Greeks + "Open in Robinhood" button) so shared links are self-explanatory + attributable.

## Recommended build sequence
1. **Now:** `options enumerate` (DONE), fix the route-selection fallback, reframe UUID rationale, bake bulk-enumeration into the skill.
2. **Next (headline):** `rh sentiment` read → `options signal` → `rh share` (the pipeline the repo is named for).
3. **Then (capability tier):** capture `api-streaming` ws → `stream` command (live data).
4. **Hardening:** `classifyRobinhoodError()` in the engine, MCP task-verbs, `doctor`/CI, instrument cache.
5. **Reusable security:** extract `capture-web-session`; write the version-gate bypass profile; portable learnings doc.
6. **Growth:** mission-first README, npm/MCP one-liner, trust-theater demo, sibling-repo brand.
