import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ascendToRepoRoot,
  tokenFromEnvFile,
  refreshBrokerageToken,
  executeBrokerageRequest,
} from "../src/lib.js";

// Pins the systematic-staleness fix AND hardens it for a public repo cloned onto
// Windows/macOS/Linux with Chrome/Brave/Edge and JWT-shaped tokens. Defects guarded:
//   1) READ-PATH: repo-root resolution used a brittle fixed `../..` that pointed at the
//      wrong dir under a different build layout, breaking .env / data-file loading;
//   2) HOLD: the only 401 recovery re-scraped Chrome, so a long-running MCP never picked
//      up an out-of-band / peer-synced token — it kept serving the stale one;
//   3) REGRESSION (boss-review §2.0): the marker-walk must NOT halt at cli/dist, where the
//      build copies api-map/brokerage-routes.json — otherwise .env loading re-breaks.

function tmpEnv(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "rh-env-"));
  const p = join(dir, ".env");
  writeFileSync(p, contents);
  return p;
}

describe("ascendToRepoRoot — repo-root resolution (read-path)", () => {
  it("finds the real repo root via a true-root marker", () => {
    const root = ascendToRepoRoot();
    expect(typeof root).toBe("string");
    expect(existsSync(join(root as string, "pnpm-workspace.yaml"))).toBe(true);
  });

  it("REGRESSION GUARD: does NOT stop at cli/dist even though the build copies api-map there", () => {
    // Reproduce the production layout: api-map/brokerage-routes.json lives BOTH at the true
    // root AND inside cli/dist (copied by `pnpm build`). Starting from cli/dist, the default
    // resolver must walk PAST it to the true root — not treat cli/dist as the root.
    const root = mkdtempSync(join(tmpdir(), "rh-fakeroot-"));
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n");
    mkdirSync(join(root, "cli", "dist", "api-map"), { recursive: true });
    writeFileSync(join(root, "cli", "dist", "api-map", "brokerage-routes.json"), "[]");
    writeFileSync(join(root, "api-map.placeholder"), "x"); // ensure true root is distinct
    const fromDist = join(root, "cli", "dist");
    // Default markers (true-root only) → must return the TRUE root, not cli/dist.
    expect(ascendToRepoRoot(undefined, fromDist)).toBe(root);
    // repoRootFromCli's explicit api-map marker INTENTIONALLY resolves to cli/dist (route data).
    expect(ascendToRepoRoot(["api-map/brokerage-routes.json"], fromDist)).toBe(fromDist);
  });

  it("returns undefined (and terminates) when no marker can be found", () => {
    const isolated = mkdtempSync(join(tmpdir(), "rh-nomarker-"));
    expect(ascendToRepoRoot(["this-marker-does-not-exist.xyz"], isolated)).toBeUndefined();
  });
});

describe("tokenFromEnvFile — cross-environment .env parsing", () => {
  it("reads the token, ignoring comments and blank lines", () => {
    expect(tokenFromEnvFile(tmpEnv("# header\n\nROBINHOOD_BROKERAGE_TOKEN=abc123\nOTHER=x\n"))).toBe("abc123");
  });

  it("does NOT truncate a JWT/base64 token containing '=' (slice, not split)", () => {
    expect(tokenFromEnvFile(tmpEnv("ROBINHOOD_BROKERAGE_TOKEN=aaa.bbb.ccc==\n"))).toBe("aaa.bbb.ccc==");
  });

  it("tolerates Windows CRLF line endings (the #1 cross-OS .env footgun)", () => {
    expect(tokenFromEnvFile(tmpEnv("# c\r\nROBINHOOD_BROKERAGE_TOKEN=wintok\r\nOTHER=1\r\n"))).toBe("wintok");
  });

  it("strips a UTF-8 BOM (Excel/Notepad-saved .env files)", () => {
    expect(tokenFromEnvFile(tmpEnv("﻿ROBINHOOD_BROKERAGE_TOKEN=bomtok\n"))).toBe("bomtok");
  });

  it("strips single and double quotes", () => {
    expect(tokenFromEnvFile(tmpEnv("ROBINHOOD_BROKERAGE_TOKEN=\"dq\"\n"))).toBe("dq");
    expect(tokenFromEnvFile(tmpEnv("ROBINHOOD_BROKERAGE_TOKEN='sq'\n"))).toBe("sq");
  });

  it("ignores a COMMENTED-OUT token line (does not resurrect a disabled token)", () => {
    expect(tokenFromEnvFile(tmpEnv("# ROBINHOOD_BROKERAGE_TOKEN=disabled\nOTHER=1\n"))).toBeUndefined();
  });

  it("returns the FIRST token when duplicated (deterministic)", () => {
    expect(tokenFromEnvFile(tmpEnv("ROBINHOOD_BROKERAGE_TOKEN=first\nROBINHOOD_BROKERAGE_TOKEN=second\n"))).toBe("first");
  });

  it("returns undefined for a missing file, empty value, or no token line", () => {
    expect(tokenFromEnvFile(join(tmpdir(), "definitely-missing-rh-xyz.env"))).toBeUndefined();
    expect(tokenFromEnvFile(tmpEnv("OTHER=1\n"))).toBeUndefined();
    expect(tokenFromEnvFile(tmpEnv("ROBINHOOD_BROKERAGE_TOKEN=\n"))).toBeUndefined();
  });
});

