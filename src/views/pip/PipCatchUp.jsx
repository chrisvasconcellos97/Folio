import { useState } from "react";
import { Modal } from "../../components/Modal";
import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { showToast } from "../../components/Toast";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// "Catch up with Pip" — a dedicated surface to answer the whole queue in one
// sitting, bypassing the gentle daily drip on Home. Each answer teaches Pip
// something (terminology → glossary, portfolio/gap → profile). Skipping is
// fine. Questions disappear as they're handled (parent shrinks the list).
function catLabel(cat) {
  if (cat === "terminology") return "Term";
  if (cat === "portfolio")   return "Insight";
  if (cat === "gap")         return "Gap";
  return "Question";
}

// Plain-language label for the structured write a suggestion would make.
export function suggestionLabel(s) {
  if (!s) return null;
  if (s.type === "account_system")    return "Also save " + (s.term || "this") + " to " + (s.account_name || "the account") + "’s systems";
  if (s.type === "contact_role")      return "Also save " + (s.contact_name || "their") + "’s role";
  if (s.type === "account_objective") return "Also set " + (s.account_name || "the account") + "’s objective";
  return null;
}

export function PipCatchUp({ questions, onAnswer, onSkip, onClose, onApplySuggestion, onAskMore }) {
  var [drafts, setDrafts] = useState({});
  var [busy, setBusy]     = useState({});
  var [applyOff, setApplyOff] = useState({}); // ids where the user unchecked "also save"
  var [asking, setAsking] = useState(false);

  function askMore() {
    if (asking || typeof onAskMore !== "function") return;
    setAsking(true);
    Promise.resolve(onAskMore())
      .catch(function () { showToast("Couldn't fetch more — try again", "error"); })
      .finally(function () { setAsking(false); });
  }

  function setDraft(id, v) { setDrafts(function (p) { return Object.assign({}, p, { [id]: v }); }); }
  function markBusy(id)    { setBusy(function (p) { return Object.assign({}, p, { [id]: true }); }); }
  function clearBusy(id)   { setBusy(function (p) { var n = Object.assign({}, p); delete n[id]; return n; }); }

  function answer(q) {
    var text = (drafts[q.id] || "").trim();
    if (!text || busy[q.id]) return;
    markBusy(q.id);
    var willApply = q.suggestion && !applyOff[q.id] && typeof onApplySuggestion === "function";
    Promise.resolve(onAnswer(q.id, text))
      .then(function () {
        if (willApply) onApplySuggestion(q.suggestion, text);  // shows its own toast
        else showToast("Got it — thanks");
      })
      .catch(function () { clearBusy(q.id); showToast("Couldn't save — try again", "error"); });
  }

  function skip(q) {
    if (busy[q.id]) return;
    markBusy(q.id);
    Promise.resolve(onSkip(q.id)).catch(function () { clearBusy(q.id); });
  }

  var sorted = (questions || []).slice().sort(function (a, b) {
    return (b.priority || 0) - (a.priority || 0);
  });

  return (
    <Modal title="Catch up with Pip" onClose={onClose} width={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px", background: C.accentGlow,
          border: "1px solid " + C.accentLine, borderRadius: 8,
        }}>
          <PipMark size={8} color={C.accent} glow />
          <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>
            Answer as many as you like — each one teaches me something about your world. Skip anything that doesn't apply.
          </div>
        </div>

        {sorted.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", fontFamily: INTER }}>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
              {asking
                ? "Pip's thinking about what to ask…"
                : "All caught up ✦ Want me to dig up more about your world?"}
            </div>
            {onAskMore && (
              <button
                type="button"
                onClick={askMore}
                disabled={asking}
                style={{
                  background: asking ? C.surface : C.accentDeep,
                  border: "1px solid " + (asking ? C.rule : C.accent),
                  borderRadius: 8, padding: "9px 18px",
                  fontSize: 13, fontWeight: 600,
                  color: asking ? C.textMuted : C.bg,
                  fontFamily: INTER, cursor: asking ? "default" : "pointer",
                }}
              >
                {asking ? "Thinking…" : "Pip, ask me more →"}
              </button>
            )}
          </div>
        ) : sorted.map(function (q) {
          var filled = (drafts[q.id] || "").trim().length > 0;
          var isBusy = !!busy[q.id];
          return (
            <div key={q.id} style={{
              background: C.surface, border: "1px solid " + C.rule,
              borderRadius: 10, padding: "12px 14px",
              display: "flex", flexDirection: "column", gap: 8,
              opacity: isBusy ? 0.6 : 1, transition: "opacity 0.15s ease",
            }}>
              <span style={{
                alignSelf: "flex-start",
                fontFamily: MONO, fontSize: 9, color: C.accent,
                background: C.accentFaint, border: "1px solid " + C.accentLine,
                borderRadius: 999, padding: "1px 7px",
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>{catLabel(q.category)}</span>
              <div style={{ fontSize: 14, color: C.text, fontFamily: INTER, lineHeight: 1.5 }}>
                {q.question_text}
              </div>
              <textarea
                value={drafts[q.id] || ""}
                onChange={function (e) { setDraft(q.id, e.target.value); }}
                onKeyDown={function (e) { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && filled) answer(q); }}
                placeholder="Tell me…"
                rows={2}
                style={{
                  width: "100%", background: C.bgDark,
                  border: "1px solid " + C.border, borderRadius: 8,
                  padding: "8px 10px", color: C.text, fontSize: 16,
                  fontFamily: INTER, lineHeight: 1.5, resize: "vertical",
                  outline: "none", boxSizing: "border-box",
                }}
              />
              {q.suggestion && suggestionLabel(q.suggestion) && onApplySuggestion && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 2 }}>
                  <input
                    type="checkbox"
                    checked={!applyOff[q.id]}
                    onChange={function (e) {
                      var off = !e.target.checked;
                      setApplyOff(function (p) { return Object.assign({}, p, { [q.id]: off }); });
                    }}
                    style={{ accentColor: C.accent, width: 15, height: 15 }}
                  />
                  <span style={{ fontFamily: INTER, fontSize: 12, color: C.accent }}>
                    {suggestionLabel(q.suggestion)}
                  </span>
                </label>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={function () { skip(q); }}
                  disabled={isBusy}
                  style={{ background: "none", border: "none", color: C.textMuted, fontSize: 12, fontFamily: INTER, cursor: isBusy ? "default" : "pointer", padding: "4px 0" }}
                >Skip</button>
                <button
                  type="button"
                  onClick={function () { answer(q); }}
                  disabled={!filled || isBusy}
                  style={{
                    background: filled && !isBusy ? C.accentDeep : C.surface,
                    border: "1px solid " + (filled && !isBusy ? C.accent : C.rule),
                    borderRadius: 8, padding: "7px 16px",
                    fontSize: 12, fontWeight: 600,
                    color: filled && !isBusy ? C.bg : C.textMuted,
                    fontFamily: INTER, cursor: filled && !isBusy ? "pointer" : "default",
                  }}
                >{isBusy ? "Saving…" : "Save"}</button>
              </div>
            </div>
          );
        })}

        {sorted.length > 0 && onAskMore && (
          <button
            type="button"
            onClick={askMore}
            disabled={asking}
            style={{
              alignSelf: "center", marginTop: 4,
              background: "none", border: "1px dashed " + C.rule, borderRadius: 8,
              padding: "8px 16px", fontSize: 12, fontWeight: 600,
              color: asking ? C.textMuted : C.accent,
              fontFamily: INTER, cursor: asking ? "default" : "pointer",
            }}
          >
            {asking ? "Thinking…" : "Pip, ask me more →"}
          </button>
        )}
      </div>
    </Modal>
  );
}
