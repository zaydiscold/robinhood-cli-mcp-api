import { describe, expect, it } from "vitest";
import { readOptionsOrderFlow } from "../src/lib.js";

// Options order-flow reads are strictly non-ordering. Fee and collateral models require
// prospective-order context serialized as JSON inside query fields; a naked GET is malformed.

function deps(fix: { bp?: any; fees?: any; collateral?: any; chainCollateral?: any; throwOn?: string[] }) {
  const calls: Array<{ url: string; params: Record<string, string>; query: Record<string, string> }> = [];
  const getJson = async (
    url: string,
    params: Record<string, string> = {},
    query: Record<string, string> = {},
  ) => {
    calls.push({ url, params, query });
    const fail = (k: string) => fix.throwOn?.includes(k);
    if (url.includes("options_buying_power")) { if (fail("bp")) throw new Error("503"); return fix.bp; }
    if (url.includes("options/fees")) { if (fail("fees")) throw new Error("503"); return fix.fees; }
    if (url.includes("options/orders/collateral")) { if (fail("collateral")) throw new Error("503"); return fix.collateral; }
    if (url.includes("options/chains/") && url.includes("collateral")) {
      if (fail("chainCollateral")) throw new Error("503");
      return fix.chainCollateral;
    }
    throw new Error("unexpected " + url);
  };
  return { getJson, calls };
}

const legs = [
  {
    option: "https://api.robinhood.com/options/instruments/option-1/",
    side: "buy",
    position_effect: "open",
    ratio_quantity: 1,
  },
];
const order = {
  account: "https://api.robinhood.com/accounts/account-1/",
  direction: "debit",
  legs,
  price: "1.00",
  quantity: "1",
  time_in_force: "gfd",
  trigger: "immediate",
  type: "limit",
};
const base = {
  bp: { options_buying_power: "1234.56" },
  fees: { regulatory_fees: "0.03" },
  collateral: { collateral: [] },
  chainCollateral: { collateral: [] },
};

describe("readOptionsOrderFlow", () => {
  it("composes buying power, order-specific fees, and order-specific collateral", async () => {
    const d = deps(base);
    const r = await readOptionsOrderFlow({ accountNumber: "111", legs, order }, d);
    expect(r.buyingPower.options_buying_power).toBe("1234.56");
    expect(r.fees).toBeTruthy();
    expect(r.collateral).toBeTruthy();
    expect(r.warnings).toEqual([]);
  });

  it("JSON-serializes prospective legs and the full order into query fields", async () => {
    const d = deps(base);
    await readOptionsOrderFlow({ accountNumber: "111", legs, order }, d);

    const feeCall = d.calls.find((c) => c.url.includes("options/fees"));
    const collateralCall = d.calls.find((c) => c.url.includes("options/orders/collateral"));
    expect(feeCall?.params).toEqual({});
    expect(JSON.parse(feeCall?.query.legs ?? "null")).toEqual(legs);
    expect(collateralCall?.params).toEqual({});
    expect(JSON.parse(collateralCall?.query.order ?? "null")).toEqual(order);
  });

  it("skips malformed fee/collateral requests when prospective inputs are absent", async () => {
    const d = deps(base);
    const r = await readOptionsOrderFlow({ accountNumber: "111" }, d);
    expect(d.calls.some((c) => c.url.includes("options/fees"))).toBe(false);
    expect(d.calls.some((c) => c.url.includes("options/orders/collateral"))).toBe(false);
    expect(r.fees).toBeUndefined();
    expect(r.collateral).toBeUndefined();
    expect(r.warnings.some((w) => /prospective legs/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /prospective order/.test(w))).toBe(true);
  });

  it("keeps chain-level collateral as separately labeled supplemental context", async () => {
    const d = deps(base);
    const r = await readOptionsOrderFlow({ accountNumber: "111", chainId: "abc", legs, order }, d);
    expect(r.collateral).toEqual(base.collateral);
    expect(r.chainCollateral).toEqual(base.chainCollateral);
    expect(d.calls.some((c) => c.url.includes("options/chains/{id}/collateral/"))).toBe(true);
  });

  it("warns without crashing when account is omitted", async () => {
    const d = deps(base);
    const r = await readOptionsOrderFlow({ legs, order }, d);
    expect(r.buyingPower).toBeUndefined();
    expect(r.warnings.some((w) => /per-account/.test(w))).toBe(true);
    expect(r.fees).toBeTruthy();
    expect(r.collateral).toBeTruthy();
  });

  it("degrades each read independently", async () => {
    const d = deps({ ...base, throwOn: ["fees"] });
    const r = await readOptionsOrderFlow({ accountNumber: "111", legs, order }, d);
    expect(r.buyingPower).toBeTruthy();
    expect(r.collateral).toBeTruthy();
    expect(r.fees).toBeUndefined();
    expect(r.warnings.some((w) => /fees read failed/.test(w))).toBe(true);
  });
});

// Zayd Khan // cold // www.zayd.wtf
