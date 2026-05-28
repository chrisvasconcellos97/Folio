import { useState, useEffect, useRef } from "react";
import { C } from "../lib/colors";
import { showToast } from "./Toast";

var INTER = "'Inter Variable', system-ui, sans-serif";
var MONO  = "'JetBrains Mono Variable', monospace";

function pillBtn(active) {
  return {
    background:   active ? C.accentFaint : C.surface2,
    border:       "1px solid " + (active ? C.accentBorder : C.rule),
    borderRadius: 20,
    padding:      "8px 16px",
    fontSize:     12,
    fontWeight:   600,
    color:        active ? C.accent : C.text,
    cursor:       "pointer",
    fontFamily:   INTER,
    transition:   "border-color 0.12s, color 0.12s, background 0.12s",
    whiteSpace:   "nowrap",
  };
}

export function QuickActionBar({ accounts, onAddAccount, onOpenConversation, onAddTask }) {
  var [openPanel, setOpenPanel] = useState(null); // "task" | null
  var [hovered,   setHovered]   = useState(null);

  // Task form state
  var [taskAcctId,  setTaskAcctId]  = useState("");
  var [taskTitle,   setTaskTitle]   = useState("");
  var [taskSaving,  setTaskSaving]  = useState(false);

  var panelRef = useRef(null);

  useEffect(function() {
    if (!openPanel) return;
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpenPanel(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return function() { document.removeEventListener("mousedown", handleClick); };
  }, [openPanel]);

  function openTask() {
    setTaskAcctId("");
    setTaskTitle("");
    setTaskSaving(false);
    setOpenPanel(openPanel === "task" ? null : "task");
  }

  function handleOpenConversation() {
    setOpenPanel(null);
    if (onOpenConversation) onOpenConversation();
  }

  async function handleAddTask(e) {
    e.preventDefault();
    if (!taskTitle.trim()) {
      showToast("Task title required", "warning");
      return;
    }
    setTaskSaving(true);
    try {
      await onAddTask(taskAcctId || null, taskTitle.trim());
      showToast("Task added");
      setOpenPanel(null);
    } catch (err) {
      console.error(err);
      showToast("Couldn't add task — check your connection", "error");
    } finally {
      setTaskSaving(false);
    }
  }

  var inputStyle = {
    background:   C.surface,
    border:       "1px solid " + C.rule,
    borderRadius: 6,
    padding:      "7px 10px",
    fontSize:     13,
    color:        C.text,
    fontFamily:   INTER,
    width:        "100%",
    boxSizing:    "border-box",
    height:       36,
    outline:      "none",
  };

  var selectStyle = Object.assign({}, inputStyle, {
    appearance:  "none",
    cursor:      "pointer",
    color:       C.textSoft,
  });

  var logBtn = {
    background:   C.accent,
    border:       "none",
    borderRadius: 6,
    padding:      "7px 16px",
    fontSize:     12,
    fontWeight:   700,
    color:        C.bg,
    cursor:       "pointer",
    fontFamily:   INTER,
    transition:   "opacity 0.12s",
    height:       36,
    flexShrink:   0,
  };

  return (
    <div ref={panelRef} style={{ marginBottom: 14 }}>
      {/* Button row */}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={onAddAccount}
          onMouseEnter={function() { setHovered("acct"); }}
          onMouseLeave={function() { setHovered(null); }}
          style={pillBtn(hovered === "acct")}
        >
          + Account
        </button>
        <button
          onClick={handleOpenConversation}
          onMouseEnter={function() { setHovered("meet"); }}
          onMouseLeave={function() { setHovered(null); }}
          style={pillBtn(hovered === "meet")}
        >
          + Conversation
        </button>
        <button
          onClick={openTask}
          onMouseEnter={function() { setHovered("task"); }}
          onMouseLeave={function() { setHovered(null); }}
          style={pillBtn(openPanel === "task" || hovered === "task")}
        >
          + Task
        </button>
      </div>

      {/* Task mini-form */}
      {openPanel === "task" && (
        <div style={{
          marginTop:    8,
          background:   C.surface2,
          border:       "1px solid " + C.rule,
          borderRadius: 10,
          padding:      "14px 14px",
          boxShadow:    "0 4px 16px rgba(0,0,0,0.3)",
        }}>
          <form onSubmit={handleAddTask} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: MONO, marginBottom: 2 }}>
              Quick Task
            </div>
            <select
              value={taskAcctId}
              onChange={function(e) { setTaskAcctId(e.target.value); }}
              style={selectStyle}
            >
              <option value="">No account (optional)</option>
              {accounts.map(function(a) {
                return <option key={a.id} value={a.id}>{a.name}</option>;
              })}
            </select>
            <input
              type="text"
              value={taskTitle}
              onChange={function(e) { setTaskTitle(e.target.value); }}
              placeholder="Task title…"
              style={inputStyle}
              required
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <button
                type="button"
                onClick={function() { setOpenPanel(null); }}
                style={Object.assign({}, logBtn, { background: "transparent", border: "1px solid " + C.rule, color: C.textSoft })}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={taskSaving}
                style={Object.assign({}, logBtn, { opacity: taskSaving ? 0.6 : 1 })}
              >
                {taskSaving ? "Saving…" : "Add"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
