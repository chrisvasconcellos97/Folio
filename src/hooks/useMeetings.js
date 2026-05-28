import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activity";
import { timed } from "../lib/net";
import { touchAccount } from "../lib/touchAccount";
import { useRealtimeSync } from "./useRealtimeSync";

export function useMeetings(userId, accountId, orgId) {
  var [meetings, setMeetings] = useState([]);
  var [loading, setLoading]   = useState(false);
  var [error, setError]       = useState(null);

  var cacheKey = accountId ? null : "folio_meetings_" + userId;

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    var query = supabase
      .from("folio_meetings")
      .select("*, folio_accounts(name)")
      .eq("user_id", userId)
      .order("meeting_date", { ascending: false });
    if (accountId) query = query.eq("account_id", accountId);
    timed("meetings.fetch", function () { return query; }).then(function (result) {
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
        if (cacheKey) {
          var cached = localStorage.getItem(cacheKey);
          if (cached) { try { setMeetings(JSON.parse(cached)); } catch (e) {} }
        }
      } else {
        setError(null);
        setMeetings(result.data || []);
        if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(result.data || []));
      }
    });
  }, [userId, accountId, cacheKey]);

  useEffect(function () { fetch(); }, [fetch]);

  // Phase 8 — multi-device realtime sync. See useRealtimeSync.js.
  useRealtimeSync("folio_meetings", userId, fetch);

  function addMeeting(data) {
    return supabase
      .from("folio_meetings")
      .insert([Object.assign({}, data, { user_id: userId })])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        var meeting = result.data[0];
        if (data.account_id && data.meeting_date) {
          touchAccount(data.account_id, { last_meeting: data.meeting_date });
        }
        logActivity(orgId, userId, data.account_id, "meeting_logged", { title: data.title || "Meeting" });
        fetch();
        return meeting;
      });
  }

  function updateMeeting(id, data) {
    return supabase
      .from("folio_meetings")
      .update(data)
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  function deleteMeeting(id) {
    return supabase
      .from("folio_meetings")
      .delete()
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  return { meetings, loading, error, refetch: fetch, addMeeting, updateMeeting, deleteMeeting };
}
