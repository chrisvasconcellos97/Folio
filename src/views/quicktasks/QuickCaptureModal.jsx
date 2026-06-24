import { useState, useEffect } from "react";
import { Modal } from "../../components/Modal";
import { C } from "../../lib/colors";
import { AccountPicker } from "../../components/AccountPicker";
import { showToast } from "../../components/Toast";
import { callParseDigestPip } from "../../lib/pip";
import { parseDigest } from "../../lib/digestParse";
import { justBackFrom } from "../../lib/awayMode";
import { insertTask } from "../../hooks/useTasks";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// Resolve a free-text account name to an id (exact, then contains either way).
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

var KIND_CFG = {
  owe:     { label: "YOU OWE", color: C.yellow },
  waiting: { label: "WAITING", color: C.accent },
  quiet:   { label: "WAITING", color: C.accent },
  touch:   { label: "NOTE",    color: C.textMuted },
};

// Quick Capture — type one line from anywhere (⌘K → "Capture as a task"), Pip
// extracts what it is + which account + due date, you confirm, it's filed. The
// single-line sibling of the digest paste; reuses api/parse-digest (a capture is
// just a one-row digest) + the same insert-by-kind logic. Closes the capture gap.
export function QuickCaptureModal({ accounts, userId, addMeeting, awayPeriods, initialText, onClose }) {
  var backFromPTO = !!justBackFrom(awayPeriods, new Date(), 14);
  var [text, setText]       = useState(initialText || "");
  var [step, setStep]       = useState("type"); // type | review
  var [rows, setRows]       = useState([]);
  var [parsing, setParsing] = useState(false);
  var [filing, setFiling]   = useState(false);

  // If launched with text already (from the ⌘K palette), parse immediately.
  useEffect(function () {
    if (initialText && initialText.trim()) doParse(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toReview(extracted) {
    if (!extracted.length) {
      // Pip found nothing structured — offer to file the raw line as a plain task.
      setRows([{ kind: "owe", text: text.trim(), accountId: null, due: null, who: null, since: null, isFallback: true }]);
      setStep("review");
      return;
    }
    setRows(extracted.map(function (r) {
      var accountId = r.accountId || matchAccountId(r.accountName, accounts);
      return Object.assign({}, r, { accountId: accountId });
    }));
    setStep("review");
  }

  function doParse(t) {
    var line = (t != null ? t : text).trim();
    if (parsing || !line) return;
    setParsing(true);
    callParseDigestPip({
      text: line,
      accounts: (accounts || []).map(function (a) { return a.name; }).filter(Boolean),
      today: new Date().toISOString().slice(0, 10),
    }).then(function (out) {
      setParsing(false);
      toReview((out && out.rows) || []);
    }).catch(function () {
      setParsing(false);
      var det = parseDigest(line, accounts);
      toReview(det.rows || []);
    });
  }

  function patchRow(idx, fields) {
    setRows(function (prev) { return prev.map(function (r, i) { return i === idx ? Object.assign({}, r, fields) : r; }); });
  }

  function handleFile() {
    if (filing) return;
    var todayISO = new Date().toISOString().slice(0, 10);
    // A task can be account-less (a personal to-do); a touch/note needs an account.
    setFiling(true);
    var ops = rows.map(function (r) {
      var awayTag = backFromPTO ? { follow_up_on_return: true } : {};
      if (r.kind === "touch") {
        if (!r.accountId) return Promise.resolve();
        return addMeeting({
          account_id: r.accountId, meeting_date: todayISO, method: "email",
          status: "summarized", title: "Email touchpoint", notes: r.text,
        });
      }
      if (r.kind === "waiting" || r.kind === "quiet") {
        return insertTask(userId, Object.assign({
          title: r.text, account_id: r.accountId || null,
          waiting_on: r.who || null, waiting_on_since: r.since || todayISO,
          user_added: true,
        }, awayTag));
      }
      // owe / fallback → a commitment task (account optional)
      return insertTask(userId, Object.assign({
        title: r.text, account_id: r.accountId || null,
        due_date: r.due || null, is_commitment: !r.isFallback, user_added: true,
      }, awayTag));
    });
    Promise.allSettled(ops).then(function (results) {
      setFiling(false);
      var failed = results.filter(function (x) { return x.status === "rejected"; }).length;
      if (failed >= results.length) { showToast("Couldn't file that — try again", "error"); return; }
      showToast("Filed ✦" + (failed ? " · " + failed + " failed" : ""));
      onClose();
    });
  }

  return (
    <Modal title="Quick capture" onClose={onClose} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {step === "type" && (
          <>
            <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.55, fontFamily: INTER }}>
              Type it like you'd say it — Pip figures out what it is, which account, and when.
            </div>
            <textarea
              value={text}
              onChange={function (e) { setText(e.target.value); }}
              onKeyDown={function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doParse(); } }}
              placeholder={"e.g. Told All Star I'd send the audit by Friday\nor: waiting on Mike for the POC list since Monday"}
              rows={3}
              autoFocus
              disabled={parsing}
              style={{
                width: "100%", boxSizing: "border-box", background: C.surface, color: C.text,
                border: "1px solid " + C.rule, borderRadius: 10, padding: "12px 14px",
                fontSize: 16, fontFamily: INTER, lineHeight: 1.5, outline: "none", resize: "vertical",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={function () { doParse(); }}
                disabled={parsing || !text.trim()}
                style={{
                  background: C.accent, color: C.bg, border: "none", borderRadius: 8,
                  padding: "8px 18px", fontSize: 13, fontWeight: 600, fontFamily: INTER,
                  cursor: parsing || !text.trim() ? "default" : "pointer", opacity: parsing || !text.trim() ? 0.5 : 1,
                }}
              >
                {parsing ? "Reading…" : "Capture"}
              </button>
            </div>
          </>
        )}

        {step === "review" && (
          <>
            <div style={{ fontSize: 11, color: C.textFaint, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              {rows.length === 1 ? "Pip read this — file it?" : "Pip found " + rows.length + " — file them?"}
            </div>
            {rows.map(function (r, idx) {
              var cfg = KIND_CFG[r.kind] || KIND_CFG.owe;
              return (
                <div key={idx} style={{ background: C.bgCard, border: "1px solid " + C.border, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, color: cfg.color, border: "1px solid " + cfg.color, borderRadius: 4, padding: "1px 6px", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
                      {cfg.label}
                    </span>
                    <input
                      value={r.text || ""}
                      onChange={function (e) { patchRow(idx, { text: e.target.value }); }}
                      style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: C.text, fontSize: 16, fontFamily: INTER, outline: "none" }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 180 }}>
                      <AccountPicker
                        accounts={accounts}
                        value={r.accountId || ""}
                        onChange={function (id) { patchRow(idx, { accountId: id }); }}
                        placeholder="No account (personal task)"
                        allowNone
                      />
                    </div>
                    {(r.kind === "owe" || r.isFallback) && (
                      <input
                        type="date"
                        value={r.due || ""}
                        onChange={function (e) { patchRow(idx, { due: e.target.value || null }); }}
                        style={{
                          background: C.bgDark, border: "1px solid " + C.rule, borderRadius: 6,
                          padding: "4px 8px", color: r.due ? C.text : C.textMuted, fontSize: 16, fontFamily: INTER, outline: "none",
                          colorScheme: (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light") ? "light" : "dark",
                        }}
                      />
                    )}
                    {r.who && <span style={{ fontSize: 11, color: C.textMuted }}>waiting on {r.who}</span>}
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button
                onClick={function () { setStep("type"); }}
                style={{ background: "transparent", border: "1px solid " + C.border, borderRadius: 8, padding: "8px 14px", fontSize: 13, color: C.textMuted, fontFamily: INTER, cursor: "pointer" }}
              >
                ← Edit
              </button>
              <button
                onClick={handleFile}
                disabled={filing}
                style={{
                  background: C.accent, color: C.bg, border: "none", borderRadius: 8, padding: "8px 18px",
                  fontSize: 13, fontWeight: 600, fontFamily: INTER, cursor: filing ? "default" : "pointer", opacity: filing ? 0.5 : 1,
                }}
              >
                {filing ? "Filing…" : "File it"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
