import { supabase } from "./supabase";

export function askPip(messages, context) {
  return supabase.auth.getSession().then(function (result) {
    var token   = result.data.session ? result.data.session.access_token : null;
    var headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch("/api/pip", {
      method:  "POST",
      headers: headers,
      body:    JSON.stringify({ messages: messages, context: context || {} }),
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || "Pip error"); });
      return res.json();
    });
  });
}
