import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadTaxReferenceCatalog,
  type TaxEvidenceLaneId,
  type TaxReferenceCatalog,
  type TaxReferenceClaim,
  type TaxReferenceSource,
  type TaxReferenceTopic,
} from "./tax-reference.js";

export type TaxAccountContext = "taxable" | "traditional-ira" | "roth-ira" | "unknown";
export type TaxFactSource = "brokerage" | "tax-form" | "user" | "external";

export interface TaxStrategyRequiredFact {
  id: string;
  prompt: string;
  why: string;
  source: TaxFactSource;
}

export interface TaxStrategyBrokerRead {
  purpose: string;
  cli: string;
  mcp: string;
}

export interface TaxStrategyDefinition {
  id: string;
  title: string;
  aliases: string[];
  tags: string[];
  summary: string;
  accountContexts: TaxAccountContext[];
  topicIds: string[];
  supplementalClaims: TaxReferenceClaim[];
  requiredFacts: TaxStrategyRequiredFact[];
  brokerReads: TaxStrategyBrokerRead[];
  workflow: string[];
  redFlags: string[];
  stopConditions: string[];
}

export interface TaxStrategyCatalog {
  schemaVersion: 1;
  reviewedAt: string;
  jurisdiction: string;
  scope: string;
  disclaimer: string;
  agentOutputContract: string[];
  strategies: TaxStrategyDefinition[];
}

export interface TaxStrategyGuide {
  schemaVersion: 1;
  reviewedAt: string;
  jurisdiction: string;
  scope: string;
  disclaimer: string;
  accountContext: TaxAccountContext;
  strategy: TaxStrategyDefinition;
  ruleTopics: TaxReferenceTopic[];
  sources: TaxReferenceSource[];
  agentOutputContract: string[];
  notPersonalizedAdvice: true;
  tradeAuthorized: false;
  filingResultDetermined: false;
}

export interface TaxResearchStatus {
  reviewedAt: string;
  jurisdiction: string;
  referenceTopicCount: number;
  strategyCount: number;
  sourceCount: number;
  reviewAgeDays: number | null;
  reviewYearMatchesCurrentYear: boolean;
  reviewRecommended: boolean;
  maintenancePolicy: string;
}

interface CatalogValidationContext {
  topicIds: ReadonlySet<string>;
  sourceIds: ReadonlySet<string>;
  laneIds: ReadonlySet<string>;
  validContexts: ReadonlySet<TaxAccountContext>;
  validFactSources: ReadonlySet<TaxFactSource>;
  strategyIds: Set<string>;
  normalizedNames: Map<string, string>;
}

let cachedCatalog: TaxStrategyCatalog | undefined;

function defaultCatalogPath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDir, "knowledge", "tax-strategies.json"),
    resolve(moduleDir, "..", "..", "knowledge", "tax-strategies.json"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Tax strategy catalog was not found. Checked: ${candidates.join(", ")}. ` +
        "Rebuild the CLI package so knowledge/tax-strategies.json is copied into dist.",
    );
  }
  return found;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid tax strategy catalog: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid tax strategy catalog: ${label} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid tax strategy catalog: ${label} must be a string array`);
  }
  if (!allowEmpty && value.length === 0) {
    throw new Error(`Invalid tax strategy catalog: ${label} must not be empty`);
  }
  return value as string[];
}

function normalizeStrategyName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateStrategyNames(
  strategy: Record<string, unknown>,
  index: number,
  context: CatalogValidationContext,
): { id: string; aliases: string[] } {
  const id = requireString(strategy.id, `strategies[${index}].id`);
  if (context.strategyIds.has(id)) {
    throw new Error(`Duplicate tax strategy id: ${id}`);
  }
  context.strategyIds.add(id);

  const aliases = requireStringArray(strategy.aliases, `strategies[${index}].aliases`, true);
  for (const name of [id, ...aliases]) {
    const normalized = normalizeStrategyName(name);
    const prior = context.normalizedNames.get(normalized);
    if (prior && prior !== id) {
      throw new Error(`Tax strategy name or alias "${name}" is shared by ${prior} and ${id}`);
    }
    context.normalizedNames.set(normalized, id);
  }
  return { id, aliases };
}

