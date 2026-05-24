import { useState, useRef, useEffect, useMemo } from "react";
import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { AmberBtn } from "../../components/Buttons";
import { InputField } from "../../components/InputField";
import { askPip } from "../../lib/pip";
import { latestRecord, momPct, yoyPct, fmtRevenue, fmtPct } from "../../lib/metricsUtils";
import { getNextOccurrence, getFrequencyLabel } from "../../lib/cadenceUtils";

var STARTERS = [
  "Which accounts need my attention this week?",
  "Draft a follow-up email for my last LKQ meeting.",
  "Give me a pre-meeting brief for my next call.",
  "Summarize my book health.",
];

function buildTasksGreeting(openTasks, accounts) {
  var n     = openTasks.length;
  var lines = openTasks.slice(0, 5).map(function (t) {
    var acct = t.account_id ? (accounts || []).find(function (a) { return a.id === t.account_id; }) : null;
    return "• " + t.title + (acct ? " (" + acct.name + ")" : "");
  });
  var list = lines.join("\n") + (n > 5 ? "\n…and " + (n - 5) + " more." : "");
  if (n === 1) {
    return "Hey — one quick task still open before we get into it:\n" + list + "\n\nStill needs doing, or are we clear?";
  }
  return "Hey — " + n + " quick tasks open:\n" + list + "\n\nWant to run through them or focus on something else?";
}

