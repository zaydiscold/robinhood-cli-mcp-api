import { describe, expect, it } from "vitest";
import { classifyLimitScope } from "../src/money-movement-quote.js";

describe("money movement limit scope", () => {
  it("classifies the observed LimitHub product-direction bucket as shared across sources", () => {
    expect(
      classifyLimitScope(
        { product_type: "originated_ach", details: { direction: "withdraw" } },
        "originated_ach",
        "withdrawal",
      ),
    ).toEqual({
      providerProduct: "originated_ach",
      direction: "withdrawal",
      sourceSpecificBucket: false,
      sharedAcrossSources: true,
      provenance: "limitshub_product_direction_without_source_key",
    });
  });

  it("keeps scope unknown when LimitHub has no matching product bucket", () => {
    expect(classifyLimitScope(null, "originated_ach", "deposit")).toEqual({
      providerProduct: "originated_ach",
      direction: "deposit",
      sourceSpecificBucket: null,
      sharedAcrossSources: null,
      provenance: "limit_bucket_not_observed",
    });
  });
});
