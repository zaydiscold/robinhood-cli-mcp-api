import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, statSync, symlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { activeMcpProfile, isMainModule, mcpError, page, server } from "../src/server.js";
import {
  MCP_PROFILE_NAMES,
  capabilitiesForProfile,
  listKnowledge,
} from "@zaydiscold/robinhood-cli/lib";

const client = new Client({ name: "robinhood-cli-protocol-test", version: "1.0.0" });
const serverBin = fileURLToPath(new URL("../dist/server.js", import.meta.url));

function childEnvironment(profile: string): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    ROBINHOOD_MCP_PROFILE: profile,
  };
}

async function connectProfile(profile: string) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverBin],
    env: childEnvironment(profile),
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    stderr: "pipe",
  });
  const profileClient = new Client({
    name: `robinhood-cli-${profile}-protocol-test`,
    version: "1.0.0",
  });
  await profileClient.connect(transport);
  return { profileClient, transport };
}

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
  await server.close();
});

describe("MCP protocol conformance", () => {
  it("keeps pagination and structured errors machine-actionable", () => {
    expect(page(["a", "b", "c", "d"], 1, 2)).toEqual({
      total: 4,
      count: 2,
      offset: 1,
      limit: 2,
      hasMore: true,
      nextOffset: 3,
      rows: ["b", "c"],
    });
    expect(mcpError(new Error("temporary timeout"))).toEqual(
      expect.objectContaining({
        isError: true,
        structuredContent: {
          error: expect.objectContaining({ retryable: true, message: "temporary timeout" }),
        },
      }),
    );
  });

  it.skipIf(process.platform === "win32")(
    "builds the declared package binary as executable",
    () => {
      const serverBin = fileURLToPath(new URL("../dist/server.js", import.meta.url));
      expect(statSync(serverBin).mode & 0o111).not.toBe(0);
    },
  );

  it.skipIf(process.platform === "win32")(
    "recognizes the package binary when launched through a PATH symlink",
    () => {
      const serverBin = fileURLToPath(new URL("../dist/server.js", import.meta.url));
      const link = join(mkdtempSync(join(tmpdir(), "rh-mcp-bin-")), "robinhood-cli-mcp");
      symlinkSync(serverBin, link);
      expect(isMainModule(new URL("../dist/server.js", import.meta.url).href, link)).toBe(true);
    },
  );

  it("advertises the active profile's complete tool/resource/prompt surface with valid schemas and annotations", async () => {
    const [tools, resources, templates, prompts] = await Promise.all([
      client.listTools(),
      client.listResources(),
      client.listResourceTemplates(),
      client.listPrompts(),
    ]);

    expect(new Set(tools.tools.map((tool) => tool.name)).size).toBe(tools.tools.length);
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
      capabilitiesForProfile(activeMcpProfile)
        .map((entry) => entry.mcp!)
        .sort(),
    );
    // Dynamic, not a literal: resources are exactly listKnowledge() mapped (server.ts), so tie the
    // count to the file-backed source. Catches an accidental resource DROP without breaking every time
    // a knowledge/doc Markdown file is added.
    expect(resources.resources.length).toBe(listKnowledge().length);
    expect(templates.resourceTemplates).toHaveLength(1);
    expect(prompts.prompts).toHaveLength(3);
    const firstResource = resources.resources[0];
    const [resource, prompt] = await Promise.all([
      client.readResource({ uri: firstResource.uri }),
      client.getPrompt({ name: "daily-brief" }),
    ]);
    expect(resource.contents[0]).toEqual(
      expect.objectContaining({
        uri: firstResource.uri,
        mimeType: "text/markdown",
        text: expect.any(String),
      }),
    );
    expect(prompt.messages[0]).toEqual(expect.objectContaining({ role: "user" }));
    expect(
      tools.tools.every((tool) => tool.inputSchema && tool.outputSchema && tool.annotations),
    ).toBe(true);
    expect(resources.resources.map((resource) => resource.name)).toEqual(
      expect.arrayContaining(["readme", "docs-readme", "cli-mcp-architecture", "wheel"]),
    );

    expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
  });

  it("returns both text and structured content over the wire", async () => {
    const result = await client.callTool({
      name: "robinhood_options_strategy_quote",
      arguments: {
        legs: [{ id: "long-call", action: "buy", bid: 1, ask: 1.2 }],
        mode: "mid",
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "text" })]),
    );
    expect(result.structuredContent).toEqual(expect.any(Object));
    expect(JSON.stringify(result.content)).not.toContain("long-call");
  });

  it("surfaces schema failures as protocol errors without invoking a tool", async () => {
    const result = await client.callTool({
      name: "robinhood_options_strategy_quote",
      arguments: { legs: [] },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/invalid|too small|legs/i);
  });

  it("forces an inferred raw mutation to dry-run even when the MCP process is armed", async () => {
    const previous = process.env.ROBINHOOD_ALLOW_LIVE_WRITE;
    process.env.ROBINHOOD_ALLOW_LIVE_WRITE = "1";
    const { profileClient } = await connectProfile("full");
    try {
      const result = await profileClient.callTool({
        name: "robinhood_brokerage_execute",
        arguments: {
          query: "https://api.robinhood.com/ach/relationships/",
          method: "POST",
          body: { bank_routing_number: "000000000" },
        },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(
        expect.objectContaining({
          executed: false,
          executionStatus: expect.stringMatching(/DRY RUN/),
          verificationStatus: "inferred",
        }),
      );
    } finally {
      await profileClient.close();
      if (previous === undefined) delete process.env.ROBINHOOD_ALLOW_LIVE_WRITE;
      else process.env.ROBINHOOD_ALLOW_LIVE_WRITE = previous;
    }
  });
});

describe("MCP profile protocol surfaces", () => {
  for (const profile of MCP_PROFILE_NAMES) {
    it(`advertises exactly the ${profile} manifest`, async () => {
      const { profileClient } = await connectProfile(profile);
      try {
        const tools = await profileClient.listTools();
        expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
          capabilitiesForProfile(profile)
            .map((entry) => entry.mcp!)
            .sort(),
        );
        expect(
          tools.tools.every((tool) => tool.inputSchema && tool.outputSchema && tool.annotations),
        ).toBe(true);
      } finally {
        await profileClient.close();
      }
    });
  }

  it("keeps the default lean tools/list below explicit byte and estimated-token budgets", async () => {
    const { profileClient } = await connectProfile("lean");
    try {
      const tools = await profileClient.listTools();
      const bytes = Buffer.byteLength(JSON.stringify(tools.tools));
      const estimatedTokens = Math.ceil(bytes / 4);
      const instructionBytes = Buffer.byteLength(profileClient.getInstructions() ?? "");
      expect(tools.tools).toHaveLength(15);
      expect(bytes).toBeLessThanOrEqual(40_000);
      expect(estimatedTokens).toBeLessThanOrEqual(10_000);
      expect(instructionBytes).toBeLessThanOrEqual(800);
    } finally {
      await profileClient.close();
    }
  });

  it("paginates high-cardinality discovery responses by default", async () => {
    const { profileClient } = await connectProfile("admin");
    try {
      const first = await profileClient.callTool({
        name: "robinhood_brokerage_routes",
        arguments: {},
      });
      expect(first.isError).not.toBe(true);
      expect(first.structuredContent).toEqual(
        expect.objectContaining({
          total: expect.any(Number),
          count: 25,
          offset: 0,
          limit: 25,
          hasMore: true,
          nextOffset: 25,
          routes: expect.any(Array),
        }),
      );
      const routes = (first.structuredContent as { routes: unknown[] }).routes;
      expect(routes).toHaveLength(25);

      const second = await profileClient.callTool({
        name: "robinhood_brokerage_routes",
        arguments: { offset: 25, limit: 10 },
      });
      expect(second.structuredContent).toEqual(
        expect.objectContaining({ offset: 25, limit: 10, count: 10 }),
      );
    } finally {
      await profileClient.close();
    }
  });

  it("rejects an invalid profile during protocol startup with an actionable error", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverBin],
      env: childEnvironment("typo"),
      cwd: fileURLToPath(new URL("../..", import.meta.url)),
      stderr: "pipe",
    });
    let stderr = "";
    transport.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const invalidClient = new Client({
      name: "robinhood-cli-invalid-profile-test",
      version: "1.0.0",
    });
    await expect(invalidClient.connect(transport)).rejects.toThrow();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    expect(stderr).toMatch(/Invalid ROBINHOOD_MCP_PROFILE=.*typo.*lean.*full/s);
    await transport.close();
  });
});
