# Multi-leg options — click-through capture plan (2026-06-03)

Goal: capture the **exact `options/orders/` body shape per strategy** (legs, side, position_effect,
ratio_quantity, direction) so the order builder is hard-documented and an agent can't malform a
multi-leg order. Capturing fires on the **Review** screen (`POST bonfire/options/orders/review` +
`/marketability/`) — which runs BEFORE submit — so **nothing gets placed.**

## How to run it (interceptor is armed on the AAPL chain)
For EACH strategy below, in the same armed tab (`/options/chains/AAPL?account_number=…`):
1. Build the legs in the order ticket (tap **Ask** to buy-to-open a leg, **Bid** to sell-to-open).
2. Advance to the **Review** screen — this fires the capture.
3. **Do NOT submit.** Back out, build the next strategy.
Pick the soonest monthly expiration and strikes around spot (ATM ± a few). Liquidity errors at
Review are fine — the body still fires and is captured.

## The strategies to click (each = one captured "hard route")
1. **Long call** — buy-to-open 1 ATM call (tap Ask) → Review. *(direction debit, 1 leg buy/open)*
2. **Long put** — buy-to-open 1 ATM put → Review.
3. **Covered call (CC)** — sell-to-open 1 OTM call (tap Bid) → Review. *(needs 100 sh; warn ok)*
4. **Cash-secured put (CSP)** — sell-to-open 1 OTM put → Review. *(credit, 1 leg sell/open)*
5. **Call debit spread** — buy lower-strike call + sell higher-strike call, same expiry → Review.
6. **Call credit spread** — sell lower call + buy higher call → Review.
7. **Put credit spread** — sell higher put + buy lower put → Review.
8. **Put debit spread** — buy higher put + sell lower put → Review.
9. **Long straddle** — buy call + buy put, **same** strike → Review.
10. **Long strangle** — buy OTM call + buy OTM put, **different** strikes → Review.
11. **Iron condor** — sell put + buy lower-put wing + sell call + buy higher-call wing (4 legs) → Review.
12. **Call (or put) butterfly** — buy 1 low + sell 2 mid + buy 1 high, same type/expiry (1-2-1) → Review.
13. **Calendar** — same strike/type, **two different expirations** (sell near, buy far) → Review.

## Reference: leg structure each should produce (so we can verify the capture)
| Strategy | direction | legs (side / position_effect / ratio) |
|---|---|---|
| Long call/put | debit | buy/open ×1 |
| CC | credit | sell/open call ×1 (collateral: 100 sh) |
| CSP | credit | sell/open put ×1 (collateral: cash) |
| Call debit spread | debit | buy/open low + sell/open high |
| Call credit spread | credit | sell/open low + buy/open high |
| Put credit spread | credit | sell/open high + buy/open low |
| Put debit spread | debit | buy/open high + sell/open low |
| Straddle/strangle (long) | debit | buy/open call + buy/open put |
| Iron condor | credit | sell put + buy put-wing + sell call + buy call-wing (1 each) |
| Butterfly | debit | buy 1 + sell 2 + buy 1 (ratio 1/2/1) |
| Calendar | debit | sell near-exp + buy far-exp (same strike) |

After you click through, say **"harvest"** — I'll pull each captured `review` body, confirm the legs
match the table, and write the per-strategy order-body templates into the skill + AGENTS.md as
hard, copy-safe references (redundant on purpose, so a weak agent can't get the legs wrong).

<!-- Zayd Khan // cold // www.zayd.wtf -->
