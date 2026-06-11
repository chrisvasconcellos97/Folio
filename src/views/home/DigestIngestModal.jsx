import { useState } from "react";
import { Modal } from "../../components/Modal";
import { C } from "../../lib/colors";
import { AccountPicker } from "../../components/AccountPicker";
import { showToast } from "../../components/Toast";
import { parseDigest } from "../../lib/digestParse";
import { insertTask } from "../../hooks/useTasks";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// The matched half of the bridge: this prompt goes to WORK CLAUDE (the
// corporate side). It enforces the Pip Data Line Rule AT THE SOURCE — the
// digest arrives in Folios already sanitized. Keep the two halves in sync:
// this prompt's format ↔ src/lib/digestParse.js.
var WORK_CLAUDE_PROMPT = `At the end of your email/Teams analysis, output a "Folios digest" — a sanitized handoff block for my personal account notebook. STRICT RULES:
- NEVER include revenue figures, transaction volumes, customer counts, shop lists, pricing, or contract terms. Qualitative conclusions only.
- Use supplier/account names and people's names freely; those are fine.
- One line per entry, exactly these formats (the pipe characters matter):

=== FOLIOS DIGEST · YYYY-MM-DD ===
[OWE] Account Name | what I committed to do | due: YYYY-MM-DD
[WAITING] Account Name | Person Name | what they owe me | since: YYYY-MM-DD
[QUIET] Account Name | Person Name | thread that went quiet | last: YYYY-MM-DD
[TOUCH] Account Name | one-line qualitative note about a meaningful exchange
=== END DIGEST ===

- [OWE] = commitments I made in email/Teams that aren't done yet. due: only if a date was stated or clearly implied.
- [WAITING] = things I'm waiting on from a specific person. since: the date I asked.
- [QUIET] = threads where the other side went silent and a nudge is warranted.
- [TOUCH] = notable exchanges worth remembering on the account (tone, direction, decisions) — NOT routine noise. 3 max.
- Skip empty categories. If nothing qualifies, output the header and END line only.`;

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

