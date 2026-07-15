export const MCP_PROFILE_NAMES = ["lean", "core", "trading", "research", "admin", "full"] as const;
export type CapabilityProfile = (typeof MCP_PROFILE_NAMES)[number];
// Personal installations should expose the complete control surface without requiring an
// environment override. Narrow profiles remain available for constrained or low-context agents.
export const DEFAULT_MCP_PROFILE: CapabilityProfile = "full";

export interface CapabilityDefinition {
  id: string;
  cli?: string;
  mcp?: string;
  access: "read" | "write";
  profiles: CapabilityProfile[];
  outputSchema?:
    | "legacyObject"
    | "doctor"
    | "orderLifecycle"
    | "optionsWorkbench"
    | "portfolioSnapshot"
    | "shareSafe";
}

const LEGACY_MCP_TOOLS = [
  "robinhood_account_context_url",
  "robinhood_account_context_workflows",
  "robinhood_accounts",
  "robinhood_api_map_directory",
  "robinhood_api_map_summary",
  "robinhood_autopilot",
  "robinhood_brokerage_describe",
  "robinhood_brokerage_execute",
  "robinhood_brokerage_plan",
  "robinhood_brokerage_routes",
  "robinhood_browser_routes",
  "robinhood_buy",
  "robinhood_buying_power",
  "robinhood_calendar",
  "robinhood_cancel",
  "robinhood_crypto_execute",
  "robinhood_crypto_plan",
  "robinhood_crypto_routes",
  "robinhood_crypto_sign",
  "robinhood_dividends",
  "robinhood_documents",
  "robinhood_earnings",
  "robinhood_exposure",
  "robinhood_history",
  "robinhood_hotlist",
  "robinhood_income",
  "robinhood_knowledge",
  "robinhood_margin",
  "robinhood_movers",
  "robinhood_news",
  "robinhood_options_chain",
  "robinhood_options_close",
  "robinhood_options_contract_link_bundle",
  "robinhood_options_contract_plan",
  "robinhood_options_enumerate",
  "robinhood_options_events",
  "robinhood_options_expirations",
  "robinhood_options_holdings",
  "robinhood_options_inspect",
  "robinhood_options_order_flow",
  "robinhood_options_roll_plan",
  "robinhood_options_strategy_plan",
  "robinhood_options_strategy_quote",
  "robinhood_options_strategy_workflows",
  "robinhood_order_status",
  "robinhood_orders_open",
  "robinhood_panic",
  "robinhood_performance",
  "robinhood_portfolio",
  "robinhood_positions",
  "robinhood_pretrade",
  "robinhood_quote",
  "robinhood_ratings",
  "robinhood_recipes",
  "robinhood_recurring",
  "robinhood_review",
  "robinhood_review_note",
  "robinhood_risk",
  "robinhood_roll_ledger",
  "robinhood_routes",
  "robinhood_search",
  "robinhood_sell",
  "robinhood_sentinel",
  "robinhood_settings",
  "robinhood_stock_profile",
  "robinhood_watchlist",
  "robinhood_watchlist_add",
  "robinhood_watchlist_buy",
  "robinhood_watchlist_create",
  "robinhood_watchlist_items",
  "robinhood_watchlist_remove",
  "robinhood_whatif",
  "robinhood_wheel",
] as const;

type LegacyMcpTool = (typeof LEGACY_MCP_TOOLS)[number];

