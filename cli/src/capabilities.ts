export type CapabilityProfile = "core" | "trading" | "research" | "admin" | "full";
export interface CapabilityDefinition {
  id: string;
  cli?: string;
  mcp?: string;
  access: "read" | "write";
  profiles: CapabilityProfile[];
  outputSchema?: "legacyObject" | "doctor" | "orderLifecycle" | "optionsWorkbench" | "portfolioSnapshot" | "shareSafe";
}

const LEGACY_MCP_TOOLS = [
  "robinhood_account_context_url", "robinhood_account_context_workflows", "robinhood_accounts", "robinhood_api_map_directory", "robinhood_api_map_summary",
  "robinhood_autopilot", "robinhood_brokerage_describe", "robinhood_brokerage_execute", "robinhood_brokerage_plan", "robinhood_brokerage_routes", "robinhood_browser_routes",
  "robinhood_buy", "robinhood_buying_power", "robinhood_calendar", "robinhood_cancel", "robinhood_crypto_execute", "robinhood_crypto_plan", "robinhood_crypto_routes", "robinhood_crypto_sign",
  "robinhood_dividends", "robinhood_documents", "robinhood_earnings", "robinhood_exposure", "robinhood_history", "robinhood_hotlist", "robinhood_income", "robinhood_knowledge",
  "robinhood_margin", "robinhood_movers", "robinhood_news", "robinhood_options_chain", "robinhood_options_close", "robinhood_options_contract_link_bundle",
  "robinhood_options_contract_plan", "robinhood_options_enumerate", "robinhood_options_events", "robinhood_options_expirations", "robinhood_options_holdings",
  "robinhood_options_inspect", "robinhood_options_order_flow", "robinhood_options_roll_plan", "robinhood_options_strategy_plan", "robinhood_options_strategy_quote",
  "robinhood_options_strategy_workflows", "robinhood_order_status", "robinhood_orders_open", "robinhood_panic", "robinhood_performance", "robinhood_portfolio",
  "robinhood_positions", "robinhood_pretrade", "robinhood_quote", "robinhood_ratings", "robinhood_recipes", "robinhood_recurring", "robinhood_review",
  "robinhood_review_note", "robinhood_risk", "robinhood_roll_ledger", "robinhood_routes", "robinhood_search", "robinhood_sell", "robinhood_sentinel",
  "robinhood_settings", "robinhood_stock_profile", "robinhood_watchlist", "robinhood_watchlist_add", "robinhood_watchlist_buy", "robinhood_watchlist_create",
  "robinhood_watchlist_items", "robinhood_watchlist_remove", "robinhood_whatif", "robinhood_wheel"
] as const;

const WRITE_TOOLS = /_(?:buy|sell|cancel|panic|execute|settings|recurring|review_note|watchlist_(?:add|buy|create|remove)|options_close)$/;
const ADMIN_TOOLS = /(?:api_map|brokerage_|browser_routes|crypto_|routes$|account_context|documents|knowledge|recipes)/;
const RESEARCH_TOOLS = /(?:news|ratings|earnings|movers|hotlist|review|performance|risk|whatif|calendar|exposure|income|dividends)/;

function legacyDefinition(mcp: typeof LEGACY_MCP_TOOLS[number]): CapabilityDefinition {
  const access = WRITE_TOOLS.test(mcp) ? "write" : "read";
  const profiles: CapabilityProfile[] = access === "write"
    ? ["trading", "admin", "full"]
    : ADMIN_TOOLS.test(mcp) ? ["admin", "full"]
      : RESEARCH_TOOLS.test(mcp) ? ["research", "trading", "full"]
        : ["core", "trading", "full"];
  return { id: mcp.replace(/^robinhood_/, ""), mcp, access, profiles, outputSchema: "legacyObject" };
}

/** Complete MCP registry plus exact CLI adapters for new cross-surface capabilities. */
export const CAPABILITIES: readonly CapabilityDefinition[] = [
  ...LEGACY_MCP_TOOLS.map(legacyDefinition),
  { id: "doctor", cli: "doctor", mcp: "robinhood_doctor", access: "read", profiles: ["core", "admin", "full"], outputSchema: "doctor" },
  { id: "order-lifecycle", cli: "order-watch", mcp: "robinhood_order_watch", access: "read", profiles: ["core", "trading", "full"], outputSchema: "orderLifecycle" },
  { id: "options-workbench", cli: "options workbench", mcp: "robinhood_options_workbench", access: "read", profiles: ["trading", "research", "full"], outputSchema: "optionsWorkbench" },
  { id: "portfolio-snapshot", cli: "portfolio-snapshot", mcp: "robinhood_portfolio_snapshot", access: "read", profiles: ["core", "research", "full"], outputSchema: "portfolioSnapshot" },
  { id: "share-safe", cli: "--share-safe", mcp: "robinhood_share_safe", access: "read", profiles: ["core", "admin", "full"], outputSchema: "shareSafe" }
] as const;

export function capabilityEnabled(definition: CapabilityDefinition, profile = process.env.ROBINHOOD_MCP_PROFILE ?? "full"): boolean {
  return profile === "full" || definition.profiles.includes(profile as CapabilityProfile);
}
