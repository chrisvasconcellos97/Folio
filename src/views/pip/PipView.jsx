import { useState, useRef, useEffect, useMemo } from "react";
import { C } from "../../lib/colors";
import { PipOrb } from "../../components/PipMark";
import { InputField } from "../../components/InputField";
import { MarkdownText } from "../../components/MarkdownText";
import { PipActionBatch } from "../../components/PipActionBatch";
import { PipActionCard } from "../../components/PipActionCard";
import { showToast } from "../../components/Toast";
import { executeTool } from "../../lib/pipExecutor";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";
import { askPip, classifyIntent } from "../../lib/pip";
import { getNextOccurrence, getFrequencyLabel } from "../../lib/cadenceUtils";
import { routeToolCall, planToolCalls, describeToolCall, classifyTool, CONFIRM_THRESHOLD } from "../../lib/pipTools";
// (CONFIRM_THRESHOLD re-export below; routeToolCall still used by executeTools.)
import { usePipFacts } from "../../hooks/usePipFacts";
import { usePipAccountState, findStaleAccountIds } from "../../hooks/usePipAccountState";
import { usePipState } from "../../lib/pipState";
import { useRecentThemes } from "../../hooks/useRecentThemes";
import { useUserProfile } from "../../hooks/useUserProfile";

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

