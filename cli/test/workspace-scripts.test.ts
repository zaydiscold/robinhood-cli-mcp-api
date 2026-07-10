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
});
