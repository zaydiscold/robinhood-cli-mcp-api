import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("workspace package scripts", () => {
  it("use Corepack for nested pnpm calls so clean Windows hosts do not require a global shim", () => {
    for (const relative of ["../../package.json", "../../mcp/package.json"]) {
      const manifest = JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));
      for (const [name, script] of Object.entries(manifest.scripts ?? {})) {
        expect(String(script), `${relative} script ${name}`).not.toMatch(/(?:^|&&\s*)pnpm\s/);
      }
    }
  });

  it("routes the MCP pretest build through the portable pnpm launcher", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../mcp/package.json", import.meta.url), "utf8"));
    expect(manifest.scripts?.pretest).toContain("pnpm-portable.mjs");
    expect(manifest.scripts?.pretest).not.toMatch(/(?:^|&&\s*)corepack\s+pnpm\s/);
  });

  it("keeps VERSION aligned with published package versions", () => {
    const version = readFileSync(new URL("../../VERSION", import.meta.url), "utf8").trim();
    for (const relative of ["../../package.json", "../../cli/package.json", "../../mcp/package.json"]) {
      const manifest = JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));
      expect(manifest.version, relative).toBe(version);
    }
  });

  it("documents the GitHub clone directory and MCP server path for this repo slug", () => {
    const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
    expect(readme).toMatch(
      /git clone https:\/\/github\.com\/zaydiscold\/robinhood-cli-mcp-api\.git\r?\ncd robinhood-cli-mcp-api\r?\n/,
    );
    expect(readme).toContain("robinhood-cli-mcp-api/mcp/dist/server.js");
    expect(readme).not.toMatch(/\bcd robinhood-cli(?:\r?\n|\s|$)/);
    expect(readme).not.toContain("/robinhood-cli/mcp/dist/server.js");

    const mcpReadme = readFileSync(new URL("../../mcp/README.md", import.meta.url), "utf8");
    expect(mcpReadme).toContain("robinhood-cli-mcp-api/mcp/dist/server.js");
    expect(mcpReadme).not.toContain("/robinhood-cli/mcp/dist/server.js");
  });

  it("repairs the Unix executable mode for the declared MCP package binary", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../mcp/package.json", import.meta.url), "utf8"));
    expect(manifest.bin?.["robinhood-cli-mcp"]).toBe("dist/server.js");
    expect(manifest.scripts?.build).toContain("ensure-bin-mode.mjs");
  });

  it("normalizes Windows path separators before comparing the Prettier debt baseline", () => {
    const script = readFileSync(
      new URL("../../scripts/check-format-ratchet.mjs", import.meta.url),
      "utf8",
    );
    expect(script).toContain('replaceAll("\\\\", "/")');
  });

  it("uses the cross-platform Python command for skill integrity checks", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(manifest.scripts?.["test:skill"]).toMatch(/^python\s/);
    expect(manifest.scripts?.["test:skill"]).not.toMatch(/^python3\s/);
  });
});
