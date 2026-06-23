import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { useRealtimeSync } from "./useRealtimeSync";
import { logSilentFailure } from "../lib/logSilentFailure.js";

// PTO / Away Mode (#50) — the user's away periods (set via "Set PTO" on the
// calendar). FAIL-SOFT by design: if the folio_away_periods table doesn't exist
// yet (migration not run), reads return [] and writes no-op-with-toast — the app
// never breaks in the gap between deploy and the manual migration.
function tableMissing(err) {
  if (!err) return false;
  // PostgREST: "Could not find the table ... in the schema cache" / undefined_table.
  return err.code === "42P01" || err.code === "PGRST205" ||
    /does not exist|schema cache/i.test(err.message || "");
}

export function useAwayPeriods(userId) {
  var [periods, setPeriods] = useState([]);
  var [ready, setReady]     = useState(false);

  var fetch = useCallback(function () {
    if (!userId) { setPeriods([]); return; }
    supabase
      .from("folio_away_periods")
      .select("*")
      .eq("user_id", userId)
      .order("start_date", { ascending: false })
      .then(function (r) {
        setReady(true);
        if (r.error) {
          if (!tableMissing(r.error)) logSilentFailure("useAwayPeriods/fetch", r.error);
          setPeriods([]);
          return;
        }
        setPeriods(r.data || []);
      });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);
  useRealtimeSync("folio_away_periods", userId, fetch);

  function addAway(period) {
    if (!userId || !period || !period.start_date || !period.end_date) return Promise.resolve();
    return supabase.from("folio_away_periods").insert({
      user_id: userId,
      start_date: period.start_date,
      end_date: period.end_date,
      note: period.note || null,
    }).then(function (r) {
      if (r.error && !tableMissing(r.error)) logSilentFailure("useAwayPeriods/add", r.error);
      fetch();
      return r;
    });
  }

  function removeAway(id) {
    if (!userId) return Promise.resolve();
    return supabase.from("folio_away_periods").delete().eq("id", id).eq("user_id", userId)
      .then(function (r) { if (r.error) logSilentFailure("useAwayPeriods/remove", r.error); fetch(); });
  }

  return { periods: periods, ready: ready, refetch: fetch, addAway: addAway, removeAway: removeAway };
}
