import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export function useAccountHealthHistory(userId, accountId) {
  var [history, setHistory] = useState([]);

  useEffect(function () {
    if (!userId || !accountId) return;
    var cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    supabase
      .from("folio_account_snapshots")
      .select("snapshot_date, health_status, health_score")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .gte("snapshot_date", cutoff)
      .order("snapshot_date", { ascending: true })
      .then(function (r) {
        if (!r.error) setHistory(r.data || []);
      });
  }, [userId, accountId]);

  return history;
}
