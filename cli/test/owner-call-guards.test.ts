import { describe, expect, it, beforeEach } from "vitest";
import {
  resolveBash,
  parseAllowedAccounts,
  isAccountAllowed,
  resolveLiveWriteGate,
  checkNotionalCaps,
  recordSessionNotional,
  resetSessionNotionalSpent,
  getSessionNotionalSpent,
  NotionalCapError,
  accountFromWriteRequest,
  optionsOrderNotional,
} from "../src/lib.js";

// Owner-call hardening guards. These prove the defense-in-depth layers actually engage — not slop.

describe("resolveBash (§2.6 — PATH-hijack hardening on a token-handling path)", () => {
  it("returns an absolute /bin/bash on posix (never a bare 'bash')", () => {
    expect(resolveBash("linux", {} as any)).toBe("/bin/bash");
    expect(resolveBash("darwin", {} as any)).toBe("/bin/bash");
  });

  it("honors a validated ROBINHOOD_BASH_PATH override (absolute, existing)", () => {
    // process.execPath is a guaranteed-existing absolute path
    expect(resolveBash("win32", { ROBINHOOD_BASH_PATH: process.execPath } as any)).toBe(process.execPath);
  });

  it("throws if ROBINHOOD_BASH_PATH is set but missing (no silent PATH fallthrough)", () => {
    expect(() => resolveBash("win32", { ROBINHOOD_BASH_PATH: "/no/such/bash.exe" } as any)).toThrow(/not found/);
  });

  it("NEVER returns the bare PATH-resolved 'bash' on win32 — absolute path or throw", () => {
    let result: string | undefined;
    let threw = false;
    try { result = resolveBash("win32", {} as any); } catch { threw = true; }
    if (!threw) {
      expect(result).not.toBe("bash");
      expect(/^([A-Za-z]:|\/)/.test(result as string)).toBe(true); // absolute (drive- or root-anchored)
    } else {
      expect(threw).toBe(true); // no Git bash + no /bin/bash → loud failure, not a PATH hijack
    }
  });
});

describe("account lock (§2.9 — ROBINHOOD_ALLOWED_ACCOUNT)", () => {
  it("parses (trim + drop empties) and matches the allow-list", () => {
    expect(parseAllowedAccounts({ ROBINHOOD_ALLOWED_ACCOUNT: " 111, 222 ,333 ," } as any)).toEqual(["111", "222", "333"]);
    expect(isAccountAllowed("222", { ROBINHOOD_ALLOWED_ACCOUNT: "111,222" } as any)).toBe(true);
    expect(isAccountAllowed("999", { ROBINHOOD_ALLOWED_ACCOUNT: "111,222" } as any)).toBe(false);
  });

  it("an unset/empty allow-list imposes NO restriction (unchanged behavior)", () => {
    expect(isAccountAllowed("anything", {} as any)).toBe(true);
    expect(isAccountAllowed("anything", { ROBINHOOD_ALLOWED_ACCOUNT: "" } as any)).toBe(true);
  });

  it("forces a live write to DRY-RUN for a non-allowed account EVEN WITH the master switch ON", () => {
    const env = { ROBINHOOD_ALLOW_LIVE_WRITE: "1", ROBINHOOD_ALLOWED_ACCOUNT: "111" } as any;
    const gate = resolveLiveWriteGate({ risk: "write-mutate", method: "POST", dryRun: false, accountNumber: "999", env });
    expect(gate.allowed).toBe(false);
    expect(gate.forcedDryRun).toBe(true);
    expect(gate.reason).toMatch(/not in ROBINHOOD_ALLOWED_ACCOUNT/);
  });

  it("allows a live write to an allow-listed account when the switch is on", () => {
    const env = { ROBINHOOD_ALLOW_LIVE_WRITE: "1", ROBINHOOD_ALLOWED_ACCOUNT: "111" } as any;
    const gate = resolveLiveWriteGate({ risk: "write-mutate", method: "POST", dryRun: false, accountNumber: "111", env });
    expect(gate.allowed).toBe(true);
    expect(gate.forcedDryRun).toBe(false);
  });

  it("never affects reads or explicit dry-runs", () => {
    const env = { ROBINHOOD_ALLOW_LIVE_WRITE: "1", ROBINHOOD_ALLOWED_ACCOUNT: "111" } as any;
    expect(resolveLiveWriteGate({ risk: "read", method: "GET", dryRun: false, accountNumber: "999", env }).allowed).toBe(true);
    expect(resolveLiveWriteGate({ risk: "write-mutate", method: "POST", dryRun: true, accountNumber: "999", env }).forcedDryRun).toBe(false);
  });
});

