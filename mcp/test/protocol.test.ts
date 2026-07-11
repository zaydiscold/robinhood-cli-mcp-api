import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { server } from "../src/server.js";
import { CAPABILITIES, listKnowledge } from "@zaydiscold/robinhood-cli/lib";

const client = new Client({ name: "robinhood-cli-protocol-test", version: "1.0.0" });

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport)
  ]);
});

afterAll(async () => {
  await client.close();
  await server.close();
});

describe("MCP protocol conformance", () => {
  it.skipIf(process.platform === "win32")("builds the declared package binary as executable", () => {
    const serverBin = fileURLToPath(new URL("../dist/server.js", import.meta.url));
    expect(statSync(serverBin).mode & 0o111).not.toBe(0);
  });

  it("advertises the complete tool/resource/prompt surface with valid schemas and annotations", async () => {
    const [tools, resources, templates, prompts] = await Promise.all([
      client.listTools(),
      client.listResources(),
      client.listResourceTemplates(),
      client.listPrompts()
    ]);

    expect(new Set(tools.tools.map((tool) => tool.name)).size).toBe(tools.tools.length);
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(CAPABILITIES.map((entry) => entry.mcp!).sort());
    // Dynamic, not a literal: resources are exactly listKnowledge() mapped (server.ts), so tie the
    // count to the file-backed source. Catches an accidental resource DROP without breaking every time
    // a knowledge/doc Markdown file is added.
    expect(resources.resources.length).toBe(listKnowledge().length);
    expect(templates.resourceTemplates).toHaveLength(1);
    expect(prompts.prompts).toHaveLength(3);
    expect(tools.tools.every((tool) => tool.inputSchema && tool.outputSchema && tool.annotations)).toBe(true);
    expect(resources.resources.map((resource) => resource.name)).toEqual(expect.arrayContaining([
      "readme",
      "docs-readme",
      "cli-mcp-architecture",
      "wheel"
    ]));

    for (const name of ["robinhood_buy", "robinhood_sell", "robinhood_cancel", "robinhood_panic"]) {
      const tool = tools.tools.find((candidate) => candidate.name === name);
      expect(tool, `${name} missing`).toBeTruthy();
      expect((tool!.inputSchema as { properties?: Record<string, unknown> }).properties).toHaveProperty("dryRun");
    }
  });

  it("returns both text and structured content over the wire", async () => {
    const result = await client.callTool({
      name: "robinhood_api_map_summary",
      arguments: {}
    });

    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "text" })
    ]));
    expect(result.structuredContent).toEqual(expect.objectContaining({
      unified: expect.any(Object),
      brokerage: expect.any(Object)
    }));
  });

  it("surfaces schema failures as protocol errors without invoking a tool", async () => {
    const result = await client.callTool({
      name: "robinhood_buy",
      arguments: { symbol: "INVALID SYMBOL", account_number: "not-numeric", dryRun: true }
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/invalid|account|symbol/i);
  });

  it("forces an inferred raw mutation to dry-run even when the MCP process is armed", async () => {
    const previous = process.env.ROBINHOOD_ALLOW_LIVE_WRITE;
    process.env.ROBINHOOD_ALLOW_LIVE_WRITE = "1";
    try {
      const result = await client.callTool({
        name: "robinhood_brokerage_execute",
        arguments: {
          query: "https://api.robinhood.com/ach/relationships/",
          method: "POST",
          body: { bank_routing_number: "000000000" },
        },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(expect.objectContaining({
        executed: false,
        executionStatus: expect.stringMatching(/DRY RUN/),
        verificationStatus: "inferred",
      }));
    } finally {
      if (previous === undefined) delete process.env.ROBINHOOD_ALLOW_LIVE_WRITE;
      else process.env.ROBINHOOD_ALLOW_LIVE_WRITE = previous;
    }
  });
});
