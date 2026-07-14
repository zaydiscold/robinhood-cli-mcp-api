import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  DEFAULT_MCP_PROFILE,
  MCP_PROFILE_NAMES,
  capabilitiesForProfile,
  capabilityEnabled,
  parseCapabilityProfile
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
    expect(CAPABILITIES.find((entry) => entry.id === "options-workbench") && capabilityEnabled(CAPABILITIES.find((entry) => entry.id === "options-workbench")!, "admin")).toBe(false);
  });

  it("uses a small explicit lean profile by default", () => {
    expect(DEFAULT_MCP_PROFILE).toBe("lean");
    expect(parseCapabilityProfile(undefined)).toBe("lean");
    expect(capabilitiesForProfile(DEFAULT_MCP_PROFILE)).toHaveLength(15);
    expect(capabilitiesForProfile(DEFAULT_MCP_PROFILE).every((entry) => entry.access === "read")).toBe(true);
    expect(capabilitiesForProfile(DEFAULT_MCP_PROFILE).map((entry) => entry.mcp)).toEqual(expect.arrayContaining([
      "robinhood_accounts",
      "robinhood_portfolio",
      "robinhood_options_chain",
      "robinhood_pretrade",
      "robinhood_order_status",
      "robinhood_doctor"
    ]));
  });

  it("validates every named profile and rejects typos instead of advertising zero tools", () => {
    for (const profile of MCP_PROFILE_NAMES) {
      expect(parseCapabilityProfile(profile)).toBe(profile);
      expect(capabilitiesForProfile(profile).length).toBeGreaterThan(0);
    }
    expect(() => parseCapabilityProfile("typo")).toThrow(/Invalid ROBINHOOD_MCP_PROFILE.*lean.*full/);
    expect(() => capabilitiesForProfile("typo")).toThrow(/Invalid ROBINHOOD_MCP_PROFILE/);
  });
});
