import { normalizeSubject } from "./threadKey.js";

export async function applyEmailImport(plan, userId, orgId, helpers) {
  var { addContact, addItem, supabase, logActivity, touchAccount } = helpers || {};
  var result = { created: { contacts: [], tasks: [], threads: [], events: [] }, errors: [] };
  if (!plan || !userId) return result;

  var todayISO = new Date().toISOString().slice(0, 10);

  var selectedContacts = Array.isArray(plan.contacts)
    ? plan.contacts.filter(function (c) { return c._selected !== false; })
    : [];
  var contactIdByName = {};
  for (var i = 0; i < selectedContacts.length; i++) {
    var sc = selectedContacts[i];
    if (!sc.name || sc.match !== "none") continue;
    try {
      var newContact = await supabase
        .from("folio_contacts")
        .insert([{
          user_id:    userId,
          account_id: sc.account_id || null,
          name:       sc.name,
          email:      sc.email || null,
        }])
        .select()
        .then(function (r) {
          if (r.error) throw r.error;
          return r.data[0];
        });
      if (newContact) {
        result.created.contacts.push(newContact);
        contactIdByName[sc.name] = newContact.id;
        if (logActivity && sc.account_id) {
          logActivity(orgId, userId, sc.account_id, "contact_added", { name: sc.name });
        }
      }
    } catch (e) {
      result.errors.push({ type: "contact", name: sc.name, error: e.message });
    }
  }

  var threadIdCache = {};

  async function upsertThread(thread, accountId) {
    var norm = normalizeSubject(thread.subject_raw || "");
    var cacheKey = norm + "|" + (accountId || "");
    if (threadIdCache[cacheKey]) return threadIdCache[cacheKey];

    var existing = await supabase
      .from("folio_email_threads")
      .select("id, status")
      .eq("user_id", userId)
      .eq("subject_norm", norm)
      .eq("account_id", accountId || null)
      .maybeSingle()
      .then(function (r) { return r.data; });

    if (existing) {
      threadIdCache[cacheKey] = existing.id;
      return existing.id;
    }

    var contactId = (thread.contact_name_raw && contactIdByName[thread.contact_name_raw]) || null;
    var inserted = await supabase
      .from("folio_email_threads")
      .insert([{
        user_id:          userId,
        account_id:       accountId || null,
        subject_raw:      thread.subject_raw || "",
        subject_norm:     norm,
        contact_id:       contactId,
        contact_name_raw: thread.contact_name_raw || null,
        status:           "open",
        last_action:      thread.action_type || null,
        last_summary:     thread.summary || null,
        first_seen_date:  todayISO,
        last_seen_date:   todayISO,
      }])
      .select()
      .then(function (r) {
        if (r.error) throw r.error;
        return r.data[0];
      });

    if (inserted) {
      result.created.threads.push(inserted);
      threadIdCache[cacheKey] = inserted.id;
      return inserted.id;
    }
    return null;
  }

  var accounts = Array.isArray(plan.accounts)
    ? plan.accounts.filter(function (a) { return a.account_id; })
    : [];

  for (var ai = 0; ai < accounts.length; ai++) {
    var acct = accounts[ai];
    var threads = Array.isArray(acct.threads)
      ? acct.threads.filter(function (t) { return t._selected !== false; })
      : [];

    for (var ti = 0; ti < threads.length; ti++) {
      var thread = threads[ti];
      var threadId = null;
      try {
        threadId = await upsertThread(thread, acct.account_id);
      } catch (e) {
        result.errors.push({ type: "thread", subject: thread.subject_raw, error: e.message });
        continue;
      }

      var actionType = thread.action_type || "logged";

      if ((actionType === "action" || actionType === "committed") && thread.summary) {
        try {
          var item = await addItem({
            account_id:       acct.account_id,
            text:             thread.summary,
            is_commitment:    actionType === "committed",
            due_date:         thread.due_date || null,
            source:           "email_import",
            source_thread_id: threadId,
          });
          if (item) result.created.tasks.push(item);
        } catch (e) {
          result.errors.push({ type: "task", subject: thread.subject_raw, error: e.message });
        }
      }

      if (threadId) {
        var eventRow = {
          user_id:    userId,
          thread_id:  threadId,
          event_date: todayISO,
          action_type: actionType,
          summary:    thread.summary || null,
        };
        try {
          var evInsert = await supabase
            .from("folio_thread_events")
            .insert([eventRow])
            .select()
            .then(function (r) { if (r.error) throw r.error; return r.data[0]; });
          if (evInsert) result.created.events.push(evInsert);
        } catch (e) {
          result.errors.push({ type: "event", subject: thread.subject_raw, error: e.message });
        }
      }

      if (actionType === "logged" && logActivity && acct.account_id) {
        logActivity(orgId, userId, acct.account_id, "email_logged", { subject: thread.subject_raw });
        if (touchAccount) touchAccount(acct.account_id);
      }

      if (thread.is_resolution && threadId) {
        try {
          await supabase
            .from("folio_email_threads")
            .update({ status: "closed", resolved_at: new Date().toISOString(), last_seen_date: todayISO })
            .eq("id", threadId);
        } catch (_) {}
      } else if ((actionType === "waiting" || actionType === "still_waiting") && threadId) {
        try {
          await supabase
            .from("folio_email_threads")
            .update({ status: "waiting", waiting_since: todayISO, last_seen_date: todayISO })
            .eq("id", threadId);
        } catch (_) {}
      } else if (threadId) {
        try {
          await supabase
            .from("folio_email_threads")
            .update({ last_seen_date: todayISO, last_action: actionType, last_summary: thread.summary || null })
            .eq("id", threadId);
        } catch (_) {}
      }
    }
  }

  return result;
}
