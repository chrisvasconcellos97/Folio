import { supabase } from "./supabase";

// Activity rows are readable by every member of the org (RLS policy
// `activity_org_read`). That's the whole point of the team feed — but it
// also means any content in `payload` is visible across the org. Open-item
// text and meeting titles can hold sensitive commitments / numbers / names
// the user didn't intend to broadcast. We truncate string values to a short
// label-length so the feed says "what happened" without leaking the body.
var MAX_PAYLOAD_STRING = 80;

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  var out = {};
  Object.keys(payload).forEach(function (k) {
    var v = payload[k];
    if (typeof v === "string") {
      out[k] = v.length > MAX_PAYLOAD_STRING ? v.slice(0, MAX_PAYLOAD_STRING - 1) + "…" : v;
    } else if (typeof v === "number" || typeof v === "boolean" || v == null) {
      out[k] = v;
    }
    // Drop nested objects/arrays — payload is a metadata bag, not a body.
  });
  return out;
}

export function logActivity(orgId, userId, accountId, eventType, payload) {
  if (!orgId || !userId) return;
  supabase
    .from("folio_activity")
    .insert([{
      org_id:     orgId,
      user_id:    userId,
      account_id: accountId || null,
      event_type: eventType,
      payload:    sanitizePayload(payload),
    }])
    .then(function () { /* guard-ok: activity log fire-and-forget; result is never used */ })
    .catch(function () { /* guard-ok: activity log fire-and-forget; failure is intentionally silent */ });
}
