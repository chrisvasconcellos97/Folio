import { useState } from "react";
import { C } from "../lib/colors";
import { describeToolCall } from "../lib/pipTools";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var INTER = "'Inter', system-ui, sans-serif";

// PipActionBatch — confirmation card rendered below a Pip message that
// emitted a large batch of tool calls.
//
// Props:
//   tools      — array of pending tool calls ({ id, name, input })
//   accounts   — list of accounts for label resolution
//   onConfirmAll(tools)
//   onReviewSelected(tools)    // user-picked subset
//   onDiscard()
function summarize(tools) {
  if (!tools || !tools.length) return "";
  var counts = {};
  tools.forEach(function (t) { counts[t.name] = (counts[t.name] || 0) + 1; });
  var pieces = Object.keys(counts).map(function (k) {
    return counts[k] + " × " + k.replace(/_/g, " ");
  });
  return pieces.join(" · ");
}

function distinctAccounts(tools, accounts) {
  var set = {};
  tools.forEach(function (t) {
    var input = t.input || {};
    var id = input.account_id;
    if (id) { set[id] = true; return; }
    if (input.account_name && accounts) {
      var match = accounts.find(function (a) {
        return a.name && a.name.toLowerCase() === input.account_name.toLowerCase();
      });
      if (match) set[match.id] = true;
    }
  });
  return Object.keys(set).length;
}

export function PipActionBatch({ tools, accounts, onConfirmAll, onReviewSelected, onDiscard }) {
  var [reviewing, setReviewing] = useState(false);
  var [keepIds, setKeepIds]     = useState(function () {
    var init = {};
    (tools || []).forEach(function (t) { init[t.id || (t.name + Math.random())] = true; });
    return init;
  });
  var [busy, setBusy] = useState(false);

  if (!tools || !tools.length) return null;

  var nAccts = distinctAccounts(tools, accounts);
  var summary = summarize(tools);

  function handleConfirmAll() {
    if (busy) return;
    setBusy(true);
    Promise.resolve(onConfirmAll(tools)).finally(function () { setBusy(false); });
  }

  function handleReview() {
    setReviewing(true);
  }

  function handleApply() {
    if (busy) return;
    var keep = tools.filter(function (t) {
      return keepIds[t.id || t.name] !== false;
    });
    if (!keep.length) { onDiscard(); return; }
    setBusy(true);
    Promise.resolve(onReviewSelected(keep)).finally(function () { setBusy(false); });
  }

  function toggle(id) {
    setKeepIds(function (prev) {
      var next = Object.assign({}, prev);
      next[id] = !next[id];
      return next;
    });
  }

  return (
    <div
      style={{
        marginLeft: 42,
        background: C.surface,
        border: "1px solid " + C.accentBorder,
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Pip wants to make changes
          </div>
          <div style={{ fontFamily: INTER, fontSize: 14, color: C.text, marginTop: 4, lineHeight: 1.45 }}>
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>{tools.length}</strong>
            {" "}action{tools.length === 1 ? "" : "s"}
            {nAccts > 1 ? (
              <> across <strong style={{ fontVariantNumeric: "tabular-nums" }}>{nAccts}</strong> accounts</>
            ) : null}.
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textMuted, marginTop: 4 }}>
            {summary}
          </div>
        </div>
      </div>

      {reviewing && (
        <div
          style={{
            maxHeight: 220, overflowY: "auto",
            background: C.surface2, borderRadius: 6,
            border: "1px solid " + C.rule,
            padding: 8, display: "flex", flexDirection: "column", gap: 4,
          }}
        >
          {tools.map(function (t, i) {
            var id = t.id || t.name + i;
            var kept = keepIds[id] !== false;
            return (
              <label
                key={id}
                style={{
                  display: "flex", gap: 8, alignItems: "center",
                  padding: "5px 6px",
                  background: kept ? "transparent" : "rgba(255,255,255,0.02)",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontFamily: INTER, fontSize: 12, color: kept ? C.text : C.textMuted,
                  textDecoration: kept ? "none" : "line-through",
                }}
              >
                <input
                  type="checkbox"
                  checked={kept}
                  onChange={function () { toggle(id); }}
                  style={{ accentColor: C.accent, cursor: "pointer" }}
                />
                <span>{describeToolCall(t, accounts)}</span>
              </label>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button
          onClick={onDiscard}
          disabled={busy}
          style={{
            background: "transparent",
            border: "1px solid " + C.rule,
            color: C.textMuted,
            padding: "7px 14px",
            borderRadius: 6,
            fontFamily: MONO, fontSize: 10.5,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          Discard
        </button>
        {!reviewing ? (
          <button
            onClick={handleReview}
            disabled={busy}
            style={{
              background: "transparent",
              border: "1px solid " + C.accentBorder,
              color: C.accent,
              padding: "7px 14px",
              borderRadius: 6,
              fontFamily: MONO, fontSize: 10.5,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.5 : 1,
            }}
          >
            Review Each
          </button>
        ) : (
          <button
            onClick={handleApply}
            disabled={busy}
            style={{
              background: C.accentDeep,
              border: "none",
              color: C.bg,
              padding: "7px 14px",
              borderRadius: 6,
              fontFamily: MONO, fontSize: 10.5, fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? "Applying…" : "Apply Selected"}
          </button>
        )}
        {!reviewing && (
          <button
            onClick={handleConfirmAll}
            disabled={busy}
            style={{
              background: C.accentDeep,
              border: "none",
              color: C.bg,
              padding: "7px 14px",
              borderRadius: 6,
              fontFamily: MONO, fontSize: 10.5, fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? "Working…" : "Confirm All"}
          </button>
        )}
      </div>
    </div>
  );
}
