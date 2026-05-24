import { useState, useEffect } from "react";
import { C } from "../lib/colors";

export function FirstRunTooltip({ id, text, children }) {
  var key = "folio_tooltip_" + id;
  var [visible, setVisible] = useState(false);

  useEffect(function() {
    try {
      if (!localStorage.getItem(key)) setVisible(true);
    } catch(e) {}
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(key, "1"); } catch(e) {}
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {children}
      {visible && (
        <div
          onClick={dismiss}
          style={{
            position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
            transform: "translateX(-50%)",
            background: C.bgCardAlt, border: "1px solid " + C.accentLine,
            borderRadius: 8, padding: "8px 12px", width: 200,
            fontSize: 11, color: C.textSub, lineHeight: 1.5,
            zIndex: 200, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            whiteSpace: "normal", textAlign: "center",
          }}
        >
          {text}
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>Tap to dismiss</div>
          <div style={{
            position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
            borderTop: "5px solid " + C.accentLine,
          }} />
        </div>
      )}
    </div>
  );
}
