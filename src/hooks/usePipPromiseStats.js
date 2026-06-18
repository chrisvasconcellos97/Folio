// Global delivery track record — reads pip_promise_log for ALL the user's
// accounts in one query and returns a map { [account_id]: { avgDays,
// recentItems } }. Used by the chat context (PipView) so Pip can speak to an
// account's delivery history for whichever account the user focuses, without
// firing a per-account query each.
//
// The per-account variant (usePipPromiseLog) stays for single-account surfaces
// like CadenceHub summarize; this is the global parity wire for chat.

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export function usePipPromiseStats(userId) {
  var [statsByAccount, setStatsByAccount] = useState({}); // { account_id: { avgDays, recentItems } }

  useEffect(function () {
    if (!userId) return;
    supabase
      .from("pip_promise_log")
      .select("account_id, item_text, days_to_complete, due_date, closed_at")
      .eq("user_id", userId)
      .not("days_to_complete", "is", null)
      .order("closed_at", { ascending: false })
      .limit(500)
      .then(function (r) {
        if (r.error || !r.data || r.data.length === 0) return;
        var byAccount = {};
        r.data.forEach(function (row) {
          if (!row.account_id) return;
          (byAccount[row.account_id] || (byAccount[row.account_id] = [])).push(row);
        });
        var map = {};
        Object.keys(byAccount).forEach(function (acctId) {
          var rows  = byAccount[acctId];
          var total = rows.reduce(function (s, row) { return s + row.days_to_complete; }, 0);
          map[acctId] = {
            avgDays:     Math.round(total / rows.length),
            recentItems: rows.slice(0, 5),
          };
        });
        setStatsByAccount(map);
      });
  }, [userId]);

  return statsByAccount;
}