function validateStrategyClaims(
  strategy: Record<string, unknown>,
  index: number,
  id: string,
  context: CatalogValidationContext,
): void {
  const claims = Array.isArray(strategy.supplementalClaims) ? strategy.supplementalClaims : [];
  for (const [claimIndex, rawClaim] of claims.entries()) {
    const label = `strategies[${index}].supplementalClaims[${claimIndex}]`;
    const claim = asRecord(rawClaim, label);
    const lane = requireString(claim.lane, `${label}.lane`);
    if (!context.laneIds.has(lane as TaxEvidenceLaneId)) {
      throw new Error(`Tax strategy ${id} references unknown evidence lane ${lane}`);
    }
    requireString(claim.certainty, `${label}.certainty`);
    requireString(claim.text, `${label}.text`);
    const claimSources = requireStringArray(claim.sourceIds, `${label}.sourceIds`);
    for (const sourceId of claimSources) {
      if (!context.sourceIds.has(sourceId)) {
        throw new Error(`Tax strategy ${id} references unknown source ${sourceId}`);
      }
    }
  }
}

function validateStrategyFacts(
  strategy: Record<string, unknown>,
  index: number,
  id: string,
  context: CatalogValidationContext,
): void {
  const facts = Array.isArray(strategy.requiredFacts) ? strategy.requiredFacts : [];
  if (facts.length === 0) {
    throw new Error(`Tax strategy ${id} has no required facts`);
  }

  const factIds = new Set<string>();
  for (const [factIndex, rawFact] of facts.entries()) {
    const label = `strategies[${index}].requiredFacts[${factIndex}]`;
    const fact = asRecord(rawFact, label);
    const factId = requireString(fact.id, `${label}.id`);
    if (factIds.has(factId)) {
      throw new Error(`Tax strategy ${id} has duplicate fact ${factId}`);
    }
    factIds.add(factId);
    requireString(fact.prompt, `${label}.prompt`);
    requireString(fact.why, `${label}.why`);
    const source = requireString(fact.source, `${label}.source`);
    if (!context.validFactSources.has(source as TaxFactSource)) {
      throw new Error(`Tax strategy ${id} fact ${factId} has unknown source ${source}`);
    }
  }
}

function validateStrategyReads(strategy: Record<string, unknown>, index: number, id: string): void {
  const reads = Array.isArray(strategy.brokerReads) ? strategy.brokerReads : [];
  if (reads.length === 0) {
    throw new Error(`Tax strategy ${id} has no broker reads`);
  }

  for (const [readIndex, rawRead] of reads.entries()) {
    const label = `strategies[${index}].brokerReads[${readIndex}]`;
    const read = asRecord(rawRead, label);
    requireString(read.purpose, `${label}.purpose`);
    requireString(read.cli, `${label}.cli`);
    requireString(read.mcp, `${label}.mcp`);
  }
}

function validateStrategy(
  rawStrategy: unknown,
  index: number,
  context: CatalogValidationContext,
): void {
  const strategy = asRecord(rawStrategy, `strategies[${index}]`);
  const { id } = validateStrategyNames(strategy, index, context);
  requireString(strategy.title, `strategies[${index}].title`);
  requireString(strategy.summary, `strategies[${index}].summary`);
  requireStringArray(strategy.tags, `strategies[${index}].tags`);

  const contexts = requireStringArray(
    strategy.accountContexts,
    `strategies[${index}].accountContexts`,
  );
  for (const accountContext of contexts) {
    if (!context.validContexts.has(accountContext as TaxAccountContext)) {
      throw new Error(`Tax strategy ${id} has unknown account context ${accountContext}`);
    }
  }

  const topicIds = requireStringArray(strategy.topicIds, `strategies[${index}].topicIds`);
  for (const topicId of topicIds) {
    if (!context.topicIds.has(topicId)) {
      throw new Error(`Tax strategy ${id} references unknown topic ${topicId}`);
    }
  }

  validateStrategyClaims(strategy, index, id, context);
  validateStrategyFacts(strategy, index, id, context);
  validateStrategyReads(strategy, index, id);
  requireStringArray(strategy.workflow, `strategies[${index}].workflow`);
  requireStringArray(strategy.redFlags, `strategies[${index}].redFlags`);
  requireStringArray(strategy.stopConditions, `strategies[${index}].stopConditions`);
}

