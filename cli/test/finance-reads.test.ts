import { describe, expect, it } from "vitest";
import {
  getInboxSummary,
  getIpoAccess,
  getIpoAccessRequestPlan,
  getStockRewardsSummary,
  getSweepInterest,
  listGoldFees,
} from "../src/lib.js";

describe("finance read summaries", () => {
  it("normalizes stock reward metadata without referral identities or contact data", async () => {
    const result = await getStockRewardsSummary({}, {
      getJson: async () => [
        {
          section_name: "Pending",
          items: [{ id: "item-1", type: "referral", data: {
            referral: { id: "ref-1", email: "friend@example.com", display_name: "Private Friend" },
            reward: { id: "reward-1", reward_type: "stock", state: "pending", reward_qty: "1.25", asset_currency_code: "USD" },
          }}],
        },
        {
          section_name: "Claimed",
          items: [
            { id: "item-2", type: "standalone_reward", data: { reward: { id: "reward-2", reward_type: "stock", state: "claimed", reward_qty: "5" } } },
            { id: "item-3", type: "referral", data: { referral: { phone_number: "+15555550123" }, reward: { id: "reward-3", reward_type: "stock", state: "claimed" } } },
          ],
        },
      ],
    });

    expect(result).toMatchObject({ total: 3, sectionCounts: { Pending: 1, Claimed: 2 }, typeCounts: { referral: 2, standalone_reward: 1 } });
    expect(result.rewards).toEqual([
      { id: "reward-1", itemType: "referral", rewardType: "stock", status: "pending", quantity: 1.25, currencyCode: "USD" },
      { id: "reward-2", itemType: "standalone_reward", rewardType: "stock", status: "claimed", quantity: 5, currencyCode: null },
      { id: "reward-3", itemType: "referral", rewardType: "stock", status: "claimed", quantity: null, currencyCode: null },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/friend@example\.com|Private Friend|15555550123|ref-1/);
  });

  it("returns inbox aggregates only, never thread content or sender details", async () => {
    const result = await getInboxSummary({}, {
      getJson: async (url: string) => url.includes("badge")
        ? { shouldBadge: true, shouldCriticalBadge: true }
        : { count: 181, next: null, results: [
          { is_read: false, is_critical: true, is_muted: false, last_message_sent_at: "2026-08-02T12:00:00Z", preview_text: { text: "private message" }, display_name: "Private Sender", most_recent_message: { text: "do not expose" } },
          { is_read: true, is_critical: false, is_muted: true, last_message_sent_at: "2026-07-01T12:00:00Z" },
        ] },
    });

    expect(result).toEqual({ total: 181, unread: 1, critical: 1, muted: 1, latestActivity: "2026-08-02T12:00:00Z", hasNext: false, hasBadge: true, hasCriticalBadge: true });
    expect(JSON.stringify(result)).not.toMatch(/private message|Private Sender|do not expose/);
  });

  it("lists public IPOs and reports no open offerings honestly", async () => {
    const result = await getIpoAccess({}, {
      getJson: async (url: string, params?: Record<string, string>) => {
        if (url.includes("discovery/lists/items")) return { results: [{ symbol: "JMKE" }] };
        if (url.includes("instruments/")) return { results: [{ id: "fd5c6caf-2003-491b-a294-0ea306a05ea2", symbol: params?.symbol, name: "Jersey Mike's", ipo_access_status: "public", ipo_access_cob_deadline: "2026-07-30T03:59:00Z", ipoa_start_date: "2026-07-20", list_date: "2026-07-30", ipo_s1_url: "https://example.test/s1", ipo_roadshow_url: "https://example.test/roadshow" }] };
        if (url.includes("ipo_access/viewmodels/summary")) return { ipo_price: "23", customer_count: 36273, status: "public", participation: { customers: 36273 } };
        if (url.includes("accounts/")) return { results: [{ account_number: "12345678", ipo_access_restricted: false, ipo_access_restricted_reason: null }] };
        throw new Error(`unexpected ${url}`);
      },
    });

    expect(result.openOfferingCount).toBe(0);
    expect(result.message).toMatch(/No open IPO offerings/i);
    expect(result.offerings[0]).toMatchObject({ symbol: "JMKE", ipoId: "fd5c6caf-2003-491b-a294-0ea306a05ea2", status: "public", deadline: "2026-07-30T03:59:00Z", startDate: "2026-07-20", listDate: "2026-07-30", priceUsd: null, customerCount: null, s1Url: "https://example.test/s1", roadshowUrl: "https://example.test/roadshow" });
    expect(result.eligibility).toEqual({ eligibleAccounts: 1, restrictedAccounts: 0, restrictionReasons: [] });
  });

  it("keeps an IPO result usable and marks a mapped summary failure honestly", async () => {
    const result = await getIpoAccess({ symbol: "JMKE" }, {
      getJson: async (url: string, params?: Record<string, string>) => {
        if (url.includes("instruments/")) return { results: [{ id: "ipo-1", symbol: params?.symbol, ipo_access_status: "public" }] };
        if (url.includes("ipo_access/viewmodels/summary")) throw new Error("404 unavailable");
        if (url.includes("accounts/")) return { results: [] };
        throw new Error(`unexpected ${url}`);
      },
    });
    expect(result.offerings[0]).toMatchObject({ symbol: "JMKE", ipoId: "ipo-1", status: "public", priceUsd: null });
    expect(result.warnings).toEqual(["IPO summary unavailable for JMKE: 404 unavailable"]);
  });

  it("shows one IPO by symbol through the instrument resolver and preserves restrictive eligibility", async () => {
    const calls: string[] = [];
    const result = await getIpoAccess({ symbol: "jmke" }, {
      getJson: async (url: string, params?: Record<string, string>) => {
        calls.push(url);
        if (url.includes("instruments/")) return { results: [{ id: "ipo-1", symbol: params?.symbol, ipo_access_status: "open", ipo_access_cob_deadline: "2026-08-10T03:59:00Z" }] };
        if (url.includes("ipo_access/viewmodels/summary")) return { price: { amount: "23", currency_code: "USD" }, participation_stats: { customers: 12 } };
        if (url.includes("accounts/")) return { results: [{ ipo_access_restricted: true, ipo_access_restricted_reason: "account_ineligible" }] };
        throw new Error(`unexpected ${url}`);
      },
    });
    expect(calls.some((url) => url.includes("discovery/lists/items"))).toBe(false);
    expect(result.offerings[0]).toMatchObject({ symbol: "JMKE", ipoId: "ipo-1", status: "open", priceUsd: 23, customerCount: 12 });
    expect(result.eligibility).toEqual({ eligibleAccounts: 0, restrictedAccounts: 1, restrictionReasons: ["account_ineligible"] });
  });

  it("collapses IPO onboarding cards into one explicit request plan without pretending the submit write is mapped", async () => {
    const calls: string[] = [];
    const result = await getIpoAccessRequestPlan(
      { symbol: "rvii", accountNumber: "A1" },
      {
        getJson: async (url: string, _pathParams?: Record<string, string>, query?: Record<string, string>) => {
          calls.push(`${url}?${new URLSearchParams(query ?? {}).toString()}`);
          if (url.includes("transfer/accounts")) return { results: [{ account_number: "A1", type: "rhs" }] };
          if (url.includes("instruments/?symbol"))
            return {
              results: [
                {
                  id: "ipo-1",
                  symbol: "RVII",
                  ipo_access_status: "price_finalized",
                  ipo_access_cob_deadline: "2026-08-13T00:00:00Z",
                },
              ],
            };
          if (url.includes("order_entry_splash"))
            return {
              title: "IPO Access",
              subtitle_markdown: "Learn before requesting",
              continue_cta_title: "Start request",
              dont_show_again_cta_title: "Don't show again",
              sections: [],
            };
          if (url.includes("web_order_entry"))
            return {
              ipoa_new_orders_blocked_details: "",
              form_state: { form_state_id: "price_finalized2525" },
              order_entry_view_model: {
                title: "Request to buy RVII",
                buying_power_description: "$50.00 Buying Power Available",
                rows: { quantity_row: { label: "Number of shares" }, price_row: { value: "$25.00" } },
                order_summary: { description_markdown: "conditional offer to buy" },
                disclaimer: { label_markdown: "deadline" },
              },
              context: {
                phase: "price_finalized",
                user_is_enrolled: true,
                has_cob_deadline_passed: false,
                available_buying_power: { amount: "50.00", currency_code: "USD" },
                existing_order: null,
              },
            };
          if (url.includes("indication_of_interest"))
            return { title: "Before you request", rows: [{ title_markdown: "Risk" }], footer_markdown: "Terms", accept_title: "I agree", dismiss_title: "Cancel" };
          if (url.includes("notification_disclosure"))
            return { title: "Notifications", rows: [], disclosure_markdown: "Notice", continue_button: { title: "Continue" } };
          throw new Error(`unexpected ${url}`);
        },
      },
    );

    expect(result).toMatchObject({
      symbol: "RVII",
      status: "price_finalized",
      canRequest: true,
      enrollment: { evaluated: true, enrolled: true },
      deadline: { evaluated: true, passed: false, at: "2026-08-13T00:00:00Z" },
      buyingPower: { evaluated: true, amount: 50, currencyCode: "USD" },
      education: { startLabel: "Start request", suppressLabel: "Don't show again" },
      acknowledgement: { required: true, acceptLabel: "I agree", dismissLabel: "Cancel" },
      submission: { evaluated: false, status: "not_evaluated" },
    });
    expect(calls.some((url) => url.includes("account_number=A1"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("A1");
  });
});

describe("existing sweep and Gold finance reads", () => {
  it("prefers the authenticated Gold product surface for the current cash-sweep APY", async () => {
    const calls: string[] = [];
    const result = await getSweepInterest({}, { getJson: async (url: string) => {
      calls.push(url);
      return {
        sweep_section: {
          section_header: {
            info_tag: { label: "3.35% APY with Gold" },
            icon_dialog: { message: "Rate may change." },
          },
        },
      };
    } });
    expect(calls).toEqual(["https://bonfire.robinhood.com/gold/sweep_flow_splash/"]);
    expect(result.rates).toEqual([{
      balanceTier: "Gold cash sweep",
      apyPct: 3.35,
      interestRatePct: null,
      effectiveDate: null,
      source: "gold-sweep-splash",
    }]);
  });

  it("falls back to account sweep context without relabeling APY as a base rate", async () => {
    const result = await getSweepInterest({}, { getJson: async (url: string) => {
      if (url.includes("gold/sweep_flow_splash")) throw new Error("product surface unavailable");
      return { interest_rate: "3.35", sweep_enabled: true };
    } });
    expect(result.rates).toEqual([{
      balanceTier: "Account cash sweep",
      apyPct: 3.35,
      interestRatePct: null,
      effectiveDate: null,
      source: "account-sweep-fallback",
    }]);
    expect(result.warnings).toEqual(["Gold sweep product read unavailable; used account sweep fallback."]);
  });

  it("keeps Gold fees dollar-normalized and paginated", async () => {
    const result = await listGoldFees({ limit: 1 }, { getAll: async () => [{ id: "fee-1", amount: "5.00", status: "paid", type: "subscription" }, { id: "fee-2", amount: "5.00", status: "paid", type: "subscription" }] });
    expect(result).toMatchObject({ total: 2, count: 1, hasMore: true });
    expect(result.fees[0]).toMatchObject({ id: "fee-1", amountUsd: 5 });
  });
});