describe("notional caps (§2.8 — ROBINHOOD_MAX_ORDER_DOLLARS / _SESSION_DOLLARS)", () => {
  beforeEach(() => resetSessionNotionalSpent());

  it("throws when an order exceeds the per-order cap; passes within it", () => {
    expect(() => checkNotionalCaps(500, { env: { ROBINHOOD_MAX_ORDER_DOLLARS: "100" } as any })).toThrow(NotionalCapError);
    expect(() => checkNotionalCaps(50, { env: { ROBINHOOD_MAX_ORDER_DOLLARS: "100" } as any })).not.toThrow();
  });

  it("override bypasses the cap", () => {
    expect(() => checkNotionalCaps(500, { override: true, env: { ROBINHOOD_MAX_ORDER_DOLLARS: "100" } as any })).not.toThrow();
  });

  it("trips the SESSION accumulator across multiple orders", () => {
    const env = { ROBINHOOD_MAX_SESSION_DOLLARS: "100" } as any;
    checkNotionalCaps(60, { env });
    recordSessionNotional(60);
    expect(getSessionNotionalSpent()).toBe(60);
    expect(() => checkNotionalCaps(60, { env })).toThrow(NotionalCapError); // 60+60=120 > 100
    expect(() => checkNotionalCaps(30, { env })).not.toThrow(); // 60+30=90 <= 100
  });

  it("no caps configured → never throws, even for a huge order", () => {
    expect(() => checkNotionalCaps(1_000_000, { env: {} as any })).not.toThrow();
  });
});

describe("accountFromWriteRequest (§2.9 — closes the lock-bypass on generic writes / brokerage execute)", () => {
  it("extracts the account from a /accounts/{num}/ body URL (order writes)", () => {
    expect(accountFromWriteRequest({ account: "https://api.robinhood.com/accounts/123456/", side: "buy" })).toBe("123456");
  });

  it("extracts from params (account_number / account / num), trimming", () => {
    expect(accountFromWriteRequest(undefined, { account_number: "111" })).toBe("111");
    expect(accountFromWriteRequest(undefined, { num: " 222 " })).toBe("222");
  });

  it("extracts from body.account_number (number or string)", () => {
    expect(accountFromWriteRequest({ account_number: 999 })).toBe("999");
  });

  it("returns undefined when no account is present (e.g. an account-less cancel) — documented gap", () => {
    expect(accountFromWriteRequest({ foo: "bar" }, {})).toBeUndefined();
    expect(accountFromWriteRequest(undefined, undefined)).toBeUndefined();
  });

  it("END-TO-END: the extracted account drives the lock — a body-account write to a non-allowed account is forced to dry-run", () => {
    const env = { ROBINHOOD_ALLOW_LIVE_WRITE: "1", ROBINHOOD_ALLOWED_ACCOUNT: "111" } as any;
    const body = { account: "https://api.robinhood.com/accounts/999/" };
    const gate = resolveLiveWriteGate({ risk: "write-mutate", method: "POST", dryRun: false, accountNumber: accountFromWriteRequest(body), env });
    expect(gate.forcedDryRun).toBe(true);
    expect(gate.reason).toMatch(/not in ROBINHOOD_ALLOWED_ACCOUNT/);
  });
});

describe("optionsOrderNotional (N4 — extend notional caps to options placements)", () => {
  it("computes gross premium = price × 100 × contracts for an options placement POST", () => {
    expect(optionsOrderNotional("https://api.robinhood.com/options/orders/", "POST", { price: "1.50", quantity: "2" })).toBe(300);
  });

  it("is 0 for a cancel (…/options/orders/{id}/cancel/), never a placement", () => {
    expect(optionsOrderNotional("https://api.robinhood.com/options/orders/abc-123/cancel/", "POST", { price: "1.50", quantity: "2" })).toBe(0);
  });

  it("is 0 for equity orders, GETs, and missing price/qty", () => {
    expect(optionsOrderNotional("https://api.robinhood.com/orders/", "POST", { price: "1", quantity: "1" })).toBe(0);
    expect(optionsOrderNotional("https://api.robinhood.com/options/orders/", "GET", { price: "1", quantity: "1" })).toBe(0);
    expect(optionsOrderNotional("https://api.robinhood.com/options/orders/", "POST", { quantity: "2" })).toBe(0);
  });

  it("feeds the cap: a $30k options order trips ROBINHOOD_MAX_ORDER_DOLLARS=$1k", () => {
    const n = optionsOrderNotional("https://api.robinhood.com/options/orders/", "POST", { price: "150", quantity: "2" }); // $30,000
    expect(n).toBe(30000);
    expect(() => checkNotionalCaps(n, { env: { ROBINHOOD_MAX_ORDER_DOLLARS: "1000" } as any })).toThrow(NotionalCapError);
  });
});
