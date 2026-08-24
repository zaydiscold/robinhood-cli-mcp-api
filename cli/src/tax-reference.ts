import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type TaxEvidenceLaneId =
  | "primary-law"
  | "irs-guidance"
  | "broker-platform"
  | "planning-inference";

export interface TaxEvidenceLane {
  id: TaxEvidenceLaneId;
  label: string;
  meaning: string;
}

export interface TaxReferenceSource {
  id: string;
  lane: TaxEvidenceLaneId;
  title: string;
  url: string;
  effectiveFor: string;
  notes: string;
}

export interface TaxReferenceClaim {
  lane: TaxEvidenceLaneId;
  certainty: "high" | "medium" | "uncertain" | "fact-specific";
  text: string;
  sourceIds: string[];
}

export interface TaxReferenceTopic {
  id: string;
  title: string;
  summary: string;
  claims: TaxReferenceClaim[];
  caveats: string[];
}

export interface TaxReferenceCatalog {
  schemaVersion: 1;
  reviewedAt: string;
  jurisdiction: string;
  scope: string;
  disclaimer: string;
  agentRules: string[];
  evidenceLanes: TaxEvidenceLane[];
  sources: TaxReferenceSource[];
  topics: TaxReferenceTopic[];
}

export interface TaxReferenceQuery {
  topic?: string;
  query?: string;
  source?: string;
}

export interface TaxReferenceResult {
  schemaVersion: 1;
  reviewedAt: string;
  jurisdiction: string;
  scope: string;
  disclaimer: string;
  evidenceLanes: TaxEvidenceLane[];
  agentRules: string[];
  topics: TaxReferenceTopic[];
  sources: TaxReferenceSource[];
  query: {
    topic: string | null;
    text: string | null;
    source: string | null;
  };
  matchCount: number;
  notPersonalizedAdvice: true;
}

let cachedCatalog: TaxReferenceCatalog | undefined;

function defaultCatalogPath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDir, "knowledge", "tax-reference.json"),
    resolve(moduleDir, "..", "..", "knowledge", "tax-reference.json"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Tax reference catalog was not found. Checked: ${candidates.join(", ")}. Rebuild the CLI package so knowledge/tax-reference.json is copied into dist.`,
    );
  }
  return found;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid tax reference catalog: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid tax reference catalog: ${label} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid tax reference catalog: ${label} must be a string array`);
  }
  return value as string[];
}

function validateCatalog(value: unknown): TaxReferenceCatalog {
  const root = asRecord(value, "root");
  if (root.schemaVersion !== 1) {
    throw new Error(`Unsupported tax reference schema version: ${String(root.schemaVersion)}`);
  }

  const evidenceLanes = Array.isArray(root.evidenceLanes) ? root.evidenceLanes : [];
  const sources = Array.isArray(root.sources) ? root.sources : [];
  const topics = Array.isArray(root.topics) ? root.topics : [];
  const laneIds = new Set<string>();
  for (const [index, rawLane] of evidenceLanes.entries()) {
    const lane = asRecord(rawLane, `evidenceLanes[${index}]`);
    const id = requireString(lane.id, `evidenceLanes[${index}].id`);
    if (laneIds.has(id)) throw new Error(`Duplicate tax evidence lane: ${id}`);
    laneIds.add(id);
    requireString(lane.label, `evidenceLanes[${index}].label`);
    requireString(lane.meaning, `evidenceLanes[${index}].meaning`);
  }

  const sourceIds = new Set<string>();
  for (const [index, rawSource] of sources.entries()) {
    const source = asRecord(rawSource, `sources[${index}]`);
    const id = requireString(source.id, `sources[${index}].id`);
    if (sourceIds.has(id)) throw new Error(`Duplicate tax reference source: ${id}`);
    sourceIds.add(id);
    const lane = requireString(source.lane, `sources[${index}].lane`);
    if (!laneIds.has(lane)) throw new Error(`Source ${id} references unknown lane ${lane}`);
    requireString(source.title, `sources[${index}].title`);
    const url = requireString(source.url, `sources[${index}].url`);
    if (!url.startsWith("https://")) throw new Error(`Source ${id} must use HTTPS`);
    requireString(source.effectiveFor, `sources[${index}].effectiveFor`);
    requireString(source.notes, `sources[${index}].notes`);
  }

  const topicIds = new Set<string>();
  for (const [index, rawTopic] of topics.entries()) {
    const topic = asRecord(rawTopic, `topics[${index}]`);
    const id = requireString(topic.id, `topics[${index}].id`);
    if (topicIds.has(id)) throw new Error(`Duplicate tax reference topic: ${id}`);
    topicIds.add(id);
    requireString(topic.title, `topics[${index}].title`);
    requireString(topic.summary, `topics[${index}].summary`);
    requireStringArray(topic.caveats, `topics[${index}].caveats`);
    const claims = Array.isArray(topic.claims) ? topic.claims : [];
    if (claims.length === 0) throw new Error(`Tax reference topic ${id} has no claims`);
    for (const [claimIndex, rawClaim] of claims.entries()) {
      const claim = asRecord(rawClaim, `topics[${index}].claims[${claimIndex}]`);
      const lane = requireString(claim.lane, `topics[${index}].claims[${claimIndex}].lane`);
      if (!laneIds.has(lane)) throw new Error(`Topic ${id} references unknown lane ${lane}`);
      requireString(claim.certainty, `topics[${index}].claims[${claimIndex}].certainty`);
      requireString(claim.text, `topics[${index}].claims[${claimIndex}].text`);
      const claimSources = requireStringArray(
        claim.sourceIds,
        `topics[${index}].claims[${claimIndex}].sourceIds`,
      );
      if (claimSources.length === 0) throw new Error(`Tax reference topic ${id} has an unsourced claim`);
      for (const sourceId of claimSources) {
        if (!sourceIds.has(sourceId)) {
          throw new Error(`Topic ${id} references unknown source ${sourceId}`);
        }
      }
    }
  }

  requireString(root.reviewedAt, "reviewedAt");
  requireString(root.jurisdiction, "jurisdiction");
  requireString(root.scope, "scope");
  requireString(root.disclaimer, "disclaimer");
  requireStringArray(root.agentRules, "agentRules");

  return value as TaxReferenceCatalog;
}

