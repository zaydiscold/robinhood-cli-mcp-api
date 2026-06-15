import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Tool-count guard. The MCP server's tool count is referenced by a hard number in SKILL.md,
// AGENTS.md, and README — and it has rotted before (docs said 38 / 40+ / 48 while the source
// registered 50; see claims-audit CNT-1/2/6). This test forces anyone who adds or removes a
// tool to CONSCIOUSLY bump the expected count here, which is the reminder to also fix the docs.
// It is deterministic and offline: it parses mcp/src/server.ts source, no server boot, no network.

const EXPECTED_TOOL_COUNT = 53;
const FAIL_MSG =
  "tool count changed — update SKILL.md/AGENTS.md/README tool-count references and this test.";

const here = dirname(fileURLToPath(import.meta.url));
const serverSrc = readFileSync(resolve(here, "../../mcp/src/server.ts"), "utf8");

describe("MCP tool-count guard", () => {
  it(`registers exactly ${EXPECTED_TOOL_COUNT} tools via registerTool`, () => {
    const registerCalls = serverSrc.match(/\bregisterTool\s*\(/g) ?? [];
    expect(registerCalls.length, FAIL_MSG).toBe(EXPECTED_TOOL_COUNT);
  });

  it(`declares exactly ${EXPECTED_TOOL_COUNT} distinct robinhood_* tool names`, () => {
    const names = new Set(
      [...serverSrc.matchAll(/"(robinhood_[a-z0-9_]+)"/g)].map((m) => m[1])
    );
    expect(names.size, FAIL_MSG).toBe(EXPECTED_TOOL_COUNT);
  });

  it("the registerTool count matches the distinct-name count (no dupes, no untitled regs)", () => {
    const registerCalls = (serverSrc.match(/\bregisterTool\s*\(/g) ?? []).length;
    const names = new Set(
      [...serverSrc.matchAll(/"(robinhood_[a-z0-9_]+)"/g)].map((m) => m[1])
    ).size;
    expect(registerCalls, FAIL_MSG).toBe(names);
  });
});

// Zayd Khan // cold // www.zayd.wtf
