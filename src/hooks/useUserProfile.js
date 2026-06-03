import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";

export function useUserProfile(userId) {
  var [profile, setProfile]   = useState(null);
  // Default to TRUE so the "no profile yet" state is never mistaken for
  // "confirmed no profile" before the first fetch resolves. Routing code
  // gates the onboarding interview on (!loading && profile === null); if
  // loading started false, the very first render after a cache clear —
  // before this hook's effect fires — would read loading=false + profile=null
  // and wrongly re-trigger onboarding for users who already completed it.
  var [loading, setLoading]   = useState(true);
  var [error, setError]       = useState(null);

  var fetch = useCallback(function () {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from("folio_user_profile")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(function (r) {
        setLoading(false);
        if (r.error) { setError(r.error.message); return; }
        setError(null);
        setProfile(r.data || null);
      });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);

  function upsertProfile(fields) {
    if (!userId) return Promise.resolve();
    var payload = Object.assign({}, fields, { user_id: userId });
    return supabase
      .from("folio_user_profile")
      .upsert([payload], { onConflict: "user_id" })
      .select()
      .then(function (r) {
        if (r.error) throw r.error;
        setProfile(r.data && r.data[0] ? r.data[0] : null);
        return r.data && r.data[0];
      });
  }

  function saveAnswer(questionId, answerText) {
    if (!userId) return Promise.resolve();
    return supabase
      .from("folio_pip_questions")
      .update({ status: "answered", answer_text: answerText, answered_at: new Date().toISOString() })
      .eq("id", questionId)
      .eq("user_id", userId)
      .then(function (r) { if (r.error) throw r.error; });
  }

  function seedBankQuestions() {
    if (!userId) return Promise.resolve([]);
    var BANK = [
      { question_text: "What's your role, and what are you most accountable for day-to-day?", category: "role", slot: "role_title", priority: 1 },
      { question_text: "What's your company name, and how would you describe what you sell in your own words?", category: "company", slot: "company_name", priority: 2 },
      { question_text: "How many accounts are you carrying right now, and what kind of accounts are they?", category: "portfolio", slot: "portfolio_shape", priority: 3 },
      { question_text: "What does a good quarter look like for you?", category: "goals", slot: "primary_goal", priority: 4 },
      { question_text: "How do you like Pip to communicate with you, and when is your week typically busiest?", category: "working_style", slot: "working_style", priority: 5 },
    ];
    var rows = BANK.map(function (q) { return Object.assign({}, q, { user_id: userId, source: "bank", status: "queued" }); });
    return supabase
      .from("folio_pip_questions")
      .insert(rows)
      .select()
      .then(function (r) {
        if (r.error) throw r.error;
        return r.data || [];
      });
  }

  function loadBankQuestions() {
    if (!userId) return Promise.resolve([]);
    return supabase
      .from("folio_pip_questions")
      .select("*")
      .eq("user_id", userId)
      .eq("source", "bank")
      .order("priority", { ascending: true })
      .then(function (r) {
        if (r.error) throw r.error;
        return r.data || [];
      });
  }

  return { profile, loading, error, refetch: fetch, upsertProfile, saveAnswer, seedBankQuestions, loadBankQuestions };
}
