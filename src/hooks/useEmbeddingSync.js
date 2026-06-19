import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { fetchWithTimeout } from "../lib/net";

// useEmbeddingSync — F6. Once per day per user, fire a background sweep that
// embeds any new/changed notes/summaries/project-notes/updates into
// folio_embeddings (the recall corpus). The server fingerprint-gates per source,
// so the FIRST run is the one-time backfill and every later run is a near-free
// catch-up.
//
// Recall targets OLD content ("what did we decide about X months ago"), so
// same-day freshness isn't required — a daily sweep is enough, and keeps the
// surface area tiny. Fire-and-forget; never blocks or surfaces errors. No-ops
// when userId is null (Hook Order Rule — this is called unconditionally above
// App's authLoading early-return and guards internally) or when embeddings
// aren't configured (the endpoint returns a clean no-op).
export function useEmbeddingSync(userId, accounts) {
  var inFlight = useRef(false);

  useEffect(function () {
    if (!userId) return;
    if (!Array.isArray(accounts) || !accounts.length) return;
    if (inFlight.current) return;

    var key = "folio_embed_sync_last_" + userId;
    var last = 0;
    try { last = parseInt(localStorage.getItem(key) || "0", 10); } catch (e) { /* guard-ok: corrupt localStorage, treat as never-run */ }
    if (Date.now() - last < 24 * 60 * 60 * 1000) return;

    var ids = accounts
      .filter(function (a) { return a && a.id && !a.is_inactive; })
      .map(function (a) { return a.id; });
    if (!ids.length) return;

    // Stamp BEFORE the request so a slow/failed call doesn't retrigger every
    // render this session; the daily cadence is intentionally forgiving.
    try { localStorage.setItem(key, String(Date.now())); } catch (e) { /* guard-ok: best-effort throttle */ }
    inFlight.current = true;

    supabase.auth.getSession().then(function (result) {
      var token = result.data.session ? result.data.session.access_token : null;
      var headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;
      return fetchWithTimeout("/api/embed-sync", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ accountIds: ids }),
      }, 55000);
    }).then(function (r) {
      if (r && !r.ok) console.warn("embed-sync failed:", r.status);
    }).catch(function (err) {
      console.warn("embed-sync error:", err && err.message);
    }).then(function () {
      inFlight.current = false;
    });
  }, [userId, accounts]);
}
