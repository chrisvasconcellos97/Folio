import { useState, useEffect } from "react";
import { C } from "../lib/colors";

export function showToast(msg, type, onUndoOrOpts) {
  var opts = onUndoOrOpts && typeof onUndoOrOpts === "object" ? onUndoOrOpts : { onUndo: onUndoOrOpts };
  document.dispatchEvent(new CustomEvent("folio-toast", {
    detail: {
      msg:     msg,
      type:    type || "success",
      onUndo:  opts.onUndo || null,
      action:  opts.action || null,
      sticky:  !!opts.sticky,
    }
  }));
}

function ToastItem({ t, onRemove }) {
  // Theme-aware: solid card background + colored border/text per type, so
  // toasts render correctly in light mode (was theme-blind dark rgba).
  var borderColor = t.type === "error" ? C.redLine : t.type === "warning" ? C.yellow : C.accentLine;
  var textColor   = t.type === "error" ? C.red : t.type === "warning" ? C.yellow : C.accent;
  var bg          = C.bgCard;
  return (
    <div key={t.id} className="fade-in" style={{
      background: bg,
      border: "1px solid " + borderColor,
      color: textColor,
      padding: "10px 16px",
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 600,
      fontFamily: "'Inter', system-ui, sans-serif",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 24px var(--c-overlay-shadow)",
      pointerEvents: t.onUndo || t.action ? "auto" : "none",
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      <span>{t.msg}</span>
      {t.onUndo && (
        <button
          onClick={function() {
            t.onUndo();
            onRemove(t.id);
          }}
          style={{
            background: C.surface,
            border: "1px solid " + C.border,
            color: C.text,
            borderRadius: 6,
            padding: "3px 10px",
            fontSize: 12,
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: 700,
            cursor: "pointer",
            lineHeight: "1.5",
          }}
        >
          Undo
        </button>
      )}
      {t.action && (
        <button
          onClick={function() {
            t.action.run();
            onRemove(t.id);
          }}
          style={{
            background: C.surface,
            border: "1px solid " + C.border,
            color: C.text,
            borderRadius: 6,
            padding: "3px 10px",
            fontSize: 12,
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: 700,
            cursor: "pointer",
            lineHeight: "1.5",
          }}
        >
          {t.action.label}
        </button>
      )}
    </div>
  );
}

var CONTAINER_STYLE = {
  position: "fixed",
  top: 70,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 9999,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  alignItems: "center",
  pointerEvents: "none",
};

export function Toast() {
  var [toasts, setToasts] = useState([]);

  useEffect(function() {
    function handler(e) {
      var id     = Date.now() + Math.random();
      var t      = e.detail;
      setToasts(function(prev) { return prev.concat({ id: id, msg: t.msg, type: t.type, onUndo: t.onUndo, action: t.action, sticky: t.sticky }); });
      if (!t.sticky) {
        var duration = t.onUndo || t.action ? 4500 : 2500;
        setTimeout(function() {
          setToasts(function(prev) { return prev.filter(function(x) { return x.id !== id; }); });
        }, duration);
      }
    }
    document.addEventListener("folio-toast", handler);
    return function() { document.removeEventListener("folio-toast", handler); };
  }, []);

  if (!toasts.length) return null;

  function removeToast(id) {
    setToasts(function(prev) { return prev.filter(function(x) { return x.id !== id; }); });
  }

  var errorToasts   = toasts.filter(function(t) { return t.type === "error"; });
  var nonErrToasts  = toasts.filter(function(t) { return t.type !== "error"; });

  return (
    <>
      {nonErrToasts.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={CONTAINER_STYLE}
        >
          {nonErrToasts.map(function(t) {
            return <ToastItem key={t.id} t={t} onRemove={removeToast} />;
          })}
        </div>
      )}
      {errorToasts.length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          style={Object.assign({}, CONTAINER_STYLE, { top: nonErrToasts.length > 0 ? 120 : 70 })}
        >
          {errorToasts.map(function(t) {
            return <ToastItem key={t.id} t={t} onRemove={removeToast} />;
          })}
        </div>
      )}
    </>
  );
}