function validateCatalog(
  value: unknown,
  referenceCatalog: TaxReferenceCatalog,
): TaxStrategyCatalog {
  const root = asRecord(value, "root");
  if (root.schemaVersion !== 1) {
    throw new Error(`Unsupported tax strategy schema version: ${String(root.schemaVersion)}`);
  }

  const reviewedAt = requireString(root.reviewedAt, "reviewedAt");
  if (reviewedAt !== referenceCatalog.reviewedAt) {
    throw new Error(
      `Tax strategy catalog review date ${reviewedAt} does not match ` +
        `tax reference review date ${referenceCatalog.reviewedAt}`,
    );
  }

  const jurisdiction = requireString(root.jurisdiction, "jurisdiction");
  if (jurisdiction !== referenceCatalog.jurisdiction) {
    throw new Error(
      `Tax strategy jurisdiction ${jurisdiction} does not match ` +
        `tax reference jurisdiction ${referenceCatalog.jurisdiction}`,
    );
  }

  requireString(root.scope, "scope");
  requireString(root.disclaimer, "disclaimer");
  requireStringArray(root.agentOutputContract, "agentOutputContract");
  const strategies = Array.isArray(root.strategies) ? root.strategies : [];
  if (strategies.length === 0) {
    throw new Error("Tax strategy catalog has no strategies");
  }

  const context: CatalogValidationContext = {
    topicIds: new Set(referenceCatalog.topics.map((topic) => topic.id)),
    sourceIds: new Set(referenceCatalog.sources.map((source) => source.id)),
    laneIds: new Set(referenceCatalog.evidenceLanes.map((lane) => lane.id)),
    validContexts: new Set(["taxable", "traditional-ira", "roth-ira", "unknown"]),
    validFactSources: new Set(["brokerage", "tax-form", "user", "external"]),
    strategyIds: new Set(),
    normalizedNames: new Map(),
  };
  for (const [index, strategy] of strategies.entries()) {
    validateStrategy(strategy, index, context);
  }
  return value as TaxStrategyCatalog;
}

function searchableStrategy(strategy: TaxStrategyDefinition): string {
  return [
    strategy.id,
    strategy.title,
    strategy.summary,
    ...strategy.aliases,
    ...strategy.tags,
    ...strategy.topicIds,
    ...strategy.supplementalClaims.flatMap((claim) => [
      claim.lane,
      claim.certainty,
      claim.text,
      ...claim.sourceIds,
    ]),
    ...strategy.requiredFacts.flatMap((fact) => [fact.id, fact.prompt, fact.why, fact.source]),
    ...strategy.brokerReads.flatMap((read) => [read.purpose, read.cli, read.mcp]),
    ...strategy.workflow,
    ...strategy.redFlags,
    ...strategy.stopConditions,
  ]
    .join("\n")
    .toLowerCase();
}

export function loadTaxStrategyCatalog(
  path?: string,
  referenceCatalog: TaxReferenceCatalog = loadTaxReferenceCatalog(),
): TaxStrategyCatalog {
  const resolvedPath = path ?? defaultCatalogPath();
  const isDefault = path === undefined;
  if (isDefault && cachedCatalog) return cachedCatalog;
  const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as unknown;
  const catalog = validateCatalog(parsed, referenceCatalog);
  if (isDefault) cachedCatalog = catalog;
  return catalog;
}

export function resetTaxStrategyCache(): void {
  cachedCatalog = undefined;
}

export function listTaxStrategies(
  catalog: TaxStrategyCatalog = loadTaxStrategyCatalog(),
): Array<Pick<TaxStrategyDefinition, "id" | "title" | "summary" | "aliases" | "tags">> {
  return catalog.strategies.map(({ id, title, summary, aliases, tags }) => ({
    id,
    title,
    summary,
    aliases,
    tags,
  }));
}

export function searchTaxStrategies(
  query: string,
  catalog: TaxStrategyCatalog = loadTaxStrategyCatalog(),
): TaxStrategyDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return catalog.strategies;
  return catalog.strategies.filter((strategy) => searchableStrategy(strategy).includes(normalized));
}

export function resolveTaxStrategy(
  idOrAlias: string,
  catalog: TaxStrategyCatalog = loadTaxStrategyCatalog(),
): TaxStrategyDefinition {
  const normalized = normalizeStrategyName(idOrAlias);
  const strategy = catalog.strategies.find(
    (candidate) =>
      normalizeStrategyName(candidate.id) === normalized ||
      candidate.aliases.some((alias) => normalizeStrategyName(alias) === normalized),
  );
  if (!strategy) {
    const available = catalog.strategies.map((candidate) => candidate.id).join(", ");
    throw new Error(`Unknown tax strategy "${idOrAlias}". Available: ${available}`);
  }
  return strategy;
}

