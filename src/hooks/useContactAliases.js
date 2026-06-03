import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";

export function useContactAliases(orgId) {
  var [aliases, setAliases] = useState([]);

  useEffect(function () {
    if (!orgId) return;
    supabase
      .from("folio_contact_aliases")
      .select("*")
      .eq("org_id", orgId)
      .then(function ({ data }) { if (data) setAliases(data); });
  }, [orgId]);

  var addAlias = useCallback(function (contactId, alias) {
    if (!orgId || !alias.trim()) return Promise.resolve();
    return supabase
      .from("folio_contact_aliases")
      .insert([{ org_id: orgId, contact_id: contactId, alias: alias.trim() }])
      .select()
      .then(function ({ data }) {
        if (data) setAliases(function (prev) { return prev.concat(data); });
      });
  }, [orgId]);

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
