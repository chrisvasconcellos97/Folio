import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { useRealtimeSync } from "./useRealtimeSync";
import { logSilentFailure } from "../lib/logSilentFailure.js";

// Win log (#3) — the brag file. A win is a user-confirmed good outcome (a
// project landed, a promise kept, a fire put out) persisted so it survives for
// review season + the Friday Wrap. Auto-detected candidates (candidateWins in
// weekReview.js) are logged one-tap with a source_ref; manual wins have none.
export function useWins(userId) {
  var [wins, setWins] = useState([]);

  var fetch = useCallback(function () {
    if (!userId) { setWins([]); return; }
    supabase
      .from("folio_wins")
      .select("*")
      .eq("user_id", userId)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200)
      .then(function (r) { if (!r.error) setWins(r.data || []); });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);
  useRealtimeSync("folio_wins", userId, fetch);

  // Add a win. `source_ref` (e.g. "project:<id>") dedupes candidates — a unique
  // partial index rejects a second log of the same source, so the .catch is
  // benign (already logged) and we just refetch.
  function addWin(win) {
    if (!userId || !win || !win.title) return Promise.resolve();
    var row = {
      user_id: userId,
      title: String(win.title).slice(0, 280),
      account_id: win.account_id || null,
      kind: win.kind || "manual",
      source_ref: win.source_ref || null,
      occurred_on: win.occurred_on || new Date().toISOString().slice(0, 10),
    };
    return supabase.from("folio_wins").insert(row)
      .then(function (r) {
        // 23505 = unique violation (candidate already logged) — not a failure.
        if (r.error && r.error.code !== "23505") logSilentFailure("useWins/addWin", r.error);
        fetch();
      });
  }

  function removeWin(id) {
    if (!userId) return Promise.resolve();
    return supabase.from("folio_wins").delete().eq("id", id).eq("user_id", userId)
      .then(function (r) { if (r.error) logSilentFailure("useWins/removeWin", r.error); fetch(); });
  }

  return { wins: wins, refetch: fetch, addWin: addWin, removeWin: removeWin };
}
