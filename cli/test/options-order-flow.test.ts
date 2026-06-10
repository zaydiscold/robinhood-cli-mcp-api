import { describe, expect, it } from "vitest";
import { readOptionsOrderFlow } from "../src/lib.js";

// T5: options order-flow reads (buying power / fees / collateral) composed into one pre-trade context,
// each degrading independently so one failure never blanks the rest.

function deps(fix: { bp?: any; fees?: any; collateral?: any; throwOn?: string[] }) {
  const getJson = async (url: string) => {
    const fail = (k: string) => fix.throwOn?.includes(k);
    if (url.includes("options_buying_power")) { if (fail("bp")) throw new Error("503"); return fix.bp; }
    if (url.includes("options/fees")) { if (fail("fees")) throw new Error("503"); return fix.fees; }
    if (url.includes("collateral")) { if (fail("collateral")) throw new Error("503"); return fix.collateral; }
    throw new Error("unexpected " + url);
  };
  return { getJson };
}

const base = { bp: { options_buying_power: "1234.56" }, fees: { regulatory_fees: "0.03" }, collateral: { collateral: [] } };

describe("readOptionsOrderFlow", () => {
  it("composes buying power + fees + collateral when an account is given", async () => {
    const r = await readOptionsOrderFlow({ accountNumber: "111" }, deps(base));
    expect(r.buyingPower.options_buying_power).toBe("1234.56");
    expect(r.fees).toBeTruthy();
    expect(r.collateral).toBeTruthy();
    expect(r.warnings).toEqual([]);
  });

  it("uses chain-level collateral when chainId is given (else order-level)", async () => {
    let seen = "";
    const probe = { getJson: async (url: string) => { if (url.includes("collateral")) seen = url; return {}; } };
    await readOptionsOrderFlow({ accountNumber: "111", chainId: "abc" }, probe);
    expect(seen).toContain("options/chains/{id}/collateral/");
    await readOptionsOrderFlow({ accountNumber: "111" }, probe);
    expect(seen).toContain("options/orders/collateral/");
  });

  it("warns (does not crash) when account omitted — buying power is per-account", async () => {
    const r = await readOptionsOrderFlow({}, deps(base));
    expect(r.buyingPower).toBeUndefined();
    expect(r.warnings.some((w) => /per-account/.test(w))).toBe(true);
    expect(r.fees).toBeTruthy(); // global reads still happen
  });

  it("degrades each read independently — one failure doesn't blank the others", async () => {
    const r = await readOptionsOrderFlow({ accountNumber: "111" }, deps({ ...base, throwOn: ["fees"] }));
    expect(r.buyingPower).toBeTruthy();
    expect(r.collateral).toBeTruthy();
    expect(r.fees).toBeUndefined();
    expect(r.warnings.some((w) => /fees read failed/.test(w))).toBe(true);
  });
});
