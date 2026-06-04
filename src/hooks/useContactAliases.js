import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";

// Contact aliases for entity detection. Org members share the org's aliases;
// solo users (no org) get per-user aliases scoped by user_id. Previously this
// was org-only, so the whole feature was dead for solo users — and removeAlias
// was RLS-blocked because created_by was never set on insert.
export function useContactAliases(orgId, userId) {
  var [aliases, setAliases] = useState([]);

  var fetch = useCallback(function () {
    if (!orgId && !userId) { setAliases([]); return; }
    var q = supabase.from("folio_contact_aliases").select("*");
    if (orgId) q = q.eq("org_id", orgId);
    else       q = q.is("org_id", null).eq("user_id", userId);
    q.then(function (r) { if (r.data) setAliases(r.data); });
  }, [orgId, userId]);

  useEffect(function () { fetch(); }, [fetch]);

  var addAlias = useCallback(function (contactId, alias) {
    if ((!orgId && !userId) || !alias.trim()) return Promise.resolve();
    var row = {
      org_id:     orgId || null,
      user_id:    orgId ? null : (userId || null),
      contact_id: contactId,
      alias:      alias.trim(),
      created_by: userId || null,
    };
    return supabase
      .from("folio_contact_aliases")
      .insert([row])
      .select()
      .then(function (r) {
        if (r.data) setAliases(function (prev) { return prev.concat(r.data); });
      });
  }, [orgId, userId]);

  var removeAlias = useCallback(function (aliasId) {
    return supabase
      .from("folio_contact_aliases")
      .delete()
      .eq("id", aliasId)
      .then(function () {
        setAliases(function (prev) { return prev.filter(function (a) { return a.id !== aliasId; }); });
      });
  }, []);

  return { aliases, addAlias, removeAlias };
}
