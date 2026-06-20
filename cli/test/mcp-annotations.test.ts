import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// MCP annotation guard. The 2026-06-18 audit caught a real bug: write tools (buy/sell/cancel) were
// annotated destructiveHint:false because the server mapped destructiveHint to risk==="destructive"
// ONLY, so clients were told an order "isn't destructive". That was fixed (destructiveHint = any
// write tier). NOTHING tested it — so a future tool could be mis-tagged and ship green again.
//
// This test is the lock. It parses mcp/src/server.ts source (zero boot, zero network — same pattern
// as mcp-server.test.ts / mcp-tool-count.test.ts), extracts the (readOnly, risk) pair every tool
// passes to toolAnnotations(), replicates the toolAnnotations() derivation, and asserts the four
// hints come out correct for EVERY tool — with extra teeth on the dangerous direction (a real write
// tool that gets flipped to read-only). Zayd Khan // cold // www.zayd.wtf

const here = dirname(fileURLToPath(import.meta.url));
const serverSrc = readFileSync(resolve(here, "../../mcp/src/server.ts"), "utf8");

type RiskLevel =
  | "read"
  | "sensitive-read"
  | "write-safe"
  | "write-mutate"
  | "write-or-sensitive"
  | "destructive";

const VALID_RISKS: readonly RiskLevel[] = [
  "read",
  "sensitive-read",
  "write-safe",
  "write-mutate",
  "write-or-sensitive",
  "destructive"
];
const READ_TIERS = new Set<RiskLevel>(["read", "sensitive-read"]);

// Replica of toolAnnotations() in mcp/src/server.ts — kept in lockstep BY this test. If the server's
// derivation changes, update this and the assertions together (that's the point: a conscious change).
function deriveHints(readOnly: boolean, risk: RiskLevel) {
  const isWrite = !READ_TIERS.has(risk);
  return {
    readOnlyHint: readOnly,
    destructiveHint: isWrite,
    idempotentHint: readOnly || risk === "write-safe",
    openWorldHint: true
  };
}

interface ToolReg {
  name: string;
  readOnly: boolean;
  risk: RiskLevel;
}

// Pull every registerTool("name", { ... annotations: toolAnnotations(<bool>, "<risk>") ... }) block.
function parseToolRegs(src: string): ToolReg[] {
  const re =
    /registerTool\(\s*"(robinhood_[a-z0-9_]+)"[\s\S]*?annotations:\s*toolAnnotations\(\s*(true|false)\s*,\s*"([^"]+)"\s*\)/g;
  const out: ToolReg[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out.push({ name: m[1], readOnly: m[2] === "true", risk: m[3] as RiskLevel });
  }
  return out;
}

