import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useMeetings(userId, accountId) {
  var [meetings, setMeetings] = useState([]);
  var [loading, setLoading]   = useState(false);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    var query = supabase
      .from("folio_meetings")
      .select("*, folio_accounts(name)")
      .eq("user_id", userId)
      .order("meeting_date", { ascending: false });
    if (accountId) query = query.eq("account_id", accountId);
    query.then(function (result) {
      setLoading(false);
      if (!result.error) setMeetings(result.data || []);
    });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  function addMeeting(data) {
    return supabase
      .from("folio_meetings")
      .insert([Object.assign({}, data, { user_id: userId })])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
        return result.data[0];
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

  return { meetings, loading, refetch: fetch, addMeeting, updateMeeting, deleteMeeting };
}
