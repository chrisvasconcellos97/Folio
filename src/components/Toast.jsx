import { useState, useEffect } from "react";
import { C } from "../lib/colors";

var toastListeners = [];
export function showToast(msg, type) {
  toastListeners.forEach(function(fn) { fn(msg, type || "success"); });
}

export function Toast() {
  var [toasts, setToasts] = useState([]);

  useEffect(function() {
    function handler(msg, type) {
      var id = Date.now();
      setToasts(function(prev) { return prev.concat({ id: id, msg: msg, type: type }); });
      setTimeout(function() {
        setToasts(function(prev) { return prev.filter(function(t) { return t.id !== id; }); });
      }, 2500);
    }
    toastListeners.push(handler);
    return function() { toastListeners = toastListeners.filter(function(fn) { return fn !== handler; }); };
  }, []);

  if (!toasts.length) return null;

  return (
    <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
      {toasts.map(function(t) {
        return (
          <div key={t.id} className="fade-in" style={{
            background: t.type === "error" ? "rgba(224,92,92,0.15)" : t.type === "warning" ? "rgba(232,168,56,0.15)" : "rgba(74,155,130,0.15)",
            border: "1px solid " + (t.type === "error" ? "rgba(224,92,92,0.3)" : t.type === "warning" ? "rgba(232,168,56,0.3)" : "rgba(74,155,130,0.3)"),
            color: t.type === "error" ? "#e05c5c" : t.type === "warning" ? "#e8a838" : C.accent,
            padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500,
            fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}>
            {t.msg}
          </div>
        );
      })}
    </div>
  );
}
