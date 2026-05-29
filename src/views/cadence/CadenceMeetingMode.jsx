import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { C, glass } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { showToast } from "../../components/Toast";
import { PipBriefPanel, HubProjectCard, OpenItemRow } from "./CadenceHub";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useAutoBullet } from "../../lib/useAutoBullet";

var BULLET_KEY = "folio_autobullet_meeting_mode";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

function MetaChip({ label, value, tone }) {
  var color = tone === "warn" ? C.yellow : tone === "ok" ? C.green : C.textSoft;
  var border = tone === "warn" ? C.yellow : tone === "ok" ? C.green : C.rule;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: C.surface,
      border: "1px solid " + border,
      borderRadius: 999,
      padding: "5px 11px",
      fontFamily: INTER,
      fontVariantNumeric: "tabular-nums",
    }}>
      <span style={{
        fontFamily: MONO, fontSize: 9, color: C.textMuted,
        letterSpacing: "0.07em", textTransform: "uppercase",
      }}>{label}</span>
      <span style={{ fontSize: 12, color: color, fontWeight: 600 }}>{value}</span>
    </div>
  );
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

function ContactCard({ contact, selected, onToggle }) {
  var canToggle = typeof onToggle === "function";
  return (
    <div
      role={canToggle ? "button" : undefined}
      tabIndex={canToggle ? 0 : undefined}
      onClick={canToggle ? function () { onToggle(contact.name); } : undefined}
      onKeyDown={canToggle ? function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(contact.name); }
      } : undefined}
      style={Object.assign({}, glass, {
        borderRadius: 8, padding: "8px 10px", marginBottom: 6,
        cursor: canToggle ? "pointer" : "default",
        display: "flex", alignItems: "flex-start", gap: 8,
        border: selected ? "1px solid " + C.accentBorder : glass.border,
        background: selected ? C.accentFaint : glass.background,
      })}
    >
      {canToggle && (
        <div
          aria-hidden="true"
          style={{
            width: 14, height: 14, flexShrink: 0, marginTop: 2,
            borderRadius: 4,
            border: "1.5px solid " + (selected ? C.accent : C.accentDim),
            background: selected ? C.accent : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: C.bg, fontSize: 10, lineHeight: 1, fontWeight: 700,
          }}
        >
          {selected ? "✓" : ""}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{contact.name}</div>
        {contact.title && <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 2 }}>{contact.title}</div>}
        {contact.email && <div style={{ fontSize: 10, color: C.accent, marginTop: 2 }}>{contact.email}</div>}
      </div>
    </div>
  );
}

var METHOD_LABEL = {
  phone:     "Phone",
  email:     "Email",
  video:     "Video",
  in_person: "In Person",
};

