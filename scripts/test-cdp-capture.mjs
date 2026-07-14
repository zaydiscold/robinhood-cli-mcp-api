import assert from "node:assert/strict";
import { assertSanitizedCapture, sanitizeCapture } from "./lib/cdp-capture.mjs";

const secret = "secret-value-that-must-not-survive";
const output = sanitizeCapture({
  capturedAt: secret,
  surfaces: [`account-${secret}`],
  requests: [
    {
      url: `https://api.robinhood.com/accounts/123456789/buying_power/?account_number=${secret}&page_size=25`,
      method: "GET",
      resourceType: "xhr",
      status: 200,
      surface: `portfolio-${secret}`,
      requiresAuth: false,
      requestHeaders: { Authorization: `Bearer ${secret}` },
      responseHeaders: { "Content-Type": "application/json; charset=utf-8" },
      responseBody: JSON.stringify({
        account_number: secret,
        buying_power: "123.45",
        nested: [{ enabled: true }],
        134679852: { state: "active" },
        "123e4567-e89b-12d3-a456-426614174000": { value: secret },
        "person@example.com": { value: secret },
      }),
    },
    {
      url: "https://api.robinhood.com/orders/",
      method: "POST",
      resourceType: "fetch",
      status: 201,
      surface: "order-ticket-observed-no-submit",
      requestHeaders: { Cookie: `session=${secret}`, "Content-Type": "application/json" },
      requestBody: JSON.stringify({ account: secret, quantity: "1", side: "buy" }),
      responseHeaders: { "Content-Type": "application/json" },
      responseBody: JSON.stringify({ id: secret, state: "queued" }),
    },
    { url: `https://example.com/leak?token=${secret}`, method: "GET", resourceType: "xhr" },
  ],
});

assert.equal(output.sanitized, true);
assert.equal(output.routeIndex.length, 2);
assert.equal(output.routeIndex[0].url.path, "/accounts/{id}/buying_power/");
assert.deepEqual(output.routeIndex[0].url.queryKeys, ["account_number", "page_size"]);
assert.equal(output.routeIndex[0].requiresAuth, true);
assert.equal(output.routeIndex[0].responseBodySchema.properties.account_number.type, "string");
assert.equal(output.routeIndex[0].responseBodySchema.properties["{dynamic_key}"].type, "object");
assert.equal(output.routeIndex[1].requestBodySchema.properties.quantity.type, "string");
assert.equal(JSON.stringify(output).includes(secret), false);
assert.equal(JSON.stringify(output).includes("Authorization"), false);
assert.equal(JSON.stringify(output).includes("Cookie"), false);
assert.equal(
  sanitizeCapture({
    requests: [
      {
        url: "https://api.robinhood.com//kaizen/experiments/123e4567-e89b-12d3-a456-426614174000",
        resourceType: "xhr",
      },
    ],
  }).routeIndex[0].url.path,
  "/kaizen/experiments/{uuid}",
);
assert.equal(assertSanitizedCapture(output), output);
assert.throws(
  () => assertSanitizedCapture({ ...output, sanitized: false }),
  /must declare sanitized=true/,
);
assert.throws(
  () =>
    assertSanitizedCapture({
      ...output,
      routeIndex: [{ ...output.routeIndex[0], requestHeaders: { Authorization: secret } }],
    }),
  /forbidden raw field requestHeaders/,
);

console.log("CDP capture sanitizer contract passed");