// Exact manifests are deliberately verbose. A new tool cannot drift into a profile merely because
// its name happens to match a regex; profile changes are reviewable data changes.
const PROFILE_TOOL_NAMES: Record<Exclude<CapabilityProfile, "full">, readonly string[]> = {
  lean: [
    "robinhood_accounts",
    "robinhood_portfolio",
    "robinhood_positions",
    "robinhood_quote",
    "robinhood_history",
    "robinhood_options_holdings",
    "robinhood_options_expirations",
    "robinhood_options_chain",
    "robinhood_options_strategy_quote",
    "robinhood_buying_power",
    "robinhood_pretrade",
    "robinhood_orders_open",
    "robinhood_order_status",
    "robinhood_doctor",
    "robinhood_search",
  ],
  core: [
    "robinhood_accounts",
    "robinhood_autopilot",
    "robinhood_buying_power",
    "robinhood_history",
    "robinhood_margin",
    "robinhood_options_chain",
    "robinhood_options_contract_link_bundle",
    "robinhood_options_contract_plan",
    "robinhood_options_enumerate",
    "robinhood_options_events",
    "robinhood_options_expirations",
    "robinhood_options_holdings",
    "robinhood_options_inspect",
    "robinhood_options_order_flow",
    "robinhood_options_roll_plan",
    "robinhood_options_strategy_plan",
    "robinhood_options_strategy_quote",
    "robinhood_options_strategy_workflows",
    "robinhood_order_status",
    "robinhood_orders_open",
    "robinhood_portfolio",
    "robinhood_positions",
    "robinhood_pretrade",
    "robinhood_quote",
    "robinhood_roll_ledger",
    "robinhood_search",
    "robinhood_sentinel",
    "robinhood_stock_profile",
    "robinhood_watchlist",
    "robinhood_watchlist_items",
    "robinhood_wheel",
    "robinhood_doctor",
    "robinhood_order_watch",
    "robinhood_portfolio_snapshot",
    "robinhood_share_safe",
  ],
  trading: [
    "robinhood_accounts",
    "robinhood_autopilot",
    "robinhood_brokerage_execute",
    "robinhood_buy",
    "robinhood_buying_power",
    "robinhood_calendar",
    "robinhood_cancel",
    "robinhood_crypto_execute",
    "robinhood_dividends",
    "robinhood_earnings",
    "robinhood_exposure",
    "robinhood_history",
    "robinhood_hotlist",
    "robinhood_income",
    "robinhood_margin",
    "robinhood_movers",
    "robinhood_news",
    "robinhood_options_chain",
    "robinhood_options_close",
    "robinhood_options_contract_link_bundle",
    "robinhood_options_contract_plan",
    "robinhood_options_enumerate",
    "robinhood_options_events",
    "robinhood_options_expirations",
    "robinhood_options_holdings",
    "robinhood_options_inspect",
    "robinhood_options_order_flow",
    "robinhood_options_roll_plan",
    "robinhood_options_strategy_plan",
    "robinhood_options_strategy_quote",
    "robinhood_options_strategy_workflows",
    "robinhood_order_status",
    "robinhood_orders_open",
    "robinhood_panic",
    "robinhood_performance",
    "robinhood_portfolio",
    "robinhood_positions",
    "robinhood_pretrade",
    "robinhood_quote",
    "robinhood_ratings",
    "robinhood_recurring",
    "robinhood_review",
    "robinhood_review_note",
    "robinhood_risk",
    "robinhood_roll_ledger",
    "robinhood_search",
    "robinhood_sell",
    "robinhood_sentinel",
    "robinhood_settings",
    "robinhood_stock_profile",
    "robinhood_watchlist",
    "robinhood_watchlist_add",
    "robinhood_watchlist_buy",
    "robinhood_watchlist_create",
    "robinhood_watchlist_items",
    "robinhood_watchlist_remove",
    "robinhood_whatif",
    "robinhood_wheel",
    "robinhood_doctor",
    "robinhood_order_watch",
    "robinhood_options_workbench",
    "robinhood_portfolio_snapshot",
    "robinhood_share_safe",
  ],
  research: [
    "robinhood_calendar",
    "robinhood_dividends",
    "robinhood_earnings",
    "robinhood_exposure",
    "robinhood_hotlist",
    "robinhood_income",
    "robinhood_movers",
    "robinhood_news",
    "robinhood_performance",
    "robinhood_ratings",
    "robinhood_review",
    "robinhood_risk",
    "robinhood_whatif",
    "robinhood_options_workbench",
    "robinhood_portfolio_snapshot",
  ],
  admin: [
    "robinhood_account_context_url",
    "robinhood_account_context_workflows",
    "robinhood_api_map_directory",
    "robinhood_api_map_summary",
    "robinhood_brokerage_describe",
    "robinhood_brokerage_execute",
    "robinhood_brokerage_plan",
    "robinhood_brokerage_routes",
    "robinhood_browser_routes",
    "robinhood_buy",
    "robinhood_cancel",
    "robinhood_crypto_execute",
    "robinhood_crypto_plan",
    "robinhood_crypto_routes",
    "robinhood_crypto_sign",
    "robinhood_documents",
    "robinhood_knowledge",
    "robinhood_options_close",
    "robinhood_panic",
    "robinhood_recipes",
    "robinhood_recurring",
    "robinhood_review_note",
    "robinhood_routes",
    "robinhood_sell",
    "robinhood_settings",
    "robinhood_watchlist_add",
    "robinhood_watchlist_buy",
    "robinhood_watchlist_create",
    "robinhood_watchlist_remove",
    "robinhood_doctor",
    "robinhood_share_safe",
  ],
};

