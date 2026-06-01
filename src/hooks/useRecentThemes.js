import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

// Returns the most common themes across all accounts in the last 90 days.
// Shape: [{ theme, count, accounts: ["Account A", "Account B"] }] sorted by count desc.
export function useRecentThemes(userId) {
  var [themes, setThemes] = useState([]);

  useEffect(function () {
    if (!userId) return;
    var cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    supabase
      .from("folio_meetings")
      .select("theme, account_id, folio_accounts(name)")
      .eq("user_id", userId)
      .not("theme", "is", null)
      .gte("meeting_date", cutoff)
      .order("meeting_date", { ascending: false })
      .limit(100)
      .then(function (r) {
        if (r.error || !r.data || r.data.length === 0) return;
        var counts = {};
        var accountSets = {};
        r.data.forEach(function (row) {
          var t = row.theme;
          if (!t) return;
          counts[t] = (counts[t] || 0) + 1;
          if (!accountSets[t]) accountSets[t] = new Set();
          var name = row.folio_accounts ? row.folio_accounts.name : null;
          if (name) accountSets[t].add(name);
        });
        var result = Object.keys(counts)
          .map(function (t) {
            return { theme: t, count: counts[t], accounts: Array.from(accountSets[t] || []).slice(0, 3) };
          })
          .sort(function (a, b) { return b.count - a.count; });
        setThemes(result);
      });
  }, [userId]);

  return themes;
}
