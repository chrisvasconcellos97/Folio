import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

// usePipAccountState — rolling cache of Pip's per-account state prose.
// One row per (user, account). Refreshed via /api/pip-state-refresh.
//
// Exposes:
//   states               — array of all state rows for this user
//   getState(accountId)  — returns the fresh prose, or null if missing/stale
//   getStateRow(accountId) — returns the full row (incl. stale prose)
//   refreshState(ids)    — POST to /api/pip-state-refresh for these IDs
//   loading, error, refetch
function isFresh(row) {
  if (!row || !row.stale_at) return false;
  return new Date(row.stale_at).getTime() > Date.now();
}

export function usePipAccountState(userId) {
  var [states, setStates]   = useState([]);
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("folio_pip_account_state")
      .select("*")
      .eq("user_id", userId)
      .then(function (result) {
        setLoading(false);
        if (result.error) { setError(result.error.message); return; }
        setError(null);
        setStates(result.data || []);
      });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);

  function getStateRow(accountId) {
    if (!accountId) return null;
    return states.find(function (s) { return s.account_id === accountId; }) || null;
  }

  function getState(accountId) {
    var row = getStateRow(accountId);
    if (!row || !isFresh(row)) return null;
    return row.state_prose;
  }

  function refreshState(accountIds) {
    var ids = Array.isArray(accountIds) ? accountIds : [accountIds];
    ids = ids.filter(function (id) { return !!id; }).slice(0, 50);
    if (!ids.length) return Promise.resolve(null);
    return supabase.auth.getSession().then(function (result) {
      var token = result.data.session ? result.data.session.access_token : null;
      var headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;
      return fetch_refresh(ids, headers).then(function () {
        fetch();
      });
    });
  }

  // Separate so it can be reused with custom headers — kept inside the hook
  // closure so the network call lives next to its hook caller.
  function fetch_refresh(ids, headers) {
    return window.fetch("/api/pip-state-refresh", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ accountIds: ids }),
    }).then(function (r) {
      // Don't throw — refresh is best-effort.
      if (!r.ok) {
        console.warn("pip-state-refresh failed:", r.status);
      }
      return r;
    }).catch(function (err) {
      console.warn("pip-state-refresh error:", err && err.message);
    });
  }

  return {
    states: states,
    loading: loading,
    error: error,
    getState: getState,
    getStateRow: getStateRow,
    refreshState: refreshState,
    refetch: fetch,
  };
}

// Find accounts whose state is missing or stale. Used to fire-and-forget
// a refresh on Pip view mount.
export function findStaleAccountIds(accounts, states, max) {
  if (!Array.isArray(accounts)) return [];
  var byId = {};
  (states || []).forEach(function (s) { byId[s.account_id] = s; });
  var stale = [];
  accounts.forEach(function (a) {
    var row = byId[a.id];
    if (!row) { stale.push(a.id); return; }
    if (!row.stale_at || new Date(row.stale_at).getTime() <= Date.now()) {
      stale.push(a.id);
    }
  });
  return stale.slice(0, max || 20);
}
