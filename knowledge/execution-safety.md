# Execution safety — the hard rules, distilled

> **When to load this:** before ANY write (order, cancel, settings change, recurring toggle) and
> whenever an error comes back from a write path. Reads are free and live; **every write is a
> dry-run unless the `ROBINHOOD_ALLOW_LIVE_WRITE=1` switch is set.** This is the checklist version of
> SKILL.md's failure modes — when in doubt, stop and confirm.

## The live-write switch (non-negotiable)

- A write sends only when `ROBINHOOD_ALLOW_LIVE_WRITE=1` is set in the environment — the single master
  switch (MCP: the env var in the server's environment). No per-call `--live-write`/`liveWrite` is
  required; the flag is accepted but optional and no longer the gate. Switch unset = every write is dry-run.
- **Set it deliberately.** Prefer inline on the single command over exporting it into a shell profile,
  where every later write would silently go live:

```bash
ROBINHOOD_ALLOW_LIVE_WRITE=1 node cli/dist/index.js <command> ...
```

- MCP `dryRun: true` always wins, even when the switch is on — the deliberate "preview this exact live
  call" escape hatch.

## The account-echo contract (before ANY send)

Echo the fully resolved order and get an explicit yes for **this exact order**:

```
account_number + nickname | symbol/contract | side | position_effect | qty |
limit price | estimated dollars (debit/credit x 100 x qty) | TIF | ref_id
```

If any field is inferred rather than confirmed — especially side/effect on "sell a call" wording —
stop and ask. Never default into naked/undefined-risk exposure.

## The failure-mode checklist (SKILL.md's 20, as gates)

**CRITICAL — real money / wrong account**

- [ ] 1. Account enumerated via `transfer/accounts/` (bare `accounts/` under-reports ~2 of 5); the `{account_number}` param passed explicitly; resolved account echoed.
- [ ] 2. `--method` passed on every write (GET/POST share URLs; omitting it silently runs the read — and a list response is NOT an order).
- [ ] 3. Live-write env var inline only, never exported.
- [ ] 4. For dollar equity orders: `fractional_tradability` read; OTC/`position_closing_only` names switched to whole shares + marketable limit.
- [ ] 5. Equity orders carry `order_form_version: 7` (engine does this; options orders are exempt).

**HIGH — wrong/failed orders, unintended state**

- [ ] 6. Option UUIDs bulk-enumerated first (`options enumerate <SYM> --expiration <D>`) — UUIDs are random v4; never computed, guessed, or cached per-contract.
- [ ] 7. `recurring pause|resume --all` reported as state-scoped (only active ones pause, only paused ones resume).
- [ ] 8. Limit price on-tick: `options/chains/{id}` `min_ticks` read; below `cutoff_price` (~$3) use `below_tick` (ARKG/SPX = $0.05; $0.01 → 400).
- [ ] 9. GTC option opens checked against **overnight** buying power, not regular BP.
- [ ] 10. Settings writes checked against `docs/account-settings-capability-map-2026-06-03.md` (DRIP write = `PATCH corp_actions/drip/account_settings/{account}/`, NOT `drip/enrollment/` which is GET-only/405). Unproven write bodies = research, not automation.

**MEDIUM — silent misreads / classification**

- [ ] 11. Positions' instrument UUIDs resolved to tickers via `instruments/?ids=` before reporting.
- [ ] 12. Watchlist reads carry `owner_type=custom`; renames use `display_name` (`name` = silent 200 no-op).
- [ ] 13. On 429: sleep the server-directed seconds, retry the **same `ref_id`** (429 = nothing placed → idempotent; a new ref_id risks a duplicate). Pace fractional bursts ≥2.5s; stop the batch on "can only purchase 0 shares" / "not enough buying power".
- [ ] 14. Route queries keep `{placeholder}` syntax + `--param` (substring matching; raw values don't match); `pnpm build` after any map edit (runtime reads `cli/dist/`).
- [ ] 15. "Sell a call/put" classified BEFORE building (sell-to-close ≠ covered ≠ credit spread ≠ naked — disambiguation table in `knowledge/playbooks/broker-call.md`).
- [ ] 16. Coverage/collateral verified up front: 100 shares same-account per short call; settled cash per CSP.
- [ ] 17. Cash-account rolls staged T+1 (`options roll-plan --cash-account`); same-day open on unsettled cash = good-faith violation.
- [ ] 18. Crypto uses its own auth (API key + Ed25519 signing), not the brokerage bearer.
- [ ] 19. PDT framing current: lifted on RH (no $25k cap); cash accounts still T+1/good-faith.

**EVIDENCE — what counts as proof**

- [ ] 20. **Order history is the only proof an order happened.** It executed only if `orders/` /
  `options/orders/` shows a filled/pending/rejected/cancelled record, or a position/cash/BP
  change confirms it. Screenshots, UI screens, "the button was clicked", a lone 201 without a
  re-read, and agent logs are NOT proof. No record → report non-executed.

## Shared-engine behaviors to rely on (not re-implement)

- **Dedup window:** the equity engine (`placeEquityOrder`, shared by CLI `buy`/`sell` and MCP
  `robinhood_buy`/`robinhood_sell`) blocks duplicate pending orders for the same intent within a
  **5-minute window**; `--force` / `force:true` skips it deliberately.
- **`ref_id` idempotency:** stamped on every order; 429 retries reuse it.
- **Fails closed / fails loud:** a forced write method with no matching write route returns no
  match (never degrades to the GET); ambiguous substrings throw `AmbiguousRouteError` with
  candidates. These errors are the safety net — respect them, don't engineer around them.
- **Dead-quote hard-fail and OTC guard** are built into the buy path.
- Order lifecycle (live-verified): `POST options/orders/` → 201 `queued` → confirm →
  `POST options/orders/{0}/cancel/` (keep the `{0}` placeholder, pass the id via `--param`) →
  200 → re-read shows `cancelled`. A 403 "cannot cancel" on a second try = already cancelled.
  Test orders always use a can't-fill limit ($0.01 buy where tick allows / natural + $200 sell).

## Golden rule

> Reads are free and live; every write is dry-run unless ROBINHOOD_ALLOW_LIVE_WRITE=1 is set. When
> unsure about account, side, position_effect, or amount — stop and confirm. A wrong write is
> real money.

## Deep dives

- `SKILL.md` — the compact binding lifecycle and high-value guards; this module is the canonical
  detailed failure-mode checklist.
- `docs/agent-operating-intelligence-2026-06-04.md` §4 — symptom → diagnosis → fix decision tree.
- `docs/error-code-reference-2026-06-11.md` — the error taxonomy one-for-one.
- `docs/live-write-verification-2026-06-03.md`, `docs/account-settings-capability-map-2026-06-03.md` — what is live-verified vs research-only.
