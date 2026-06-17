import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activity";
import { touchAccount } from "../lib/touchAccount";
import { useRealtimeSync } from "./useRealtimeSync";

// Map a folio_tasks row to the shape consumers expect (item.text, item.owner).
function mapRow(row) {
  if (!row) return row;
  return Object.assign({}, row, {
    text:  row.title,
    owner: row.assignee_email,
  });
}

// Map consumer-facing field names back to folio_tasks column names for writes.
function mapFields(data) {
  var out = Object.assign({}, data);
  if ("text" in out)  { out.title = out.text;  delete out.text;  }
  if ("owner" in out) { out.assignee_email = out.owner; delete out.owner; }
  return out;
}

export function useItems(userId, accountId, orgId) {
  var [items, setItems]     = useState([]);
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    var query = supabase
      .from("folio_tasks")
      .select("*")
      .eq("user_id", userId)
      .is("project_id", null)   // loose action items only — not Gauge project tasks
      // No done filter — ItemsTab shows both open and closed sections.
      // Per-account queries are bounded by accountId; global queries use allItems from App.
      .order("created_at", { ascending: false })
      .limit(200);
    if (accountId) query = query.eq("account_id", accountId);
    query.then(function (result) {
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
      } else {
        setError(null);
        setItems((result.data || []).map(mapRow));
      }
    });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  useRealtimeSync("folio_tasks", userId, fetch);

  function addItem(data) {
    var payload = mapFields(Object.assign({}, data, { user_id: userId }));
    return supabase
      .from("folio_tasks")
      .insert([payload])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        if (data.account_id) {
          touchAccount(data.account_id);
        }
        logActivity(orgId, userId, data.account_id, "item_added", { text: data.text || data.title });
        fetch();
        return mapRow(result.data[0]);
      });
  }

  function closeItem(id) {
    var closedAt = new Date().toISOString();
    return supabase
      .from("folio_tasks")
      .update({ done: true, status: "complete", closed_at: closedAt })
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        logActivity(orgId, userId, accountId, "item_completed", { id: id });
        fetch();
        // Fire-and-forget promise completion ledger entry for V2 brain.
        supabase
          .from("folio_tasks")
          .select("*")
          .eq("id", id)
          .single()
          .then(function (r) {
            if (r.error || !r.data) return;
            var item    = r.data;
            var created = item.created_at ? new Date(item.created_at) : null;
            var closed  = new Date(closedAt);
            var days    = created ? Math.max(0, Math.floor((closed - created) / 86400000)) : null;
            return supabase.from("pip_promise_log").insert([{
              user_id:          userId,
              account_id:       item.account_id,
              item_id:          item.id,
              item_text:        item.title,
              due_date:         item.due_date || null,
              days_to_complete: days,
              closed_at:        closedAt,
            }]);
          })
          .catch(function () { /* ledger is fire-and-forget */ });
      });
  }

  function updateItem(id, data) {
    var payload = mapFields(data);
    return supabase
      .from("folio_tasks")
      .update(payload)
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  function deleteItem(id) {
    return supabase
      .from("folio_tasks")
      .delete()
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  return { items, loading, error, refetch: fetch, addItem, closeItem, updateItem, deleteItem };
}
