import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { C, glass } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { MarkdownText } from "../../components/MarkdownText";
import { showToast } from "../../components/Toast";
import { summarizeDraftPip } from "../../lib/pip";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ---- Sidebar sections ---- */
function SidebarSection({ title, count, children, collapsed }) {
  if (collapsed) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
        fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
        marginBottom: 8,
      }}>
        {title}{typeof count === "number" ? " (" + count + ")" : ""}
      </div>
      {children}
    </div>
  );
}

function CompactProjectCard({ project }) {
  var isPlanning = project.status === "planned" || project.status === "on_hold";
  var statusColor = isPlanning ? C.yellow : C.accent;
  return (
    <div style={Object.assign({}, glass, {
      borderRadius: 8, padding: "8px 10px", marginBottom: 6,
    })}>
      <div style={{ fontSize: 12, color: C.text, fontWeight: 600, lineHeight: 1.3 }}>
        {project.title || "Untitled project"}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        <span style={{
          fontFamily: MONO, fontSize: 9, color: statusColor, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.07em",
        }}>
          {(project.status || "").replace("_", " ")}
        </span>
        {project.due_date && (
          <span style={{ fontSize: 10, color: C.textMuted }}>
            due {fmtDate(project.due_date)}
          </span>
        )}
      </div>
    </div>
  );
}