export function getTaxStrategyGuide(
  input: { strategy: string; accountContext?: TaxAccountContext },
  strategyCatalog: TaxStrategyCatalog = loadTaxStrategyCatalog(),
  referenceCatalog: TaxReferenceCatalog = loadTaxReferenceCatalog(),
): TaxStrategyGuide {
  const strategy = resolveTaxStrategy(input.strategy, strategyCatalog);
  const accountContext = input.accountContext ?? "unknown";
  const ruleTopics = strategy.topicIds.map((topicId) => {
    const topic = referenceCatalog.topics.find((candidate) => candidate.id === topicId);
    if (!topic) {
      throw new Error(`Tax strategy ${strategy.id} references missing topic ${topicId}`);
    }
    return topic;
  });
  const sourceIds = new Set([
    ...ruleTopics.flatMap((topic) => topic.claims.flatMap((claim) => claim.sourceIds)),
    ...strategy.supplementalClaims.flatMap((claim) => claim.sourceIds),
  ]);
  const sources = referenceCatalog.sources.filter((source) => sourceIds.has(source.id));
  return {
    schemaVersion: strategyCatalog.schemaVersion,
    reviewedAt: strategyCatalog.reviewedAt,
    jurisdiction: strategyCatalog.jurisdiction,
    scope: strategyCatalog.scope,
    disclaimer: strategyCatalog.disclaimer,
    accountContext,
    strategy,
    ruleTopics,
    sources,
    agentOutputContract: strategyCatalog.agentOutputContract,
    notPersonalizedAdvice: true,
    tradeAuthorized: false,
    filingResultDetermined: false,
  };
}

export function getTaxResearchStatus(
  referenceCatalog: TaxReferenceCatalog = loadTaxReferenceCatalog(),
  strategyCatalog: TaxStrategyCatalog = loadTaxStrategyCatalog(undefined, referenceCatalog),
  now: Date = new Date(),
): TaxResearchStatus {
  const reviewedMs = Date.parse(`${referenceCatalog.reviewedAt}T00:00:00Z`);
  const nowMs = now.getTime();
  const reviewAgeDays =
    Number.isFinite(reviewedMs) && Number.isFinite(nowMs)
      ? Math.max(0, Math.floor((nowMs - reviewedMs) / 86_400_000))
      : null;
  const reviewYear = Number(referenceCatalog.reviewedAt.slice(0, 4));
  const currentYear = now.getUTCFullYear();
  const reviewYearMatchesCurrentYear = reviewYear === currentYear;
  const reviewRecommended =
    reviewAgeDays === null || reviewAgeDays > 120 || !reviewYearMatchesCurrentYear;
  return {
    reviewedAt: referenceCatalog.reviewedAt,
    jurisdiction: referenceCatalog.jurisdiction,
    referenceTopicCount: referenceCatalog.topics.length,
    strategyCount: strategyCatalog.strategies.length,
    sourceCount: referenceCatalog.sources.length,
    reviewAgeDays,
    reviewYearMatchesCurrentYear,
    reviewRecommended,
    maintenancePolicy:
      "Internal maintenance signal only: re-review when the filing year changes, controlling " +
      "authority or broker behavior changes, or 120 days elapse. It is not a legal validity period.",
  };
}

export function formatTaxStrategyText(guide: TaxStrategyGuide): string {
  const { strategy } = guide;
  const lines = [
    `Tax Strategy Research — ${strategy.title} [${strategy.id}]`,
    `Jurisdiction: ${guide.jurisdiction}`,
    `Reviewed: ${guide.reviewedAt}`,
    `Account context: ${guide.accountContext}`,
    guide.disclaimer,
    "",
    strategy.summary,
    "",
    "Required facts:",
    ...strategy.requiredFacts.map(
      (fact) => `  - [${fact.source}] ${fact.prompt}\n    why: ${fact.why}`,
    ),
    "",
    "Broker reads:",
    ...strategy.brokerReads.map(
      (read) => `  - ${read.purpose}\n    CLI: ${read.cli}\n    MCP: ${read.mcp}`,
    ),
    "",
    "Linked rule topics:",
    ...guide.ruleTopics.map((topic) => `  - ${topic.id}: ${topic.summary}`),
  ];

  if (strategy.supplementalClaims.length > 0) {
    lines.push(
      "",
      "Strategy-specific claims:",
      ...strategy.supplementalClaims.map(
        (claim) =>
          `  - [${claim.lane}; certainty=${claim.certainty}] ${claim.text}\n` +
          `    sources: ${claim.sourceIds.join(", ")}`,
      ),
    );
  }

  lines.push(
    "",
    "Workflow:",
    ...strategy.workflow.map((step, index) => `  ${index + 1}. ${step}`),
    "",
    "Red flags:",
    ...strategy.redFlags.map((flag) => `  - ${flag}`),
    "",
    "Stop and escalate when:",
    ...strategy.stopConditions.map((condition) => `  - ${condition}`),
    "",
    "Sources:",
    ...guide.sources.map((source) => `  - ${source.id} [${source.lane}] ${source.url}`),
    "",
    "Result state: educational research only; no filing result determined; no trade authorized.",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}
