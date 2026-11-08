# Portfolio-read reliability audit — October 27, 2026

This audit compared authenticated broker responses, the visible account page, CLI JSON, human tables, and MCP source. Private responses and account screenshots remain outside this repository's public documentation. No account changes or trades were submitted.

## Findings and implemented changes

1. **Performance:** chart point `y` values were interpreted as returns. Current broker responses use those values as plotting coordinates. Return amounts and percentages now come from displayed broker fields, including negative color/icon metadata. Missing percentage data remains null; the renderer does not print `undefined%`. Broker display is not an independently reconstructed return or tax result.
2. **Holdings:** the unscoped equity endpoint can default to a single account. The MCP also used first-page reads and silently converted per-account failures to empty results. One shared `readOwnedEquityPositions` engine now enumerates owned accounts and paginates explicitly for both CLI and MCP, keeps account identity, and refuses unknown completeness. Human output masks account tails.
3. **Option order history:** the unscoped endpoint returned only the default account in this audit. Unified history now queries options separately per owned account, retains order ID/account/symbol provenance, deduplicates, and fails explicitly on a missing options account read. It is still a transaction view, not a full lot/campaign ledger.
4. **Maintenance:** derived risk bands previously omitted the broker's maintenance excess including uncleared deposits. JSON and human output now expose that value and its difference from settled maintenance. The source of the band is explicit; it is not presented as a formal broker call notice. A broker-reported debit in an IRA must not automatically be called a permitted interest-bearing margin loan.
5. **Concentration:** existing gross-position weights remain available and are labeled. Net-equity weights are additive fields and stay unknown for nonpositive equity. Neither measure is a delta-adjusted, look-through exposure model.
6. **Documentation:** the README was shortened and the workflow reference separated. Incorrect “token never leaves the machine” and blanket authentication-retry statements were corrected. Fictional system-message copy was removed. Private encrypted operator files remain optional and encrypted; credentials remain excluded from Git.

## Reproducibility

Use the source-built `cli/dist/cli-entry.js`. Compare `accounts`, account-scoped positions, `portfolio --by position --top 0`, `options positions`, `margin`, `exposure`, and `performance --span ytd --json` against the owner's browser. For performance inspect the exact mapped GET `https://bonfire.robinhood.com/portfolio/performance/{id}/` with `display_span=ytd`, not just the curve coordinates. For maintenance inspect GET `portfolios/{account_number}/` and both `excess_maintenance` fields. Use explicit `account_numbers` with `options/orders/` and exhaust pagination before claiming history coverage.

Regression coverage includes signed display returns, unknown returns, all-account option provenance, shared paginated equity inventory, account-discovery/read failures, pending maintenance adjustments, gross/net denominators, and nonpositive equity. Run the repository build, built test suites, and quality checks; record live reads separately from fixture checks.

## Product boundaries and remaining work

Existing MCP profiles are discovery scopes, not independent authorization levels. A simple public presentation can distinguish review, research/planning, and execution while retaining the current write gate and exact approval contract. No new profile or automatic execution authority was added.

A reliable future campaign ledger must merge execution fills, cancellations with partial fills, explicit multi-leg rolls, expirations, assignments/exercises, corporate adjustments, transferred lots, fees, and current inventory in chronological order. Timing-based close/rebuy matches are candidates, not proven roll intent. Report unmatched quantities and opening-period value before claiming period returns. Current unified history prose is insufficient as an accounting database.

The audit does not establish a cause for any external model safeguard or promise that a README rewrite prevents refusals. Tests do not certify all private broker behavior or all account types. Missing Greek coverage, cross-ticker look-through exposure, and a fully reconciled cash-flow performance ledger remain separate capabilities.
