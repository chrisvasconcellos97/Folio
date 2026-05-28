import { useEffect, useRef } from "react";
import { C } from "../lib/colors";
import { useBreakpoint } from "../hooks/useBreakpoint";

var FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, width }) {
  var innerRef = useRef(null);
  var isDesktop = useBreakpoint();
  var isMobile = !isDesktop;

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
        background: "var(--c-overlay-shadow-strong)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: isMobile ? 8 : 20,
      }}
    >
      <div
        ref={innerRef}
        className="fade-in modal-sheet"
        style={{
          background: C.bgCard,
          border: "1px solid " + C.border,
          borderRadius: 16,
          padding: isMobile ? 18 : 24,
          width: "100%",
          maxWidth: isMobile
            ? "min(" + (width || 480) + "px, calc(100vw - 16px))"
            : width || 480,
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
              fontFamily: "'Inter', system-ui, sans-serif",
              lineHeight: 1,
              padding: "4px 8px",
              minWidth: 44,
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
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
