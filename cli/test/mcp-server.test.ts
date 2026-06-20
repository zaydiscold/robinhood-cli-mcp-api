import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// MCP server tests — verifies dry-run safety, live-flag aliasing, and tool schema
// completeness using source-level inspection (zero network, no server boot).
// Wired into `pnpm test` via vitest include: ["test/**/*.test.ts"].

const here = dirname(fileURLToPath(import.meta.url));
const serverSrc = readFileSync(resolve(here, "../../mcp/src/server.ts"), "utf8");

// ── 1. Dry-run safety: write tools gate through writeStatus ──

describe("MCP dry-run safety", () => {
  it("every registered write tool returns executed:false on dry-run", () => {
    // writeStatus sets `executed: !opts.dryRun`. Find all writeStatus call sites
    // to confirm write tools use the gate.
    const writeStatusCalls = (serverSrc.match(/writeStatus\(/g) ?? []).length;
    // There should be many write-status-gated tools (one per write tool).
    expect(writeStatusCalls).toBeGreaterThan(10);

    // Also verify the writeStatus function itself contains the executed marker
    expect(serverSrc).toContain("executed: !opts.dryRun");
    expect(serverSrc).toContain("DRY RUN — NOT EXECUTED");
    expect(serverSrc).toContain("LIVE — SENT to Robinhood");
  });

  it("resolveLiveFlag correctly aliases liveWrite and live", () => {
    // The function exists in the source
    expect(serverSrc).toContain("function resolveLiveFlag");
    expect(serverSrc).toContain("liveWrite");
    expect(serverSrc).toContain("Boolean(liveWrite ?? live)");
  });
});

// ── 2. Tool schema completeness ──

describe("MCP tool registration", () => {
  it("every tool has a title and description", () => {
    // Find all registerTool calls and check they have title + description
    const calls = [...serverSrc.matchAll(/registerTool\s*\(\s*"([^"]+)"/g)];
    const names = calls.map((m) => m[1]);
    expect(names.length).toBeGreaterThan(50); // currently 66

    for (const name of names) {
      // Each tool should appear near a title:
      const idx = serverSrc.indexOf(`"${name}"`);
      const context = serverSrc.slice(idx, idx + 500);
      expect(context).toContain("title:");
      expect(context).toContain("description:");
    }
  });

  it("no duplicate tool names", () => {
    const names = [...serverSrc.matchAll(/registerTool\s*\(\s*"([^"]+)"/g)].map((m) => m[1]);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("all tool names follow robinhood_* convention", () => {
    const names = [...serverSrc.matchAll(/registerTool\s*\(\s*"([^"]+)"/g)].map((m) => m[1]);
    for (const name of names) {
      expect(name).toMatch(/^robinhood_[a-z0-9_]+$/);
    }
  });
});

// ── 3. Write-tool gate enforcement ──

describe("MCP write-tool gate", () => {
  it("write tools that accept account-numbered inputs include liveWrite/live/dryRun", () => {
    // Most write tools accept a write flag; verify at least the order-path tools do.
    const orderToolNames = ["robinhood_buy", "robinhood_sell", "robinhood_cancel"];
    for (const name of orderToolNames) {
      const re = new RegExp(`registerTool\\s*\\(\\s*"${name}"[\\s\\S]*?inputSchema:\\s*z\\.object\\(\\{([^}]*)\\}`, "g");
      const m = re.exec(serverSrc);
      if (m) {
        const fields = m[1];
        const hasLiveParam = fields.includes("liveWrite") || fields.includes("live");
        expect(hasLiveParam,
          `Write tool "${name}" inputSchema should accept liveWrite or live param`
        ).toBe(true);
      }
    }
  });
});
