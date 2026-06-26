import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { fetchWithTimeout } from "../lib/net";

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

  // force=true bypasses the server fingerprint skip (manual "resync" button).
  function refreshState(accountIds, force) {
    var ids = Array.isArray(accountIds) ? accountIds : [accountIds];
    ids = ids.filter(function (id) { return !!id; }).slice(0, 50);
    if (!ids.length) return Promise.resolve(null);
    return supabase.auth.getSession().then(function (result) {
      var token = result.data.session ? result.data.session.access_token : null;
      var headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;
      return fetch_refresh(ids, headers, force).then(function () {
        fetch();
      });
    });
  }

  // Separate so it can be reused with custom headers — kept inside the hook
  // closure so the network call lives next to its hook caller.
  function fetch_refresh(ids, headers, force) {
    // Refresh is best-effort, but bound it to 30s so a hung connection
    // doesn't leak fetch promises forever.
    return fetchWithTimeout("/api/pip-state-refresh", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ accountIds: ids, force: !!force }),
    }, 30000).then(function (r) {
      if (!r.ok) {
        console.warn("pip-state-refresh failed:", r.status);
      }
      return r;
    }).catch(function (err) {
      console.warn("pip-state-refresh error:", err && err.message);
    });
  }

  // Account Narrative Memory (#17) — re-derive the per-account story for these
  // accounts. Mirrors refreshState; the server fingerprint-gates so an unchanged
  // account is a $0 skip, and returns {skipped:"not_migrated"} until the columns
  // exist (fail-soft). Best-effort + refetch on completion.
  function deriveNarratives(accountIds, force) {
    var ids = Array.isArray(accountIds) ? accountIds : [accountIds];
    ids = ids.filter(function (id) { return !!id; }).slice(0, 12);
    if (!ids.length) return Promise.resolve(null);
    return supabase.auth.getSession().then(function (result) {
      var token = result.data.session ? result.data.session.access_token : null;
      var headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;
      return fetchWithTimeout("/api/account-narrative", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ accountIds: ids, force: !!force }),
      }, 60000).then(function (r) {
        if (!r.ok) { console.warn("account-narrative failed:", r.status); return null; }
        return r.json().then(function (body) {
          // Only refetch when real work landed — a skip (not_migrated / spend_cap /
          // fingerprint-unchanged) changes nothing, so don't churn a refetch loop.
          if (body && body.derived > 0) fetch();
          return body;
        }, function () { return null; });
      }).catch(function (err) {
        console.warn("account-narrative error:", err && err.message);
        return null;
      });
    });
  }

  return {
    states: states,
    loading: loading,
    error: error,
    getState: getState,
    getStateRow: getStateRow,
    refreshState: refreshState,
    deriveNarratives: deriveNarratives,
    refetch: fetch,
  };
}

// Find accounts that actually CHANGED since their state was last computed.
// An account is stale only if: (a) no state row exists, or (b) its
// last_interaction_at is newer than the row's generated_at — meaning new
// activity happened after the last refresh. Accounts that haven't been
// touched since their last refresh are skipped (event-gate, not timer-gate).
export function findStaleAccountIds(accounts, states, max) {
  if (!Array.isArray(accounts)) return [];
  var byId = {};
  (states || []).forEach(function (s) { byId[s.account_id] = s; });
  var stale = [];
  accounts.forEach(function (a) {
    var row = byId[a.id];
    // No state row yet — always refresh.
    if (!row) { stale.push(a.id); return; }
    // Changed since last compute: last_interaction_at > generated_at.
    if (
      a.last_interaction_at &&
      row.generated_at &&
      new Date(a.last_interaction_at) > new Date(row.generated_at)
    ) {
      stale.push(a.id);
    }
  });
  return stale.slice(0, max || 20);
}
