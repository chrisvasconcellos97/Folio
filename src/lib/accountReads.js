// persistAccountReads — shared writer for "✦ Pip will remember" per-account
// memory notes. Used by the digest paste AND meeting summarize / quick capture,
// so the logic lives once (App Coherence).
//
// Each read: { accountId, note, detail?, impact? }. Persists to
// folio_account_updates (type 'other', the note as the headline `title`, the
// fuller context as `description`, impact → observed_impact) → which flows into
// the account's Recent Updates AND both briefs via buildAccountContext's
// recentUpdates, so capturing a meeting durably makes Pip smarter on the account.
//
// Same-day dedup: re-running for the same account on the same day under the same
// `owner` replaces that day's prior notes (so re-summarizing a meeting / re-pasting
// doesn't pile up duplicate rows). Best-effort — never throws.

import { supabase } from "./supabase";

export function persistAccountReads(opts) {
  var userId   = opts && opts.userId;
  var accounts = (opts && opts.accounts) || [];
  var reads    = (opts && opts.reads) || [];
  var owner    = (opts && opts.owner) || "Pip ✦";
  var selected = reads.filter(function (r) { return r && r.checked !== false && r.accountId && r.note; });
  if (!userId || !selected.length) return Promise.resolve(0);

  var today = new Date().toISOString().slice(0, 10);
  var acctIds = selected.map(function (r) { return r.accountId; });
  var payload = selected.map(function (r) {
    var acct = accounts.find(function (a) { return a.id === r.accountId; });
    return {
      user_id:         userId,
      account_id:      r.accountId,
      org_id:          (acct && acct.org_id) || null,
      update_date:     today,
      update_type:     "other",
      title:           r.note,
      description:     r.detail || null,
      owner:           owner,
      observed_impact: r.impact || "unknown",
    };
  });

  var del = supabase.from("folio_account_updates").delete()
    .eq("user_id", userId).eq("update_date", today).eq("owner", owner)
    .in("account_id", acctIds);
  return Promise.resolve(del).then(function () {}, function () {}).then(function () {
    return supabase.from("folio_account_updates").insert(payload)
      .then(function (r) { return r && r.error ? 0 : payload.length; }, function () { return 0; });
  });
}
