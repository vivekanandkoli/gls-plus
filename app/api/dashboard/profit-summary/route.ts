import { NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { fetchDealsForWac } from "@/lib/wac-fetch";
import { getCurrentWacState, OPENING_STOCK_GM, OPENING_STOCK_VALUE_THB } from "@/lib/wac-ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createSupabaseServiceClient() as any;

    // ── 1. Settings ───────────────────────────────────────────────────────────
    const { data: settings } = await supabase
      .from("settings")
      .select("opening_stock_value_thb, closing_rate_owner")
      .limit(1)
      .maybeSingle();

    const openingStockValue: number =
      typeof settings?.opening_stock_value_thb === "number"
        ? settings.opening_stock_value_thb
        : OPENING_STOCK_VALUE_THB;

    const closingRateOwner: number =
      typeof settings?.closing_rate_owner === "number" && settings.closing_rate_owner > 0
        ? settings.closing_rate_owner
        : 4260;

    // ── 2. All approved deals ─────────────────────────────────────────────────
    const { data: allDeals, error: dealsErr } = await supabase
      .from("deals")
      .select("trading_profit,buy_amount,sell_amount,is_cash,status")
      .eq("status", "approved");

    if (dealsErr) throw new Error(dealsErr.message);

    // Profit 1: Trading profit = sum of trading_profit across ALL approved deals
    let tradingProfit = 0;
    let totalBuyOfficial = 0;
    let totalSellOfficial = 0;

    for (const d of allDeals ?? []) {
      const tp = typeof d.trading_profit === "number" ? d.trading_profit : 0;
      tradingProfit += tp;

      if (!d.is_cash) {
        totalBuyOfficial += typeof d.buy_amount === "number" ? d.buy_amount : 0;
        totalSellOfficial += typeof d.sell_amount === "number" ? d.sell_amount : 0;
      }
    }

    // ── 3. Current stock via WAC ledger ───────────────────────────────────────
    const wacTxs = await fetchDealsForWac(supabase);
    const wacState = wacTxs.length > 0
      ? getCurrentWacState(wacTxs)
      : { stockGm: OPENING_STOCK_GM, wac: openingStockValue / OPENING_STOCK_GM, stockValueThb: openingStockValue };

    const currentStockGm = wacState.stockGm;
    const currentWac = wacState.wac;

    // ── 4. Tax profit (official non-cash deals, WAC closing method) ───────────
    const closingValueOwner = currentStockGm * closingRateOwner;
    const closingValueWac = currentStockGm * currentWac;

    // COGS = opening inventory + official purchases − closing inventory
    const cogsOwnerMethod = openingStockValue + totalBuyOfficial - closingValueOwner;
    const cogsWacMethod = openingStockValue + totalBuyOfficial - closingValueWac;

    // Tax profit = revenue − COGS
    const taxProfitOwnerMethod = totalSellOfficial - cogsOwnerMethod;
    const taxProfitWacMethod = totalSellOfficial - cogsWacMethod;

    return NextResponse.json({
      // Profit 1: private trading profit across all deals
      trading_profit: {
        value: Math.round(tradingProfit * 100) / 100,
        label: "Trading Profit (Private)",
        note: "All deals - cash + non-cash",
      },

      // Profit 2: CA/tax profit - non-cash only, owner-rate closing
      tax_profit: {
        value: Math.round(taxProfitOwnerMethod * 100) / 100,
        label: "Tax Profit (Official)",
        note: "Non-cash only · owner rate closing",
        formula: {
          total_sell: Math.round(totalSellOfficial * 100) / 100,
          total_buy: Math.round(totalBuyOfficial * 100) / 100,
          opening_value: openingStockValue,
          closing_value_owner: Math.round(closingValueOwner * 100) / 100,
          closing_value_wac: Math.round(closingValueWac * 100) / 100,
          owner_closing_rate: closingRateOwner,
          cogs_owner: Math.round(cogsOwnerMethod * 100) / 100,
          cogs_wac: Math.round(cogsWacMethod * 100) / 100,
          profit_wac_method: Math.round(taxProfitWacMethod * 100) / 100,
        },
      },

      // Supporting figures
      current_stock_gm: Math.round(currentStockGm * 1000) / 1000,
      current_wac: Math.round(currentWac * 10000) / 10000,
      closing_rate_owner: closingRateOwner,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to compute profit summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
