import { useState, useEffect, useRef } from "react";
import { C } from "../lib/colors";

export function InfoTip({ text, position }) {
  // position: "above" (default) | "below"
  var [open, setOpen] = useState(false);
  var ref = useRef(null);
  var tooltipId = useRef("infotip-" + Math.floor(Math.random() * 1e9)).current;

  // Close on outside click/tap
  useEffect(function () {
    if (!open) return;
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return function () {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [open]);

  var pos = position || "above";

  return (
    <span
      ref={ref}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", flexShrink: 0 }}
    >
      <button
        type="button"
        onMouseEnter={function () { setOpen(true); }}
        onMouseLeave={function () { setOpen(false); }}
        onClick={function (e) { e.stopPropagation(); setOpen(function (o) { return !o; }); }}
        aria-label="More info"
        aria-describedby={open ? tooltipId : undefined}
        style={{
          background: "none", border: "none", padding: "0 2px",
          cursor: "pointer", color: C.textFaint,
          fontSize: 11, lineHeight: 1, fontFamily: "system-ui, sans-serif",
          fontWeight: 600, display: "inline-flex", alignItems: "center",
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
      >ⓘ</button>
      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          style={{
            position: "absolute",
            [pos === "below" ? "top" : "bottom"]: "calc(100% + 6px)",
            left: "50%", transform: "translateX(-50%)",
            background: C.surface, border: "1px solid " + C.rule,
            borderRadius: 8, padding: "8px 10px",
            width: 210, fontSize: 11, color: C.textSoft,
            lineHeight: 1.5, zIndex: 300,
            boxShadow: "0 4px 16px var(--c-overlay-shadow-soft)",
            whiteSpace: "normal", textAlign: "left",
            pointerEvents: "none",
          }}>
          {text}
          <div style={{
            position: "absolute",
            [pos === "below" ? "bottom" : "top"]: "100%",
            left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            [pos === "below" ? "borderBottom" : "borderTop"]: "5px solid " + C.rule,
          }} />
        </div>
      )}
    </span>
  );
}
