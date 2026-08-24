# Security Policy

This project can access and, when explicitly armed, mutate a live brokerage account. Treat authentication material, account data, order evidence, downloaded documents, and private route captures as sensitive.

## Supported versions

Security fixes target the latest commit on `main` and the latest tagged release. Older revisions may not receive backports.

## Report vulnerabilities privately

Use the repository's GitHub **Security** tab and private vulnerability reporting or a draft security advisory when that option is available.

Never place any of the following in a public issue, pull request, discussion, or screenshot:

- browser-session or brokerage bearer tokens
- cookies, authorization headers, MFA or challenge data, device identifiers, or API/private keys
- account numbers, balances, positions, order IDs, signed document URLs, or downloaded statements
- unsanitized CDP captures, `.env` files, logs, or local operator ledgers
- an exploit that could bypass a live-write, account-lock, notional-cap, provenance, deduplication, or idempotency guard

If private reporting is unavailable, open a public issue containing only a request for a private contact channel. Do not include vulnerability details or sensitive data.

## High-priority security scope

Reports are especially important when they involve:

- bypassing dry-run or `ROBINHOOD_ALLOW_LIVE_WRITE` controls
- sending a mutation to an unapproved account or inferred/unverified route
- duplicate order execution, unsafe retry behavior, or incorrect outcome evidence
- credential, account, document, or signed-URL disclosure
- path traversal or unsafe file writes in download/export flows
- redaction failures in share-safe output or public fixtures
- command, argument, URL, or request-body injection

## Safe validation

Use synthetic fixtures, local tests, and dry-run request bodies. Do not authenticate to another person's account. Do not submit, cancel, or modify a real order or account setting while validating a report unless the account owner has explicitly approved the exact account, operation, instrument, quantity, and limit.

When sharing a reproduction privately, minimize the payload and replace all real identifiers and values with synthetic equivalents whenever possible.
