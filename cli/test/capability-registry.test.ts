import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  DEFAULT_MCP_PROFILE,
  MCP_PROFILE_NAMES,
  capabilitiesForProfile,
  capabilityEnabled,
  parseCapabilityProfile,
} from "../src/lib.js";

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
    expect(
      CAPABILITIES.find((entry) => entry.id === "options-workbench") &&
        capabilityEnabled(
          CAPABILITIES.find((entry) => entry.id === "options-workbench")!,
          "admin",
        ),
    ).toBe(false);
  });

  it("uses the complete full profile by default while retaining explicit lean mode", () => {
    expect(DEFAULT_MCP_PROFILE).toBe("full");
    expect(parseCapabilityProfile(undefined)).toBe("full");
    expect(capabilitiesForProfile(DEFAULT_MCP_PROFILE)).toHaveLength(CAPABILITIES.length);
    expect(
      capabilitiesForProfile(DEFAULT_MCP_PROFILE).some((entry) => entry.access === "write"),
    ).toBe(true);
    expect(capabilitiesForProfile("lean")).toHaveLength(15);
    expect(capabilitiesForProfile("lean").every((entry) => entry.access === "read")).toBe(true);
  });

  it("validates every named profile and rejects typos instead of advertising zero tools", () => {
    for (const profile of MCP_PROFILE_NAMES) {
      expect(parseCapabilityProfile(profile)).toBe(profile);
      expect(capabilitiesForProfile(profile).length).toBeGreaterThan(0);
    }
    expect(() => parseCapabilityProfile("typo")).toThrow(
      /Invalid ROBINHOOD_MCP_PROFILE.*lean.*full/,
    );
    expect(() => capabilitiesForProfile("typo")).toThrow(/Invalid ROBINHOOD_MCP_PROFILE/);
  });
});
