# Withdrawal capability — evidence and operating boundary

**As of 2026-09-11.** This document records public rules and the code boundary; it does not claim account-specific eligibility, limits, balances, or a live write contract.

## Public rules (official Robinhood support)

| Rail | Published fee | Published timing | Published reset cadence | Account-specific condition |
|---|---:|---|---|---|
| Standard bank (ACH) | none | 1 day on Robinhood; receiving bank may take longer | business day, 7 PM ET | actual amount/frequency limit is account-specific |
| Instant bank / RTP | 1.75%, min $1, max $150 | typically 10 minutes | calendar day, 12 AM ET | linked with Plaid, bank eligible, requested amount within limit |
| External debit card | 1.75%, min $1, max $150 | up to 30 minutes | calendar day, 12 AM ET | actual eligibility and limit are account-specific |

Official sources retrieved 2026-09-11:

- [Withdraw money from Robinhood](https://robinhood.com/us/en/support/articles/withdraw-money-from-robinhood/) — ACH/no-fee rule, instant fee rule, reset clocks, settlement/pending-deposit/order/referral/margin/options-collateral restrictions, and 60-day different-source verification condition.
- [Transfer types](https://robinhood.com/us/en/support/articles/transfer-types/) — published per-transfer maxima ($250k ACH, $15k debit card, $50k RTP), stated cross-account cumulative limits, and timings. These are not substituted for an authenticated quote.
- [Instant bank transfers](https://robinhood.com/us/en/support/articles/instant-bank-transfers/) — Plaid/select-bank eligibility, 10-minute typical timing, fee deduction, incomplete request expiry, and managed-account exclusion for instant withdrawals.
- [Transfer fees](https://robinhood.com/us/en/support/articles/are-there-fees-for-transfers/) — fee confirmation.

## Product boundary

The engine exposes `bank_standard`, `bank_instant`, and `debit_card` only when a linked destination read identifies them. It evaluates every **owned source × rail × destination × amount** separately using a fresh authenticated quote containing withdrawable cash, eligibility, holds, amount/count windows, reset timestamps, and fee.

Retirement sources are not blanket-disabled. They require an authenticated retirement-flow eligibility assertion. This does not decide tax treatment or eligibility.

No generic ACH `POST` is treated as a withdrawal contract. A live execution is blocked until a sanitized action-scoped capture supplies the exact URL, headers/body semantics, source and destination identifiers, amount field, and status-read route. An ambiguous transport result is terminal for that invocation: read status before any human-approved next action; do not retry.

## Required capture before execution

Capture in the owned browser, without submitting the withdrawal:

1. source-account selection and bank, instant-bank, and debit-card destination variants;
2. each route's limit/fee/hold read and the corresponding response fields;
3. the final **Review** request shape only after a parent has the user's exact account, destination, rail, amount, and live-write approval;
4. immediate history/status read route and stable correlation identifiers.

Raw HAR/auth values stay private and gitignored. Add only sanitized field names, route templates, and fixtures to the repository.
