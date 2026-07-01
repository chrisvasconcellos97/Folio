import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { useRealtimeSync } from "./useRealtimeSync";
import { logSilentFailure } from "../lib/logSilentFailure.js";

// Conference Prep (item 56) — pre-departure readiness before a conference.
// FAIL-SOFT by design, same pattern as useAwayPeriods: if folio_conferences
// doesn't exist yet (migration not run), reads return [] and writes no-op —
// the app never breaks in the gap between deploy and the manual migration.
function tableMissing(err) {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" ||
    /does not exist|schema cache/i.test(err.message || "");
}

export function useConferences(userId) {
  var [conferences, setConferences] = useState([]);
  var [ready, setReady] = useState(false);

  var fetch = useCallback(function () {
    if (!userId) { setConferences([]); return; }
    supabase
      .from("folio_conferences")
      .select("*")
      .eq("user_id", userId)
      .order("start_date", { ascending: true })
      .then(function (r) {
        setReady(true);
        if (r.error) {
          if (!tableMissing(r.error)) logSilentFailure("useConferences/fetch", r.error);
          setConferences([]);
          return;
        }
        setConferences(r.data || []);
      });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);
  useRealtimeSync("folio_conferences", userId, fetch);

  function addConference(conference) {
    if (!userId || !conference || !conference.name || !conference.start_date || !conference.end_date) {
      return Promise.resolve(null);
    }
    var row = {
      user_id: userId,
      name: String(conference.name).slice(0, 200),
      location: conference.location ? String(conference.location).slice(0, 200) : null,
      start_date: conference.start_date,
      end_date: conference.end_date,
      account_ids: conference.account_ids || [],
      notes: conference.notes || null,
    };
    return supabase.from("folio_conferences").insert(row).select().single()
      .then(function (r) {
        if (r.error) {
          if (!tableMissing(r.error)) logSilentFailure("useConferences/add", r.error);
          fetch();
          return null;
        }
        fetch();
        return r.data;
      });
  }

  function updateConference(id, fields) {
    if (!userId || !id) return Promise.resolve();
    return supabase.from("folio_conferences").update(fields).eq("id", id).eq("user_id", userId)
      .then(function (r) {
        if (r.error && !tableMissing(r.error)) logSilentFailure("useConferences/update", r.error);
        fetch();
      });
  }

  function removeConference(id) {
    if (!userId || !id) return Promise.resolve();
    return supabase.from("folio_conferences").delete().eq("id", id).eq("user_id", userId)
      .then(function (r) {
        if (r.error && !tableMissing(r.error)) logSilentFailure("useConferences/remove", r.error);
        fetch();
      });
  }

  return {
    conferences: conferences,
    ready: ready,
    refetch: fetch,
    addConference: addConference,
    updateConference: updateConference,
    removeConference: removeConference,
  };
}