const WRITE_TOOL_NAMES = new Set<string>([
  "robinhood_brokerage_execute",
  "robinhood_buy",
  "robinhood_cancel",
  "robinhood_crypto_execute",
  "robinhood_panic",
  "robinhood_recurring",
  "robinhood_review_note",
  "robinhood_roll_ledger",
  "robinhood_sell",
  "robinhood_settings",
  "robinhood_watchlist_add",
  "robinhood_watchlist_buy",
  "robinhood_watchlist_create",
  "robinhood_watchlist_remove",
]);

const PROFILE_TOOL_SETS: Record<Exclude<CapabilityProfile, "full">, ReadonlySet<string>> = {
  lean: new Set(PROFILE_TOOL_NAMES.lean),
  core: new Set(PROFILE_TOOL_NAMES.core),
  trading: new Set(PROFILE_TOOL_NAMES.trading),
  research: new Set(PROFILE_TOOL_NAMES.research),
  admin: new Set(PROFILE_TOOL_NAMES.admin),
};

function profilesForMcp(mcp: string): CapabilityProfile[] {
  return [
    ...MCP_PROFILE_NAMES.filter(
      (profile) => profile !== "full" && PROFILE_TOOL_SETS[profile].has(mcp),
    ),
    "full" as const,
  ];
}

function legacyDefinition(mcp: LegacyMcpTool): CapabilityDefinition {
  return {
    id: mcp.replace(/^robinhood_/, ""),
    mcp,
    access: WRITE_TOOL_NAMES.has(mcp) ? "write" : "read",
    profiles: profilesForMcp(mcp),
    outputSchema: "legacyObject",
  };
}

/** Complete MCP registry plus exact CLI adapters for new cross-surface capabilities. */
export const CAPABILITIES: readonly CapabilityDefinition[] = [
  ...LEGACY_MCP_TOOLS.map(legacyDefinition),
  {
    id: "doctor",
    cli: "doctor",
    mcp: "robinhood_doctor",
    access: "read",
    profiles: profilesForMcp("robinhood_doctor"),
    outputSchema: "doctor",
  },
  {
    id: "order-lifecycle",
    cli: "order-watch",
    mcp: "robinhood_order_watch",
    access: "read",
    profiles: profilesForMcp("robinhood_order_watch"),
    outputSchema: "orderLifecycle",
  },
  {
    id: "options-workbench",
    cli: "options workbench",
    mcp: "robinhood_options_workbench",
    access: "read",
    profiles: profilesForMcp("robinhood_options_workbench"),
    outputSchema: "optionsWorkbench",
  },
  {
    id: "portfolio-snapshot",
    cli: "portfolio-snapshot",
    mcp: "robinhood_portfolio_snapshot",
    access: "read",
    profiles: profilesForMcp("robinhood_portfolio_snapshot"),
    outputSchema: "portfolioSnapshot",
  },
  {
    id: "share-safe",
    cli: "--share-safe",
    mcp: "robinhood_share_safe",
    access: "read",
    profiles: profilesForMcp("robinhood_share_safe"),
    outputSchema: "shareSafe",
  },
] as const;

const REGISTERED_MCP_NAMES = new Set(CAPABILITIES.map((definition) => definition.mcp));
for (const [profile, names] of Object.entries(PROFILE_TOOL_NAMES)) {
  if (new Set(names).size !== names.length)
    throw new Error(`MCP profile ${profile} contains duplicate tools.`);
  for (const name of names) {
    if (!REGISTERED_MCP_NAMES.has(name))
      throw new Error(`MCP profile ${profile} references unknown tool ${name}.`);
  }
}

export function parseCapabilityProfile(value: string | undefined): CapabilityProfile {
  const profile = value ?? DEFAULT_MCP_PROFILE;
  if ((MCP_PROFILE_NAMES as readonly string[]).includes(profile))
    return profile as CapabilityProfile;
  throw new Error(
    `Invalid ROBINHOOD_MCP_PROFILE=${JSON.stringify(profile)}. Expected one of: ${MCP_PROFILE_NAMES.join(", ")}.`,
  );
}

export function capabilityEnabled(definition: CapabilityDefinition, profile?: string): boolean {
  const selected = parseCapabilityProfile(profile ?? process.env.ROBINHOOD_MCP_PROFILE);
  return selected === "full" || definition.profiles.includes(selected);
}

export function capabilitiesForProfile(profile?: string): readonly CapabilityDefinition[] {
  const selected = parseCapabilityProfile(profile ?? process.env.ROBINHOOD_MCP_PROFILE);
  return CAPABILITIES.filter(
    (definition) => selected === "full" || definition.profiles.includes(selected),
  );
}
