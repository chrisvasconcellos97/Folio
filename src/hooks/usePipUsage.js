// Reads from folio_pip_usage and returns a current-calendar-month rollup
// (call count + estimated spend) for the SettingsView tile.
//
// Cost rows are stored in micro-cents (cents × 10,000) — divide by 1,000,000
// to render dollars.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function usePipUsage(userId) {
  var [callCount, setCallCount]   = useState(0);
  var [spendUsd, setSpendUsd]     = useState(0);
  var [loading, setLoading]       = useState(false);
  var [error, setError]           = useState(null);

  useEffect(function () {
    if (!userId) return;
    setLoading(true);
    setError(null);

    // Calendar month start in user-local time. Stored timestamps are UTC, but
    // for a back-of-envelope spend tile, the small wrap-around discrepancy is
    // fine — we're not invoicing off this number.
    var now = new Date();
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    supabase
      .from("folio_pip_usage")
      .select("cost_micro_cents", { count: "exact" })
      .eq("user_id", userId)
      .gte("created_at", monthStart)
      .then(function (r) {
        setLoading(false);
        if (r.error) {
          // Most likely: table doesn't exist yet (SQL not run) — fail soft so
          // the tile shows "—" instead of breaking the Settings page.
          setError(r.error.message);
          return;
        }
        var rows = r.data || [];
        var totalMicroCents = rows.reduce(function (acc, row) {
          return acc + (row.cost_micro_cents || 0);
        }, 0);
        setCallCount(rows.length);
        setSpendUsd(totalMicroCents / 1000000); // micro-cents → dollars
      }, function (err) {
        setLoading(false);
        setError(err && err.message);
      });
  }, [userId]);

  return { callCount: callCount, spendUsd: spendUsd, loading: loading, error: error };
}
