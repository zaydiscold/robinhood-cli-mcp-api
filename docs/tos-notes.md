# ToS Notes

Robinhood's official Crypto Trading API is documented and credentialed.

## Brokerage / Account Surface

The brokerage/account surface in this repository is reverse-engineered from community tooling
and browser-visible behavior. It accesses Robinhood's **private web API** (the same one the
web app uses) using your browser session token — not a public or documented API.

**⚠️ ToS Risk:** Robinhood's Terms of Service almost certainly prohibit automated or non-browser
access to their private API. The token extraction is purely local (reads your own
already-authenticated session from Chrome's on-disk storage — zero network calls, no browser
automation), but the resulting API calls may violate Robinhood's ToS. Enforcement is typically
against scraping/fraud, not individual account-holders accessing their own data, but the
project does not distribute credentials or provide unauthorized access to third-party accounts.

**Treat this as personal-use research.** Do not run automated live account actions without
reviewing current Robinhood terms and getting explicit user approval for the exact action.

This personal repo includes live brokerage/account execution. The operational boundary is
exact-action consent: read routes can be used for account inspection; write-mutate and
destructive routes should only be used when the user asked for that specific live mutation.

All writes are env-gated by `ROBINHOOD_ALLOW_LIVE_WRITE=1` — the single master switch.
Without it, every write is a dry-run.

<!-- Zayd Khan // cold // www.zayd.wtf -->