export function loadTaxReferenceCatalog(path?: string): TaxReferenceCatalog {
  const resolvedPath = path ?? defaultCatalogPath();
  const isDefault = path === undefined;
  if (isDefault && cachedCatalog) return cachedCatalog;
  const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as unknown;
  const catalog = validateCatalog(parsed);
  if (isDefault) cachedCatalog = catalog;
  return catalog;
}

export function resetTaxReferenceCache(): void {
  cachedCatalog = undefined;
}

function searchableTopic(topic: TaxReferenceTopic): string {
  return [
    topic.id,
    topic.title,
    topic.summary,
    ...topic.claims.flatMap((claim) => [
      claim.lane,
      claim.certainty,
      claim.text,
      ...claim.sourceIds,
    ]),
    ...topic.caveats,
  ]
    .join("\n")
    .toLowerCase();
}

function selectedSources(
  catalog: TaxReferenceCatalog,
  topics: TaxReferenceTopic[],
  sourceId?: string,
): TaxReferenceSource[] {
  if (sourceId) {
    const source = catalog.sources.find((candidate) => candidate.id === sourceId);
    if (!source) {
      throw new Error(
        `Unknown tax reference source "${sourceId}". Available: ${catalog.sources
          .map((candidate) => candidate.id)
          .join(", ")}`,
      );
    }
    return [source];
  }
  const ids = new Set(topics.flatMap((topic) => topic.claims.flatMap((claim) => claim.sourceIds)));
  return catalog.sources.filter((source) => ids.has(source.id));
}

export function getTaxReference(
  input: TaxReferenceQuery = {},
  catalog: TaxReferenceCatalog = loadTaxReferenceCatalog(),
): TaxReferenceResult {
  const topicId = input.topic?.trim();
  const query = input.query?.trim().toLowerCase();
  let topics = catalog.topics;

  if (topicId) {
    const topic = catalog.topics.find((candidate) => candidate.id === topicId);
    if (!topic) {
      throw new Error(
        `Unknown tax reference topic "${topicId}". Available: ${catalog.topics
          .map((candidate) => candidate.id)
          .join(", ")}`,
      );
    }
    topics = [topic];
  }

  if (query) {
    topics = topics.filter((topic) => searchableTopic(topic).includes(query));
  }

  const sources = selectedSources(catalog, topics, input.source?.trim());
  return {
    schemaVersion: catalog.schemaVersion,
    reviewedAt: catalog.reviewedAt,
    jurisdiction: catalog.jurisdiction,
    scope: catalog.scope,
    disclaimer: catalog.disclaimer,
    evidenceLanes: catalog.evidenceLanes,
    agentRules: catalog.agentRules,
    topics,
    sources,
    query: {
      topic: topicId ?? null,
      text: input.query?.trim() || null,
      source: input.source?.trim() || null,
    },
    matchCount: topics.length,
    notPersonalizedAdvice: true,
  };
}

export function listTaxReferenceTopics(
  catalog: TaxReferenceCatalog = loadTaxReferenceCatalog(),
): Array<Pick<TaxReferenceTopic, "id" | "title" | "summary">> {
  return catalog.topics.map(({ id, title, summary }) => ({ id, title, summary }));
}

export function formatTaxReferenceText(result: TaxReferenceResult): string {
  const lines = [
    `Tax Reference — ${result.jurisdiction}`,
    `Reviewed: ${result.reviewedAt}`,
    result.disclaimer,
    "",
  ];

  if (result.topics.length === 0) {
    lines.push("No tax reference topic matched the query.");
  }

  for (const topic of result.topics) {
    lines.push(`${topic.title} [${topic.id}]`, topic.summary);
    for (const claim of topic.claims) {
      lines.push(
        `  [${claim.lane}; certainty=${claim.certainty}] ${claim.text}`,
        `    sources: ${claim.sourceIds.join(", ")}`,
      );
    }
    if (topic.caveats.length > 0) {
      lines.push("  Caveats:");
      for (const caveat of topic.caveats) lines.push(`    - ${caveat}`);
    }
    lines.push("");
  }

  if (result.sources.length > 0) {
    lines.push("Sources:");
    for (const source of result.sources) {
      lines.push(
        `  ${source.id} [${source.lane}] — ${source.title}`,
        `    ${source.url}`,
        `    effective/review scope: ${source.effectiveFor}`,
      );
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
