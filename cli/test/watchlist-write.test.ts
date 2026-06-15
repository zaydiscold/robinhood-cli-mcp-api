import { describe, expect, it } from "vitest";
import {
  watchlistMutateItems,
  createWatchlist,
  resolveWatchlist,
  DISCOVERY_LISTS_URL,
  DISCOVERY_LISTS_ITEMS_URL
} from "../src/lib.js";

// Injected-deps, no live network. Pins the verified discovery/lists write contract (captured
// 2026-06-14): items add/remove POST discovery/lists/items/ with a list-id-keyed batch body, and
// create POST discovery/lists/. Asserts method + URL + body shape end-to-end through the engine.

const LISTS_FIXTURE = {
  results: [
    { id: "LID-1", display_name: "Homie index", allowed_object_types: ["instrument"] },
    { id: "LID-2", display_name: "Uranium", allowed_object_types: ["instrument"] }
  ]
};

function fakeGetJson() {
  return async (url: string) => {
    if (url.includes("/discovery/lists/")) return LISTS_FIXTURE;
    throw new Error(`unexpected getJson url: ${url}`);
  };
}

describe("watchlist writes — discovery/lists contract", () => {
  it("resolveWatchlist matches by case-insensitive display_name", async () => {
    const wl = await resolveWatchlist("homie INDEX", { getJson: fakeGetJson() as any });
    expect(wl.id).toBe("LID-1");
    expect(wl.display_name).toBe("Homie index");
  });

  it("resolveWatchlist matches by id and throws on no match", async () => {
    const wl = await resolveWatchlist("LID-2", { getJson: fakeGetJson() as any });
    expect(wl.display_name).toBe("Uranium");
    await expect(resolveWatchlist("nope", { getJson: fakeGetJson() as any })).rejects.toThrow(/No custom watchlist/);
  });

  it("ADD builds a list-keyed batch body with operation=create against discovery/lists/items/", async () => {
    let captured: any;
    const out = await watchlistMutateItems(
      { list: "Homie index", symbols: ["googl", "msft"], operation: "create", dryRun: true },
      {
        getJson: fakeGetJson() as any,
        resolveInstrument: async (s: string) => `uuid-${s.toUpperCase()}`,
        write: async (opts: any) => { captured = opts; return { status: 200, dryRun: true }; }
      }
    );
    expect(captured.method).toBe("POST");
    expect(captured.url).toBe(DISCOVERY_LISTS_ITEMS_URL);
    expect(captured.body).toEqual({
      "LID-1": [
        { object_id: "uuid-GOOGL", object_type: "instrument", operation: "create" },
        { object_id: "uuid-MSFT", object_type: "instrument", operation: "create" }
      ]
    });
    expect(out.items).toEqual([
      { symbol: "GOOGL", object_id: "uuid-GOOGL" },
      { symbol: "MSFT", object_id: "uuid-MSFT" }
    ]);
  });

  it("REMOVE uses operation=delete on the same endpoint", async () => {
    let captured: any;
    await watchlistMutateItems(
      { list: "LID-1", symbols: ["AAPL"], operation: "delete", dryRun: true },
      {
        getJson: fakeGetJson() as any,
        resolveInstrument: async () => "uuid-AAPL",
        write: async (opts: any) => { captured = opts; return { status: 200, dryRun: true }; }
      }
    );
    expect(captured.body).toEqual({ "LID-1": [{ object_id: "uuid-AAPL", object_type: "instrument", operation: "delete" }] });
  });

  it("ADD rejects when no symbols are given", async () => {
    await expect(
      watchlistMutateItems(
        { list: "Homie index", symbols: [], operation: "create", dryRun: true },
        { getJson: fakeGetJson() as any, resolveInstrument: async () => "x", write: async () => ({ status: 200, dryRun: true }) }
      )
    ).rejects.toThrow(/No symbols/);
  });

  it("CREATE posts display_name (+ optional emoji) to discovery/lists/", async () => {
    let captured: any;
    await createWatchlist(
      { displayName: "Og handle fund", iconEmoji: "🛰️", dryRun: true },
      { write: async (opts: any) => { captured = opts; return { status: 201, dryRun: true }; } }
    );
    expect(captured.method).toBe("POST");
    expect(captured.url).toBe(DISCOVERY_LISTS_URL);
    expect(captured.body).toEqual({ display_name: "Og handle fund", icon_emoji: "🛰️" });
  });
});

// Zayd Khan // cold // www.zayd.wtf