describe("refreshBrokerageToken — disk re-read (scrape disabled)", () => {
  it("returns the on-disk token when it differs from the current stale one", () => {
    expect(refreshBrokerageToken("stale-old", { scrape: false, envPath: tmpEnv("ROBINHOOD_BROKERAGE_TOKEN=fresh-from-disk\n") })).toBe("fresh-from-disk");
  });

  it("returns undefined when the on-disk token equals the current one (nothing fresher)", () => {
    expect(refreshBrokerageToken("same-tok", { scrape: false, envPath: tmpEnv("ROBINHOOD_BROKERAGE_TOKEN=same-tok\n") })).toBeUndefined();
  });

  it("re-reads a CRLF .env correctly when recovering (Windows peer-sync path)", () => {
    expect(refreshBrokerageToken("stale", { scrape: false, envPath: tmpEnv("ROBINHOOD_BROKERAGE_TOKEN=winfresh\r\n") })).toBe("winfresh");
  });

  it("never scrapes when scrape:false and the file has no token", () => {
    expect(refreshBrokerageToken("whatever", { scrape: false, envPath: tmpEnv("OTHER=1\n") })).toBeUndefined();
  });
});

// END-TO-END: drive the real executeBrokerageRequest through the 401 path. Proof that the
// long-running-process bug is fixed — a stale token 401s, the engine re-reads the .env file,
// finds the out-of-band-refreshed token, and retries with it (no Chrome, no restart).
const PLAN = {
  method: "GET",
  url: "https://api.robinhood.com/accounts/",
  risk: "read",
  mutatesAccount: false,
  requiresAuth: true,
} as any;

function makeFetch(statuses: number[]) {
  const auths: Array<string | undefined> = [];
  let i = 0;
  const impl = (async (_url: string, init: any) => {
    auths.push(init?.headers?.authorization);
    const status = statuses[Math.min(i, statuses.length - 1)];
    i += 1;
    return {
      status,
      statusText: status === 200 ? "OK" : "ERR",
      headers: new Headers(),
      text: async () => (status === 200 ? '{"ok":true}' : '{"detail":"unauthorized"}'),
    } as any;
  }) as unknown as typeof fetch;
  return { impl, auths };
}

describe("executeBrokerageRequest — 401 self-heal via .env re-read (end-to-end)", () => {
  it("on a 401, re-reads .env and retries with the refreshed token (no Chrome, no restart)", async () => {
    const env = tmpEnv("ROBINHOOD_BROKERAGE_TOKEN=fresh-token\n");
    const { impl, auths } = makeFetch([401, 200]);
    const result = await executeBrokerageRequest(PLAN, {
      token: "stale-token",
      fetchImpl: impl,
      envPath: env,
      autoRetry: false,
    });
    expect(auths[0]).toBe("Bearer stale-token"); // first attempt used the stale token
    expect(auths.length).toBe(2); // retried exactly once
    expect(auths[1]).toBe("Bearer fresh-token"); // retry used the disk-refreshed token
    expect(result.status).toBe(200);
  });

  it("does NOT retry on 401 when .env holds no fresher token (no pointless re-send / loop)", async () => {
    const env = tmpEnv("ROBINHOOD_BROKERAGE_TOKEN=stale-token\n");
    const { impl, auths } = makeFetch([401]);
    const result = await executeBrokerageRequest(PLAN, {
      token: "stale-token",
      fetchImpl: impl,
      envPath: env,
      autoRetry: false,
    });
    expect(auths.length).toBe(1); // single attempt — nothing fresher to retry with
    expect(result.status).toBe(401);
  });
});
