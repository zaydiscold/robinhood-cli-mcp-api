import { describe, expect, it } from "vitest";
import { loadRecipes, filterRecipes } from "../src/lib.js";

// T4: runnable recipe index. The committed api-map/recipes.json is the agent's intent→command routing
// table; these tests pin its integrity + the free-text filter so it can't silently rot or drift.

describe("recipe index", () => {
  const recipes = loadRecipes();

  it("loads a non-trivial set of recipes", () => {
    expect(recipes.length).toBeGreaterThanOrEqual(15);
  });

  it("every recipe has the required fields", () => {
    for (const r of recipes) {
      expect(r.id, "id").toBeTruthy();
      expect(r.intent, `intent for ${r.id}`).toBeTruthy();
      expect(Array.isArray(r.triggers) && r.triggers.length > 0, `triggers for ${r.id}`).toBe(true);
      expect(r.command, `command for ${r.id}`).toBeTruthy();
      expect(r.mcpTool, `mcpTool for ${r.id}`).toBeTruthy();
      expect(r.risk, `risk for ${r.id}`).toBeTruthy();
    }
  });

  it("recipe ids are unique", () => {
    const ids = recipes.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("routes the headline 'down today' intent to the portfolio command", () => {
    const hit = filterRecipes(recipes, "after hours");
    expect(hit.some((r) => r.command.includes("portfolio"))).toBe(true);
    expect(hit.some((r) => r.mcpTool === "robinhood_portfolio")).toBe(true);
  });

  it("free-text filter matches across intent, triggers, command, and notes", () => {
    expect(filterRecipes(recipes, "iron condor").length).toBeGreaterThan(0); // trigger phrase
    expect(filterRecipes(recipes, "roll-plan").length).toBeGreaterThan(0);   // command text
    expect(filterRecipes(recipes, "uuid").length).toBeGreaterThan(0);        // notes/triggers
  });

  it("an unfiltered call returns everything; a hopeless filter returns nothing", () => {
    expect(filterRecipes(recipes, undefined).length).toBe(recipes.length);
    expect(filterRecipes(recipes, "zzzzzznotathing").length).toBe(0);
  });

  it("every write recipe documents the double-gate in its command or notes", () => {
    const writes = recipes.filter((r) => r.risk.startsWith("write") || r.risk === "destructive");
    for (const r of writes) {
      const text = `${r.command} ${r.notes ?? ""}`.toLowerCase();
      expect(text.includes("live-write") || text.includes("double-gated") || text.includes("gated"), `gate note for ${r.id}`).toBe(true);
    }
  });
});
