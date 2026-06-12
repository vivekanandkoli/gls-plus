"use client";

import { useCallback, useEffect, useState } from "react";

import { OPENING_STOCK_GM, OPENING_WAC } from "@/lib/wac-ledger";

/** Lightweight hook for SELL preview — reads current WAC and stock from the server. */
export function useCurrentWac() {
  const [currentWac, setCurrentWac] = useState(OPENING_WAC);
  const [stockGm, setStockGm] = useState(OPENING_STOCK_GM);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/current-wac");
      if (!res.ok) throw new Error("Failed to load WAC");
      const data = await res.json();
      setCurrentWac(typeof data.wac === "number" ? data.wac : OPENING_WAC);
      setStockGm(typeof data.stock_gm === "number" ? data.stock_gm : OPENING_STOCK_GM);
    } catch {
      setCurrentWac(OPENING_WAC);
      setStockGm(OPENING_STOCK_GM);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { currentWac, stockGm, loading, refresh };
}
