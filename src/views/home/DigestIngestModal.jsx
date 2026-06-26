import { useState } from "react";
import { Modal } from "../../components/Modal";
import { C } from "../../lib/colors";
import { AccountPicker } from "../../components/AccountPicker";
import { showToast } from "../../components/Toast";
import { parseDigest } from "../../lib/digestParse";
import { callParseDigestPip } from "../../lib/pip";
import { justBackFrom } from "../../lib/awayMode";
import { insertTask } from "../../hooks/useTasks";
import { supabase } from "../../lib/supabase";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// Resolve a free-text account name (from Pip's extraction) to an account id:
// exact case-insensitive first, then a contains match either direction. No
// match → null, and the user picks it in the preview.
function matchAccountId(name, accounts) {
  if (!name) return null;
  var n = name.trim().toLowerCase();
  var exact = (accounts || []).find(function (a) { return (a.name || "").toLowerCase() === n; });
  if (exact) return exact.id;
  var partial = (accounts || []).find(function (a) {
    var an = (a.name || "").toLowerCase();
    return an && (an.indexOf(n) !== -1 || n.indexOf(an) !== -1);
  });
  return partial ? partial.id : null;
}

function KindBadge({ kind }) {
  var cfg = {
    owe:     { label: "YOU OWE",   color: C.yellow },
    waiting: { label: "WAITING",   color: C.accent },
    quiet:   { label: "QUIET",     color: C.red },
    touch:   { label: "TOUCH",     color: C.textMuted },
  }[kind] || { label: kind, color: C.textMuted };
  return (
    <span style={{
      fontFamily: MONO, fontSize: 8.5, fontWeight: 700,
      color: cfg.color, border: "1px solid " + cfg.color,
      borderRadius: 4, padding: "1px 6px",
      letterSpacing: "0.07em", whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

// Where each filed row actually lands — shown on the row so nothing files into
// a black hole (the "I don't even know where these go" complaint).
function destLabel(kind) {
  return {
    owe:     "→ a commitment in Your Word",
    waiting: "→ Who has the ball",
    quiet:   "→ Who has the ball",
    touch:   "→ logged as a touchpoint",
  }[kind] || "";
}

export function DigestIngestModal({ accounts, userId, addMeeting, awayPeriods, onClose }) {
  // If the user is freshly back from PTO, items filed from this paste are the
  // catch-up pile → tag them so they surface under "While you were out" (#50).
  var backFromPTO = !!justBackFrom(awayPeriods, new Date(), 14);
  var [step, setStep]       = useState("paste"); // paste | preview
  var [raw, setRaw]         = useState("");
  var [read, setRead]       = useState(null); // Pip's plain-language read of the day
  var [acctReads, setAcctReads] = useState([]); // per-account memory notes (Phase A)
  var [rows, setRows]       = useState([]);
  var [unparsed, setUnparsed] = useState([]);
  var [applying, setApplying] = useState(false);
  var [parsing, setParsing]   = useState(false);

  function toPreview(extracted, skipped, hasRead) {
    if (!extracted.length && !hasRead && (!skipped || !skipped.length)) {
      showToast("Pip didn't find anything to file in that — try adding a bit more detail");
      return;
    }
    setRows(extracted.map(function (r) {
      var accountId = r.accountId || matchAccountId(r.accountName, accounts);
      // Matched rows start checked; unmatched need an account picked first.
      // Already-done commitments start UNchecked so we don't re-create a
      // commitment for something finished — the user can still tick it.
      return Object.assign({}, r, { accountId: accountId, checked: !!accountId && !r.done });
    }));
    setUnparsed(skipped || []);
    setStep("preview");
  }

  // Pip reads the free-form summary and returns structured rows. Falls back to
  // the deterministic parser if the call fails (or the paste is already tagged),
  // so the box never hard-dead-ends.
  function handleParse() {
    if (parsing || !raw.trim()) return;
    setParsing(true);
    callParseDigestPip({
      text: raw,
      accounts: (accounts || []).map(function (a) { return a.name; }).filter(Boolean),
      today: new Date().toISOString().slice(0, 10),
    }).then(function (out) {
      setParsing(false);
      var rd = (out && out.read) || null;
      setRead(rd);
      // Per-account memory notes — keep ALL (matched + unmatched); the user can
      // pick an account for unmatched ones or uncheck any in the preview. Matched
      // start checked; unmatched start unchecked until an account is picked.
      var ar = ((out && out.account_reads) || [])
        .map(function (a) {
          var aid = matchAccountId(a.account, accounts);
          return Object.assign({}, a, { accountId: aid, checked: !!aid });
        });
      setAcctReads(ar);
      toPreview((out && out.rows) || [], [], !!rd || ar.length > 0);
    }).catch(function () {
      // Network/AI failure → deterministic fallback (handles tagged input too).
      setParsing(false);
      setRead(null); // deterministic fallback has no read
      setAcctReads([]);
      var det = parseDigest(raw, accounts);
      if (det.rows.length || det.unparsed.length) {
        toPreview(det.rows, det.unparsed, false);
      } else {
        showToast("Couldn't read that right now — try again in a moment");
      }
    });
  }

  function patchRow(idx, fields) {
    setRows(function (prev) {
      return prev.map(function (r, i) { return i === idx ? Object.assign({}, r, fields) : r; });
    });
  }

  function patchAcctRead(idx, fields) {
    setAcctReads(function (prev) {
      return prev.map(function (a, i) { return i === idx ? Object.assign({}, a, fields) : a; });
    });
  }

  // Phase A — persist the per-account memory notes as folio_account_updates.
  // These flow into the account's Recent Updates AND both briefs (cadence
  // pre-call + daily) via buildAccountContext's recentUpdates, so the digest
  // durably makes Pip smarter about each account. Best-effort: a failure here
  // never blocks the task-filing the user actually confirmed.
  function persistAcctReads() {
    var selected = acctReads.filter(function (a) { return a.checked && a.accountId; });
    if (!selected.length) return Promise.resolve(0);
    var today = new Date().toISOString().slice(0, 10);
    var acctIds = selected.map(function (a) { return a.accountId; });
    var payload = selected.map(function (a) {
      var acct = (accounts || []).find(function (x) { return x.id === a.accountId; });
      return {
        user_id: userId,
        account_id: a.accountId,
        org_id: (acct && acct.org_id) || null, // match addUpdate convention
        update_date: today,
        update_type: "other",
        title: a.note,
        owner: "Pip ✦ digest",
        observed_impact: a.impact || "unknown",
      };
    });
    // Same-day dedup: re-pasting today replaces today's prior digest note for the
    // SAME account (only accounts in this paste), so the Update Calendar doesn't
    // collect duplicate "Pip ✦ digest" rows from multiple pastes in one day.
    var del = supabase.from("folio_account_updates").delete()
      .eq("user_id", userId).eq("update_date", today).eq("owner", "Pip ✦ digest")
      .in("account_id", acctIds);
    return Promise.resolve(del).then(function () {}, function () {}).then(function () {
      return supabase.from("folio_account_updates").insert(payload)
        .then(function (r) { return r && r.error ? 0 : payload.length; }, function () { return 0; });
    });
  }

  function handleApply() {
    if (applying) return;
    var todayISO = new Date().toISOString().slice(0, 10);
    var selected = rows.filter(function (r) { return r.checked && r.accountId; });
    if (!selected.length) { showToast("Nothing selected (rows need an account)"); return; }
    setApplying(true);

    var counts = { owe: 0, waiting: 0, quiet: 0, touch: 0 };
    var ops = selected.map(function (r) {
      // Only set the flag when actually back from PTO — omitting it otherwise
      // keeps the insert from depending on the (maybe-not-yet-migrated) column.
      var awayTag = backFromPTO ? { follow_up_on_return: true } : {};
      if (r.kind === "owe") {
        return insertTask(userId, Object.assign({
          title: r.text, account_id: r.accountId,
          due_date: r.due || null, is_commitment: true, user_added: true,
        }, awayTag)).then(function () { counts.owe++; });
      }
      if (r.kind === "waiting" || r.kind === "quiet") {
        // waiting_on names the PERSON who has the ball — never the account.
        // A QUIET thread with no named person stays a waiting-on task without a
        // who, rather than stamping the account name into the person field.
        return insertTask(userId, Object.assign({
          title: r.text, account_id: r.accountId,
          waiting_on: r.who || null, waiting_on_since: r.since || todayISO,
          user_added: true,
        }, awayTag)).then(function () { counts[r.kind]++; });
      }
      // touch → a lightweight summarized email touchpoint; feeds last-interaction,
      // history, and Pip context through the normal meeting path.
      return addMeeting({
        account_id: r.accountId,
        meeting_date: r.date || todayISO,
        method: "email",
        status: "summarized",
        title: "Email touchpoint",
        notes: r.text,
        // Soft-structured signal (item 51 #4) — feeds tone-trend + mastermind themes.
        pip_tone: r.tone || null,
        theme: r.theme || null,
      }).then(function () { counts.touch++; });
    });

    Promise.all([Promise.allSettled(ops), persistAcctReads()]).then(function (res) {
      var results = res[0];
      var noted = res[1];
      setApplying(false);
      var failed = results.filter(function (x) { return x.status === "rejected"; }).length;
      var bits = [];
      if (counts.owe) bits.push(counts.owe + " commitment" + (counts.owe > 1 ? "s" : ""));
      if (counts.waiting + counts.quiet) bits.push((counts.waiting + counts.quiet) + " waiting-on" + (counts.waiting + counts.quiet > 1 ? "s" : ""));
      if (counts.touch) bits.push(counts.touch + " touchpoint" + (counts.touch > 1 ? "s" : ""));
      if (noted) bits.push("noted on " + noted + " account" + (noted > 1 ? "s" : ""));
      showToast(bits.length ? "Filed: " + bits.join(", ") + (failed ? " · " + failed + " failed" : "") + " ✦" : "Nothing filed");
      if (!failed) onClose();
    });
  }

  return (
    <Modal title="Paste your daily summary" onClose={onClose} width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {step === "paste" && (
          <>
            <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.55, fontFamily: INTER }}>
              Drop in a summary of your day — emails, calls, whatever you've got, in
              any format. Pip reads it back to you — what you owe, what you're waiting
              on, what's gone quiet, what shifted — and files the few real commitments
              where you can find them. You review everything before anything's saved.
            </div>
            <textarea
              value={raw}
              onChange={function (e) { setRaw(e.target.value); }}
              placeholder={"Paste your summary here…\n\ne.g. Caught up on email. Told All Star I'd send the audit results by Friday. Still waiting on Mike for the updated POC list — asked him Monday. Good call with Parts Authority, they're leaning toward the integration."}
              rows={10}
              autoFocus
              disabled={parsing}
              style={{
                width: "100%", boxSizing: "border-box",
                background: C.surface, color: C.text,
                border: "1px solid " + C.rule, borderRadius: 10,
                padding: "12px 14px",
                fontFamily: INTER, fontSize: 16, lineHeight: 1.5,
                resize: "vertical", outline: "none",
                opacity: parsing ? 0.6 : 1,
              }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={handleParse}
                disabled={!raw.trim() || parsing}
                style={{
                  background: raw.trim() && !parsing ? C.accentDeep : C.accentFaint,
                  border: "none", borderRadius: 8, padding: "9px 18px",
                  fontSize: 13, fontWeight: 700,
                  color: raw.trim() && !parsing ? C.onAccent : C.textMuted,
                  fontFamily: INTER, cursor: raw.trim() && !parsing ? "pointer" : "default",
                }}
              >
                {parsing ? "Pip's reading…" : "Review what Pip found →"}
              </button>
            </div>
          </>
        )}

        {step === "preview" && (
          <>
            {/* Pip's read of the day — the PRIMARY output. The rows below are
                just the few items worth filing; this is where the intelligence
                lives (owes, waitings, what went quiet, what shifted). */}
            {read && (
              <div style={{
                background: C.accentFaint,
                border: "1px solid " + C.accentLine,
                borderRadius: 10, padding: "12px 14px",
              }}>
                <div style={{
                  fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: C.accent,
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
                }}>
                  ✦ Pip's read of your day
                </div>
                <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55, fontFamily: INTER, whiteSpace: "pre-wrap" }}>
                  {read}
                </div>
              </div>
            )}
            {/* Per-account memory (Phase A) — what Pip will durably remember on
                each account, shown as a receipt so it's never silent. Persists to
                folio_account_updates → flows into the account's next pre-call brief. */}
            {acctReads.length > 0 && (
              <div style={{ border: "1px solid " + C.rule, borderRadius: 10, padding: "10px 13px" }}>
                <div style={{
                  fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: C.textMuted,
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7,
                }}>
                  ✦ Pip will remember — uncheck any, match unlinked ones
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {acctReads.map(function (a, i) {
                    var nm = (accounts.find(function (x) { return x.id === a.accountId; }) || {}).name || a.account;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, opacity: a.checked ? 1 : 0.5 }}>
                        <div
                          role="checkbox"
                          aria-checked={!!a.checked}
                          tabIndex={0}
                          onClick={function () { patchAcctRead(i, { checked: !a.checked }); }}
                          onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); patchAcctRead(i, { checked: !a.checked }); } }}
                          title={a.checked ? "Pip will remember this — click to skip" : "Skipped — click to include"}
                          style={{
                            width: 20, height: 20, flexShrink: 0, marginTop: 1, borderRadius: 6,
                            border: "2px solid " + (a.checked ? C.accent : C.textMuted),
                            background: a.checked ? C.accent : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: C.onAccent, fontSize: 13, fontWeight: 700, cursor: "pointer",
                          }}
                        >{a.checked ? "✓" : ""}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.45, fontFamily: INTER }}>{a.note}</div>
                          <div style={{ marginTop: 4 }}>
                            {a.accountId ? (
                              <span style={{ fontSize: 11, color: C.accent }}>{nm}</span>
                            ) : (
                              <AccountPicker
                                accounts={accounts}
                                value={null}
                                onChange={function (id) { patchAcctRead(i, { accountId: id, checked: true }); }}
                                placeholder={'Match "' + a.account + '" to an account…'}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: C.textFaint, marginTop: 7, fontFamily: INTER }}>
                  Checked notes save to each account's history — your next brief on them reflects it.
                </div>
              </div>
            )}
            <div style={{ fontSize: 12, color: C.textSoft, fontFamily: INTER }}>
              {rows.length === 0
                ? "Nothing worth filing as a task — the read above is the takeaway."
                : (rows.length + " thing" + (rows.length === 1 ? "" : "s") + " worth filing — each shows where it lands. Uncheck anything you don't want; rows without a matched account need one picked.")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "46vh", overflowY: "auto" }}>
              {rows.map(function (r, idx) {
                return (
                  <div key={idx} style={{
                    display: "flex", alignItems: "flex-start", gap: 9,
                    background: C.surface, border: "1px solid " + (r.checked && r.accountId ? C.rule : C.yellowFaint),
                    borderRadius: 8, padding: "9px 11px",
                    opacity: r.checked ? 1 : 0.55,
                  }}>
                    <div
                      role="checkbox"
                      aria-checked={!!r.checked}
                      tabIndex={0}
                      onClick={function () { patchRow(idx, { checked: !r.checked }); }}
                      onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); patchRow(idx, { checked: !r.checked }); } }}
                      title={r.checked ? "Filed — click to skip" : "Skipped — click to include"}
                      style={{
                        width: 22, height: 22, flexShrink: 0, marginTop: 1, borderRadius: 6,
                        border: "2px solid " + (r.checked ? C.accent : C.textMuted),
                        background: r.checked ? C.accent : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: C.onAccent, fontSize: 14, fontWeight: 700, cursor: "pointer",
                      }}
                    >{r.checked ? "✓" : ""}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 3 }}>
                        <KindBadge kind={r.kind} />
                        {r.done && <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.accent }}>✓ already done</span>}
                        {r.who && <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{r.who}</span>}
                        {(r.due || r.since || r.date) && (
                          <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted }}>
                            {r.due ? "due " + r.due : r.since ? "since " + r.since : r.date}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>{r.text}</div>
                      <div style={{ marginTop: 5 }}>
                        {r.accountId ? (
                          <span style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, color: C.accent }}>
                              {(accounts.find(function (a) { return a.id === r.accountId; }) || {}).name || r.accountName}
                            </span>
                            <span style={{ fontSize: 10, color: C.textMuted, fontFamily: MONO }}>{destLabel(r.kind)}</span>
                          </span>
                        ) : (
                          <AccountPicker
                            accounts={accounts}
                            value={null}
                            onChange={function (id) { patchRow(idx, { accountId: id, checked: true }); }}
                            placeholder={'Match "' + r.accountName + '" to an account…'}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {unparsed.length > 0 && (
              <div style={{ fontSize: 11, color: C.textMuted, fontFamily: MONO, lineHeight: 1.6 }}>
                Skipped (couldn't read as an item): {unparsed.slice(0, 3).join(" · ")}{unparsed.length > 3 ? " +" + (unparsed.length - 3) : ""}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {rows.length > 0 ? (
                <button
                  onClick={handleApply}
                  disabled={applying}
                  style={{
                    background: C.accentDeep, border: "none", borderRadius: 8,
                    padding: "9px 18px", fontSize: 13, fontWeight: 700,
                    color: C.bg, fontFamily: INTER,
                    cursor: applying ? "default" : "pointer", opacity: applying ? 0.6 : 1,
                  }}
                >
                  {applying ? "Filing…" : "File it all ✦"}
                </button>
              ) : (
                <button
                  onClick={function () {
                    persistAcctReads().then(function (noted) {
                      if (noted) showToast("Noted on " + noted + " account" + (noted > 1 ? "s" : "") + " ✦");
                      onClose();
                    });
                  }}
                  style={{
                    background: C.accentDeep, border: "none", borderRadius: 8,
                    padding: "9px 18px", fontSize: 13, fontWeight: 700,
                    color: C.bg, fontFamily: INTER, cursor: "pointer",
                  }}
                >
                  Got it ✦
                </button>
              )}
              <button
                onClick={function () { setStep("paste"); }}
                style={{
                  background: "transparent", border: "1px solid " + C.rule,
                  borderRadius: 8, padding: "9px 14px",
                  fontSize: 12, color: C.textMuted, fontFamily: INTER, cursor: "pointer",
                }}
              >
                ← Back
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
