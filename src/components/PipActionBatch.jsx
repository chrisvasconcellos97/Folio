import { useState, useMemo } from "react";
import { C } from "../lib/colors";
import { PipActionCard } from "./PipActionCard";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var INTER = "'Inter', system-ui, sans-serif";

// PipActionBatch — confirmation card rendered below a Pip message that
// emitted ≥2 confirm-required tool calls. Internally renders a stack of
// PipActionCard instances; the wrapper adds "Confirm All Remaining" /
// "Discard All" controls in a footer.
//
// Props:
//   tools        — array of pending tool calls ({ id, name, input })
//   accounts     — list of accounts for label resolution
//   onConfirmOne(tool)   — called when a card's [Confirm] resolves; should
//                          return a promise of an executor result envelope
//   onDiscardOne(toolId) — called when a card's [Skip] is hit
//   onConfirmAll(tools)  — fire all remaining (un-skipped, un-confirmed) at once
//   onDiscardAll()       — drop the whole batch
//
// Per-tool state is tracked here so cards can show "Skipped" / "Done" badges.
export function PipActionBatch({
  tools,
  accounts,
  onConfirmOne,
  onDiscardOne,
  onConfirmAll,
  onDiscardAll,
}) {
  // status: "pending" | "skipped" | "done"
  var [status, setStatus] = useState(function () {
    var init = {};
    (tools || []).forEach(function (t) { init[t.id || t.name] = "pending"; });
    return init;
  });
  var [busy, setBusy] = useState(false);

  var summary = useMemo(function () {
    if (!tools || !tools.length) return "";
    var counts = {};
    tools.forEach(function (t) { counts[t.name] = (counts[t.name] || 0) + 1; });
    return Object.keys(counts).map(function (k) {
      return counts[k] + " × " + k.replace(/_/g, " ");
    }).join(" · ");
  }, [tools]);

  if (!tools || !tools.length) return null;

  function idFor(t) { return t.id || t.name; }

  function handleCardConfirm(tool) {
    setBusy(true);
    return Promise.resolve(onConfirmOne(tool))
      .then(function (r) {
        if (r && r.ok === false) return r;
        setStatus(function (prev) {
          var next = Object.assign({}, prev);
          next[idFor(tool)] = "done";
          return next;
        });
        return r;
      })
      .finally(function () { setBusy(false); });
  }

  function handleCardDiscard(tool) {
    setStatus(function (prev) {
      var next = Object.assign({}, prev);
      next[idFor(tool)] = "skipped";
      return next;
    });
    onDiscardOne && onDiscardOne(idFor(tool));
  }

  function pendingTools() {
    return tools.filter(function (t) { return status[idFor(t)] === "pending"; });
  }

  function handleConfirmAll() {
    if (busy) return;
    var remaining = pendingTools();
    if (!remaining.length) return;
    setBusy(true);
    Promise.resolve(onConfirmAll(remaining))
      .then(function () {
        setStatus(function (prev) {
          var next = Object.assign({}, prev);
          remaining.forEach(function (t) { next[idFor(t)] = "done"; });
          return next;
        });
      })
      .finally(function () { setBusy(false); });
  }

  function handleDiscardAll() {
    if (busy) return;
    onDiscardAll && onDiscardAll();
  }

  var nPending = pendingTools().length;

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
      {/* Header */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Pip wants to make changes
        </div>
        <div style={{ fontFamily: INTER, fontSize: 14, color: C.text, marginTop: 4, lineHeight: 1.45 }}>
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>{tools.length}</strong>
          {" "}action{tools.length === 1 ? "" : "s"} pending review.
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textMuted, marginTop: 4 }}>
          {summary}
        </div>
      </div>

      {/* Card stack */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tools.map(function (t) {
          var s = status[idFor(t)] || "pending";
          if (s === "done") {
            // Hide entirely once executed — the toast already confirmed it.
            return null;
          }
          return (
            <PipActionCard
              key={idFor(t)}
              tool={t}
              accounts={accounts}
              compact
              skipped={s === "skipped"}
              onConfirm={function (updated) { return handleCardConfirm(updated); }}
              onDiscard={function () { handleCardDiscard(t); }}
            />
          );
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          flexWrap: "wrap",
          borderTop: "1px solid " + C.ruleSoft,
          paddingTop: 10,
        }}
      >
        <button
          onClick={handleDiscardAll}
          disabled={busy}
          style={{
            background: "transparent",
            border: "1px solid " + C.rule,
            color: C.textMuted,
            padding: "7px 14px",
            borderRadius: 6,
            fontFamily: MONO,
            fontSize: 10.5,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          Discard All
        </button>
        <button
          onClick={handleConfirmAll}
          disabled={busy || nPending === 0}
          style={{
            background: C.accentDeep,
            border: "none",
            color: C.bg,
            padding: "7px 14px",
            borderRadius: 6,
            fontFamily: MONO,
            fontSize: 10.5,
            fontWeight: 700,
            cursor: busy || nPending === 0 ? "default" : "pointer",
            opacity: busy || nPending === 0 ? 0.5 : 1,
          }}
        >
          {busy ? "Working…" : "Confirm All Remaining"}
        </button>
      </div>
    </div>
  );
}
