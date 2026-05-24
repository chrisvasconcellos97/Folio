import { useState, useEffect } from "react";
import { C } from "../lib/colors";

// Module-level queue — only one tooltip visible at a time
var _registered = []; // [{id, key}] in mount order
var _setters = {};    // id -> setState fn
var _activeId = null;

function activateNext() {
  for (var i = 0; i < _registered.length; i++) {
    var item = _registered[i];
    try {
      if (!localStorage.getItem(item.key)) {
        _activeId = item.id;
        if (_setters[item.id]) _setters[item.id](true);
        return;
      }
    } catch(e) {}
  }
  _activeId = null;
}

export function FirstRunTooltip({ id, text, children }) {
  var key = "folio_tooltip_" + id;
  var [visible, setVisible] = useState(false);

  useEffect(function() {
    _registered.push({ id: id, key: key });
    _setters[id] = setVisible;

    if (_activeId === null) activateNext();

    return function() {
      _registered = _registered.filter(function(r) { return r.id !== id; });
      delete _setters[id];
      if (_activeId === id) { _activeId = null; activateNext(); }
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(key, "1"); } catch(e) {}
    _activeId = null;
    if (_setters[id]) _setters[id](false);
    setTimeout(activateNext, 300);
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
