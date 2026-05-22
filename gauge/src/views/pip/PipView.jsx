import { useState, useRef, useEffect } from "react";
import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { GaugeIcon } from "../../components/GaugeIcon";
import { InputField } from "../../components/InputField";
import { askPip } from "../../lib/pip";

var GB     = "rgba(103,200,249,0.10)";
var GB_BDR = "rgba(103,200,249,0.28)";

var STARTERS = [
  "Which projects are overdue?",
  "Add a new project for Acme Corp",
  "What's the status of all active projects?",
  "Mark the pricing proposal as complete",
];

export function PipView({ projects, accounts, addProject, updateProject, onBack }) {
  var [messages, setMessages] = useState([{
    role: "assistant",
    text: "Hey. Ready when you are. What's going on with your projects?",
  }]);
  var [input, setInput]     = useState("");
  var [loading, setLoading] = useState(false);
  var bottomRef             = useRef(null);

  useEffect(function () {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function buildContext() {
    return {
      today:    new Date().toISOString().split("T")[0],
      projects: (projects || []).map(function (p) {
        var acct = (accounts || []).find(function (a) { return a.id === p.account_id; });
        return {
          id:           p.id,
          title:        p.title,
          account_name: acct ? acct.name : null,
          account_id:   p.account_id || null,
          status:       p.status,
          priority:     p.priority,
          due_date:     p.due_date || null,
          description:  p.description || null,
        };
      }),
      accounts: (accounts || []).map(function (a) {
        return { id: a.id, name: a.name };
      }),
    };
  }

  function parseAction(text) {
    try {
      var match = text.match(/<pip-action>([\s\S]*?)<\/pip-action>/);
      if (!match) return null;
      return JSON.parse(match[1].trim());
    } catch (e) { return null; }
  }

  function stripAction(text) {
    return text.replace(/<pip-action>[\s\S]*?<\/pip-action>/g, "").trim();
  }

  function executeAction(action) {
    if (!action) return Promise.resolve(null);

    if (action.type === "add_project") {
      return addProject({
        title:       action.title,
        description: action.description || null,
        status:      action.status || "active",
        priority:    action.priority || "medium",
        due_date:    action.due_date || null,
        account_id:  action.account_id || null,
      }).then(function () { return "added"; });
    }

    if (action.type === "update_project" && action.project_id && action.changes) {
      return updateProject(action.project_id, action.changes)
        .then(function () { return "updated"; });
    }

    return Promise.resolve(null);
  }

  function send(text) {
    var msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");

    var newMessages = messages.concat([{ role: "user", text: msg }]);
    setMessages(newMessages);
    setLoading(true);

    var apiMessages = newMessages.map(function (m) {
      return { role: m.role === "assistant" ? "assistant" : "user", content: m.text };
    });

    askPip(apiMessages, buildContext())
      .then(function (data) {
        var rawText   = data.content || "";
        var action    = parseAction(rawText);
        var cleanText = stripAction(rawText);

        return executeAction(action).then(function (result) {
          setLoading(false);
          setMessages(function (prev) {
            return prev.concat([{
              role:         "assistant",
              text:         cleanText,
              action:       action,
              actionResult: result,
            }]);
          });
        });
      })
      .catch(function (err) {
        setLoading(false);
        setMessages(function (prev) {
          return prev.concat([{
            role: "assistant",
            text: err.message || "Something went sideways on my end. Try again in a sec.",
          }]);
        });
      });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "calc(100vh - 80px)", maxHeight: 760,
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", padding: "20px 0 16px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: GB, border: "1px solid rgba(103,200,249,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 28px rgba(103,200,249,0.18)",
            animation: "pipFloat 3s ease-in-out infinite",
          }}>
            <PipMark size={16} color={C.accent} glow pulse />
          </div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>Pip</div>
        <div style={{ fontSize: 12, color: C.textMuted }}>Your project intelligence</div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "0 4px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {messages.map(function (m, i) {
          var isPip = m.role === "assistant";
          return (
            <div key={i} style={{
              display: "flex", flexDirection: "column",
              alignItems: isPip ? "flex-start" : "flex-end", gap: 6,
            }}>
              <div style={{
                maxWidth: "82%",
                background:  isPip ? C.bgCard : "rgba(103,200,249,0.08)",
                border: "1px solid " + (isPip ? C.border : "rgba(103,200,249,0.2)"),
                borderRadius: isPip ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
                padding: "10px 14px",
                fontSize: 13, color: isPip ? C.textSub : C.text, lineHeight: 1.65,
              }}>
                {isPip && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                    <PipMark size={6} color={C.accent} />
                    <span style={{ fontSize: 9, color: C.accent, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Pip
                    </span>
                  </div>
                )}
                {m.text}
              </div>

              {/* Action result confirmation */}
              {isPip && m.actionResult && (
                <div style={{
                  fontSize: 10, color: C.accent,
                  display: "flex", alignItems: "center", gap: 5, paddingLeft: 4,
                }}>
                  <span style={{ color: "#4ade80" }}>✓</span>
                  {m.actionResult === "added" ? "Project added" : "Project updated"}
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{
              background: C.bgCard, border: "1px solid " + C.border,
              borderRadius: "4px 12px 12px 12px",
              padding: "10px 16px",
              display: "flex", gap: 5, alignItems: "center",
            }}>
              {[0, 1, 2].map(function (d) {
                return (
                  <div key={d} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: C.accentDim,
                    animation: "pipPulse 1.2s ease-in-out " + (d * 0.2) + "s infinite",
                  }} />
                );
              })}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Starters */}
      {messages.length === 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 0" }}>
          {STARTERS.map(function (s, i) {
            return (
              <button key={i} onClick={function () { send(s); }} style={{
                background: C.bgCardAlt, border: "1px solid " + C.border,
                borderRadius: 20, padding: "5px 12px",
                fontSize: 11, color: C.textSub,
                fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                whiteSpace: "nowrap",
              }}>
                {s}
              </button>
            );
          })}
        </div>
      )}

      {/* Input */}
      <div style={{ paddingTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <InputField
          value={input}
          onChange={function (e) { setInput(e.target.value); }}
          onKeyDown={handleKeyDown}
          placeholder="Ask Pip anything about your projects…"
          style={{ flex: 1 }}
        />
        <button
          onClick={function () { send(); }}
          disabled={loading || !input.trim()}
          style={{
            background: loading || !input.trim() ? GB : C.accent,
            border: "1px solid " + (loading || !input.trim() ? C.border : C.accent),
            borderRadius: 24, padding: "10px 16px",
            fontSize: 13, fontWeight: 700,
            color: loading || !input.trim() ? C.textMuted : C.bg,
            fontFamily: "'DM Sans', sans-serif",
            cursor: loading || !input.trim() ? "default" : "pointer",
            flexShrink: 0,
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}
