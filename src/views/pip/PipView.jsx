import { useState, useRef, useEffect } from "react";
import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { AmberBtn } from "../../components/Buttons";
import { InputField } from "../../components/InputField";
import { askPip } from "../../lib/pip";

var STARTERS = [
  "Which accounts need my attention this week?",
  "Draft a follow-up email for my last LKQ meeting.",
  "Give me a pre-meeting brief for my next call.",
  "Summarize my book health.",
];

export function PipView({ accounts, meetings, onAction }) {
  var [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hey. Ready when you are. What's going on with your accounts?",
    },
  ]);
  var [input, setInput]     = useState("");
  var [loading, setLoading] = useState(false);
  var bottomRef             = useRef(null);

  useEffect(function () {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  function buildContext() {
    return {
      accounts: accounts.map(function (a) {
        return {
          id:      a.id,
          name:    a.name,
          tier:    a.tier,
          status:  a.status,
          revenue: a.revenue,
          region:  a.region,
          tags:    a.tags,
        };
      }),
      recentMeetings: meetings.slice(0, 10).map(function (m) {
        return {
          account:     m.folio_accounts ? m.folio_accounts.name : "Unknown",
          title:       m.title,
          date:        m.meeting_date,
          action_items: m.action_items,
        };
      }),
    };
  }

  function parseAction(text) {
    try {
      var match = text.match(/<pip-action>([\s\S]*?)<\/pip-action>/);
      if (!match) return null;
      return JSON.parse(match[1].trim());
    } catch (e) {
      return null;
    }
  }

  function stripAction(text) {
    return text.replace(/<pip-action>[\s\S]*?<\/pip-action>/g, "").trim();
  }

  function findAccount(name) {
    if (!name) return null;
    var lower = name.toLowerCase();
    return accounts.find(function (a) {
      return a.name.toLowerCase() === lower ||
             a.name.toLowerCase().includes(lower) ||
             lower.includes(a.name.toLowerCase());
    }) || null;
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
        setLoading(false);
        var rawText = data.content || data.text || "...";
        var action  = parseAction(rawText);
        var cleanText = stripAction(rawText);
        setMessages(function (prev) {
          return prev.concat([{ role: "assistant", text: cleanText }]);
        });
        if (action && onAction) {
          var account = action.accountName ? findAccount(action.accountName) : null;
          onAction(action, account);
        }
      })
      .catch(function (err) {
        setLoading(false);
        setMessages(function (prev) {
          return prev.concat([
            {
              role: "assistant",
              text: "Something went sideways on my end. Try again in a sec.",
            },
          ]);
        });
      });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 120px)",
        maxHeight: 700,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", padding: "20px 0 16px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <div
            className="pip-sonar"
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: C.accentGlow,
              border: "1px solid rgba(200,136,58,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 28px rgba(200,136,58,0.18)",
            }}
          >
            <PipMark size={16} color={C.accent} glow pulse />
          </div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>
          Pip
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>
          Your account intelligence
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 4px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map(function (m, i) {
          var isPip = m.role === "assistant";
          return (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: isPip ? "flex-start" : "flex-end",
              }}
            >
              <div
                style={{
                  maxWidth: "82%",
                  background: isPip ? C.bgCard : "rgba(200,136,58,0.12)",
                  border: "1px solid " + (isPip ? C.border : "rgba(200,136,58,0.2)"),
                  borderRadius: isPip ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
                  padding: "10px 14px",
                  fontSize: 13,
                  color: isPip ? C.textSub : C.text,
                  lineHeight: 1.65,
                }}
              >
                {isPip && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      marginBottom: 5,
                    }}
                  >
                    <PipMark size={6} color={C.accent} />
                    <span
                      style={{
                        fontSize: 9,
                        color: C.accent,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      Pip
                    </span>
                  </div>
                )}
                {m.text}
              </div>
            </div>
          );
        })}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                background: C.bgCard,
                border: "1px solid " + C.border,
                borderRadius: "4px 12px 12px 12px",
                padding: "10px 16px",
                display: "flex",
                gap: 5,
                alignItems: "center",
              }}
            >
              {[0, 1, 2].map(function (d) {
                return (
                  <div
                    key={d}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: C.accentDim,
                      animation: "pipPulse 1.2s ease-in-out " + d * 0.2 + "s infinite",
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Starters (only show if only the first greeting message) */}
      {messages.length === 1 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: "10px 0",
          }}
        >
          {STARTERS.map(function (s, i) {
            return (
              <button
                key={i}
                onClick={function () { send(s); }}
                style={{
                  background: C.bgPill,
                  border: "1px solid " + C.border,
                  borderRadius: 20,
                  padding: "5px 12px",
                  fontSize: 11,
                  color: C.textSub,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}

      {/* Input */}
      <div
        style={{
          paddingTop: 12,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <InputField
          value={input}
          onChange={function (e) { setInput(e.target.value); }}
          onKeyDown={handleKeyDown}
          placeholder="Ask Pip anything about your accounts..."
          style={{ flex: 1 }}
        />
        <AmberBtn
          onClick={function () { send(); }}
          disabled={loading || !input.trim()}
          style={{ flexShrink: 0, padding: "10px 16px" }}
        >
          →
        </AmberBtn>
      </div>
    </div>
  );
}
