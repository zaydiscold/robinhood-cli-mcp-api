#!/usr/bin/env node
// Scrape the CURRENT x-robinhood-web-app-version header via a CDP-debuggable Chrome
// and persist it to .env as ROBINHOOD_WEB_APP_VERSION.
//
// Why: equity orders are gated on a fresh-enough web app version; the header value rotates
// with Robinhood's web builds. The login page (the SPA shell) sends it on its own pre-auth
// requests, so NO Robinhood login is required in the debug browser — any Chrome started with
// --remote-debugging-port works (e.g. the shared `chrome-debug` profile on 9222).
//
// Usage: pnpm version:refresh   (or: node scripts/scrape-web-app-version.mjs [--port 9222])
// Requires Node >= 22 (global WebSocket). Prints the captured version; exits 1 on failure.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = process.argv.includes("--port")
  ? Number(process.argv[process.argv.indexOf("--port") + 1])
  : Number(process.env.CDP_PORT ?? 9222);
const VERSION_RE = /^\d{4}\.\d+\.\d+\+[a-z0-9]+$/i;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

if (typeof WebSocket === "undefined") {
  console.error("Node >= 22 required (global WebSocket). Current:", process.version);
  process.exit(1);
}

const fail = (msg) => { console.error(`scrape-web-app-version: ${msg}`); process.exit(1); };

let wsUrl;
try {
  const info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  wsUrl = info.webSocketDebuggerUrl;
} catch {
  fail(`no CDP browser on port ${PORT}. Start one first (e.g. \`chrome-debug\`, or any Chrome with --remote-debugging-port=${PORT}).`);
}

const ws = new WebSocket(wsUrl);
let nextId = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

const version = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timed out after 30s — header never observed")), 30_000);
  let targetId, sessionId;

  const cleanupAnd = (fn, value) => {
    clearTimeout(timer);
    // Best-effort tab cleanup; never let cleanup mask the result.
    const done = () => { try { ws.close(); } catch {} fn(value); };
    if (targetId) send("Target.closeTarget", { targetId }).then(done, done);
    else done();
  };

  ws.onerror = (e) => cleanupAnd(reject, new Error(`websocket error: ${e.message ?? e.type}`));
  ws.onmessage = (raw) => {
    const msg = JSON.parse(typeof raw.data === "string" ? raw.data : raw.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve: res, reject: rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      return;
    }
    // Event: watch both header surfaces — requestWillBeSent carries JS-set headers,
    // ExtraInfo carries the wire-complete set.
    if (msg.method === "Network.requestWillBeSent" || msg.method === "Network.requestWillBeSentExtraInfo") {
      const headers = msg.params?.request?.headers ?? msg.params?.headers ?? {};
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === "x-robinhood-web-app-version" && VERSION_RE.test(String(v))) {
          cleanupAnd(resolve, String(v));
          return;
        }
      }
    }
  };
  ws.onopen = async () => {
    try {
      ({ targetId } = await send("Target.createTarget", { url: "about:blank" }));
      ({ sessionId } = await send("Target.attachToTarget", { targetId, flatten: true }));
      await send("Network.enable", {}, sessionId);
      await send("Page.enable", {}, sessionId);
      // The login page is the SPA shell — it sends the header pre-auth.
      await send("Page.navigate", { url: "https://robinhood.com/login" }, sessionId);
    } catch (e) {
      cleanupAnd(reject, e);
    }
  };
}).catch((e) => fail(e.message));

// Persist to .env (replace the line if present, append otherwise).
const envPath = join(repoRoot, ".env");
const line = `ROBINHOOD_WEB_APP_VERSION=${version}`;
let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
env = /^ROBINHOOD_WEB_APP_VERSION=.*$/m.test(env)
  ? env.replace(/^ROBINHOOD_WEB_APP_VERSION=.*$/m, line)
  : env + (env.endsWith("\n") || env === "" ? "" : "\n") + line + "\n";
writeFileSync(envPath, env);

console.log(`x-robinhood-web-app-version: ${version}`);
console.log(`written to .env as ROBINHOOD_WEB_APP_VERSION (engine prefers env over its baked fallback)`);

// made with love by Zayd Khan / cold
