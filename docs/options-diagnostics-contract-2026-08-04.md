# Read-only options diagnostics contract

`options diagnostics` and `robinhood_options_diagnostics` share `readOptionsOrderDiagnostics`.

## Scope and safety

This capability performs only independently input-gated **GET** reads. It does not call option order review, marketability, creation, replacement, cancellation, or submission endpoints.

| Diagnostic | Required input | Route | Evidence |
|---|---|---|---|
| Available contracts | `accountNumber`, `strategyCode` | `options/orders/available_contracts/{account_number}/` | observed-contract (public bundle) |
| Maximum rollable quantity | `accountNumber`, `strategyCode` | `options/maximum_rollable_quantity/{strategy_code}/` | live-verified |
| Available shares | `accountNumber`, `equityInstrumentId` | `options/orders/available_shares/{account_number}/` | observed-contract (public bundle) |
| Recent rejection | none | `options/has_recent_rejection/` | live-verified (sanitized authenticated structural proof) |
| Exercise checks | `accountNumber`, `optionId` | `options/exercise_checks/` | observed-contract (public bundle) |

`orderToReplaceId` is passed only to the two availability routes where the observed request contract permits it. Missing prerequisites result in local warnings and no request; a failed sub-read leaves independent diagnostics intact.

## Evidence classifications

“Observed-contract” means the path/query model and named response fields were observed in Robinhood’s public web bundle; it does **not** claim authenticated response semantics. `maximum_rollable_quantity` and `has_recent_rejection` are separately labeled `live-verified` from sanitized authenticated structural evidence. Do not promote the remaining bundle-derived capabilities without sanitized authenticated structural proof.

## Usage

```text
options diagnostics --account <N> --strategy-code <CODE> --equity-instrument-id <UUID> --option-id <UUID> --json
```

For replacement-aware availability reads, append `--order-to-replace-id <UUID>`. Account and instrument identifiers are sensitive; keep live outputs private or use synthetic values in tests.

- delilah 🌸