export function CadenceMeetingMode({
  draft,
  account,
  cadenceLabel,
  brief,
  briefAt,
  projects,
  openItems,
  contacts,
  accounts,
  members,
  userEmail,
  lastMeetingAt,
  onUpdate,
  onAddItem,
  onCloseItem,
  onUpdateProject,
  onClose,
  onSummarizeRequest,
  summarizing,
  summarizeErr,
}) {
  var isDesktop                         = useBreakpoint();
  var isMobile                          = !isDesktop;
  var [notes, setNotes]                 = useState(draft.notes || "");
  var [bulletsOn, setBulletsOn]         = useState(function () {
    try { var v = localStorage.getItem(BULLET_KEY); return v === null ? true : v === "1"; } catch (e) { return true; }
  });
  var bulletProps = useAutoBullet({ value: notes, onChange: setNotes, enabled: bulletsOn });
  useEffect(function () {
    try { localStorage.setItem(BULLET_KEY, bulletsOn ? "1" : "0"); } catch (e) {}
  }, [bulletsOn]);
  // Start collapsed by default on mobile; the user can expand it if they want
  // to see the sidebar context. Below the desktop breakpoint the sidebar is
  // effectively hidden (44px icon-strip toggle) so the notepad gets the
  // whole viewport.
  var [sidebarCollapsed, setCollapsed]  = useState(isMobile);
  var [briefExpanded, setBriefExpanded] = useState(false);
  var [mobileTab, setMobileTab]         = useState("projects");
  var [quickItem, setQuickItem]         = useState("");
  var [attendees, setAttendees]         = useState(Array.isArray(draft.attendees) ? draft.attendees.slice() : []);
  var saveTimer = useRef(null);
  var attendeesTimer = useRef(null);
  var notesRef  = useRef(null);

  // Auto-collapse sidebar whenever crossing into mobile width.
  useEffect(function () {
    if (isMobile) setCollapsed(true);
  }, [isMobile]);

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

  // Debounced attendees sync — fires 600ms after the last toggle.
  useEffect(function () {
    if (attendeesTimer.current) clearTimeout(attendeesTimer.current);
    var draftAttendees = Array.isArray(draft.attendees) ? draft.attendees : [];
    var same = draftAttendees.length === attendees.length &&
               draftAttendees.every(function (n, i) { return n === attendees[i]; });
    if (same) return;
    attendeesTimer.current = setTimeout(function () {
      onUpdate(draft.id, { attendees: attendees.length ? attendees : null }).catch(function (e) {
        console.error("Meeting mode attendees save failed:", e);
      });
    }, 600);
    return function () { if (attendeesTimer.current) clearTimeout(attendeesTimer.current); };
  }, [attendees]);

  function toggleAttendee(name) {
    setAttendees(function (prev) {
      return prev.indexOf(name) >= 0
        ? prev.filter(function (n) { return n !== name; })
        : prev.concat([name]);
    });
  }

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
    if (attendeesTimer.current) { clearTimeout(attendeesTimer.current); attendeesTimer.current = null; }
    var pending = {};
    if (notes !== (draft.notes || "")) pending.notes = notes;
    var draftAttendees = Array.isArray(draft.attendees) ? draft.attendees : [];
    var attendeesChanged = draftAttendees.length !== attendees.length ||
                           draftAttendees.some(function (n, i) { return n !== attendees[i]; });
    if (attendeesChanged) pending.attendees = attendees.length ? attendees : null;
    if (Object.keys(pending).length === 0) return Promise.resolve();
    return onUpdate(draft.id, pending);
  }

  function handleClose() {
    flushPendingSave().finally(function () {
      if (onClose) onClose();
    });
  }

  function handleSummarize() {
    if (summarizing) return;
    var draftPayload = Object.assign({}, draft, { notes: notes });
    flushPendingSave().finally(function () {
      onSummarizeRequest(draftPayload);
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

  // When expanded on mobile we still cap to a viewport-friendly width so
  // the notepad column doesn't disappear entirely.
  var sidebarWidth = sidebarCollapsed ? 44 : (isMobile ? Math.min(320, typeof window !== "undefined" ? window.innerWidth - 60 : 320) : 480);
  var hasBrief     = Boolean(brief && brief.trim());
  var topLabel     = cadenceLabel
    ? cadenceLabel
    : (draft.method && METHOD_LABEL[draft.method]) || "Ad-hoc conversation";

  // Meta-strip vitals
  var daysSinceLast = lastMeetingAt
    ? Math.floor((Date.now() - new Date(lastMeetingAt + "T00:00:00").getTime()) / 86400000)
    : null;
  var openItemCount = (openItems || []).length;
  var overdueItems  = (openItems || []).filter(function (i) {
    return i.due_date && i.due_date < new Date().toISOString().slice(0, 10);
  }).length;
  var projectHealth = (function () {
    var list = projects || [];
    if (!list.length) return null;
    var atRisk = list.filter(function (p) {
      return p.status === "blocked" || p.status === "on_hold" ||
             (p.due_date && p.due_date < new Date().toISOString().slice(0, 10) && p.status !== "complete");
    }).length;
    return atRisk > 0
      ? { label: atRisk + " at risk", tone: "warn" }
      : { label: list.length + " on track", tone: "ok" };
  })();

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
          <div style={{
            fontFamily: SERIF, fontSize: isMobile ? 14 : 16, color: C.text, lineHeight: 1.2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {account.name}
          </div>
          <div style={{
            fontFamily: MONO, fontSize: isMobile ? 9 : 10, color: C.accent,
            letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {isMobile
              ? topLabel + " · " + new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : topLabel + " · " + new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
        <button
          onClick={handleSummarize}
          disabled={summarizing}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: C.accentGlow, border: "1px solid " + C.accentSubtle,
            borderRadius: 8, padding: isMobile ? "6px 10px" : "7px 14px",
            fontSize: isMobile ? 11 : 12, fontWeight: 600, color: C.accent,
            fontFamily: INTER, cursor: summarizing ? "default" : "pointer",
            opacity: summarizing ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          <PipMark size={7} color={C.accent} glow pulse={summarizing} />
          {summarizing ? "Summarizing…" : isMobile ? "Summarize ✦" : "End & Summarize with Pip"}
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

      {/* Pip brief strip — collapsed one-liner on mobile until tapped; expanded
          form gets its own collapse pair so we don't trap the user. */}
      {hasBrief && (
        <div style={{
          flexShrink: 0,
          padding: isMobile ? "8px 12px" : "12px 18px 14px 18px",
          background: C.surface2,
          borderBottom: "1px solid " + C.rule,
          position: "relative",
        }}>
          <PipBriefPanel
            brief={brief}
            briefAt={briefAt}
            loading={false}
            error={null}
            onRefresh={null}
            mobileCollapsed={isMobile && !briefExpanded}
            onExpand={function () { setBriefExpanded(true); }}
          />
          {isMobile && briefExpanded && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
              <button
                onClick={function () { setBriefExpanded(false); }}
                aria-label="Collapse brief"
                style={{
                  background: "transparent", border: "none",
                  color: C.textMuted, fontSize: 11, fontFamily: MONO,
                  cursor: "pointer", padding: "4px 12px",
                  letterSpacing: "0.06em", textTransform: "uppercase",
                }}
              >
                ▴ Hide brief
              </button>
            </div>
          )}
        </div>
      )}

      {/* Vitals strip — desktop shows chips; mobile collapses to a one-liner
          so the notepad stays close to the top of the screen. */}
      {isMobile ? (
        <div style={{
          flexShrink: 0,
          padding: "6px 14px",
          background: C.surface2,
          borderBottom: "1px solid " + C.rule,
          fontFamily: MONO, fontSize: 10.5, color: C.textSoft,
          letterSpacing: "0.04em",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {(function () {
            var bits = [];
            if (daysSinceLast !== null) bits.push(daysSinceLast + "d ago");
            bits.push(openItemCount + " open" + (overdueItems > 0 ? " (" + overdueItems + " od)" : ""));
            if (projectHealth) bits.push(projectHealth.label);
            return bits.join(" · ");
          })()}
        </div>
      ) : (
        <div style={{
          flexShrink: 0,
          display: "flex", gap: 10, flexWrap: "wrap",
          padding: "10px 18px",
          background: C.surface2,
          borderBottom: "1px solid " + C.rule,
        }}>
          {daysSinceLast !== null && (
            <MetaChip label="Last meeting" value={daysSinceLast + "d ago"} tone={daysSinceLast > 45 ? "warn" : "muted"} />
          )}
          {openItemCount > 0 ? (
            <MetaChip
              label="Open items"
              value={openItemCount + (overdueItems > 0 ? " (" + overdueItems + " overdue)" : "")}
              tone={overdueItems > 0 ? "warn" : "muted"}
            />
          ) : (
            <MetaChip label="Open items" value="0 — all clear" tone="ok" />
          )}
          {projectHealth && (
            <MetaChip label="Projects" value={projectHealth.label} tone={projectHealth.tone} />
          )}
        </div>
      )}

      {/* Body — desktop: sidebar + notes side-by-side. Mobile: stacked
          vertical with a tabbed context section so neither column gets
          squeezed. */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: isMobile ? "column" : "row" }}>
        {/* Sidebar — desktop only */}
        {!isMobile && (
        <div style={{
          width: sidebarWidth,
          background: C.surface2,
          borderRight: "1px solid " + C.rule,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          transition: "width 0.18s ease",
          flexShrink: 0,
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid " + C.rule,
            background: C.surface,
          }}>
            {!sidebarCollapsed && (
              <div style={{
                fontFamily: SERIF, fontSize: 15, color: C.text,
                letterSpacing: "-0.01em",
              }}>
                Context
              </div>
            )}
            <button
              onClick={function () { setCollapsed(function (v) { return !v; }); }}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              style={{
                background: "none", border: "none",
                color: C.textMuted, cursor: "pointer",
                padding: 0,
                fontFamily: MONO, fontSize: 12, lineHeight: 1,
              }}
            >
              {sidebarCollapsed ? "›" : "‹"}
            </button>
          </div>
          {!sidebarCollapsed && (
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 28px 16px" }}>
              <SidebarSection title="Gauge Projects" count={(projects || []).length}>
                {(projects || []).length === 0 ? (
                  <div style={{ fontSize: 11, color: C.textMuted }}>No active projects.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(projects || []).map(function (p) {
                      return (
                        <HubProjectCard
                          key={p.id}
                          project={p}
                          accounts={accounts}
                          members={members}
                          userEmail={userEmail}
                          onUpdateProject={onUpdateProject}
                        />
                      );
                    })}
                  </div>
                )}
              </SidebarSection>
              <SidebarSection title="Open Items" count={(openItems || []).length}>
                {(openItems || []).length === 0 ? (
                  <div style={{ fontSize: 11, color: C.green }}>All clear.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(openItems || []).map(function (i) {
                      return <OpenItemRow key={i.id} item={i} onClose={onCloseItem} />;
                    })}
                  </div>
                )}
              </SidebarSection>
              <SidebarSection
                title={"Contacts" + (attendees.length ? " · " + attendees.length + " attending" : "")}
                count={(contacts || []).length}
              >
                {(contacts || []).length === 0 ? (
                  <div style={{ fontSize: 11, color: C.textMuted }}>No contacts.</div>
                ) : (
                  (contacts || []).map(function (c) {
                    return (
                      <ContactCard
                        key={c.id}
                        contact={c}
                        selected={attendees.indexOf(c.name) >= 0}
                        onToggle={toggleAttendee}
                      />
                    );
                  })
                )}
              </SidebarSection>
            </div>
          )}
        </div>
        )}

        {/* Notes area */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          minWidth: 0, minHeight: 0,
          background: C.bg,
        }}>
          <div style={{
            flex: isMobile ? "0 0 auto" : 1,
            overflowY: "auto",
            display: "flex", justifyContent: "center",
            padding: isMobile ? "10px 10px 6px 10px" : "32px 32px 8px 32px",
          }}>
            <div style={{
              width: "100%", maxWidth: 920,
              display: "flex", flexDirection: "column",
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 10, gap: 8,
              }}>
                {!isMobile ? (
                  <div style={{
                    fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
                    textTransform: "uppercase", letterSpacing: "0.1em",
                  }}>
                    {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </div>
                ) : <span />}
                <button
                  onClick={function () { setBulletsOn(function (v) { return !v; }); }}
                  aria-pressed={bulletsOn}
                  title="Auto-bullet new lines"
                  style={{
                    fontFamily: MONO, fontSize: 9.5,
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    background: bulletsOn ? C.accentFaint : "transparent",
                    color: bulletsOn ? C.accent : C.textMuted,
                    border: "1px solid " + (bulletsOn ? C.accentLine : C.rule),
                    borderRadius: 999, padding: "3px 10px",
                    cursor: "pointer", flexShrink: 0,
                  }}
                >
                  • Bullets {bulletsOn ? "on" : "off"}
                </button>
              </div>
              <textarea
                ref={notesRef}
                value={notes}
                onChange={function (e) { setNotes(e.target.value); }}
                onKeyDown={bulletProps.onKeyDown}
                onFocus={bulletProps.onFocus}
                onPaste={bulletProps.onPaste}
                placeholder="Start typing — Pip will summarize when you end the meeting…"
                style={{
                  flex: 1, width: "100%",
                  height: isMobile ? 220 : undefined,
                  minHeight: isMobile ? 220 : 440,
                  background: C.surface,
                  color: C.text,
                  border: "1px solid " + C.rule,
                  borderRadius: 12,
                  outline: "none",
                  padding: isMobile ? "12px 14px" : "22px 26px",
                  fontFamily: INTER, fontSize: isMobile ? 14.5 : 15.5, lineHeight: 1.65,
                  resize: "none",
                  boxSizing: "border-box",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)",
                }}
              />
            </div>
          </div>

          {/* Mobile context tabs + content. Stacks below the notes so all
              three sections (projects / items / contacts) are reachable
              without a sidebar drawer. */}
          {isMobile && (
            <>
              <div style={{
                display: "flex", gap: 4,
                padding: "6px 10px 0 10px",
                background: C.bg,
                flexShrink: 0,
              }}>
                {[
                  { id: "projects", label: "Projects", count: (projects || []).length },
                  { id: "items",    label: "Items",    count: (openItems || []).length },
                  { id: "contacts", label: "Contacts", count: (contacts || []).length },
                ].map(function (t) {
                  var active = mobileTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={function () { setMobileTab(t.id); }}
                      style={{
                        flex: 1,
                        background: active ? C.surface : "transparent",
                        border: "1px solid " + (active ? C.rule : "transparent"),
                        borderBottom: "none",
                        borderRadius: "8px 8px 0 0",
                        padding: "8px 8px",
                        fontSize: 11.5, fontWeight: active ? 600 : 400,
                        color: active ? C.accent : C.textMuted,
                        fontFamily: INTER, cursor: "pointer",
                        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
                      }}
                    >
                      {t.label}
                      <span style={{
                        fontFamily: MONO, fontSize: 10, color: active ? C.accent : C.textMuted,
                        background: active ? C.accentFaint : "transparent",
                        border: "1px solid " + (active ? C.accentLine : C.rule),
                        borderRadius: 999, padding: "0 6px",
                      }}>{t.count}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{
                flex: 1, overflowY: "auto",
                padding: "12px 10px 10px",
                background: C.surface,
                borderTop: "1px solid " + C.rule,
              }}>
                {mobileTab === "projects" && ((projects || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: C.textMuted, padding: "4px 0" }}>No active projects.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(projects || []).map(function (p) {
                      return (
                        <HubProjectCard
                          key={p.id}
                          project={p}
                          accounts={accounts}
                          members={members}
                          userEmail={userEmail}
                          onUpdateProject={onUpdateProject}
                        />
                      );
                    })}
                  </div>
                ))}
                {mobileTab === "items" && ((openItems || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: C.green, padding: "4px 0" }}>All clear.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(openItems || []).map(function (i) {
                      return <OpenItemRow key={i.id} item={i} onClose={onCloseItem} />;
                    })}
                  </div>
                ))}
                {mobileTab === "contacts" && ((contacts || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: C.textMuted, padding: "4px 0" }}>No contacts.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(contacts || []).map(function (c) {
                      return (
                        <ContactCard
                          key={c.id}
                          contact={c}
                          selected={attendees.indexOf(c.name) >= 0}
                          onToggle={toggleAttendee}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
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
