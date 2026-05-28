import { useState, useEffect, useRef } from "react";
import { C } from "../lib/colors";

export function CommandPalette({ accounts, contacts, onSelectAccount, onSelectContact, onNavigate, onClose }) {
  var [query, setQuery] = useState("");
  var [idx, setIdx] = useState(0);
  var inputRef = useRef(null);

  useEffect(function() { if (inputRef.current) inputRef.current.focus(); }, []);

  var NAV_ITEMS = [
    { label: "Accounts",  action: function() { onNavigate("accounts"); } },
    { label: "Meetings",  action: function() { onNavigate("meetings"); } },
    { label: "Pipeline",  action: function() { onNavigate("pipeline"); } },
    { label: "Cadence",   action: function() { onNavigate("cadence"); } },
    { label: "Gauge",     action: function() { onNavigate("gauge"); } },
    { label: "Pip",       action: function() { onNavigate("pip"); } },
  ];

  var q = query.trim().toLowerCase();
  var accountResults = q
    ? (accounts || []).filter(function(a) {
        return a.name.toLowerCase().includes(q)
          || (a.tags && a.tags.some(function(t) { return t.toLowerCase().includes(q); }))
          || (a.region && a.region.toLowerCase().includes(q));
      }).slice(0, 6).map(function(a) {
        var sub = a.tier || a.region || "";
        if (a.is_inactive) sub = (sub ? sub + " · " : "") + (a.merged_into_account_id ? "Merged" : "Inactive");
        return { label: a.name, sub: sub, group: "Accounts", action: function() { onSelectAccount(a); } };
      })
    : [];
  var contactResults = q && contacts && onSelectContact
    ? contacts.filter(function(c) {
        return (c.name && c.name.toLowerCase().includes(q))
          || (c.email && c.email.toLowerCase().includes(q))
          || (c.title && c.title.toLowerCase().includes(q));
      }).slice(0, 6).map(function(c) {
        var acct = (accounts || []).find(function(a) { return a.id === c.account_id; });
        return {
          label: c.name,
          sub: (c.title ? c.title : "") + (acct ? (c.title ? " · " : "") + acct.name : ""),
          group: "Contacts",
          action: function() { onSelectContact(c); },
        };
      })
    : [];
  var navResults = NAV_ITEMS.filter(function(n) { return !q || n.label.toLowerCase().includes(q); })
    .map(function(n) { return Object.assign({}, n, { group: "Navigate" }); });
  var results = accountResults.concat(contactResults).concat(navResults);

  useEffect(function() { setIdx(0); }, [query]);

  function handleKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(function(i) { return Math.min(i + 1, results.length - 1); }); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setIdx(function(i) { return Math.max(i - 1, 0); }); }
    if (e.key === "Enter" && results[idx]) { results[idx].action(); onClose(); }
    if (e.key === "Escape") { onClose(); }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 120,
      }}
    >
      <div
        onClick={function(e) { e.stopPropagation(); }}
        style={{
          background: C.bgCard, border: "1px solid " + C.borderBright, borderRadius: 14,
          width: "100%", maxWidth: 480, boxShadow: "0 24px 60px rgba(0,0,0,0.5)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 16px", borderBottom: "1px solid " + C.border }}>
          <input
            ref={inputRef}
            value={query}
            onChange={function(e) { setQuery(e.target.value); }}
            onKeyDown={handleKey}
            placeholder="Jump to account or view…"
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              fontSize: 16, color: C.text, fontFamily: "'Inter', system-ui, sans-serif",
            }}
          />
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {results.length === 0 && (
            <div style={{ padding: "20px 16px", color: C.textMuted, fontSize: 13, textAlign: "center" }}>No results</div>
          )}
          {results.map(function(r, i) {
            var active = i === idx;
            var prevGroup = i > 0 ? results[i - 1].group : null;
            var showHeader = r.group && r.group !== prevGroup;
            return (
              <div key={i}>
                {showHeader && (
                  <div style={{
                    padding: "8px 16px 2px", fontSize: 9.5, fontWeight: 700,
                    color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em",
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  }}>
                    {r.group}
                  </div>
                )}
                <div
                  onClick={function() { r.action(); onClose(); }}
                  style={{
                    padding: "10px 16px", cursor: "pointer", display: "flex", alignItems: "center",
                    gap: 10, background: active ? C.accentFaint : "transparent",
                    borderLeft: "2px solid " + (active ? C.accent : "transparent"),
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: C.text, fontWeight: active ? 500 : 400 }}>{r.label}</div>
                    {r.sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{r.sub}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "8px 16px", borderTop: "1px solid " + C.border, display: "flex", gap: 12 }}>
          <span style={{ fontSize: 10, color: C.textMuted }}>↑↓ navigate</span>
          <span style={{ fontSize: 10, color: C.textMuted }}>↵ select</span>
          <span style={{ fontSize: 10, color: C.textMuted }}>esc close</span>
        </div>
      </div>
    </div>
  );
}
