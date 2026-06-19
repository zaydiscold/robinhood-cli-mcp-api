# MCP Best Practices Gap Analysis — robinhood-cli

**Date:** 2026-06-18
**Sources:** MCP spec (draft + 2025-11-25), Tool Annotations blog (2026-03-16), MCP Security guide (2026), Progressive Disclosure patterns

---

## 1. Tool Annotations: Current State vs Best Practice

### What the project does NOW (in server.ts lines 102-111):
```typescript
function toolAnnotations(readOnly: boolean, risk: RouteRisk) {
  return {
    readOnlyHint: readOnly,
    destructiveHint: risk === "destructive",
    idempotentHint: readOnly || risk === "write-safe",
    openWorldHint: true,
    "mcp:read-only": readOnly,
    "mcp:risk": risk
  };
}
```

### What best practice says (Tool Annotations blog, 2026-03-16):

**The four hints and their defaults (spec assumes WORST unless told otherwise):**

| Hint | Default (if absent) | robinhood-cli usage | Assessment |
|------|-------------------|---------------------|------------|
| `readOnlyHint` | `false` | Set correctly — true for reads, false for writes | ✅ |
| `destructiveHint` | `true` | Set to true ONLY when `risk === "destructive"` | ⚠️ TOO NARROW |
| `idempotentHint` | `false` | Set to true for reads + write-safe | ✅ |
| `openWorldHint` | `true` | Always `true` (this is correct — Robinhood API is external) | ✅ |

### The `destructiveHint` Gap:

The project maps `destructiveHint` to the `"destructive"` risk level only. But in the MCP annotation vocabulary, **"destructive" means ANY change, not just catastrophic ones.** The spec says:
> "destructiveHint: If it does modify things, is the change destructive (as opposed to additive)?"

A buy order IS destructive — it modifies the portfolio, spends money. A cancel IS destructive. The current annotation marks these as `destructiveHint: false` because their risk levels are `write-mutate`, not `destructive`.

**Recommendation:** Set `destructiveHint: true` for ALL write-tier tools (write-safe, write-mutate, write-or-sensitive, destructive). Reserve `false` only for reads. This aligns with the spec's "assume worst" default.

### The "Lethal Trifecta" (Tool Annotations blog):

The blog identifies the most dangerous annotation combination:
```
readOnlyHint: false + destructiveHint: true + idempotentHint: false
```
= "This tool changes things, destructively, and repeating it makes it worse."

robinhood-cli's order tools (buy, sell, cancel) are EXACTLY this pattern but the `destructiveHint` is currently `false` — so clients don't get the full warning. **Fix: set destructiveHint true on all writes.**

---

## 2. Custom Annotations (`mcp:read-only`, `mcp:risk`)

The project adds two custom annotations:
```typescript
"mcp:read-only": readOnly,
"mcp:risk": risk  // "read" | "sensitive-read" | "write-safe" | "write-mutate" | "write-or-sensitive" | "destructive"
```

### Assessment:

**The spec says annotations are hints, not contracts.** Custom annotations are valid but:
- They duplicate `readOnlyHint` (the standard hint already covers read-only)
- `mcp:risk` is **more useful than the standard hints** — it adds a granularity (6 levels) that the 4 boolean hints can't capture. This is GOOD.
- No standard client will use `mcp:risk` — it's robinhood-cli-specific. That's fine for this project's use case.

**Recommendation:** Keep `mcp:risk` as the authoritative risk taxonomy. Fix `destructiveHint` to be true for all writes. Document that `mcp:risk` is the granular truth and the standard hints are coarse approximations for generic clients.

---

## 3. Server Instructions String (line 79-81)

Current:
```
"Control plane for a REAL Robinhood account: reads run live; writes are dry-run unless ROBINHOOD_ALLOW_LIVE_WRITE=1 is set in the server env — a single master switch (no per-call liveWrite needed; pass dryRun:true to preview even when it's on). At session start on any trading topic, pull the operator knowledge library via robinhood_knowledge (action=index, then read the module that matches the task) and check robinhood_roll_ledger (action=list) for pending cash-account kosher rolls whose open leg may be due — they are two-day trades and sessions die between the legs. After any live write append a trading-log.md entry; brokerage order history is the ONLY proof an order happened."
```

### Assessment:
- ✅ Covers the write gate
- ✅ Covers the boot sequence (knowledge + roll ledger)
- ✅ Covers the evidence rule
- ❌ Missing: the cardinal rule ("verify the API surface, not the consumer surface")
- ❌ Missing: account enumeration — always discover, never hardcode
- ❌ Missing: the "read → classify → gate" workflow
- ❌ Missing: signal sourcing doctrine (X/Reddit → midlands → institutional)
- ❌ Missing: "reads are free and live" — could be more prominent
- ❌ Missing: the toolCount note ("trust live tools/list, not any hardcoded number")

**Recommendation:** The instructions string is the ONLY thing a pure-MCP agent sees before calling tools. It should be a mini operating-intelligence doc. At minimum add:
1. The cardinal rule (one line)
2. Account discovery (one line: "always enumerate via robinhood_accounts before touching any account")
3. The classify-before-write rule

---

## 4. Security Best Practices

