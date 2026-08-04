# Options order-flow request contracts — 2026-08-04

## Why this changed

The previous `options order-flow` sent naked GETs to `/options/fees/` and `/options/orders/collateral/`. Public 2026 web-bundle analysis proved the routes were plausible but the requests were malformed: both endpoints are request-model reads whose nested objects are JSON-serialized into query fields.

## Current read-only contracts

| Surface | Request |
|---|---|
| Fee quote | `GET /options/fees/?legs=<JSON-stringified prospective legs>` |
| Exact collateral | `GET /options/orders/collateral/?order=<JSON-stringified complete prospective order>` |
| Supplemental chain context | `GET /options/chains/{id}/collateral/` |

The engine supplies query objects to `brokerageGetJson`; the URL planner performs percent encoding. No request body is sent. Chain-level context is deliberately returned as `chainCollateral` and is never presented as exact order collateral.

## CLI

```bash
node cli/dist/index.js options order-flow \
  --account <ACCOUNT> \
  --legs-json '<prospective-leg-array>' \
  --order-json '<complete-prospective-order-object>' \
  --json
```

`--chain-id` is optional supplemental context. If `--legs-json` or `--order-json` is absent, that request is skipped locally with an actionable warning instead of sending a malformed naked GET.

## MCP

`robinhood_options_order_flow` accepts the same typed inputs:

- `accountNumber?`
- `chainId?`
- `legs?: Record<string, unknown>[]`
- `order?: Record<string, unknown>`

It never reviews or submits the prospective order.

## Evidence classification

- Serialization contracts: `observed-contract` from public web bundle modules `557131` (fees) and `474280` (collateral).
- Authenticated no-draft behavior: live-verified 2026-08-04; account buying power succeeded and malformed fee/collateral calls were skipped.
- Production response semantics for real prospective orders remain `observed-contract` until a sanitized authenticated read is exercised with a user-approved draft.

## Regression proof

`cli/test/options-order-flow.test.ts` asserts:

1. decoded `legs` deep-equals the supplied synthetic legs;
2. decoded `order` deep-equals the supplied synthetic full draft;
3. no-input paths make neither malformed request;
4. chain context remains separately labeled;
5. independent read failures degrade to warnings.

No account identifiers, option UUIDs, live order drafts, quotes, holdings, auth state, or response payloads are retained in this document.
