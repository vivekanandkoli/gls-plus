"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchAllTransactionsForWac } from "@/lib/wac-fetch";
import {
  getCurrentWacState,
  OPENING_WAC,
  recalculateWacPl,
  type WacPlEntry,
} from "@/lib/wac-ledger";
import { getSupabaseClient } from "@/lib/supabase";

/** Client-side WAC map — used when DB columns are not migrated yet. */
export function useTransactionWac(enabled = true) {
  const [plById, setPlById] = useState<Map<string, WacPlEntry>>(new Map());
  const [currentWac, setCurrentWac] = useState(OPENING_WAC);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setPlById(new Map());
      setCurrentWac(OPENING_WAC);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      getSupabaseClient();
      const txs = await fetchAllTransactionsForWac();
      const map = recalculateWacPl(txs);
      setPlById(map);
      setCurrentWac(getCurrentWacState(txs).wac);
    } catch {
      setPlById(new Map());
      setCurrentWac(OPENING_WAC);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { plById, currentWac, loading, refresh };
}
