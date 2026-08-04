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
