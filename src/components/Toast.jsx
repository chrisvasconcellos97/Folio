import { useState, useEffect } from "react";
import { C } from "../lib/colors";

export function showToast(msg, type) {
  document.dispatchEvent(new CustomEvent("folio-toast", {
    detail: { msg: msg, type: type || "success" }
  }));
}

export function Toast() {
  var [toasts, setToasts] = useState([]);

  useEffect(function() {
    function handler(e) {
      var id = Date.now() + Math.random();
      var msg = e.detail.msg;
      var type = e.detail.type;
      setToasts(function(prev) { return prev.concat({ id: id, msg: msg, type: type }); });
      setTimeout(function() {
        setToasts(function(prev) { return prev.filter(function(t) { return t.id !== id; }); });
      }, 2500);
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
        return (
          <div key={t.id} className="fade-in" style={{
            background: t.type === "error" ? "rgba(30,10,10,0.95)" : t.type === "warning" ? "rgba(30,25,10,0.95)" : "rgba(10,30,25,0.95)",
            border: "1px solid " + (t.type === "error" ? "rgba(224,92,92,0.5)" : t.type === "warning" ? "rgba(232,168,56,0.5)" : "rgba(74,155,130,0.5)"),
            color: t.type === "error" ? "#e05c5c" : t.type === "warning" ? "#e8a838" : C.accent,
            padding: "10px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          }}>
            {t.msg}
          </div>
        );
      })}
    </div>
  );
}
