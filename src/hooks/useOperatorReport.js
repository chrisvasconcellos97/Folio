import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

// useOperatorReport — reads the materialized output of the nightly Pip
// Autonomous Operator loop (api/operator-run.js):
//
//   report  — today's portfolio-level operator report row, or null if the
//             loop hasn't run today (first day, or a skipped idle weekend).
//   drafts  — per-account follow-up emails Pip drafted in the latest run,
//             pulled from folio_pip_account_state.operator_draft_email.
//
// A null report is the signal for HomeView to fall back to the live daily
// brief. Both stores are written by the cron via the service role; reads here
// run under the user's session (RLS-scoped to auth.uid()).
function todayLocalISO() {
  // Match the report_date the loop writes (user-local calendar day).
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export function useOperatorReport(userId) {
  var [report, setReport]   = useState(null);
  var [drafts, setDrafts]   = useState([]);
  var [loading, setLoading] = useState(false);
  var [loaded, setLoaded]   = useState(false);

  var fetchReport = useCallback(function () {
    if (!userId) { setReport(null); setDrafts([]); setLoaded(true); return; }
    setLoading(true);
    var day = todayLocalISO();

    var reportP = supabase
      .from("folio_operator_reports")
      .select("*")
      .eq("user_id", userId)
      .eq("report_date", day)
      .maybeSingle();

    // Drafts from the most recent run (today). Join account name client-side.
    var draftsP = supabase
      .from("folio_pip_account_state")
      .select("account_id,operator_draft_email,operator_generated_at,folio_accounts(name)")
      .eq("user_id", userId)
      .not("operator_draft_email", "is", null)
      .neq("operator_draft_email", "");

    Promise.all([reportP, draftsP]).then(function (results) {
      setLoading(false);
      setLoaded(true);
      var r = results[0];
      var d = results[1];
      setReport(r && r.data ? r.data : null);
      var rows = (d && d.data) || [];
      // Only surface drafts generated today, so a stale draft from a prior run
      // (on an account that didn't move tonight) doesn't linger on Home.
      var startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      var fresh = rows.filter(function (row) {
        return row.operator_generated_at && new Date(row.operator_generated_at).getTime() >= startOfDay.getTime();
      });
      setDrafts(fresh.map(function (row) {
        return {
          account_id: row.account_id,
          account_name: row.folio_accounts ? row.folio_accounts.name : "Account",
          email: row.operator_draft_email,
        };
      }));
    });
  }, [userId]);

  useEffect(function () { fetchReport(); }, [fetchReport]);

  return { report: report, drafts: drafts, loading: loading, loaded: loaded, refetch: fetchReport };
}
