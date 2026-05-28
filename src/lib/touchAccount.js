import { supabase } from "./supabase";

// Bump last_interaction_at on the account AND its direct child accounts so
// the child cards don't drift to "going cold" when the parent is the one
// being worked. extraFields are applied only to the primary account
// (e.g. last_meeting on a meeting log), not propagated to children.
//
// Fire-and-forget: failures are logged but don't break the caller's flow.
export function touchAccount(accountId, extraFields) {
  if (!accountId) return;
  var now = new Date().toISOString();

  var primaryFields = Object.assign({ last_interaction_at: now }, extraFields || {});
  supabase.from("folio_accounts")
    .update(primaryFields)
    .eq("id", accountId)
    .then(function (r) { if (r && r.error) console.error("touchAccount primary:", r.error.message); })
    .catch(function (err) { console.error("touchAccount primary:", err); });

  supabase.from("folio_accounts")
    .update({ last_interaction_at: now })
    .eq("parent_account_id", accountId)
    .then(function (r) { if (r && r.error) console.error("touchAccount children:", r.error.message); })
    .catch(function (err) { console.error("touchAccount children:", err); });
}
