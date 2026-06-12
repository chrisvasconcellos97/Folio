import { useState, useEffect } from "react";
import { C } from "../lib/colors";
import { MarkdownText } from "./MarkdownText";
import { PipCard } from "./PipCard";
import { supabase } from "../lib/supabase";
import { showToast } from "./Toast";
import { draftAccountFollowupPip } from "../lib/pip.js";

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

export function OperatorPanel({ stateRow, accountName, onAddTask, onChanged, fallback, profileProse }) {
  var [emailOpen, setEmailOpen]       = useState(false);
  var [busyIdx, setBusyIdx]           = useState(null);
  var [readAt, setReadAt]             = useState(null);
  // On-demand draft — generated when the user taps "✦ Draft a follow-up".
  // Cached in component state so it doesn't regenerate on every render.
  var [draftEmail, setDraftEmail]     = useState("");
  var [draftLoading, setDraftLoading] = useState(false);

  // Unread = the operator wrote this account's state more recently than the
  // last time this device opened the card. Opening it stores the timestamp, so
  // the amber glow clears until the next run produces something newer.
  var genAt   = stateRow && stateRow.operator_generated_at;
  var accId   = stateRow && stateRow.account_id;
  var readKey = accId ? "folio_op_read_" + accId : null;
  useEffect(function () {
    if (!readKey) { setReadAt(null); return; }
    try { setReadAt(localStorage.getItem(readKey)); } catch (_) { setReadAt(null); }
  }, [readKey]);

  // No operator read yet — show the lightweight fallback as a head-only card.
  if (!genAt) {
    if (!fallback) return null;
    return <PipCard headline={fallback} />;
  }

  var unread = !readAt || new Date(readAt) < new Date(genAt);
  function markRead() {
    if (!readKey) return;
    try { localStorage.setItem(readKey, genAt); } catch (_) { /* ignore */ }
    setReadAt(genAt);
  }

  var situation = stateRow.operator_situation || "";
  var headline  = stateRow.operator_headline || firstSentence(situation) || "Pip worked this account overnight.";
  var delta     = stateRow.operator_delta || "";
  var agenda    = stateRow.operator_agenda || "";
  var risks     = Array.isArray(stateRow.operator_risks) ? stateRow.operator_risks.filter(Boolean) : [];
  var allMoves  = Array.isArray(stateRow.operator_proposed_moves) ? stateRow.operator_proposed_moves : [];
  var pending = allMoves
    .map(function (m, i) { return { m: m, i: i }; })
    .filter(function (x) { return x.m && !x.m.status; });

  // Show the draft button when Pip's situation notes a follow-up is warranted
  // OR when there are active risks — both are signals the account needs a touch.
  var showDraftButton = !!(risks.length || situation);

  function handleDraftFollowup() {
    if (draftLoading || draftEmail) return;
    setDraftLoading(true);
    draftAccountFollowupPip({
      accountName:  accountName || "",
      situation:    situation,
      risks:        risks,
      profileProse: profileProse || null,
    }).then(function (r) {
      setDraftEmail(r.email || "");
      setEmailOpen(true);
      setDraftLoading(false);
    }).catch(function () {
      showToast("Couldn't draft the email — try again");
      setDraftLoading(false);
    });
  }

  // Density row — the counts that tell you what's underneath.
  var chips = [];
  if (risks.length) chips.push("⚠ " + risks.length + " risk" + (risks.length > 1 ? "s" : ""));
  if (draftEmail) chips.push("✦ draft ready");
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

      {/* On-demand follow-up draft — generated on tap, cached in state, not nightly */}
      {showDraftButton && !draftEmail && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid " + C.rule }}>
          <button
            onClick={handleDraftFollowup}
            disabled={draftLoading}
            style={{
              fontFamily: MONO, fontSize: 10, color: C.accent,
              background: C.accentFaint, border: "1px solid " + C.accentLine,
              borderRadius: 6, padding: "4px 11px", cursor: draftLoading ? "default" : "pointer",
              opacity: draftLoading ? 0.6 : 1,
            }}
          >
            {draftLoading ? "Drafting…" : "✦ Draft a follow-up"}
          </button>
        </div>
      )}

      {draftEmail && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid " + C.rule }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              ✦ Pip drafted a follow-up
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={function () { try { navigator.clipboard.writeText(draftEmail); showToast("Draft copied — review before sending"); } catch (_) { showToast("Couldn't copy"); } }}
                style={{ fontFamily: MONO, fontSize: 10, color: C.accent, background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 6, padding: "3px 9px", cursor: "pointer" }}>Copy</button>
              <a href={"mailto:?body=" + encodeURIComponent(draftEmail)}
                style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, border: "1px solid " + C.rule, borderRadius: 6, padding: "3px 9px", textDecoration: "none" }}>Open in Mail</a>
              <button onClick={function () { setEmailOpen(function (v) { return !v; }); }}
                style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, background: "none", border: "1px solid " + C.rule, borderRadius: 6, padding: "3px 9px", cursor: "pointer" }}>{emailOpen ? "Hide" : "Read"}</button>
            </div>
          </div>
          {emailOpen && (
            <div style={{ fontFamily: INTER, fontSize: 13, color: C.textSoft, lineHeight: 1.6, whiteSpace: "pre-wrap", marginTop: 8 }}>{draftEmail}</div>
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
      unread={unread}
      onRead={markRead}
    >
      {body}
    </PipCard>
  );
}
