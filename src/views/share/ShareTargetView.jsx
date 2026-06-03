import { useState, useEffect } from "react";
import { C } from "../../lib/colors.js";
import { useAccounts } from "../../hooks/useAccounts.js";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

export function ShareTargetView({ userId, onOpenConversation, onBack }) {
  var { accounts } = useAccounts(userId);
  var [sharedText, setSharedText] = useState("");
  var [selectedAccountId, setSelectedAccountId] = useState("");

  useEffect(function () {
    var params = new URLSearchParams(window.location.search);
    var parts = [params.get("title"), params.get("text"), params.get("url")].filter(Boolean);
    setSharedText(parts.join("\n\n"));
  }, []);

  function handleStart() {
    if (!selectedAccountId) return;
    var account = (accounts || []).find(function (a) { return a.id === selectedAccountId; });
    if (!account) return;
    if (onOpenConversation) {
      onOpenConversation({ accountId: selectedAccountId, prefillNotes: sharedText });
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ fontFamily: SERIF, fontSize: 26, color: C.text, marginBottom: 6 }}>Shared note</div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 20 }}>
        Add to a meeting
      </div>

      <textarea
        value={sharedText}
        onChange={function (e) { setSharedText(e.target.value); }}
        rows={6}
        style={{
          width: "100%", boxSizing: "border-box",
          background: C.surface, border: "1px solid " + C.rule, borderRadius: 8,
          padding: "12px 14px", fontFamily: MONO, fontSize: 13, color: C.text,
          resize: "vertical", lineHeight: 1.6, marginBottom: 14, outline: "none",
        }}
        placeholder="Paste or edit notes here…"
      />

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Account</div>
        <select
          value={selectedAccountId}
          onChange={function (e) { setSelectedAccountId(e.target.value); }}
          style={{
            width: "100%", background: C.surface, border: "1px solid " + C.rule,
            borderRadius: 8, padding: "10px 12px", fontFamily: MONO, fontSize: 16,
            color: C.text, outline: "none", cursor: "pointer",
          }}
        >
          <option value="">Pick an account…</option>
          {(accounts || []).filter(function (a) { return !a.is_inactive; }).map(function (a) {
            return <option key={a.id} value={a.id}>{a.name}</option>;
          })}
        </select>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleStart}
          disabled={!selectedAccountId || !sharedText.trim()}
          style={{
            background: selectedAccountId && sharedText.trim() ? C.accent : C.surface,
            color: selectedAccountId && sharedText.trim() ? C.bg : C.textMuted,
            border: "1px solid " + (selectedAccountId && sharedText.trim() ? C.accent : C.rule),
            borderRadius: 8, padding: "10px 20px", fontFamily: MONO, fontSize: 12,
            fontWeight: 600, cursor: selectedAccountId && sharedText.trim() ? "pointer" : "default",
          }}
        >
          Open in meeting ✦
        </button>
        {onBack && (
          <button
            onClick={onBack}
            style={{ background: "none", border: "1px solid " + C.rule, borderRadius: 8, padding: "10px 16px", fontFamily: MONO, fontSize: 12, color: C.textMuted, cursor: "pointer" }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
