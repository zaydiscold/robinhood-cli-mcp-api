import { describe, expect, it } from "vitest";
import {
  getTaxLotInventory,
  rankTaxLots,
  planTaxLotSale,
  submitTaxLotSale,
  getTaxLotsForOrder,
  type TaxLot,
} from "../src/lib.js";

const NOW = Date.parse("2026-08-08T12:00:00Z");
const rawLots = [
  {
    account_number: "A1",
    instrument_id: "iid-hpe",
    open_lot_id: "lot-new-loss",
    open_tran_type: "buy",
    order_id: "order-new",
    quantity: "4.000000",
    quantity_available: "3.500000",
    book_cost_basis: "100.00",
    tax_cost_basis: "108.00",
    book_proceeds: "0.00",
    open_date: "2026-07-15",
    term: "short_term",
    is_selectable: true,
    cost_per_share: "27.00",
  },
  {
    account_number: "A1",
    instrument_id: "iid-hpe",
    open_lot_id: "lot-old-gain",
    open_tran_type: "buy",
    order_id: "order-old",
    quantity: "5.000000",
    quantity_available: "5.000000",
    book_cost_basis: "85.00",
    tax_cost_basis: "90.00",
    book_proceeds: "0.00",
    open_date: "2025-07-20",
    term: "long_term",
    is_selectable: true,
    cost_per_share: "18.00",
  },
  {
    account_number: "A1",
    instrument_id: "iid-hpe",
    open_lot_id: "lot-stale",
    quantity: "2.000000",
    quantity_available: "0.000000",
    book_cost_basis: "60.00",
    tax_cost_basis: null,
    open_date: "2025-01-01",
    term: "long_term",
    is_selectable: false,
    cost_per_share: "30.00",
  },
];

const expectedTaxLotKeys = [
  "account_number",
  "book_cost_basis",
  "book_proceeds",
  "cost_per_share",
  "instrument_id",
  "is_selectable",
  "open_date",
  "open_lot_id",
  "open_tran_type",
  "order_id",
  "quantity",
  "quantity_available",
  "tax_cost_basis",
  "term",
].sort();

function deps(overrides: Record<string, unknown> = {}) {
  const calls: Array<{
    url: string;
    path?: Record<string, string>;
    query?: Record<string, string>;
  }> = [];
  return {
    calls,
    deps: {
      now: () => NOW,
      getJson: async (
        url: string,
        path?: Record<string, string>,
        query?: Record<string, string>,
      ) => {
        calls.push({ url, path, query });
        if (url.includes("transfer/accounts"))
          return { results: [{ type: "rhs", account_number: "A1", account_type: "margin" }] };
        if (url.includes("instruments/?symbol"))
          return { results: [{ id: "iid-hpe", symbol: "HPE" }] };
        if (url.includes("marketdata/quotes"))
          return {
            results: [
              {
                last_trade_price: "24.00",
                bid_price: "23.99",
                ask_price: "24.01",
                updated_at: "2026-08-08T11:59:30Z",
              },
            ],
          };
        if (url.includes("tax_lots/open")) return { results: rawLots };
        throw new Error(`unexpected ${url}`);
      },
      ...overrides,
    },
  };
}

describe("tax-lot inventory", () => {
  it("normalizes the live 14-field lot contract and distinguishes tax basis from book/display basis", async () => {
    const d = deps();
    const result = await getTaxLotInventory({ symbol: "hpe", accountNumber: "A1" }, d.deps);
    expect(result.symbol).toBe("HPE");
    expect(result.eligibility).toEqual({
      status: "evaluated",
      eligible: true,
      source: "owned account type plus open-lot is_selectable fields",
    });
    expect(result.lots).toHaveLength(3);
    expect(Object.keys(result.rawFieldContract).sort()).toEqual(expectedTaxLotKeys);
    expect(result.lots[0]).toMatchObject({
      openLotId: "lot-new-loss",
      quantity: 4,
      quantityAvailable: 3.5,
      bookCostBasisUsd: 100,
      taxCostBasisUsd: 108,
      taxCostPerShareUsd: 27,
      currentPriceUsd: 24,
      unrealizedGainLossUsd: -10.5,
      term: "short_term",
      termSource: "robinhood",
      selectable: true,
    });
    expect(d.calls.find((c) => c.url.includes("tax_lots/open"))?.query).toMatchObject({
      sort_type: "date",
      sort_direction: "DESC",
      fetch_max_abs_values: "true",
      price: "24.00",
    });
  });

  it("returns explicit not-evaluated basis math rather than treating missing basis as zero", async () => {
    const result = await getTaxLotInventory({ symbol: "HPE", accountNumber: "A1" }, deps().deps);
    const stale = result.lots.find((lot) => lot.openLotId === "lot-stale")!;
    expect(stale.taxBasis).toEqual({
      status: "not_evaluated",
      reason: "tax_cost_basis is missing",
    });
    expect(stale.unrealizedGainLossUsd).toBeNull();
  });
});

