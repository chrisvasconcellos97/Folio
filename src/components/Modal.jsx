import { useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { C } from "../lib/colors";
import { useBreakpoint } from "../hooks/useBreakpoint";

var FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, width }) {
  var innerRef = useRef(null);
  // Stable ref so the focus-trap effect doesn't re-fire and steal focus
  // every time the parent re-renders with a fresh inline onClose. Without
  // this, typing inside the modal would yank focus to the close (×) button
  // on every keystroke that caused a parent re-render.
  var onCloseRef = useRef(onClose);
  useEffect(function () { onCloseRef.current = onClose; }, [onClose]);
  var isDesktop = useBreakpoint();
  var isMobile = !isDesktop;
  var titleId = useId();

  // Body scroll-lock while modal is open
  useEffect(function () {
    var prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return function () { document.body.style.overflow = prev; };
  }, []);

  useEffect(function () {
    var trigger = document.activeElement;

    var focusable = innerRef.current ? Array.from(innerRef.current.querySelectorAll(FOCUSABLE)) : [];
    if (focusable.length > 0) focusable[0].focus();

    function handleKey(e) {
      if (e.key === "Escape") { onCloseRef.current(); return; }
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
  // Empty deps on purpose — initial focus + key trap runs once per mount.
  // onClose is read via onCloseRef so a fresh function from the parent
  // doesn't retrigger the effect mid-typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onCloseRef.current();
  }

  return createPortal(
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
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
          <div id={titleId} style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
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
    </div>,
    document.body
  );
}