export function PipView({ accounts, meetings, tasks, addTask, updateTask, onAction, revenueHistory, shopMetrics, cadences }) {
  var openTasks = useMemo(function () {
    return (tasks || []).filter(function (t) { return !t.done; });
  }, [tasks]);

  var [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hey. Ready when you are. What's going on with your accounts?",
    },
  ]);
  var [input, setInput]           = useState("");
  var [loading, setLoading]       = useState(false);
  var [listening, setListening]   = useState(false);
  var [audioEnabled, setAudio]    = useState(true);
  var bottomRef                   = useRef(null);
  var taskMsgSet                  = useRef(false);
  var recognitionRef              = useRef(null);
  var voiceSupported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  function startListening() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    var r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = "en-US";
    r.onstart  = function () { setListening(true); };
    r.onend    = function () { setListening(false); };
    r.onerror  = function () { setListening(false); };
    r.onresult = function (e) {
      var transcript = e.results[0][0].transcript;
      setListening(false);
      send(transcript);
    };
    recognitionRef.current = r;
    r.start();
  }

  function stopListening() {
    if (recognitionRef.current) recognitionRef.current.stop();
    setListening(false);
  }

  function speak(text) {
    if (!audioEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }

  useEffect(function () {
    if (taskMsgSet.current || openTasks.length === 0) return;
    taskMsgSet.current = true;
    setMessages([{ role: "assistant", text: buildTasksGreeting(openTasks, accounts) }]);
  }, [openTasks, accounts]);

  useEffect(function () {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  function buildContext() {
    var rh = revenueHistory || [];
    var sm = shopMetrics    || [];
    return {
      accounts: accounts.map(function (a) {
        var latest   = latestRecord(rh, a.id);
        var shopLatest = latestRecord(sm, a.id);
        return {
          id:      a.id,
          name:    a.name,
          tier:    a.tier,
          status:  a.status,
          revenue: a.revenue,
          region:  a.region,
          tags:    a.tags,
          revenueTrend: latest ? {
            amount:    fmtRevenue(latest.revenue),
            month:     latest.month,
            year:      latest.year,
            momPct:    momPct(rh, a.id, "revenue"),
            yoyPct:    yoyPct(rh, a.id, "revenue"),
          } : null,
          shopConnections: shopLatest ? {
            connected:    shopLatest.connected,
            integrated:   shopLatest.integrated,
            no_connection: shopLatest.no_connection,
            month:        shopLatest.month,
            year:         shopLatest.year,
          } : null,
        };
      }),
      recentMeetings: meetings.slice(0, 10).map(function (m) {
        return {
          account:      m.folio_accounts ? m.folio_accounts.name : "Unknown",
          title:        m.title,
          date:         m.meeting_date,
          action_items: m.action_items,
        };
      }),
      openQuickTasks: openTasks.map(function (t) {
        var acct = t.account_id ? accounts.find(function (a) { return a.id === t.account_id; }) : null;
        return {
          id:          t.id,
          title:       t.title,
          notes:       t.notes || null,
          account:     acct ? acct.name : null,
          reminder_at: t.reminder_at || null,
        };
      }),
      upcomingTaskCadences: (cadences || []).filter(function (c) { return c.type === "task"; }).map(function (c) {
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var next  = getNextOccurrence(c, today);
        var days  = next ? Math.round((next - today) / 86400000) : null;
        return {
          task:     c.task_title,
          account:  c.folio_accounts ? c.folio_accounts.name : null,
          schedule: getFrequencyLabel(c),
          nextDue:  next ? next.toISOString().split("T")[0] : null,
          daysUntil: days,
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

  function actionLabel(action, account) {
    var name = account ? account.name : null;
    if (action.type === 'open_cadence')  return 'Set Cadence' + (name ? ' for ' + name : '') + ' →';
    if (action.type === 'open_meeting')  return 'Log Meeting' + (name ? ' for ' + name : '') + ' →';
    if (action.type === 'open_item')     return 'Add Open Item' + (name ? ' for ' + name : '') + ' →';
    if (action.type === 'open_contact')  return 'Add Contact' + (name ? ' for ' + name : '') + ' →';
    if (action.type === 'navigate')      return 'Go to ' + (action.view || 'View') + ' →';
    return 'Open →';
  }

  function executeQuickTaskAction(action) {
    if (!action) return Promise.resolve(null);
    if (action.type === "complete_task" && action.task_id && updateTask) {
      return updateTask(action.task_id, { done: true }).then(function () { return "completed"; });
    }
    if (action.type === "add_quick_task" && action.title && addTask) {
      return addTask({
        title:      action.title,
        notes:      action.notes || null,
        account_id: action.account_id || null,
      }).then(function () { return "added"; });
    }
    return Promise.resolve(null);
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
        var rawText   = data.content || data.text || "...";
        var action    = parseAction(rawText);
        var cleanText = stripAction(rawText);
        var account   = action && action.accountName ? findAccount(action.accountName) : null;
        return executeQuickTaskAction(action).then(function (result) {
          setLoading(false);
          setMessages(function (prev) {
            return prev.concat([{
              role:         "assistant",
              text:         cleanText,
              action:       action || null,
              actionAccount: account || null,
              actionResult: result,
            }]);
          });
          speak(cleanText);
        });
      })
      .catch(function (err) {
        setLoading(false);
        setMessages(function (prev) {
          return prev.concat([{
            role: "assistant",
            text: "Something went sideways on my end. Try again in a sec.",
          }]);
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
              border: "1px solid " + C.accentRing,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 28px " + C.accentLine,
            }}
          >
            <PipMark size={16} color={C.accent} glow pulse />
          </div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>
          Pip
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <div style={{ fontSize: 12, color: C.textMuted }}>Your account intelligence</div>
          {voiceSupported && (
            <button
              onClick={function () { setAudio(function (v) { if (!v) window.speechSynthesis && window.speechSynthesis.cancel(); return !v; }); }}
              title={audioEnabled ? "Mute Pip's voice" : "Unmute Pip's voice"}
              aria-label={audioEnabled ? "Mute Pip voice" : "Unmute Pip voice"}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", opacity: audioEnabled ? 1 : 0.4, lineHeight: 1 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {audioEnabled
                  ? <><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></>
                  : <><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></>
                }
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        aria-live="polite"
        aria-label="Conversation"
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
                flexDirection: "column",
                alignItems: isPip ? "flex-start" : "flex-end",
                gap: 6,
              }}
            >
              <div
                style={{
                  maxWidth: "82%",
                  background: isPip ? C.bgCard : C.accentGlow,
                  border: "1px solid " + (isPip ? C.border : C.accentLine),
                  borderRadius: isPip ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
                  padding: "10px 14px",
                  fontSize: 13,
                  color: isPip ? C.textSub : C.text,
                  lineHeight: 1.65,
                }}
              >
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
              {isPip && m.actionResult && (
                <div style={{ fontSize: 10, color: C.accent, display: "flex", alignItems: "center", gap: 5, paddingLeft: 4 }}>
                  <span style={{ color: "#4ade80" }}>✓</span>
                  {m.actionResult === "completed" ? "Task marked done" : "Task added"}
                </div>
              )}
              {isPip && m.action && onAction && (
                <button
                  onClick={function () { onAction(m.action, m.actionAccount); }}
                  style={{
                    background: C.accentGlow,
                    border: "1px solid " + C.accentRing,
                    borderRadius: 20,
                    padding: "7px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.accent,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                  }}
                >
                  {actionLabel(m.action, m.actionAccount)}
                </button>
              )}
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
          placeholder={listening ? "Listening..." : "Ask Pip anything about your accounts..."}
          style={{ flex: 1 }}
        />
        {voiceSupported && (
          <button
            onClick={listening ? stopListening : startListening}
            className={listening ? "pip-pulse" : ""}
            title={listening ? "Stop listening" : "Speak to Pip"}
            aria-label={listening ? "Stop listening" : "Speak to Pip"}
            style={{
              width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
              background: listening ? "rgba(224,92,92,0.15)" : C.accentGlow,
              border: "1px solid " + (listening ? "rgba(224,92,92,0.4)" : C.accentLine),
              color: listening ? C.red : C.accent,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {listening
                ? <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>
                : <><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3M8 22h8"/></>
              }
            </svg>
          </button>
        )}
        <AmberBtn
          onClick={function () { send(); }}
          disabled={loading || !input.trim()}
          aria-label="Send message"
          style={{ flexShrink: 0, padding: "10px 16px" }}
        >
          →
        </AmberBtn>
      </div>
    </div>
  );
}