describe("tax-aware lot ranking", () => {
  const lots: TaxLot[] = [
    {
      openLotId: "loss-short",
      quantityAvailable: 2,
      taxCostPerShareUsd: 30,
      currentPriceUsd: 20,
      unrealizedGainLossUsd: -20,
      term: "short_term",
      openDate: "2026-01-01",
      selectable: true,
    } as TaxLot,
    {
      openLotId: "gain-long",
      quantityAvailable: 2,
      taxCostPerShareUsd: 10,
      currentPriceUsd: 20,
      unrealizedGainLossUsd: 20,
      term: "long_term",
      openDate: "2024-01-01",
      selectable: true,
    } as TaxLot,
    {
      openLotId: "gain-short",
      quantityAvailable: 2,
      taxCostPerShareUsd: 15,
      currentPriceUsd: 20,
      unrealizedGainLossUsd: 10,
      term: "short_term",
      openDate: "2026-02-01",
      selectable: true,
    } as TaxLot,
  ];

  it("supports harvest-loss, minimize-gain, long-term-first, and FIFO objectives deterministically", () => {
    expect(rankTaxLots(lots, "harvest_loss").map((x) => x.openLotId)).toEqual([
      "loss-short",
      "gain-short",
      "gain-long",
    ]);
    expect(rankTaxLots(lots, "minimize_gain").map((x) => x.openLotId)).toEqual([
      "loss-short",
      "gain-short",
      "gain-long",
    ]);
    expect(rankTaxLots(lots, "long_term_first").map((x) => x.openLotId)).toEqual([
      "gain-long",
      "loss-short",
      "gain-short",
    ]);
    expect(rankTaxLots(lots, "fifo").map((x) => x.openLotId)).toEqual([
      "gain-long",
      "loss-short",
      "gain-short",
    ]);
  });
});

