// Reads pip_promise_log for a specific account and computes delivery stats:
// how long commitments typically take to close, and which ones were closed recently.
// Used to inject a "delivery track record" block into Pip's summarize context.

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export function usePipPromiseLog(userId, accountId) {
  var [stats, setStats] = useState(null); // { avgDays, recentItems }

  useEffect(function () {
    if (!userId || !accountId) return;
    supabase
      .from("pip_promise_log")
      .select("item_text, days_to_complete, due_date, closed_at")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .not("days_to_complete", "is", null)
      .order("closed_at", { ascending: false })
      .limit(20)
      .then(function (r) {
        if (r.error || !r.data || r.data.length === 0) return;
        var total = r.data.reduce(function (s, row) { return s + row.days_to_complete; }, 0);
        setStats({
          avgDays: Math.round(total / r.data.length),
          recentItems: r.data.slice(0, 5),
        });
      });
  }, [userId, accountId]);

  return stats;
}
