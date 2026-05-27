import { useState, useRef, useEffect, useMemo } from "react";
import { C } from "../../lib/colors";
import { PipOrb } from "../../components/PipMark";
import { AmberBtn } from "../../components/Buttons";
import { InputField } from "../../components/InputField";
import { MarkdownText } from "../../components/MarkdownText";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";
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

export function PipView({ accounts, meetings, items, contacts, tasks, addTask, updateTask, onAction, revenueHistory, shopMetrics, cadences, projects }) {
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
  var [audioEnabled, setAudio]    = useState(false);
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
    var allItems    = items    || [];
    var allContacts = contacts || [];
    var allMeetings = meetings || [];
    return {
      accounts: accounts.map(function (a) {
        var latest   = latestRecord(rh, a.id);
        var shopLatest = latestRecord(sm, a.id);
        var acctMeetings = allMeetings.filter(function (m) { return m.account_id === a.id; })
          .slice(0, 8)
          .map(function (m) {
            return {
              date:         m.meeting_date,
              title:        m.title,
              notes:        m.notes,
              action_items: m.action_items,
              commitments:  m.commitments,
              follow_up:    m.follow_up_date,
              summary:      m.pip_summary,
              attendees:    m.attendees,
            };
          });
        var openItems = allItems.filter(function (i) { return i.account_id === a.id && !i.done; })
          .map(function (i) { return { text: i.text, due: i.due_date, owner: i.owner }; });
        var acctContacts = allContacts.filter(function (c) { return c.account_id === a.id; })
          .map(function (c) { return { name: c.name, title: c.title, email: c.email, phone: c.phone, is_poc: c.is_poc }; });
        var acctProjects = (projects || [])
          .filter(function (p) { return p.account_id === a.id && p.status !== "complete" && p.status !== "on_hold"; })
          .map(function (p) { return { title: p.title, status: p.status, due_date: p.due_date }; });
        return {
          id:      a.id,
          name:    a.name,
          tier:    a.tier,
          status:  a.status,
          revenue: a.revenue,
          revenue_amount: a.revenue_amount,
          notes:   a.objective,
          last_interaction_at: a.last_interaction_at,
          region:  a.region,
          tags:    a.tags,
          meetings:       acctMeetings,
          openItems:      openItems,
          contacts:       acctContacts,
          activeProjects: acctProjects,
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
      activeGaugeProjects: (projects || [])
        .filter(function(p) { return p.status === "in_progress" || p.status === "blocked"; })
        .map(function(p) {
          var acct = accounts.find(function(a) { return a.id === p.account_id; });
          return {
            title:   p.title,
            status:  p.status,
            account: acct ? acct.name : null,
            due_date: p.due_date || null,
          };
        }),
      recentDeliveries: (projects || [])
        .filter(function(p) { return p.status === "complete"; })
        .sort(function(a, b) { return (b.updated_at || "") > (a.updated_at || "") ? 1 : -1; })
        .slice(0, 5)
        .map(function(p) {
          var acct = accounts.find(function(a) { return a.id === p.account_id; });
          return {
            title:   p.title,
            account: acct ? acct.name : null,
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
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "16px 0 14px",
        borderBottom: "1px solid " + C.rule,
        marginBottom: 16,
      }}>
        <PipOrb size="md" sonar />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
            Pip
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 3 }}>
            Account Intelligence · {listening ? "Listening" : "Ready"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {voiceSupported && (
            <button
              onClick={function () { setAudio(function (v) { if (!v) window.speechSynthesis && window.speechSynthesis.cancel(); return !v; }); }}
              title={audioEnabled ? "Mute Pip's voice" : "Unmute Pip's voice"}
              aria-label={audioEnabled ? "Mute Pip voice" : "Unmute Pip voice"}
              style={{
                width: 28, height: 28, borderRadius: 6, cursor: "pointer",
                background: "transparent", border: "1px solid " + C.rule,
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: audioEnabled ? 1 : 0.4,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {audioEnabled
                  ? <><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></>
                  : <><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></>
                }
              </svg>
            </button>
          )}
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textFaint }}>
            {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </div>
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
              {isPip ? (
                <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 10, maxWidth: "82%" }}>
                  <PipOrb size="sm" />
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                      PIP · {i === 0 ? "JUST NOW" : "EARLIER"}
                    </div>
                    <MarkdownText
                      text={m.text}
                      style={{ fontFamily: SERIF, fontSize: 17, color: C.text, lineHeight: 1.5 }}
                    />
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    maxWidth: "50ch",
                    background: C.surface2,
                    borderRadius: "12px 12px 4px 12px",
                    padding: "10px 14px",
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: 14,
                    color: C.text,
                    lineHeight: 1.5,
                  }}
                >
                  {m.text}
                </div>
              )}
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
                    background: C.accentDeep,
                    border: "none",
                    borderRadius: 6,
                    padding: "7px 14px",
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: C.bg,
                    cursor: "pointer",
                    marginLeft: 42,
                  }}
                >
                  {actionLabel(m.action, m.actionAccount)}
                </button>
              )}
            </div>
          );
        })}

        {loading && (
          <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 10, alignItems: "center" }}>
            <PipOrb size="sm" />
            <div
              style={{
                background: C.surface,
                border: "1px solid " + C.rule,
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
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: C.accentDim,
                      animation: "pip-breathe 1.2s ease-in-out " + d * 0.2 + "s infinite",
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
                  background: "transparent",
                  border: "1px solid " + C.rule,
                  borderRadius: 999,
                  padding: "5px 13px",
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: C.textSoft,
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
          borderTop: "1px solid " + C.rule,
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
          style={{ flex: 1, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 15 }}
        />
        {voiceSupported && (
          <button
            onClick={listening ? stopListening : startListening}
            className={listening ? "pip-pulse" : ""}
            title={listening ? "Stop listening" : "Speak to Pip"}
            aria-label={listening ? "Stop listening" : "Speak to Pip"}
            style={{
              width: 38, height: 38, borderRadius: 6, flexShrink: 0,
              background: listening ? C.redFaint : "transparent",
              border: "1px solid " + (listening ? C.redLine : C.rule),
              color: listening ? C.red : C.textMuted,
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
        <button
          onClick={function () { send(); }}
          disabled={loading || !input.trim()}
          aria-label="Send message"
          style={{
            flexShrink: 0, padding: "10px 18px",
            background: C.accentDeep, color: C.bg,
            border: "none", borderRadius: 6,
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 14, fontWeight: 600,
            cursor: loading || !input.trim() ? "default" : "pointer",
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}
