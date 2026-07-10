import { describe, expect, it } from "vitest";
import { CAPABILITIES, capabilityEnabled } from "../src/lib.js";

describe("typed capability registry", () => {
  it("uses unique ids, CLI commands, and MCP names", () => {
    for (const field of ["id", "cli", "mcp"] as const) {
      const values = CAPABILITIES.map((entry) => entry[field]).filter(Boolean);
      expect(new Set(values).size, `duplicate ${field}`).toBe(values.length);
    }
  });

  it("requires profiles and output schemas for every MCP capability", () => {
    for (const entry of CAPABILITIES) {
      expect(entry.profiles.length).toBeGreaterThan(0);
      expect(entry.outputSchema).toBeTruthy();
      expect(entry.mcp).toMatch(/^robinhood_/);
    }
    expect(CAPABILITIES.filter((entry) => entry.cli).every((entry) => entry.mcp)).toBe(true);
  });

  it("keeps full backward-compatible and filters narrower profiles", () => {
    expect(CAPABILITIES.every((entry) => capabilityEnabled(entry, "full"))).toBe(true);
    expect(CAPABILITIES.find((entry) => entry.id === "options-workbench") && capabilityEnabled(CAPABILITIES.find((entry) => entry.id === "options-workbench")!, "admin")).toBe(false);
  });
});
