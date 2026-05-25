import { supabase } from "./supabase";

export function logActivity(orgId, userId, accountId, eventType, payload) {
  if (!orgId || !userId) return;
  supabase
    .from("folio_activity")
    .insert([{
      org_id:     orgId,
      user_id:    userId,
      account_id: accountId || null,
      event_type: eventType,
      payload:    payload || {},
    }])
    .then(function () {})
    .catch(function () {});
}