function CompactItemRow({ item }) {
  return (
    <div style={{
      padding: "6px 0",
      borderBottom: "1px solid " + C.ruleSoft,
      fontSize: 12, color: C.textSoft, lineHeight: 1.4,
    }}>
      <div>{item.text}</div>
      {item.due_date && (
        <div style={{ fontSize: 10, color: C.yellow, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
          Due {fmtDate(item.due_date)}
        </div>
      )}
    </div>
  );
}

function CompactContactRow({ contact }) {
  return (
    <div style={{
      padding: "6px 0",
      borderBottom: "1px solid " + C.ruleSoft,
      fontSize: 12, color: C.textSoft, lineHeight: 1.4,
    }}>
      <div style={{ color: C.text, fontWeight: 500 }}>{contact.name}</div>
      {contact.title && <div style={{ fontSize: 10, color: C.textMuted }}>{contact.title}</div>}
    </div>
  );
}

export function CadenceMeetingMode({
  draft,
  account,
  cadenceLabel,
  brief,
  projects,
  openItems,
  contacts,
  onUpdate,
  onAddItem,
  onClose,
  onSummarized,
}) {
  var [notes, setNotes]                 = useState(draft.notes || "");
  var [sidebarCollapsed, setCollapsed]  = useState(false);
  var [summarizing, setSummarizing]     = useState(false);
  var [summarizeErr, setSummarizeErr]   = useState(null);
  var [quickItem, setQuickItem]         = useState("");
  var [briefExpanded, setBriefExpanded] = useState(false);
  var saveTimer = useRef(null);
  var notesRef  = useRef(null);

  // Auto-collapse sidebar on narrow viewports
  useEffect(function () {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 900) setCollapsed(true);
  }, []);

  // Focus the textarea on mount
  useEffect(function () {
    if (notesRef.current) notesRef.current.focus();
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return function () { document.body.style.overflow = prevOverflow; };
  }, []);

  // Autosave notes 1.5s after last keystroke
  useEffect(function () {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (notes === (draft.notes || "")) return;
    saveTimer.current = setTimeout(function () {
      onUpdate(draft.id, { notes: notes }).catch(function (e) {
        console.error("Meeting mode save failed:", e);
      });
    }, 1500);
    return function () { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [notes]);

  // ESC closes
  useEffect(function () {
    function onKey(e) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return function () { window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  function flushPendingSave() {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (notes !== (draft.notes || "")) {
      return onUpdate(draft.id, { notes: notes });
    }
    return Promise.resolve();
  }

  function handleClose() {
    flushPendingSave().finally(function () {
      if (onClose) onClose();
    });
  }

  function handleSummarize() {
    if (summarizing) return;
    setSummarizing(true);
    setSummarizeErr(null);
    var draftPayload = Object.assign({}, draft, { notes: notes });
    flushPendingSave()
      .then(function () {
        return summarizeDraftPip({
          draft:        draftPayload,
          accountName:  account.name,
          cadenceLabel: cadenceLabel,
        });
      })
      .then(function (out) {
        var followUp = out.follow_up_date || null;
        var updatePromise = onUpdate(draft.id, {
          pip_summary:    out.summary || null,
          follow_up_date: followUp,
          status:         "summarized",
        });
        var actionPromises = (out.action_items || []).map(function (ai) {
          if (!ai || !ai.text) return null;
          return onAddItem({
            text:     ai.text,
            due_date: ai.promised_date || null,
          });
        }).filter(Boolean);
        return Promise.all([updatePromise].concat(actionPromises)).then(function () { return out; });
      })
      .then(function (out) {
        setSummarizing(false);
        showToast("Summarized — " + (out.action_items || []).length + " action item" + ((out.action_items || []).length !== 1 ? "s" : "") + " logged");
        if (onSummarized) onSummarized();
        if (onClose) onClose();
      })
      .catch(function (err) {
        setSummarizing(false);
        setSummarizeErr(err && err.message ? err.message : "Pip couldn't summarize.");
      });
  }

  function handleAddQuickItem() {
    var t = quickItem.trim();
    if (!t) return;
    onAddItem({ text: t, due_date: null })
      .then(function () {
        setQuickItem("");
        showToast("Added to open items");
      })
      .catch(function () {
        showToast("Couldn't add item");
      });
  }

  var sidebarWidth = sidebarCollapsed ? 44 : 300;

  var overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Meeting mode"
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: C.bg,
        display: "flex", flexDirection: "column",
        fontFamily: INTER,
      }}
    >
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px",
        borderBottom: "1px solid " + C.rule,
        background: C.surface,
        gap: 12, flexShrink: 0,
      }}>
        <button
          onClick={handleClose}
          aria-label="Close meeting mode"
          style={{
            background: "none", border: "1px solid " + C.rule,
            color: C.textMuted, borderRadius: 8, padding: "6px 10px",
            cursor: "pointer", fontSize: 14, fontFamily: INTER,
            lineHeight: 1,
          }}
        >
          ×
        </button>
        <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
          <div style={{ fontFamily: SERIF, fontSize: 16, color: C.text, lineHeight: 1.2 }}>
            {account.name}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, letterSpacing: "0.07em", textTransform: "uppercase", marginTop: 2 }}>
            {cadenceLabel} · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
        <button
          onClick={handleSummarize}
          disabled={summarizing}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: C.accentGlow, border: "1px solid " + C.accentSubtle,
            borderRadius: 8, padding: "7px 14px",
            fontSize: 12, fontWeight: 600, color: C.accent,
            fontFamily: INTER, cursor: summarizing ? "default" : "pointer",
            opacity: summarizing ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          <PipMark size={7} color={C.accent} glow pulse={summarizing} />
          {summarizing ? "Summarizing…" : "End & Summarize with Pip"}
        </button>
      </div>

      {summarizeErr && (
        <div style={{
          padding: "8px 16px", fontSize: 12, color: C.red,
          background: C.redFaint, borderBottom: "1px solid " + C.redLine,
          flexShrink: 0,
        }}>
          {summarizeErr}
        </div>
      )}

      {/* Body */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <div style={{
          width: sidebarWidth,
          background: C.surface2,
          borderRight: "1px solid " + C.rule,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          transition: "width 0.18s ease",
          flexShrink: 0,
        }}>
          <button
            onClick={function () { setCollapsed(function (v) { return !v; }); }}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              background: "none", border: "none",
              color: C.textMuted, cursor: "pointer",
              padding: "10px 12px",
              fontFamily: MONO, fontSize: 12, textAlign: "left",
              borderBottom: "1px solid " + C.rule,
            }}
          >
            {sidebarCollapsed ? "›" : "‹ Collapse"}
          </button>
          {!sidebarCollapsed && (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 24px 14px" }}>
              {brief && (
                <SidebarSection title="Pip Brief">
                  <div style={{
                    background: C.accentGlow, border: "1px solid " + C.accentLine,
                    borderRadius: 8, padding: "8px 10px",
                  }}>
                    <button
                      onClick={function () { setBriefExpanded(function (v) { return !v; }); }}
                      style={{
                        background: "none", border: "none", padding: 0,
                        cursor: "pointer", textAlign: "left", width: "100%",
                        color: C.textSoft, fontSize: 12, lineHeight: 1.5,
                        fontFamily: INTER,
                      }}
                    >
                      {briefExpanded ? (
                        <MarkdownText text={brief} style={{ fontSize: 12, color: C.textSoft, lineHeight: 1.55 }} />
                      ) : (
                        <div style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}>
                          {brief.split(/\n+/)[0]}
                        </div>
                      )}
                      <span style={{ fontSize: 10, color: C.accent, marginTop: 4, display: "block" }}>
                        {briefExpanded ? "Collapse" : "Expand"}
                      </span>
                    </button>
                  </div>
                </SidebarSection>
              )}
              <SidebarSection title="Gauge Projects" count={(projects || []).length}>
                {(projects || []).length === 0 ? (
                  <div style={{ fontSize: 11, color: C.textMuted }}>No active projects.</div>
                ) : (
                  (projects || []).map(function (p) {
                    return <CompactProjectCard key={p.id} project={p} />;
                  })
                )}
              </SidebarSection>
              <SidebarSection title="Open Items" count={(openItems || []).length}>
                {(openItems || []).length === 0 ? (
                  <div style={{ fontSize: 11, color: C.textMuted }}>All clear.</div>
                ) : (
                  (openItems || []).map(function (i) {
                    return <CompactItemRow key={i.id} item={i} />;
                  })
                )}
              </SidebarSection>
              <SidebarSection title="Contacts" count={(contacts || []).length}>
                {(contacts || []).length === 0 ? (
                  <div style={{ fontSize: 11, color: C.textMuted }}>No contacts.</div>
                ) : (
                  (contacts || []).map(function (c) {
                    return <CompactContactRow key={c.id} contact={c} />;
                  })
                )}
              </SidebarSection>
            </div>
          )}
        </div>

        {/* Notes area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <textarea
            ref={notesRef}
            value={notes}
            onChange={function (e) { setNotes(e.target.value); }}
            placeholder="Take notes here. Pip will summarize when you end the meeting…"
            style={{
              flex: 1, width: "100%",
              background: C.surface, color: C.text,
              border: "none", outline: "none",
              padding: "24px 32px",
              fontFamily: INTER, fontSize: 16, lineHeight: 1.65,
              resize: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{
            display: "flex", gap: 8, alignItems: "center",
            padding: "10px 16px",
            borderTop: "1px solid " + C.rule,
            background: C.surface2,
            flexShrink: 0,
          }}>
            <input
              type="text"
              value={quickItem}
              onChange={function (e) { setQuickItem(e.target.value); }}
              onKeyDown={function (e) {
                if (e.key === "Enter") { e.preventDefault(); handleAddQuickItem(); }
              }}
              placeholder="+ Quick action item — press Enter"
              style={{
                flex: 1, background: C.surface, border: "1px solid " + C.rule,
                borderRadius: 8, padding: "8px 12px",
                color: C.text, fontSize: 13, fontFamily: INTER, outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={handleAddQuickItem}
              disabled={!quickItem.trim()}
              style={{
                background: C.accentFaint, border: "1px solid " + C.accentLine,
                borderRadius: 8, padding: "8px 14px",
                color: C.accent, fontSize: 12, fontWeight: 600,
                fontFamily: INTER,
                cursor: quickItem.trim() ? "pointer" : "default",
                opacity: quickItem.trim() ? 1 : 0.5,
              }}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