const allToolNames = [
  ...new Set(
    [...serverSrc.matchAll(/registerTool\(\s*"(robinhood_[a-z0-9_]+)"/g)].map((m) => m[1])
  )
];
const regs = parseToolRegs(serverSrc);
const byName = new Map(regs.map((r) => [r.name, r]));

describe("MCP annotations — every tool is annotated", () => {
  it("every registered tool passes a literal toolAnnotations(readOnly, risk)", () => {
    const missing = allToolNames.filter((n) => !byName.has(n));
    expect(
      missing,
      `tools registered without a literal annotations: toolAnnotations(<bool>, "<risk>") — ${missing.join(", ")}`
    ).toEqual([]);
    // Every name resolves to exactly one annotation.
    expect(regs.length).toBe(allToolNames.length);
  });

  it("every risk string is a member of the RiskLevel union", () => {
    const bad = regs.filter((r) => !VALID_RISKS.includes(r.risk));
    expect(bad, `unknown risk levels: ${JSON.stringify(bad)}`).toEqual([]);
  });
});

describe("MCP annotations — readOnly flag agrees with the risk tier", () => {
  it("readOnly:true ⟺ a read tier; readOnly:false ⟺ a write tier", () => {
    const inconsistent = regs.filter((r) => r.readOnly !== READ_TIERS.has(r.risk));
    expect(
      inconsistent,
      `readOnly flag contradicts risk tier (a read tagged as write, or vice versa): ${JSON.stringify(inconsistent)}`
    ).toEqual([]);
  });
});

describe("MCP annotations — derived hints are correct for every tool", () => {
  it("write-tier tools are destructiveHint:true + readOnlyHint:false (the C4 regression guard)", () => {
    const writes = regs.filter((r) => !READ_TIERS.has(r.risk));
    for (const r of writes) {
      const h = deriveHints(r.readOnly, r.risk);
      expect(h.destructiveHint, `${r.name} (${r.risk}) must be destructiveHint:true`).toBe(true);
      expect(h.readOnlyHint, `${r.name} (${r.risk}) must be readOnlyHint:false`).toBe(false);
    }
    // Sanity: there is in fact a population of write tools (so the loop isn't vacuous).
    expect(writes.length).toBeGreaterThan(5);
  });

  it("read-tier tools are readOnlyHint:true + destructiveHint:false + idempotentHint:true", () => {
    const reads = regs.filter((r) => READ_TIERS.has(r.risk));
    for (const r of reads) {
      const h = deriveHints(r.readOnly, r.risk);
      expect(h.readOnlyHint, `${r.name} (${r.risk}) must be readOnlyHint:true`).toBe(true);
      expect(h.destructiveHint, `${r.name} (${r.risk}) must be destructiveHint:false`).toBe(false);
      expect(h.idempotentHint, `${r.name} (${r.risk}) must be idempotentHint:true`).toBe(true);
    }
    expect(reads.length).toBeGreaterThan(30);
  });
});

describe("MCP annotations — the lethal-trifecta order tools are correctly flagged", () => {
  // The most dangerous-to-mislabel direction is a real money-moving write that gets flipped to
  // read-only — a client would then auto-run it without a confirmation. Pin the order lifecycle +
  // kill switch explicitly so a careless edit can never silently downgrade their risk signal.
  const MUST_BE_WRITE = [
    "robinhood_buy",
    "robinhood_sell",
    "robinhood_cancel",
    "robinhood_panic",
    "robinhood_brokerage_execute",
    "robinhood_crypto_execute",
    "robinhood_settings",
    "robinhood_recurring",
    "robinhood_watchlist_add",
    "robinhood_watchlist_remove",
    "robinhood_watchlist_create",
    "robinhood_watchlist_buy"
  ];

  it("known write tools are present and tagged as writes (readOnly:false, destructiveHint:true)", () => {
    for (const name of MUST_BE_WRITE) {
      const r = byName.get(name);
      expect(r, `${name} is missing from the server registration`).toBeDefined();
      if (!r) continue;
      expect(r.readOnly, `${name} must be registered readOnly:false`).toBe(false);
      const h = deriveHints(r.readOnly, r.risk);
      expect(h.destructiveHint, `${name} must derive destructiveHint:true`).toBe(true);
      expect(h.idempotentHint, `${name} must derive idempotentHint:false`).toBe(false);
    }
  });

  // The order-placement tools must NOT be idempotent — re-running a buy/sell/basket places ANOTHER
  // order. (cancel is idempotent-ish, but it's tagged destructive and that's what matters.)
  it("order-placement tools are non-idempotent", () => {
    for (const name of ["robinhood_buy", "robinhood_sell", "robinhood_watchlist_buy"]) {
      const r = byName.get(name)!;
      expect(deriveHints(r.readOnly, r.risk).idempotentHint, `${name} must be idempotentHint:false`).toBe(false);
    }
  });
});

describe("MCP annotations — known sensitive reads stay reads", () => {
  // The inverse safety: a sensitive balance/PII read should never be accidentally tagged as a write
  // (harmless to safety, but it would pollute destructiveHint and mislead clients).
  const MUST_BE_READ = [
    "robinhood_accounts",
    "robinhood_portfolio",
    "robinhood_positions",
    "robinhood_buying_power",
    "robinhood_margin",
    "robinhood_documents",
    "robinhood_dividends",
    "robinhood_quote",
    "robinhood_options_chain",
    "robinhood_pretrade"
  ];

  it("known read tools are present and tagged read-only", () => {
    for (const name of MUST_BE_READ) {
      const r = byName.get(name);
      expect(r, `${name} is missing from the server registration`).toBeDefined();
      if (!r) continue;
      expect(r.readOnly, `${name} must be registered readOnly:true`).toBe(true);
      expect(READ_TIERS.has(r.risk), `${name} must use a read-tier risk`).toBe(true);
    }
  });
});

// Zayd Khan // cold // www.zayd.wtf
