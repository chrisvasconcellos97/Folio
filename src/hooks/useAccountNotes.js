import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { showToast } from "../components/Toast";

// Local backup key — survives a reload even if the autosave to Supabase fails,
// so the user's unsaved scratchpad text isn't lost.
function backupKey(userId, accountId) {
  return "folio_notes_backup_" + userId + "_" + accountId;
}

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
        if (result.error) {
          // Read failure — fall back to local backup if present.
          try {
            var backup = localStorage.getItem(backupKey(userId, accountId));
            if (backup) setNotes(backup);
          } catch (e) { /* localStorage unavailable */ }
          return;
        }

        if (result.data) {
          setNotes(result.data.notes || "");
          // Server agrees — clear stale backup.
          try { localStorage.removeItem(backupKey(userId, accountId)); } catch (e) { /* localStorage unavailable */ }
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
          // No server row + no legacy — check for unsynced backup.
          try {
            var b = localStorage.getItem(backupKey(userId, accountId));
            setNotes(b || "");
          } catch (e) { setNotes(""); }
        }
      });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  function saveNotes(value) {
    setNotes(value);
    if (!userId || !accountId) return;
    // Belt: stash a local backup before the network hop so a save failure
    // doesn't lose the user's text on reload.
    try { localStorage.setItem(backupKey(userId, accountId), value); } catch (e) { /* localStorage unavailable */ }
    supabase
      .from("folio_account_notes")
      .upsert(
        [{ user_id: userId, account_id: accountId, org_id: orgId || null, notes: value, updated_at: new Date().toISOString() }],
        { onConflict: "account_id,user_id" }
      )
      .then(function (result) {
        if (result && result.error) {
          console.error("Notes autosave failed:", result.error.message);
          showToast("Couldn't sync notes — your changes are saved locally", "warning");
          return;
        }
        // Success — drop the local backup.
        try { localStorage.removeItem(backupKey(userId, accountId)); } catch (e) { /* localStorage unavailable */ }
      })
      .catch(function (err) {
        console.error("Notes autosave error:", err && err.message);
        showToast("Couldn't sync notes — your changes are saved locally", "warning");
      });
  }

  return { notes, loading, saveNotes };
}
