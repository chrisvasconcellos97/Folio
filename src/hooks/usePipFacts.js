import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

// usePipFacts — Pip "user memory". Stable preferences/facts the user wants
// Pip to remember across sessions. The facts are injected into every Pip
// system prompt (capped at 20, most-recent-first).
//
// Returns { facts, addFact, removeFact, toggleFactActive, loading, error }.
//
// Each fact row: { id, user_id, fact, source, active, created_at, updated_at }
// source is 'user_explicit' for user-typed facts or 'pip_inferred' when Pip
// called the remember_fact tool.
export function usePipFacts(userId) {
  var [facts, setFacts]     = useState([]);
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("folio_pip_facts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(function (result) {
        setLoading(false);
        if (result.error) { setError(result.error.message); return; }
        setError(null);
        setFacts(result.data || []);
      });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);

  function addFact(data) {
    if (!userId) return Promise.reject(new Error("no user"));
    var row = {
      user_id: userId,
      fact:    typeof data === "string" ? data : (data && data.fact),
      source:  (data && data.source) || "user_explicit",
      active:  true,
    };
    if (!row.fact || !row.fact.trim()) return Promise.reject(new Error("empty fact"));
    row.fact = row.fact.trim();
    return supabase
      .from("folio_pip_facts")
      .insert([row])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
        return result.data && result.data[0];
      });
  }

  function removeFact(id) {
    return supabase
      .from("folio_pip_facts")
      .delete()
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  function toggleFactActive(id, active) {
    return supabase
      .from("folio_pip_facts")
      .update({ active: !!active, updated_at: new Date().toISOString() })
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  // Convenience derived list — just the active fact strings, oldest-first
  // up to 20. Used by askPip injection.
  var activeFactStrings = facts
    .filter(function (f) { return f.active; })
    .slice(0, 20)
    .map(function (f) { return f.fact; });

  return {
    facts: facts,
    activeFactStrings: activeFactStrings,
    addFact: addFact,
    removeFact: removeFact,
    toggleFactActive: toggleFactActive,
    loading: loading,
    error: error,
    refetch: fetch,
  };
}
