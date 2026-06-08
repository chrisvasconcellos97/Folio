import { useState } from "react";
import { C } from "../lib/colors";
import { MarkdownText } from "./MarkdownText";
import { PipCard } from "./PipCard";
import { supabase } from "../lib/supabase";
import { showToast } from "./Toast";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// OperatorPanel — the per-account Pip card. Composes the shared PipCard shell:
// the head is Pip's high-level read (headline + a density row of counts) and
// the collapsed body is the full breakdown (situation, since-last-run delta,
// risks, the pre-drafted follow-up, and proposed moves you approve/dismiss).
//
// When the nightly loop hasn't worked this account yet, `fallback` (the
// lightweight heuristic read) renders as a head-only card — the shallow-water
// version of the same card. Renders nothing if there's neither.
function relTime(iso) {
  if (!iso) return "";
  var diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return "";
  var h = Math.floor(diff / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function firstSentence(s) {
  if (!s) return "";
  var m = String(s).match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : String(s)).trim();
}

export function OperatorPanel({ stateRow, accountName, onAddTask, onChanged, fallback }) {
  var [emailOpen, setEmailOpen] = useState(false);
  var [busyIdx, setBusyIdx] = useState(null);

  var hasOperator = stateRow && stateRow.operator_generated_at;

  // No operator read yet — show the lightweight fallback as a head-only card.
  if (!hasOperator) {
    if (!fallback) return null;
    return <PipCard headline={fallback} />;
  }

  var situation = stateRow.operator_situation || "";
  var headline  = stateRow.operator_headline || firstSentence(situation) || "Pip worked this account overnight.";
  var delta     = stateRow.operator_delta || "";
  var agenda    = stateRow.operator_agenda || "";
  var email     = stateRow.operator_draft_email || "";
  var risks     = Array.isArray(stateRow.operator_risks) ? stateRow.operator_risks.filter(Boolean) : [];
  var allMoves  = Array.isArray(stateRow.operator_proposed_moves) ? stateRow.operator_proposed_moves : [];
  var pending = allMoves
    .map(function (m, i) { return { m: m, i: i }; })
    .filter(function (x) { return x.m && !x.m.status; });

  // Density row — the counts that tell you what's underneath.
  var chips = [];
  if (risks.length) chips.push("⚠ " + risks.length + " risk" + (risks.length > 1 ? "s" : ""));
  if (email) chips.push("✦ draft ready");
  if (pending.length) chips.push(pending.length + " proposed move" + (pending.length > 1 ? "s" : ""));

  function persist(newMoves) {
    return supabase
      .from("folio_pip_account_state")
      .update({ operator_proposed_moves: newMoves })
      .eq("account_id", stateRow.account_id)
      .then(function () { if (onChanged) onChanged(); });
  }
  function markMove(idx, status) {
    var next = allMoves.slice();
    next[idx] = Object.assign({}, next[idx], { status: status });
    return persist(next);
  }
  function approve(idx) {
    var move = allMoves[idx];
    setBusyIdx(idx);
    Promise.resolve(onAddTask ? onAddTask(move.title) : null)
      .then(function () { return markMove(idx, "applied"); })
      .then(function () { showToast("Added — " + move.title); })
      .catch(function () { showToast("Couldn't add that task"); })
      .then(function () { setBusyIdx(null); });
  }
  function dismiss(idx) {
    setBusyIdx(idx);
    markMove(idx, "dismissed")
      .catch(function () { /* best-effort */ })
      .then(function () { setBusyIdx(null); });
  }

  var body = (
    <div>
      {situation && (
        <MarkdownText text={situation} style={{ fontFamily: INTER, fontSize: 14, color: C.textSoft, lineHeight: 1.65 }} />
      )}

      {delta && (
        <div style={{ fontFamily: INTER, fontSize: 12.5, color: C.textMuted, fontStyle: "italic", marginTop: 8 }}>
          Since last run: {delta}
        </div>
      )}

      {risks.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {risks.map(function (r, i) {
            return (
              <span key={i} style={{ fontFamily: MONO, fontSize: 10, color: C.red, border: "1px solid " + C.red, borderRadius: 6, padding: "2px 7px" }}>
                {r}
              </span>
            );
          })}
        </div>
      )}

      {agenda && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid " + C.rule }}>
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Prepped agenda
          </div>
          <div style={{ fontFamily: INTER, fontSize: 13, color: C.textSoft, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{agenda}</div>
        </div>
      )}

      {email && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid " + C.rule }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              ✦ Pip drafted a follow-up
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={function () { try { navigator.clipboard.writeText(email); showToast("Draft copied — review before sending"); } catch (_) { showToast("Couldn't copy"); } }}
                style={{ fontFamily: MONO, fontSize: 10, color: C.accent, background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 6, padding: "3px 9px", cursor: "pointer" }}>Copy</button>
              <a href={"mailto:?body=" + encodeURIComponent(email)}
                style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, border: "1px solid " + C.rule, borderRadius: 6, padding: "3px 9px", textDecoration: "none" }}>Open in Mail</a>
              <button onClick={function () { setEmailOpen(function (v) { return !v; }); }}
                style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, background: "none", border: "1px solid " + C.rule, borderRadius: 6, padding: "3px 9px", cursor: "pointer" }}>{emailOpen ? "Hide" : "Read"}</button>
            </div>
          </div>
          {emailOpen && (
            <div style={{ fontFamily: INTER, fontSize: 13, color: C.textSoft, lineHeight: 1.6, whiteSpace: "pre-wrap", marginTop: 8 }}>{email}</div>
          )}
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid " + C.rule }}>
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Pip proposes — approve or dismiss
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {pending.map(function (x) {
              var move = x.m;
              var idx = x.i;
              var busy = busyIdx === idx;
              return (
                <div key={idx} style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <span style={{ fontFamily: INTER, fontSize: 13, color: C.text, fontWeight: 600 }}>{move.title}</span>
                    {move.detail && <span style={{ fontFamily: INTER, fontSize: 12.5, color: C.textMuted }}> — {move.detail}</span>}
                    {move.confidence === "medium" && (
                      <span style={{ fontFamily: MONO, fontSize: 8.5, color: C.textMuted, marginLeft: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>maybe</span>
                    )}
                  </span>
                  <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button disabled={busy} onClick={function () { approve(idx); }}
                      style={{ fontFamily: MONO, fontSize: 10, color: C.accent, background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 6, padding: "3px 9px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}>+ Add task</button>
                    <button disabled={busy} onClick={function () { dismiss(idx); }}
                      style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, background: "none", border: "1px solid " + C.rule, borderRadius: 6, padding: "3px 9px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}>Dismiss</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <PipCard
      label="Operator read"
      headline={headline}
      timestamp={relTime(stateRow.operator_generated_at)}
      metaChips={chips}
      defaultCollapsed={true}
    >
      {body}
    </PipCard>
  );
}
