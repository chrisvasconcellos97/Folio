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

  return (
    <div style={{
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
    }}>
      {toasts.map(function(t) {
        var borderColor = t.type === "error" ? "rgba(224,92,92,0.5)" : t.type === "warning" ? "rgba(232,168,56,0.5)" : "rgba(74,155,130,0.5)";
        var textColor   = t.type === "error" ? "#e05c5c" : t.type === "warning" ? "#e8a838" : C.accent;
        var bg          = t.type === "error" ? "rgba(30,10,10,0.95)" : t.type === "warning" ? "rgba(30,25,10,0.95)" : "rgba(10,30,25,0.95)";
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
            boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
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
                  setToasts(function(prev) { return prev.filter(function(x) { return x.id !== t.id; }); });
                }}
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  color: "#fff",
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
                  setToasts(function(prev) { return prev.filter(function(x) { return x.id !== t.id; }); });
                }}
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  color: "#fff",
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
      })}
    </div>
  );
}
