export type CapabilityProfile = "core" | "trading" | "research" | "admin" | "full";
export interface CapabilityDefinition {
  id: string;
  cli?: string;
  mcp?: string;
  access: "read" | "write";
  profiles: CapabilityProfile[];
  outputSchema?: "doctor" | "orderLifecycle" | "optionsWorkbench" | "portfolioSnapshot" | "shareSafe";
}

/** Typed registry for cross-surface features. New capabilities start here, then receive adapters. */
export const CAPABILITIES = [
  { id: "doctor", cli: "doctor", mcp: "robinhood_doctor", access: "read", profiles: ["core", "admin", "full"], outputSchema: "doctor" },
  { id: "order-lifecycle", cli: "order-watch", mcp: "robinhood_order_watch", access: "read", profiles: ["core", "trading", "full"], outputSchema: "orderLifecycle" },
  { id: "options-workbench", cli: "options workbench", mcp: "robinhood_options_workbench", access: "read", profiles: ["trading", "research", "full"], outputSchema: "optionsWorkbench" },
  { id: "portfolio-snapshot", cli: "portfolio-snapshot", mcp: "robinhood_portfolio_snapshot", access: "read", profiles: ["core", "research", "full"], outputSchema: "portfolioSnapshot" },
  { id: "share-safe", cli: "--share-safe", mcp: "robinhood_share_safe", access: "read", profiles: ["core", "admin", "full"], outputSchema: "shareSafe" }
] as const satisfies readonly CapabilityDefinition[];

export function capabilityEnabled(definition: CapabilityDefinition, profile = process.env.ROBINHOOD_MCP_PROFILE ?? "full"): boolean {
  return profile === "full" || definition.profiles.includes(profile as CapabilityProfile);
}
