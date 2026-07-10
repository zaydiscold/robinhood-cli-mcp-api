# Plan 003: Validate document download hosts before attaching bearer auth

> Executor instructions: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report; do not improvise.
>
> Drift check: `git diff --stat e6cdb44..HEAD -- cli/src/lib.ts cli/test/dividends-documents-margin.test.ts`
> If in-scope code changed, compare the excerpts below against live code before editing.

## Status

- Priority: P1
- Effort: S
- Risk: LOW
- Depends on: none
- Category: security
- Planned at: commit `e6cdb44`, 2026-07-06, with uncommitted WIP present

## Why this matters

The main brokerage transport now validates auth destinations before attaching bearer/cookie auth. `downloadDocuments()` bypasses that transport and sends the bearer header directly to each document `download_url`. If a malformed or compromised document record points outside the allowed Robinhood hosts, the function should not attach private auth to that destination.

## Current state

- `cli/src/lib.ts:533-566` defines `BROKERAGE_AUTH_HOSTS` and `assertBrokerageAuthDestination(url)`.
- `cli/src/lib.ts:2187-2195` calls `assertBrokerageAuthDestination(plan.url)` in the main brokerage transport.
- `cli/src/lib.ts:5076-5083` builds headers for document downloads and attaches `authorization` when a token is present.
- `cli/src/lib.ts:5089-5093` fetches `d.downloadUrl` directly with those headers.
- Existing document tests in `cli/test/dividends-documents-margin.test.ts:185-243` cover tax-year filters and filenames, but not unsafe download hosts.

## Scope

In scope:
- `cli/src/lib.ts`
- `cli/test/dividends-documents-margin.test.ts`

Out of scope:
- Do not change document filename semantics.
- Do not change list filters or tax-year mapping.
- Do not fetch real documents in tests.

## Steps

1. Before attaching `authorization`, parse each document download URL with `assertBrokerageAuthDestination()` or an equivalent local helper.

2. Decide the intended behavior for non-allow-listed hosts:
- Preferred: do not download and add a per-file failure like `unsafe download host; authentication was not attached`.
- Acceptable only if verified: fetch a cross-origin storage URL without bearer/cookie headers. If choosing this, tests must prove auth headers are omitted for that request.

3. Add tests with injected `fetchImpl`:
- an allowed Robinhood download URL receives auth and downloads
- an external URL does not receive auth and is reported as failed or fetched unauthenticated, depending on the chosen behavior
- an invalid URL is reported as a per-file failure, not a process-level crash

4. Keep per-file failure collection behavior. One bad URL must not stop other document downloads.

## Test plan

- Run `corepack pnpm --filter @zaydiscold/robinhood-cli test -- dividends-documents-margin`.
- Run `corepack pnpm --filter @zaydiscold/robinhood-cli typecheck`.

## Done criteria

- [x] `downloadDocuments()` never attaches bearer/cookie auth to a URL outside the brokerage auth allow-list.
- [x] Tests prove auth header behavior with injected `fetchImpl`.
- [x] Existing document filter and filename tests still pass.

## STOP conditions

- Stop if live Robinhood document downloads require a non-allow-listed storage host to receive bearer auth. Report the host and evidence without exposing tokens.

## Maintenance notes

Any future raw fetch path that carries brokerage auth should reuse the same destination validation used by `executeBrokerageRequest()`.
