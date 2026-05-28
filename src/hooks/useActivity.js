import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

// useActivity — paginated read of folio_activity rows for the user's org.
// Owner sees the whole org. Non-owners see only their own actions.
//
// Filters (all optional):
//   - accountId : restrict to a specific account
//   - eventType : restrict to one event_type
//   - userId    : restrict to one user_id (owner-only — passed through, RLS handles policing)
//   - fromDate  : ISO date string lower bound (inclusive)
//   - toDate    : ISO date string upper bound (inclusive)
//
// `loadMore()` pages 50 at a time, oldest cursor advances via the rows you've seen.

var PAGE_SIZE = 50;

export function useActivity(orgId, currentUserId, isOwner, filters) {
  filters = filters || {};
  var [rows, setRows]       = useState([]);
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);
  var [done, setDone]       = useState(false);

  var fetchPage = useCallback(function (beforeTimestamp) {
    if (!orgId || !currentUserId) return Promise.resolve([]);
    var q = supabase
      .from("folio_activity")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (!isOwner) q = q.eq("user_id", currentUserId);
    if (filters.accountId) q = q.eq("account_id", filters.accountId);
    if (filters.eventType) q = q.eq("event_type", filters.eventType);
    if (filters.userId && isOwner) q = q.eq("user_id", filters.userId);
    if (filters.fromDate)  q = q.gte("created_at", filters.fromDate);
    if (filters.toDate)    q = q.lte("created_at", filters.toDate);
    if (beforeTimestamp)   q = q.lt("created_at", beforeTimestamp);

    return q.then(function (r) {
      if (r.error) { setError(r.error.message); return []; }
      return r.data || [];
    });
  }, [orgId, currentUserId, isOwner, filters.accountId, filters.eventType, filters.userId, filters.fromDate, filters.toDate]);

  // Reset + initial load on filter change
  useEffect(function () {
    setRows([]);
    setDone(false);
    setLoading(true);
    setError(null);
    fetchPage(null).then(function (data) {
      setRows(data);
      setDone(data.length < PAGE_SIZE);
      setLoading(false);
    });
  }, [fetchPage]);

  function loadMore() {
    if (loading || done || rows.length === 0) return;
    setLoading(true);
    var cursor = rows[rows.length - 1].created_at;
    fetchPage(cursor).then(function (next) {
      setRows(function (prev) { return prev.concat(next); });
      setDone(next.length < PAGE_SIZE);
      setLoading(false);
    });
  }

  return { rows: rows, loading: loading, error: error, done: done, loadMore: loadMore };
}
