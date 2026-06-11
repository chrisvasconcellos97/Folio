// Pip Tier A — read hook for folio_account_snapshots.
// Returns today's rows for the user so other components can read
// health trends, momentum, and stuck signals without re-computing.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useAccountSnapshots(userId) {
  var [snapshots, setSnapshots]             = useState([]);
  var [snapshotHistory, setSnapshotHistory] = useState([]);
  var [loading, setLoading]                 = useState(false);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    var today        = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    var eightDaysAgo = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - 8 * 86400000));
    supabase
      .from("folio_account_snapshots")
      .select("*")
      .eq("user_id", userId)
      .gte("snapshot_date", eightDaysAgo)
      .order("snapshot_date", { ascending: false })
      .then(function (r) {
        setLoading(false);
        var all = r.data || [];
        setSnapshots(all.filter(function (s) { return s.snapshot_date === today; }));
        setSnapshotHistory(all);
      });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);

  return { snapshots: snapshots, snapshotHistory: snapshotHistory, loading: loading, refetch: fetch };
}
