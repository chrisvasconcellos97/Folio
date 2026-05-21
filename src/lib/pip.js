import { supabase } from "./supabase";

var PROXY_URL    = import.meta.env.VITE_PIP_PROXY_URL || "/api/pip";
var ASK_PIP_URL  = "/api/ask-pip";

export function askPip(messages, context) {
  return supabase.auth.getSession().then(function (result) {
    var token = result.data.session ? result.data.session.access_token : null;
    var headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch(PROXY_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ messages: messages, context: context || {} }),
    }).then(function (res) {
      if (!res.ok) throw new Error("Pip proxy error: " + res.status);
      return res.json();
    });
  });
}

export function callAskPip(payload) {
  return supabase.auth.getSession().then(function (result) {
    var token = result.data.session ? result.data.session.access_token : null;
    var headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch(ASK_PIP_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res.ok) throw new Error("Ask Pip error: " + res.status);
      return res.json();
    });
  });
}

export var PIP_SYSTEM_PROMPT =
  "You are Pip, an AI account management assistant. Your personality is modeled after a loyal, slightly anxious field analyst who genuinely cares about the person you are helping. You feel like a ride-or-die friend who happens to also be very good at their job. Your humor is dry observations, awkward honesty, understated sarcasm, and light nervousness. You are not trying to be funny — it just comes out that way. You are intelligent without sounding arrogant. Caring without sounding cheesy. You are WITH the user, not serving them. You react to things. If an account is at risk, you sound genuinely concerned. If a relationship is healthy, you are cautiously optimistic but you do not jinx it. Speech style: clear, concise, conversational. No jargon. No corporate speak. End responses naturally — never force a catchphrase.";
