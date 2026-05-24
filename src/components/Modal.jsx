import { useEffect, useRef } from "react";
import { C } from "../lib/colors";

var FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, width }) {
  var innerRef = useRef(null);

  useEffect(function () {
    var trigger = document.activeElement;

    var focusable = innerRef.current ? Array.from(innerRef.current.querySelectorAll(FOCUSABLE)) : [];
    if (focusable.length > 0) focusable[0].focus();

    function handleKey(e) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      var els = innerRef.current ? Array.from(innerRef.current.querySelectorAll(FOCUSABLE)) : [];
      if (els.length === 0) return;
      var first = els[0];
      var last  = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener("keydown", handleKey);
    return function () {
      document.removeEventListener("keydown", handleKey);
      if (trigger && trigger.focus) trigger.focus();
    };
  }, [onClose]);

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fade-in"
      onClick={handleBackdrop}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 20,
      }}
    >
      <div
        ref={innerRef}
        className="fade-in"
        style={{
          background: C.bgCard,
          border: "1px solid " + C.border,
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: width || 480,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
            {title}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: C.textMuted,
              cursor: "pointer",
              fontSize: 20,
              fontFamily: "'DM Sans', sans-serif",
              lineHeight: 1,
              padding: "4px 8px",
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
