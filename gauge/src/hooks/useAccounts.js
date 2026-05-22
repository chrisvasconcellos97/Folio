import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export function useAccounts(userId) {
  var [accounts, setAccounts] = useState([]);

  useEffect(function () {
    if (!userId) return;
    supabase
      .from("folio_accounts")
      .select("id, name")
      .eq("user_id", userId)
      .order("name", { ascending: true })
      .then(function (result) {
        if (!result.error) setAccounts(result.data || []);
      });
  }, [userId]);

  return accounts;
}
