# Audit Master Plan — robinhood-cli Hardening Sprint

**Date:** 2026-06-18
**Goal:** Achieve 1:1 CLI↔MCP parity, resolve all doc contradictions, implement missing financial tools, reorganize for clarity, and harden every agent-facing surface — then ship as a PR.

## Overall Mission

The robinhood-cli project has the right architecture (shared engine, single write gate, progressive disclosure) but 4 months of rapid feature development have created drift between docs, code, and the CLI↔MCP surfaces. This sprint closes every gap and levels up the project from "impressive indie tool" to "production-grade financial control plane."

## Five Audit Tracks → Five Action Tracks

Each track produces: (1) a detailed findings report, (2) a prioritized fix list, (3) then the actual code/doc changes.

### Track A: CLI↔MCP Parity + Engine Hoisting
**Owner:** Agent A
**Goal:** Every CLI command must have an MCP equivalent, every MCP tool must have a CLI equivalent, and ALL must share the same engine functions. Zero duplicated logic. Zero bypasses.
**Key question:** Are there CLI commands that agents can't use via MCP? Are there MCP tools a human can't use via CLI?
**Deliverable:** Parity gap report → actual code changes adding missing tools

### Track B: Agent Doc Contradictions + Hardening
**Owner:** Agent B
**Goal:** Resolve all 9 known contradictions from TODO.md, find new ones, and harden every agent-facing document (SKILL.md, AGENTS.md, MCP server instructions, knowledge/ modules, README).
**Key question:** If an agent reads these docs without ever running the code, will it form correct mental models? Or will it confidently do the wrong thing?
**Deliverable:** Contradiction resolution table → doc patches for every fix

### Track C: 2026 MCP Best Practices
**Owner:** Agent C
**Goal:** Map the project's MCP implementation against current spec best practices — tool annotations, security model, error handling, progressive disclosure, transport patterns.
**Key question:** What does a "best-in-class 2026 MCP server" look like, and where does this project fall short?
**Deliverable:** Best practices gap analysis → implementation recommendations

### Track D: Financial Tools Gap Analysis
**Owner:** Agent D
**Goal:** Identify every Robinhood feature not surfaced in the CLI/MCP, rank by financial-freedom impact, and spec the top tools.
**Key question:** What can Robinhood's API do that our tools can't? What financial operations would most empower the account owner?
**Deliverable:** Prioritized gap analysis → tool specs for top 5 → implementation

### Track E: Repo Quality + DX Hardening
**Owner:** Agent E
**Goal:** Audit TypeScript strictness, test coverage, CI, dependencies, error handling, code organization, and contributor experience.
**Key question:** If a new developer cloned this repo today, what would frustrate them? What would break in production?
**Deliverable:** DX report → prioritized fix list → implementation

## Execution Order

### Phase 1: AUDIT (now) — 5 agents in parallel
A. CLI/MCP parity audit
B. Doc contradiction audit  
C. MCP best practices research
D. Financial tools gap analysis
E. Repo quality + DX audit

### Phase 2: SYNTHESIZE — me (PM)
- Merge all 5 reports into master findings
- Resolve conflicts between agent findings
- Prioritize the combined fix list
- Assign each fix to an action agent

### Phase 3: ACTION — 5 agents in parallel
- Fix code gaps (add missing MCP tools, hoist engine functions)
- Fix doc contradictions (patch SKILL.md, AGENTS.md, README)
- Implement MCP improvements (annotations, error handling)
- Implement P0 financial tools (income, risk, whatif, calendar, exposure)
- Fix DX issues (linting, tests, CI, dependency updates)

### Phase 4: VERIFY — me (PM)
- Run full test suite
- Verify tool counts match
- Read every changed doc for consistency
- Push PR

## Success Criteria

1. **CLI `--help` tool count == MCP `tools/list` count** (within the domain of first-class tools; route-map inspection tools count separately)
2. **Zero doc contradictions** — every claim in SKILL.md, AGENTS.md, README, MCP instructions, and knowledge/ is verifyable against live code behavior
3. **All write paths go through the shared engine** — no bypasses, no duplicated logic
4. **MCP annotations** on every tool (readOnlyHint, destructiveHint, idempotentHint)
5. **Test suite passes** with no regressions
6. **README system message** moved to bottom with dungeon crawler Carl meme
7. **At least 3 new P0 financial tools** spec'd and stubbed

<!-- Zayd Khan // cold // www.zayd.wtf -->
