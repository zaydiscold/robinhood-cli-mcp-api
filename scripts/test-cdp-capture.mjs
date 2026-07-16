import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertSanitizedCapture,
  canonicalOperationKey,
  sanitizeCapture,
} from "./lib/cdp-capture.mjs";

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

assert.notEqual(
  canonicalOperationKey("GET", "https://api.robinhood.com/instruments/"),
  canonicalOperationKey("GET", "https://api.robinhood.com/instruments/?symbol={symbol}"),
  "route-map merging must preserve query-template variants used by first-class tools",
);
assert.notEqual(
  canonicalOperationKey("GET", "https://api.robinhood.com/instruments/?ids={ids}"),
  canonicalOperationKey("GET", "https://api.robinhood.com/instruments/?symbol={symbol}"),
  "different query shapes on the same path must not collapse into one route",
);

const mergeDir = await mkdtemp(join(tmpdir(), "robinhood-cdp-merge-"));
try {
  const routesPath = join(mergeDir, "routes.json");
  const browserRoutesPath = join(mergeDir, "browser-routes.json");
  const capturePath = join(mergeDir, "capture-2026-07-16.json");
  const baseRoute = {
    host: "api.robinhood.com",
    categories: ["instruments"],
    risk: "read",
    methods: ["GET"],
    source: "fixture",
    fields: [],
    fieldsSource: "undocumented",
  };
  await writeFile(
    routesPath,
    JSON.stringify([
      { ...baseRoute, url: "https://api.robinhood.com/instruments/" },
    ]),
  );
  await writeFile(
    capturePath,
    JSON.stringify({
      schemaVersion: 2,
      sanitized: true,
      capturedAt: "2026-07-16T00:00:00.000Z",
      routeIndex: [
        { method: "GET", type: "XHR", url: { origin: "https://api.robinhood.com", path: "/instruments/", queryKeys: [] } },
        { method: "GET", type: "XHR", url: { origin: "https://api.robinhood.com", path: "/instruments/", queryKeys: ["ids"] } },
        { method: "GET", type: "XHR", url: { origin: "https://api.robinhood.com", path: "/instruments/", queryKeys: ["symbol"] } },
      ],
    }),
  );
  const merged = spawnSync(process.execPath, ["scripts/merge-cdp-capture.mjs", capturePath], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      ROBINHOOD_ROUTES_PATH: routesPath,
      ROBINHOOD_BROWSER_ROUTES_PATH: browserRoutesPath,
    },
    encoding: "utf8",
  });
  assert.equal(merged.status, 0, merged.stderr || merged.stdout);
  const urls = JSON.parse(await readFile(routesPath, "utf8")).map((route) => route.url);
  assert.deepEqual(
    urls.sort(),
    [
      "https://api.robinhood.com/instruments/",
      "https://api.robinhood.com/instruments/?ids={ids}",
      "https://api.robinhood.com/instruments/?symbol={symbol}",
    ].sort(),
    "the actual merge path must preserve base, ids, and symbol route variants",
  );
} finally {
  await rm(mergeDir, { recursive: true, force: true });
}

console.log("CDP capture sanitizer contract passed");
