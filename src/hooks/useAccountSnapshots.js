// Pip Tier A — read hook for folio_account_snapshots.
// Returns today's rows for the user so other components can read
// health trends, momentum, and stuck signals without re-computing.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useAccountSnapshots(userId) {
  var [snapshots, setSnapshots] = useState([]);
  var [loading, setLoading]    = useState(false);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    var today = new Date().toISOString().slice(0, 10);
    supabase
      .from("folio_account_snapshots")
      .select("*")
      .eq("user_id", userId)
      .eq("snapshot_date", today)
      .then(function (r) {
        setLoading(false);
        if (!r.error) setSnapshots(r.data || []);
      });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);

  return { snapshots: snapshots, loading: loading, refetch: fetch };
}