export function PipView(props) {
  var accounts        = props.accounts;
  var meetings        = props.meetings;
  var items           = props.items;
  var contacts        = props.contacts;
  var tasks           = props.tasks;
  var addTask         = props.addTask;
  var updateTask      = props.updateTask;
  var onAction        = props.onAction;
  var cadences        = props.cadences;
  var projects        = props.projects;
  var updates         = props.updates || [];
  // Optional Phase 2 wiring — caller may pass these from App.jsx. If absent
  // the corresponding tools simply turn into no-ops.
  var userId          = props.userId;
  var addItem         = props.addItem;
  var addMeeting      = props.addMeeting;
  var addCadence      = props.addCadence;
  var updateAccount   = props.updateAccount;
  var setFollowUp     = props.setFollowUp;
  var onNavigate      = props.onNavigate;
  // Gauge V3 — caller passes the user's lens so Pip's framing branches per-view.
  var lens            = props.lens || "am";

  var pipFacts        = usePipFacts(userId);
  var pipAcctState    = usePipAccountState(userId);
  var recentThemes    = useRecentThemes(userId);
  var userProfileApi  = useUserProfile(userId);
  var userProfile     = userProfileApi.profile;

  var openTasks = useMemo(function () {
    return (tasks || []).filter(function (t) { return !t.done; });
  }, [tasks]);

  var PIP_HISTORY_KEY = "folio_pip_messages_" + (userId || "anon");
  var PIP_HISTORY_LIMIT = 200;
  var [messages, setMessages] = useState(function () {
    try {
      var raw = localStorage.getItem(PIP_HISTORY_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [{ role: "assistant", text: "Hey. Ready when you are. What's going on with your accounts?" }];
  });

  useEffect(function () {
    try {
      var trimmed = messages.length > PIP_HISTORY_LIMIT ? messages.slice(-PIP_HISTORY_LIMIT) : messages;
      localStorage.setItem(PIP_HISTORY_KEY, JSON.stringify(trimmed));
    } catch (e) {}
  }, [messages, PIP_HISTORY_KEY]);
  var [input, setInput]           = useState("");
  var [loading, setLoading]       = useState(false);
  var [listening, setListening]   = useState(false);
  var pipMood                     = usePipState();
  useEffect(function () {
    pipMood.setSpeaking(loading);
    return function () { pipMood.setSpeaking(false); };
  }, [loading, pipMood]);
  var [audioEnabled, setAudio]    = useState(false);
  var bottomRef                   = useRef(null);
  var taskMsgSet                  = useRef(false);
  var recognitionRef              = useRef(null);
  var stateRefreshFired           = useRef(false);
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
    if (messages.length > 1) { taskMsgSet.current = true; return; }
    taskMsgSet.current = true;
    setMessages([{ role: "assistant", text: buildTasksGreeting(openTasks, accounts) }]);
  }, [openTasks, accounts, messages.length]);

  useEffect(function () {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Fire-and-forget rolling-state refresh on mount when stale rows exist.
  useEffect(function () {
    if (!userId || stateRefreshFired.current) return;
    if (!accounts || !accounts.length) return;
    if (pipAcctState.loading) return;
    stateRefreshFired.current = true;
    var stale = findStaleAccountIds(accounts, pipAcctState.states, 20);
    if (stale.length) {
      pipAcctState.refreshState(stale);
    }
  }, [userId, accounts, pipAcctState.loading, pipAcctState.states]);

  function buildContext() {
    var allItems    = items    || [];
    var allContacts = contacts || [];
    var allMeetings = meetings || [];
    var allUpdates  = updates  || [];
    var cachedStateMap = {};
    (pipAcctState.states || []).forEach(function (s) {
      if (s.stale_at && new Date(s.stale_at).getTime() > Date.now()) {
        cachedStateMap[s.account_id] = s.state_prose;
      }
    });
    return {
      accounts: accounts.map(function (a) {
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
          .map(function (i) { return { text: i.text, due: i.due_date, owner: i.owner, is_commitment: !!i.is_commitment }; });
        var acctContacts = allContacts.filter(function (c) { return c.account_id === a.id; })
          .map(function (c) { return { name: c.name, title: c.title, email: c.email, phone: c.phone, is_poc: c.is_poc }; });
        var acctProjects = (projects || [])
          .filter(function (p) { return p.account_id === a.id && p.status !== "complete" && p.status !== "on_hold"; })
          .map(function (p) { return { title: p.title, status: p.status, due_date: p.due_date }; });
        var acctUpdates = allUpdates
          .filter(function (u) { return u.account_id === a.id; })
          .slice(0, 6)
          .map(function (u) {
            return {
              update_date:     u.update_date,
              update_type:     u.update_type,
              title:           u.title,
              description:     u.description,
              owner:           u.owner,
              observed_impact: u.observed_impact,
            };
          });
        return {
          id:      a.id,
          name:    a.name,
          tier:    a.tier,
          status:  a.status,
          account_type: a.account_type || "standard",
          agreement_end_date: a.agreement_end_date || null,
          scope_summary: a.scope_summary || null,
          billing_terms: a.billing_terms || null,
          spend_ytd: a.spend_ytd != null ? a.spend_ytd : null,
          notes:   a.objective,
          last_interaction_at: a.last_interaction_at,
          region:  a.region,
          tags:    a.tags,
          owner_user_id: a.owner_user_id || null,
          meetings:       acctMeetings,
          openItems:      openItems,
          contacts:       acctContacts,
          activeProjects:  acctProjects,
          recentUpdates:   acctUpdates,
          cachedState:     cachedStateMap[a.id] || null,
          portfolioThemes: recentThemes,
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
      userId: userId || null,
    };
  }

  // Build the tool-routing context once per send. Wraps callbacks + accounts
  // so each routeToolCall() can fire writes via the user's session.
  function buildToolCtx() {
    return {
      accounts:      accounts,
      addTask:       addTask,
      updateTask:    updateTask,
      addItem:       addItem,
      addMeeting:    addMeeting,
      addCadence:    addCadence,
      updateAccount: updateAccount,
      setFollowUp:   setFollowUp,
      addFact:       pipFacts.addFact,
      onOpenAction:  onAction,
      onNavigate:    onNavigate,
    };
  }

  // Sequentially run a set of tool calls through the unified executor.
  // Used for the "immediate" batch (frictionless tools) right after stream.
  function executeTools(toolCalls) {
    if (!toolCalls || !toolCalls.length) return Promise.resolve([]);
    var hooks = buildToolCtx();
    return toolCalls.reduce(function (chain, tc) {
      return chain.then(function (results) {
        return executeTool({ tool: tc, hooks: hooks }).then(function (r) {
          results.push(r);
          return results;
        });
      });
    }, Promise.resolve([])).then(function (results) {
      var executed = results.filter(function (r) { return r && r.ok; }).length;
      var errored  = results.filter(function (r) { return r && !r.ok && r.kind === "error"; }).length;
      if (executed > 0) {
        showToast(executed + " action" + (executed === 1 ? "" : "s") + " done");
      }
      if (errored > 0) {
        showToast(errored + " action" + (errored === 1 ? "" : "s") + " failed", "warning");
      }
      return results;
    });
  }

  // Execute one confirm-required tool from a card.
  function handleConfirmOne(msgIdx, tool) {
    var hooks = buildToolCtx();
    return executeTool({ tool: tool, hooks: hooks }).then(function (r) {
      if (r.ok) {
        showToast(r.message || "Done");
        // Drop from this message's pending list
        setMessages(function (prev) {
          var next = prev.slice();
          var m = next[msgIdx];
          if (m && m.pending) {
            var remaining = m.pending.filter(function (t) { return (t.id || t.name) !== (tool.id || tool.name); });
            next[msgIdx] = Object.assign({}, m, { pending: remaining.length ? remaining : null });
          }
          return next;
        });
      } else {
        showToast(r.message || r.error || "Failed", "warning");
      }
      return r;
    });
  }

  // Fire every still-pending action on a message in sequence.
  function handleConfirmAll(msgIdx, tools) {
    var hooks = buildToolCtx();
    return tools.reduce(function (chain, t) {
      return chain.then(function (results) {
        return executeTool({ tool: t, hooks: hooks }).then(function (r) {
          results.push(r);
          return results;
        });
      });
    }, Promise.resolve([])).then(function (results) {
      var executed = results.filter(function (r) { return r && r.ok; }).length;
      var errored  = results.filter(function (r) { return r && !r.ok; }).length;
      if (executed) showToast(executed + " action" + (executed === 1 ? "" : "s") + " done");
      if (errored)  showToast(errored  + " action" + (errored  === 1 ? "" : "s") + " failed", "warning");
      // Clear all confirmed tools from pending
      var firedIds = {};
      tools.forEach(function (t) { firedIds[t.id || t.name] = true; });
      setMessages(function (prev) {
        var next = prev.slice();
        var m = next[msgIdx];
        if (m && m.pending) {
          var remaining = m.pending.filter(function (t) { return !firedIds[t.id || t.name]; });
          next[msgIdx] = Object.assign({}, m, { pending: remaining.length ? remaining : null });
        }
        return next;
      });
      return results;
    });
  }

  // Skip (drop without firing) a single card from a batch.
  function handleDiscardOne(msgIdx, toolId) {
    setMessages(function (prev) {
      var next = prev.slice();
      var m = next[msgIdx];
      if (m && m.pending) {
        var remaining = m.pending.filter(function (t) { return (t.id || t.name) !== toolId; });
        var discardedList = (m.discardedItems || []).concat([toolId]);
        next[msgIdx] = Object.assign({}, m, {
          pending: remaining.length ? remaining : null,
          discardedItems: discardedList,
        });
      }
      return next;
    });
  }

  // Drop every still-pending card without firing.
  function handleDiscardAll(msgIdx) {
    setMessages(function (prev) {
      var next = prev.slice();
      var m = next[msgIdx];
      if (m) {
        next[msgIdx] = Object.assign({}, m, { pending: null, discarded: true });
      }
      return next;
    });
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

    // Fast path: deterministic answer with no API call at all.
    var ctxForIntent = buildContext();
    var intent = classifyIntent(msg, ctxForIntent);
    if (intent.deterministicAnswer) {
      setLoading(false);
      setMessages(function (prev) {
        return prev.concat([{ role: "assistant", text: intent.deterministicAnswer }]);
      });
      speak(intent.deterministicAnswer);
      return;
    }

    // Reserve a slot for the streaming assistant message.
    var streamIdx = newMessages.length;
    var streamingText = "";
    setMessages(function (prev) {
      return prev.concat([{ role: "assistant", text: "", streaming: true }]);
    });

    function onDelta(chunk) {
      streamingText += chunk;
      setMessages(function (prev) {
        var next = prev.slice();
        if (next[streamIdx]) {
          next[streamIdx] = Object.assign({}, next[streamIdx], { text: streamingText, streaming: true });
        }
        return next;
      });
    }

    var opts = {
      onDelta: onDelta,
      mode: intent.mode,
      facts: pipFacts.activeFactStrings,
      lens: lens,
      profileProse: userProfile && userProfile.profile_prose ? userProfile.profile_prose : undefined,
    };

    askPip(apiMessages, ctxForIntent, opts)
      .then(function (data) {
        var rawText   = data.content || streamingText || "...";
        var toolCalls = data.toolCalls || [];

        // Split: frictionless fires now, confirm-required goes into card(s).
        var plan = planToolCalls(toolCalls);

        setLoading(false);
        setMessages(function (prev) {
          var next = prev.slice();
          next[streamIdx] = {
            role:      "assistant",
            text:      rawText,
            toolCalls: toolCalls,
            pending:   plan.confirm.length ? plan.confirm : null,
            mode:      plan.mode,
          };
          return next;
        });
        speak(rawText);

        if (plan.immediate.length) {
          executeTools(plan.immediate);
        }
      })
      .catch(function (err) {
        setLoading(false);
        setMessages(function (prev) {
          var next = prev.slice();
          next[streamIdx] = {
            role: "assistant",
            text: "Something went sideways on my end. Try again in a sec.",
          };
          return next;
        });
      });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function renderToolReceipts(m, idx) {
    if (!m.toolCalls || !m.toolCalls.length) return null;
    if (m.discarded) return null;
    // Only receipt the tools that already fired (immediate / frictionless).
    // Confirm-required tools still in `pending` are NOT receipted yet.
    var pendingIds = {};
    (m.pending || []).forEach(function (t) { pendingIds[t.id || t.name] = true; });
    var receipts = m.toolCalls.filter(function (t) {
      if (classifyTool(t.name) === "navigate") return false;
      if (pendingIds[t.id || t.name]) return false;
      return true;
    });
    if (!receipts.length) return null;
    return (
      <div style={{ marginLeft: 42, marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
        {receipts.map(function (t, i) {
          return (
            <div
              key={i}
              style={{ fontFamily: MONO, fontSize: 10, color: C.accent, display: "flex", gap: 6, alignItems: "center" }}
            >
              <span style={{ color: "#4ade80" }}>✓</span>
              <span>{describeToolCall(t, accounts)}</span>
            </div>
          );
        })}
      </div>
    );
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
              {isPip && renderToolReceipts(m, i)}
              {isPip && m.pending && m.pending.length === 1 && (
                <div style={{ width: "100%" }}>
                  <PipActionCard
                    tool={m.pending[0]}
                    accounts={accounts}
                    onConfirm={function (tool) { return handleConfirmOne(i, tool); }}
                    onDiscard={function () { handleDiscardOne(i, m.pending[0].id || m.pending[0].name); }}
                  />
                </div>
              )}
              {isPip && m.pending && m.pending.length >= 2 && (
                <PipActionBatch
                  tools={m.pending}
                  accounts={accounts}
                  onConfirmOne={function (tool) { return handleConfirmOne(i, tool); }}
                  onDiscardOne={function (toolId) { handleDiscardOne(i, toolId); }}
                  onConfirmAll={function (tools) { return handleConfirmAll(i, tools); }}
                  onDiscardAll={function () { handleDiscardAll(i); }}
                />
              )}
              {isPip && m.discarded && (
                <div style={{ marginLeft: 42, fontFamily: MONO, fontSize: 10, color: C.textMuted }}>
                  Discarded.
                </div>
              )}
              {isPip && m.discardedItems && m.discardedItems.length > 0 && !m.discarded && (
                <div style={{ marginLeft: 42, fontFamily: MONO, fontSize: 10, color: C.textMuted }}>
                  {m.discardedItems.length} skipped.
                </div>
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

// Re-export for convenience.
export { CONFIRM_THRESHOLD };
