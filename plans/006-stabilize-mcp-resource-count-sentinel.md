# Plan 006: Stabilize MCP resource-count sentinel after dynamic knowledge growth

> Executor instructions: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report; do not improvise.
>
> Drift check: `git diff --stat e6cdb44..HEAD -- mcp/src/server.ts mcp/test/protocol.test.ts cli/src/lib.ts docs knowledge`
> If in-scope code changed, compare the excerpts below against live code before editing.

## Status

- Priority: P1
- Effort: S
- Risk: LOW
- Depends on: none
- Category: tests
- Planned at: commit `e6cdb44`, 2026-07-06, with uncommitted WIP present

## Why this matters

The current workspace fails `corepack pnpm test` because the MCP protocol test pins a literal resource count. The server intentionally exposes knowledge resources dynamically from repo files, so adding a doc or knowledge module can make the test fail even when the server behavior is correct.

## Current state

- `mcp/test/protocol.test.ts:23-33` lists tools, resources, templates, and prompts.
- `mcp/test/protocol.test.ts:31` expects `resources.resources` to have length 47.
- Current verification result on 2026-07-06: CLI tests pass, MCP tests fail because resources length is 48.
- `mcp/src/server.ts:2365-2382` registers a `robinhood://knowledge/{id}` resource template whose list callback maps `listKnowledge()`.
- `cli/src/lib.ts:5695-5729` implements `listKnowledge()` by scanning `knowledge/`, `knowledge/playbooks/`, and `docs/` for Markdown files.
- An untracked doc exists in this workspace: `docs/adversarial-enhancement-audit-2026-07-05.md`, so dynamic resource count drift is expected.

## Scope

In scope:
- `mcp/test/protocol.test.ts`
- `cli/test/knowledge-rolls.test.ts` if adding a shared expectation helper
- `mcp/src/server.ts` only if the resource API itself is wrong

Out of scope:
- Do not remove knowledge/docs resources to satisfy a brittle count.
- Do not hardcode a new resource count unless the resource set is intentionally static.

## Steps

1. Replace the literal resource count with a dynamic expectation based on `listKnowledge().length`, or with semantic assertions for required resource ids.

2. Keep literal sentinel counts where the surface is supposed to be manually reviewed. Tool count can remain literal if adding/removing tools should force a conscious test update. Dynamic knowledge resource count should not be literal because it tracks files.

3. Add assertions that matter:
- resource count equals `listKnowledge().length`
- at least one known module resource exists, such as `robinhood://knowledge/wheel`
- resource template count remains 1
- prompts count remains 3

4. Run the MCP test and full workspace test.

## Test plan

- Run `corepack pnpm --filter @zaydiscold/robinhood-cli-mcp test`.
- Run `corepack pnpm test`.
- Run both package typechecks:
  - `corepack pnpm --filter @zaydiscold/robinhood-cli typecheck`
  - `corepack pnpm --filter @zaydiscold/robinhood-cli-mcp typecheck`

## Done criteria

- [x] MCP protocol test no longer fails when a new knowledge/doc Markdown file is added.
- [x] The test still proves the resource list is non-empty and contains required knowledge modules.
- [x] `corepack pnpm test` exits 0.

## STOP conditions

- Stop if the extra resource is not from `listKnowledge()` and indicates an accidental duplicate registration.

## Maintenance notes

Use literal counts for intentionally curated protocol surfaces; use dynamic expectations for file-backed resource surfaces.
