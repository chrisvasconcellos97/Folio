import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

export function useAccountNotes(userId, accountId, orgId, legacyObjective, onClearLegacy) {
  var [notes, setNotes]   = useState(legacyObjective || "");
  var [loading, setLoading] = useState(false);
  var migratedRef = useRef(false);

  var fetch = useCallback(function () {
    if (!userId || !accountId) return;
    setLoading(true);
    supabase
      .from("folio_account_notes")
      .select("notes")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .maybeSingle()
      .then(function (result) {
        setLoading(false);
        if (result.error) return;

        if (result.data) {
          setNotes(result.data.notes || "");
        } else if (legacyObjective && !migratedRef.current) {
          // Migrate once from account.objective
          migratedRef.current = true;
          setNotes(legacyObjective);
          supabase
            .from("folio_account_notes")
            .upsert(
              [{ user_id: userId, account_id: accountId, org_id: orgId || null, notes: legacyObjective, updated_at: new Date().toISOString() }],
              { onConflict: "account_id,user_id" }
            )
            .then(function () {
              if (onClearLegacy) onClearLegacy({ objective: null });
            })
            .catch(function () {});
        } else {
          setNotes("");
        }
      });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  function saveNotes(value) {
    setNotes(value);
    supabase
      .from("folio_account_notes")
      .upsert(
        [{ user_id: userId, account_id: accountId, org_id: orgId || null, notes: value, updated_at: new Date().toISOString() }],
        { onConflict: "account_id,user_id" }
      )
      .then(function () {})
      .catch(function () {});
  }

  return { notes, loading, saveNotes };
}
