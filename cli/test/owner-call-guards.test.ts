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