export function DigestIngestModal({ accounts, userId, addMeeting, onClose }) {
  var [step, setStep]       = useState("paste"); // paste | preview
  var [raw, setRaw]         = useState("");
  var [rows, setRows]       = useState([]);
  var [unparsed, setUnparsed] = useState([]);
  var [applying, setApplying] = useState(false);
  var [promptCopied, setPromptCopied] = useState(false);

  function handleParse() {
    var out = parseDigest(raw, accounts);
    if (out.rows.length === 0 && out.unparsed.length === 0) {
      showToast("Nothing to parse — paste the digest block from work Claude");
      return;
    }
    setRows(out.rows.map(function (r) {
      // Matched rows start checked; unmatched need an account picked first.
      return Object.assign({}, r, { checked: !!r.accountId });
    }));
    setUnparsed(out.unparsed);
    setStep("preview");
  }

  function patchRow(idx, fields) {
    setRows(function (prev) {
      return prev.map(function (r, i) { return i === idx ? Object.assign({}, r, fields) : r; });
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
      if (r.kind === "owe") {
        return insertTask(userId, {
          title: r.text, account_id: r.accountId,
          due_date: r.due || null, is_commitment: true, user_added: true,
        }).then(function () { counts.owe++; });
      }
      if (r.kind === "waiting" || r.kind === "quiet") {
        // waiting_on names the PERSON who has the ball — never the account.
        // A QUIET thread with no named person stays a waiting-on task without a
        // who, rather than stamping the account name into the person field.
        return insertTask(userId, {
          title: r.text, account_id: r.accountId,
          waiting_on: r.who || null, waiting_on_since: r.since || todayISO,
          user_added: true,
        }).then(function () { counts[r.kind]++; });
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
      }).then(function () { counts.touch++; });
    });

    Promise.allSettled(ops).then(function (results) {
      setApplying(false);
      var failed = results.filter(function (x) { return x.status === "rejected"; }).length;
      var bits = [];
      if (counts.owe) bits.push(counts.owe + " commitment" + (counts.owe > 1 ? "s" : ""));
      if (counts.waiting + counts.quiet) bits.push((counts.waiting + counts.quiet) + " waiting-on" + (counts.waiting + counts.quiet > 1 ? "s" : ""));
      if (counts.touch) bits.push(counts.touch + " touchpoint" + (counts.touch > 1 ? "s" : ""));
      showToast(bits.length ? "Filed: " + bits.join(", ") + (failed ? " · " + failed + " failed" : "") + " ✦" : "Nothing filed");
      if (!failed) onClose();
    });
  }

  return (
    <Modal title="Work digest → Folios" onClose={onClose} width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {step === "paste" && (
          <>
            <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.55, fontFamily: INTER }}>
              Paste the digest block from your work Claude. One paste files everything —
              commitments you made, things you're waiting on, threads gone quiet, and
              notable touchpoints — onto the right accounts.
            </div>
            <textarea
              value={raw}
              onChange={function (e) { setRaw(e.target.value); }}
              placeholder={"=== FOLIOS DIGEST · 2026-06-10 ===\n[OWE] Parts Authority | send the audit results | due: 2026-06-12\n[WAITING] All Star | Mike | updated POC list | since: 2026-06-05\n..."}
              rows={9}
              autoFocus
              style={{
                width: "100%", boxSizing: "border-box",
                background: C.surface, color: C.text,
                border: "1px solid " + C.rule, borderRadius: 10,
                padding: "12px 14px",
                fontFamily: MONO, fontSize: 16, lineHeight: 1.5,
                resize: "vertical", outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={handleParse}
                disabled={!raw.trim()}
                style={{
                  background: raw.trim() ? C.accentDeep : C.accentFaint,
                  border: "none", borderRadius: 8, padding: "9px 18px",
                  fontSize: 13, fontWeight: 700,
                  color: raw.trim() ? C.bg : C.textMuted,
                  fontFamily: INTER, cursor: raw.trim() ? "pointer" : "default",
                }}
              >
                Preview →
              </button>
              <button
                onClick={function () {
                  navigator.clipboard && navigator.clipboard.writeText(WORK_CLAUDE_PROMPT);
                  setPromptCopied(true);
                  showToast("Work-Claude prompt copied — add it to your morning email report");
                }}
                style={{
                  background: "transparent", border: "1px solid " + C.rule,
                  borderRadius: 8, padding: "9px 14px",
                  fontSize: 12, color: promptCopied ? C.accent : C.textSoft,
                  fontFamily: INTER, cursor: "pointer",
                }}
              >
                {promptCopied ? "✓ Prompt copied" : "Get the work-Claude prompt"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5, fontFamily: INTER }}>
              The prompt teaches your work Claude the digest format — sanitized at the
              source: account and people names only, never numbers, lists, or pricing.
            </div>
          </>
        )}

        {step === "preview" && (
          <>
            <div style={{ fontSize: 12, color: C.textSoft, fontFamily: INTER }}>
              {rows.length} entr{rows.length === 1 ? "y" : "ies"} — uncheck anything you don't
              want; rows without a matched account need one picked.
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
                    <input
                      type="checkbox"
                      checked={!!r.checked}
                      onChange={function (e) { patchRow(idx, { checked: e.target.checked }); }}
                      style={{ width: 17, height: 17, marginTop: 2, accentColor: "var(--c-accent)", cursor: "pointer" }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 3 }}>
                        <KindBadge kind={r.kind} />
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
                          <span style={{ fontSize: 11, color: C.accent }}>
                            {(accounts.find(function (a) { return a.id === r.accountId; }) || {}).name || r.accountName}
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
                Skipped (not digest lines): {unparsed.slice(0, 3).join(" · ")}{unparsed.length > 3 ? " +" + (unparsed.length - 3) : ""}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
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
