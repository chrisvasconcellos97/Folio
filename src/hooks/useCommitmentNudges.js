import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";

export function useCommitmentNudges(userId, accounts) {
  var [nudges, setNudges] = useState([]);

  var accountsLen = (accounts || []).length;
  var compute = useCallback(function () {
    if (!userId) return;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    // Include tasks due within 3 days (today + 2) and already overdue
    var windowEnd = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    supabase
      .from("folio_tasks")
      .select("id, title, due_date, account_id")
      .eq("user_id", userId)
      .eq("is_commitment", true)
      .neq("status", "complete")
      .not("due_date", "is", null)
      .lte("due_date", windowEnd)
      .order("due_date", { ascending: true })
      .then(function (r) {
        if (r.error || !r.data) return;
        var byId = {};
        (accounts || []).forEach(function (a) { byId[a.id] = a; });
        var today0 = today.getTime();
        setNudges(r.data.map(function (t) {
          var due  = new Date(t.due_date + "T00:00:00");
          var diff = Math.round((due.getTime() - today0) / (24 * 60 * 60 * 1000));
          var acct = t.account_id ? byId[t.account_id] : null;
          return {
            taskId: t.id,
            title: t.title,
            accountName: acct ? acct.name : null,
            accountId: t.account_id,
            daysUntilDue: diff,
            isOverdue: diff < 0,
          };
        }));
      });
  }, [userId, accountsLen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(function () { compute(); }, [compute]);

  function snooze(taskId) {
    setNudges(function (prev) { return prev.filter(function (n) { return n.taskId !== taskId; }); });
  }

  function markDone(taskId) {
    supabase
      .from("folio_tasks")
      .update({ status: "complete" })
      .eq("id", taskId)
      .eq("user_id", userId)
      .then(function () {
        setNudges(function (prev) { return prev.filter(function (n) { return n.taskId !== taskId; }); });
      });
  }

  return { nudges, snooze, markDone };
}
