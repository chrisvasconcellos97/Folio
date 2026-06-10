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
        var data = r.data || null;
        // Operating context (hand-authored from the June 2026 interview) rides
        // ahead of the synthesized prose everywhere profile_prose is read —
        // composing here gives every client Pip surface the boost with zero
        // per-surface wiring. Re-synthesis writes only profile_prose, so the
        // context can never be clobbered.
        if (data && data.operating_context) {
          data = Object.assign({}, data, {
            profile_prose: data.operating_context +
              (data.profile_prose ? "\n\n" + data.profile_prose : ""),
          });
        }
        setProfile(data);
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
      { question_text: "Hey — I'm Pip. Before I start digging into your accounts, help me get you right: what's your role, and what lands on your plate most days?", category: "role", slot: "role_title", priority: 1 },
      { question_text: "Tell me about where you work — the company name, and in your own words, what you actually sell. I'd rather hear it from you than guess from the data.", category: "company", slot: "company_name", priority: 2 },
      { question_text: "How big is your world right now — roughly how many accounts are you carrying, and what kind? Just so I know how much we're juggling together.", category: "portfolio", slot: "portfolio_shape", priority: 3 },
      { question_text: "When a quarter goes great for you, what actually happened? If I know what you're chasing, I can help you keep score.", category: "goals", slot: "primary_goal", priority: 4 },
      { question_text: "Last one for now — how do you like me to talk to you: quick hits, or the full picture? And when's your week usually slammed, so I time things right?", category: "working_style", slot: "working_style", priority: 5 },
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