describe("exact-lot sell planning", () => {
  it("selects exact stable lot IDs, permits partial lots, and builds Robinhood's production custom-lot body", async () => {
    const result = await planTaxLotSale(
      { symbol: "HPE", accountNumber: "A1", shares: 4, objective: "harvest_loss", dryRun: true },
      deps().deps,
    );
    expect(result.selections).toEqual([
      { openLotId: "lot-new-loss", quantity: 3.5 },
      { openLotId: "lot-old-gain", quantity: 0.5 },
    ]);
    expect(result.orderBody).toMatchObject({
      symbol: "HPE",
      side: "sell",
      position_effect: "close",
      quantity: "4",
      tax_lot_selection_type: "custom",
      tax_lots: [
        { open_lot_id: "lot-new-loss", quantity: "3.5" },
        { open_lot_id: "lot-old-gain", quantity: "0.5" },
      ],
      market_hours: "regular_hours",
      order_form_version: "7",
    });
    expect(result.estimatedRealized).toMatchObject({
      totalUsd: -7.5,
      shortTermUsd: -10.5,
      longTermUsd: 3,
    });
    expect(result.estimatedFederalTaxImpact).toEqual({
      status: "not_evaluated",
      reason: "short-term and long-term marginal tax rates were not supplied",
      requiredInputs: ["shortTermRate", "longTermRate"],
    });
    expect(result.washSale).toEqual({
      status: "not_evaluated",
      reason: "cross-account acquisition and replacement-intent history was not supplied",
      requiredInputs: ["acquisitions61DayWindow", "replacementIntent"],
    });
    expect(result.live).toBe(false);
  });

  it("computes an assumption-labeled federal estimate only when both rates are supplied", async () => {
    const result = await planTaxLotSale(
      {
        symbol: "HPE",
        accountNumber: "A1",
        shares: 4,
        objective: "harvest_loss",
        shortTermRate: 0.32,
        longTermRate: 0.15,
      },
      deps().deps,
    );
    expect(result.estimatedFederalTaxImpact).toEqual({
      status: "evaluated",
      estimatedUsd: -2.91,
      assumptions: {
        shortTermRate: 0.32,
        longTermRate: 0.15,
        excludesStateLocalNiitAndTaxProfileNetting: true,
      },
    });
  });

  it("rejects IRA harvesting, unavailable or unknown lots, over-allocation, and ambiguous manual totals", async () => {
    const ira = deps({
      getJson: async (url: string) => {
        if (url.includes("transfer/accounts"))
          return { results: [{ type: "rhs", account_number: "A1", account_type: "ira_roth" }] };
        throw new Error("must stop before lot reads");
      },
    });
    await expect(
      planTaxLotSale(
        { symbol: "HPE", accountNumber: "A1", shares: 1, objective: "harvest_loss" },
        ira.deps,
      ),
    ).rejects.toThrow(/tax-loss harvesting is not applicable.*IRA/i);

    await expect(
      planTaxLotSale(
        { symbol: "HPE", accountNumber: "A1", shares: 99, objective: "harvest_loss" },
        deps().deps,
      ),
    ).rejects.toThrow(/only 8\.5 selectable shares/i);
    await expect(
      planTaxLotSale(
        { symbol: "HPE", accountNumber: "A1", selections: [{ openLotId: "missing", quantity: 1 }] },
        deps().deps,
      ),
    ).rejects.toThrow(/unknown open_lot_id/i);
    await expect(
      planTaxLotSale(
        {
          symbol: "HPE",
          accountNumber: "A1",
          shares: 2,
          selections: [{ openLotId: "lot-new-loss", quantity: 1 }],
        },
        deps().deps,
      ),
    ).rejects.toThrow(/selection total.*requested shares/i);
  });

  it("routes exact-lot submission through the shared gated write and remains dry-run by default", async () => {
    const writes: any[] = [];
    const d = deps({
      write: async (request: any) => {
        writes.push(request);
        return { status: 0, dryRun: true, body: JSON.stringify(request.body) };
      },
    });
    const result = await submitTaxLotSale(
      { symbol: "HPE", accountNumber: "A1", shares: 1, objective: "highest_basis" },
      d.deps,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      url: "https://api.robinhood.com/orders/",
      method: "POST",
      liveWrite: false,
      body: {
        quantity: "1",
        tax_lot_selection_type: "custom",
        tax_lots: [{ open_lot_id: "lot-new-loss", quantity: "1" }],
      },
    });
    expect(result).toMatchObject({ live: false, dryRun: true, state: null, orderId: null });
  });

  it("fails closed before the write chokepoint when live exact-lot submission is requested", async () => {
    const writes: unknown[] = [];
    const d = deps({
      write: async (request: unknown) => {
        writes.push(request);
        return { status: 201, dryRun: false, body: "{}" };
      },
    });
    await expect(
      submitTaxLotSale(
        {
          symbol: "HPE",
          accountNumber: "A1",
          shares: 1,
          objective: "highest_basis",
          liveWrite: true,
          dryRun: false,
        },
        d.deps,
      ),
    ).rejects.toThrow(/exact-lot live submission.*not mapped/i);
    expect(writes).toHaveLength(0);
  });
});

describe("post-order lot verification", () => {
  it("reads selected and closed lots with account scope so execution can be reconciled", async () => {
    const calls: string[] = [];
    const result = await getTaxLotsForOrder(
      { orderId: "order-1", accountNumber: "A1" },
      {
        getJson: async (url: string) => {
          calls.push(url);
          if (url.includes("transfer/accounts"))
            return { results: [{ type: "rhs", account_number: "A1" }] };
          if (url.includes("/selected/"))
            return { results: [{ open_lot_id: "lot-1", active_quantity: "0.5" }] };
          if (url.includes("/closed/"))
            return { results: [{ open_lot_id: "lot-1", quantity: "0.5", gain_loss: "-2" }] };
          throw new Error(`unexpected ${url}`);
        },
      },
    );
    expect(calls.some((url) => url.includes("/selected/"))).toBe(true);
    expect(calls.some((url) => url.includes("/closed/"))).toBe(true);
    expect(result).toMatchObject({
      orderId: "order-1",
      selected: [{ open_lot_id: "lot-1", active_quantity: "0.5" }],
      closed: [{ open_lot_id: "lot-1", quantity: "0.5", gain_loss: "-2" }],
      settlementStatus: "closed_lots_available",
    });
  });
});