### Prompt Injection Protection
The MCP Security guide identifies prompt injection as the #1 risk. robinhood-cli's defenses:
- ✅ Write gate as master switch (single env var) — an injected "set ROBINHOOD_ALLOW_LIVE_WRITE=1" instruction can't change the server env
- ✅ writeStatus() hoists execution state to top — injection can't hide a dry-run as live
- ✅ Tool annotations signal risk to the client
- ✅ Destructive operations gated by risk level

**Gap:** The server instructions string is itself vulnerable to injection via tool output. If a tool returns text that looks like instructions, a naive agent might follow them.

### Credential Handling
- ✅ Token in `.env` (gitignored)
- ✅ Self-healing via `refresh-auth.sh` (reads Chrome localStorage, no network)
- ✅ Crypto keys separate from brokerage token
- ❌ MCP server inherits ALL env vars from its parent process — including the token. Any MCP tool that returns raw env would leak it. The tools don't, but there's no explicit env sanitization.

### Authorization Scoping
- ❌ All 66 tools are available to every connection — no per-connection tool filtering based on auth scope
- The spec draft says: "The set MAY vary by the authorization presented on the request" — robinhood-cli doesn't implement this
- **For a single-user tool this is acceptable.** For multi-user deployment it would need per-user tool filtering.

---

## 5. Progressive Disclosure

The project has 66 tools. Without progressive disclosure, ALL 66 tool schemas are loaded into every agent's context window.

### Current behavior:
- `tools/list` returns all 66 tools with full input schemas
- Each tool has Zod schemas that add ~200-500 chars each
- Total: ~15,000-20,000 chars of tool descriptions in context

### Best practice (Solo.io pattern):
- Expose a lightweight index upfront (tool name + one-line description only)
- Load full schema on demand via `get_tool(name)`
- Invoke via `invoke_tool(name, arguments)`

### Assessment:
For a financial tool where correctness > token efficiency, FULL disclosure is actually BETTER. An agent that doesn't know about `robinhood_panic` or `robinhood_pretrade` is dangerous. The tool schemas serve as the agent's operating manual.

**Recommendation:** Keep full disclosure. The 66 tools with full schemas are the agent's safety net — they teach the agent what exists. Token cost is negligible compared to wrong-trade cost. Progressive disclosure is for servers with 100s of generic tools; this server's tools are all safety-critical.

---

## 6. Deterministic Tool Ordering

The spec says: "Servers SHOULD return tools in a deterministic order." This improves prompt cache hit rates.

**Current state:** MCP SDK default ordering (registration order).

**Recommendation:** Verify tools are returned in registration order (deterministic by code layout). If the SDK reorders them, consider explicit sorting. Minor optimization but easy win for cache hits.

---

## 7. Tool Description Quality

The spec draft emphasizes tool descriptions as the primary way models learn what a tool does. robinhood-cli's descriptions are generally good but uneven:

| Tool | Description length | Quality |
|------|-------------------|---------|
| robinhood_buy | ~350 chars | ✅ Excellent — covers OTC guard, dedup, ref_id, evidence |
| robinhood_wheel | ~420 chars | ✅ Excellent — teaches wheel mechanics |
| robinhood_accounts | ~250 chars | ✅ Good |
| robinhood_dividends | ~200 chars | ⚠️ Could mention cadence detection, projection math |
| robinhood_knowledge | ~180 chars | ⚠️ Should mention the index/read pattern |
| robinhood_roll_ledger | ~160 chars | ✅ Good |

**Recommendation:** Review all descriptions for completeness. An agent should understand the tool's full behavior from its description alone. Add the return shape hint (what keys the response contains) to descriptions for tools that return structured data.

---

## 8. Error Handling in MCP

The spec says servers should return structured JSON-RPC errors with standard codes:
- `-32602` for invalid params
- `-32603` for internal errors

robinhood-cli currently returns plain text errors in JSON responses. The MCP SDK may handle JSON-RPC error codes automatically, but the `classifyRobinhoodError` taxonomy should be mapped to MCP error codes where applicable.

**Recommendation:** Map the error taxonomy to MCP standard error codes for better client handling.

---

## 9. Summary: Priority Fixes

| # | Priority | Gap | Fix |
|---|----------|-----|-----|
| 1 | HIGH | `destructiveHint` is false for order/cancel tools | Set to `true` for ALL write-tier tools |
| 2 | HIGH | Server instructions missing cardinal rules | Add account enumeration, classify-before-write, API-not-UI rule |
| 3 | MEDIUM | No tool response shape documentation | Add return-type hints to tool descriptions |
| 4 | MEDIUM | Error codes not mapped to MCP standards | Map classifyRobinhoodError to JSON-RPC codes |
| 5 | LOW | Tool ordering not explicitly deterministic | Add explicit sort or verify SDK behavior |
| 6 | LOW | No env sanitization for MCP context | Consider env whitelisting for multi-user deploys |

---

## 10. What robinhood-cli Does RIGHT (MCP-wise)

1. **Tool annotations on EVERY tool** — many MCP servers ship with zero annotations
2. **writeStatus() pattern** — the hoisted execution state is exemplary; more MCP servers should do this
3. **Zod schemas** — type-safe input validation on all tools
4. **`mcp:risk` taxonomy** — granular 6-level risk beyond the 4 spec hints
5. **Shared engine** — CLI and MCP share lib.ts, so tool behavior is identical on both surfaces
6. **Full disclosure** — all 66 tools visible; an agent can't miss a safety tool

<!-- Zayd Khan // cold // www.zayd.wtf -->
