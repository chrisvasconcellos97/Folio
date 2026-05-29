import { useState, useEffect, useRef, useMemo } from "react";
import { C, glass } from "../../lib/colors";
import { showToast } from "../../components/Toast";
import { PipMark } from "../../components/PipMark";
import { MarkdownText } from "../../components/MarkdownText";
import { SecBtn, DangerBtn } from "../../components/Buttons";
import { getFrequencyLabel, getNextOccurrence, daysUntil, formatTime } from "../../lib/cadenceUtils";
import { summarizeDraftPip, callCadenceBriefPip } from "../../lib/pip";
import { CadenceBackfillBanner } from "./CadenceBackfillBanner";
import { AddToTasksButton } from "../../components/AddToTasksButton";
import { CadenceMeetingMode } from "./CadenceMeetingMode";
import { PipSummarizePreview } from "./PipSummarizePreview";
import { ProjectStageEditor } from "../gauge/ProjectStageEditor";
import { StandingBoardView } from "../gauge/StandingBoardView";
import { ProjectNotesEditor } from "../gauge/ProjectNotesEditor";
import { usePipAssignmentHints } from "../../hooks/usePipAssignmentHints";
import { applyPipPlan } from "../../lib/pipPlanApply";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

var METHOD_LABEL = {
  phone:     "Phone",
  email:     "Email",
  video:     "Video",
  in_person: "In Person",
};

var STALE_DAYS = 7;

function isStale(meeting) {
  if (meeting.status !== "draft") return false;
  var updated = meeting.updated_at || meeting.created_at;
  if (!updated) return false;
  var days = Math.floor((Date.now() - new Date(updated).getTime()) / 86400000);
  return days > STALE_DAYS;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatTodayLong() {
  var d = new Date();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ---- Draft scratchpad card (kept for drafts that already exist) ---- */
function DraftCard({ draft, onUpdate, onDelete, onSummarizeRequest, onResume, summarizing, summarizeErr }) {
  var [notes, setNotes]     = useState(draft.notes || "");
  var [title, setTitle]     = useState(draft.title || "");
  var [confirmDelete, setConfirmDelete] = useState(false);
  var saveTimer = useRef(null);
  var stale = isStale(draft);

  useEffect(function () {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (notes === (draft.notes || "") && title === (draft.title || "")) return;
    saveTimer.current = setTimeout(function () {
      onUpdate(draft.id, { notes: notes, title: title }).catch(function (e) {
        console.error("Draft save failed:", e);
      });
    }, 1500);
    return function () { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, title]);

  function handleResumeClick() {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    var pending = notes !== (draft.notes || "") || title !== (draft.title || "");
    var resumePromise = pending
      ? onUpdate(draft.id, { notes: notes, title: title })
      : Promise.resolve();
    resumePromise.then(function () {
      onResume(Object.assign({}, draft, { notes: notes, title: title }));
    }).catch(function () {
      onResume(Object.assign({}, draft, { notes: notes, title: title }));
    });
  }

  function handleSummarize() {
    if (summarizing) return;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    var draftPayload = Object.assign({}, draft, { notes: notes, title: title });
    onUpdate(draft.id, { notes: notes, title: title })
      .then(function () { onSummarizeRequest(draftPayload); })
      .catch(function () { onSummarizeRequest(draftPayload); });
  }

  return (
    <div style={Object.assign({}, glass, {
      borderLeft: "3px solid " + (stale ? C.yellow : C.accent),
      borderRadius: 10,
      padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: 10,
    })}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <input
          type="text"
          value={title}
          onChange={function (e) { setTitle(e.target.value); }}
          placeholder="Conversation title…"
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: C.text, fontSize: 14, fontWeight: 600, fontFamily: INTER, padding: 0,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {stale && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: C.yellow,
              background: C.yellowFaint, border: "1px solid " + C.yellow,
              borderRadius: 4, padding: "2px 6px",
              fontFamily: MONO, letterSpacing: "0.07em", textTransform: "uppercase",
            }}>Stale</span>
          )}
          <span style={{
            fontSize: 9, fontWeight: 700, color: C.accent,
            background: C.accentFaint, border: "1px solid " + C.accentLine,
            borderRadius: 4, padding: "2px 6px",
            fontFamily: MONO, letterSpacing: "0.07em", textTransform: "uppercase",
          }}>Draft</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, fontSize: 11, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>
        {draft.meeting_date && <span>{new Date(draft.meeting_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
        {draft.method && <span>{METHOD_LABEL[draft.method] || draft.method}</span>}
      </div>

      <textarea
        value={notes}
        onChange={function (e) { setNotes(e.target.value); }}
        placeholder="Notes — autosaves as you type."
        style={{
          width: "100%", background: C.surface,
          border: "1px solid " + C.rule, borderRadius: 8,
          padding: "10px 12px", color: C.text, fontSize: 14, lineHeight: 1.55,
          fontFamily: INTER, resize: "vertical", minHeight: 90, outline: "none",
          boxSizing: "border-box",
        }}
      />

      {summarizeErr && (
        <div style={{ fontSize: 11, color: C.red }}>{summarizeErr}</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {onResume && (
            <button
              onClick={handleResumeClick}
              style={{
                background: C.accentDeep, border: "none", borderRadius: 8,
                padding: "7px 14px", fontSize: 12, fontWeight: 600,
                color: C.bg, fontFamily: INTER, cursor: "pointer",
              }}
            >
              Resume in full screen →
            </button>
          )}
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
            }}
          >
            <PipMark size={7} color={C.accent} glow pulse={summarizing} />
            {summarizing ? "Pip is summarizing…" : "✦ Summarize with Pip"}
          </button>
        </div>
        {!confirmDelete ? (
          <button
            onClick={function () { setConfirmDelete(true); }}
            style={{
              background: "none", border: "none", color: C.textMuted,
              cursor: "pointer", fontSize: 11, fontFamily: INTER,
            }}
          >
            Discard
          </button>
        ) : (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.red }}>Sure?</span>
            <DangerBtn onClick={function () { onDelete(draft.id); }} style={{ fontSize: 11, padding: "4px 10px" }}>Discard</DangerBtn>
            <SecBtn onClick={function () { setConfirmDelete(false); }} style={{ fontSize: 11, padding: "4px 10px" }}>No</SecBtn>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Section header ---- */
function SectionHeader({ children, count, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: MONO }}>
        {children}{typeof count === "number" ? " (" + count + ")" : ""}
      </div>
      {action}
    </div>
  );
}

/* ---- Pip brief panel ---- */
export function PipBriefPanel({ brief, briefAt, loading, error, onRefresh, mobileCollapsed, onExpand }) {
  if (mobileCollapsed) {
    var oneLiner = brief
      ? brief.split(/\n+/)[0].slice(0, 110) + (brief.length > 110 ? "…" : "")
      : "Tap to load Pip's brief for this cadence";
    return (
      <button
        onClick={onExpand}
        style={{
          width: "100%", textAlign: "left",
          background: C.accentGlow, border: "1px solid " + C.accentLine,
          borderRadius: 10, padding: "8px 12px",
          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
        }}
      >
        <PipMark size={7} color={C.accent} glow pulse />
        <span style={{ fontSize: 12, color: C.textSub, lineHeight: 1.4, flex: 1, fontFamily: INTER }}>{oneLiner}</span>
        <span style={{ fontSize: 11, color: C.textMuted }}>▾</span>
      </button>
    );
  }
  return (
    <div style={{
      background: C.accentGlow, border: "1px solid " + C.accentLine,
      borderRadius: 12, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <PipMark size={8} color={C.accent} glow pulse={loading} />
          <div style={{ fontSize: 10, color: C.accent, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: MONO }}>
            Pip · Cadence Brief
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            background: "none", border: "1px solid " + C.accentSubtle, borderRadius: 6,
            padding: "3px 9px", fontSize: 10, fontWeight: 600,
            color: C.accent, fontFamily: INTER, cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "Working…" : (brief ? "Refresh" : "Generate")}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: C.red }}>{error}</div>}
      {brief ? (
        <>
          <MarkdownText text={brief} style={{ fontSize: 14, color: C.textSub, lineHeight: 1.65 }} />
          {briefAt && (
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 8, fontFamily: MONO }}>
              Updated {new Date(briefAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          )}
        </>
      ) : (!loading && !error && (
        <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
          No brief yet. Hit Generate when you want Pip's read on this cadence.
        </div>
      ))}
    </div>
  );
}

/* ---- Meeting history row (with CADENCE/AD-HOC tag) ---- */
function HistoryRow({ meeting, onEdit, onDelete, accountId, openItems, addItem, isCadenceTied }) {
  var [confirm, setConfirm] = useState(false);
  var tagBg    = isCadenceTied ? C.accentFaint : C.surface2;
  var tagBorder = isCadenceTied ? C.accentLine : C.rule;
  var tagColor = isCadenceTied ? C.accent     : C.textMuted;
  return (
    <div style={Object.assign({}, glass, { borderRadius: 10, padding: "11px 13px" })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{meeting.title || "Conversation"}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, color: tagColor,
              background: tagBg, border: "1px solid " + tagBorder,
              borderRadius: 4, padding: "1px 6px",
              fontFamily: MONO, letterSpacing: "0.07em", textTransform: "uppercase",
            }}>
              {isCadenceTied ? "Cadence" : "Ad-hoc"}
            </span>
            {meeting.method && (
              <span style={{ fontSize: 9, color: C.textMuted, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {METHOD_LABEL[meeting.method] || meeting.method}
              </span>
            )}
            {meeting.plan_applied_at && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: C.accent,
                background: C.accentFaint, border: "1px solid " + C.accentLine,
                borderRadius: 4, padding: "1px 6px",
                fontFamily: MONO, letterSpacing: "0.07em", textTransform: "uppercase",
              }}>
                ✓ Tasks added
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>
            {meeting.meeting_date && new Date(meeting.meeting_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
          {meeting.pip_summary && (
            <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, marginTop: 6, fontStyle: "italic" }}>
              {meeting.pip_summary}
            </div>
          )}
          {!meeting.pip_summary && meeting.notes && (
            <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, marginTop: 6, whiteSpace: "pre-wrap" }}>
              {meeting.notes.length > 240 ? meeting.notes.slice(0, 240) + "…" : meeting.notes}
            </div>
          )}
          {meeting.follow_up_date && (
            <div style={{ fontSize: 11, color: C.accent, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
              Follow-up: {new Date(meeting.follow_up_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          )}
          {meeting.action_items && addItem && accountId && (
            <div style={{ marginTop: 8 }}>
              <AddToTasksButton
                actionItemsText={meeting.action_items}
                accountId={accountId}
                openItems={openItems}
                addItem={addItem}
              />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          {onEdit && (
            <button
              onClick={function () { onEdit(meeting); }}
              style={{
                background: "none", border: "1px solid " + C.border, borderRadius: 6,
                padding: "3px 9px", fontSize: 10, color: C.textSoft, cursor: "pointer", fontFamily: INTER,
              }}
            >Edit</button>
          )}
          {onDelete && !confirm && (
            <button
              onClick={function () { setConfirm(true); }}
              style={{
                background: "none", border: "none", color: C.textMuted, fontSize: 14,
                cursor: "pointer", padding: "0 4px",
              }}
              aria-label="Delete"
            >×</button>
          )}
          {onDelete && confirm && (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <DangerBtn onClick={function () { onDelete(meeting.id); setConfirm(false); }} style={{ fontSize: 10, padding: "3px 8px" }}>Yes</DangerBtn>
              <SecBtn onClick={function () { setConfirm(false); }} style={{ fontSize: 10, padding: "3px 8px" }}>No</SecBtn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Open items row ---- */
export function OpenItemRow({ item, onClose }) {
  return (
    <div style={Object.assign({}, glass, { display: "flex", alignItems: "flex-start", gap: 6, borderRadius: 10, padding: "10px 12px" })}>
      <button
        onClick={function () { onClose(item.id); }}
        aria-label="Mark complete"
        style={{
          width: 24, height: 24,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: "none", border: "none", padding: 0,
          cursor: "pointer", flexShrink: 0, marginTop: -2,
        }}
      >
        <span style={{
          width: 16, height: 16, borderRadius: 4,
          border: "1.5px solid " + C.accentDim, background: "transparent",
          display: "inline-block",
        }} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.45 }}>{item.text}</div>
        {item.due_date && (
          <div style={{ fontSize: 10, color: C.yellow, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
            Due {new Date(item.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Inline-expandable Gauge project card ---- */
export function HubProjectCard({ project, accounts, members, userEmail, onUpdateProject }) {
  var [open, setOpen] = useState(false);
  var isPlanning   = project.status === "planned" || project.status === "on_hold";
  var statusColor  = isPlanning ? C.yellow : C.accent;
  var statusKey    = (project.status || "planned").split("_").map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join("");
  var statusStyle  = C["status" + statusKey] || C.statusPlanned;
  var tasks        = project.stages || [];
  var doneCount    = tasks.filter(function (t) { return t.completed_at; }).length;

  return (
    <div style={{
      background: C.surface,
      border: "1px solid " + (project.status === "blocked" ? C.statusBlocked.border : C.rule),
      borderRadius: 10,
      overflow: "hidden",
    }}>
      <div
        onClick={function () { setOpen(function (v) { return !v; }); }}
        role="button"
        tabIndex={0}
        onKeyDown={function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(function (v) { return !v; }); }
        }}
        style={{
          padding: "12px 14px",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 12, alignItems: "center",
          cursor: "pointer",
        }}
      >
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textMuted, userSelect: "none" }}>
          {open ? "▾" : "▸"}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: SERIF, fontSize: 15, color: C.text, lineHeight: 1.3 }}>
              {project.title || "Untitled project"}
            </span>
            <span style={{
              background: statusStyle.bg,
              border: "1px solid " + statusStyle.border,
              borderRadius: 999,
              padding: "2px 8px",
              fontFamily: MONO, fontSize: 9,
              color: statusStyle.text,
              textTransform: "uppercase", letterSpacing: "0.07em",
              whiteSpace: "nowrap",
            }}>
              {(project.status || "planned").replace("_", " ")}
            </span>
            {project.is_standing && (
              <span style={{
                fontFamily: MONO, fontSize: 9, color: C.textMuted,
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>
                Standing
              </span>
            )}
            {project._childAccountName && (
              <span style={{
                fontFamily: MONO, fontSize: 9, color: C.textMuted,
                letterSpacing: "0.06em",
              }}>
                ↳ {project._childAccountName}
              </span>
            )}
          </div>
          <div style={{
            display: "flex", gap: 10, marginTop: 4,
            fontFamily: MONO, fontSize: 10, color: C.textMuted,
            fontVariantNumeric: "tabular-nums",
          }}>
            {project.due_date && <span>Due {new Date(project.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
            {tasks.length > 0 && <span>{doneCount}/{tasks.length} tasks</span>}
            {project.assignee && <span>{project.assignee}</span>}
          </div>
          {tasks.length > 0 && (
            <div style={{
              marginTop: 8,
              height: 4, width: "100%",
              background: C.surface3,
              borderRadius: 2,
              overflow: "hidden",
              position: "relative",
            }}>
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0,
                width: Math.round((doneCount / tasks.length) * 100) + "%",
                background: C.accent,
                borderRadius: 2,
                transition: "width 0.3s ease",
              }} />
            </div>
          )}
        </div>
        <div style={{
          fontSize: 10, color: statusColor, fontFamily: MONO,
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {open ? "Collapse" : "Expand"}
        </div>
      </div>
      {open && (
        <div style={{ padding: "0 16px 14px 16px", borderTop: "1px solid " + C.rule }}>
          {project.description && (
            <div style={{
              fontFamily: SERIF, fontSize: 13, color: C.textSoft,
              lineHeight: 1.5, marginTop: 12, marginBottom: 12,
            }}>
              {project.description}
            </div>
          )}
          <ProjectNotesEditor project={project} onUpdate={onUpdateProject} compact />
          <div style={{
            fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
            textTransform: "uppercase", letterSpacing: "0.08em",
            marginTop: 10, marginBottom: 8,
          }}>
            Tasks
          </div>
          {project.is_standing ? (
            <StandingBoardView
              project={project}
              accounts={accounts}
              members={members}
              userEmail={userEmail}
              onUpdate={onUpdateProject}
            />
          ) : (
            <ProjectStageEditor
              project={project}
              onUpdate={onUpdateProject}
              accounts={accounts}
              members={members}
              userEmail={userEmail}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Main hub ---- */
export function CadenceHub({
  cadence,
  account,
  userId,
  userEmail,
  members,
  accounts,
  meetings,
  items,
  cadences,
  projects,
  contacts,
  addMeeting,
  updateMeeting,
  deleteMeeting,
  updateProject,
  addItem,
  updateItem,
  closeItem,
  onUpdateCadence,
  onEditMeeting,
  onBack,
  onOpenAccount,
  isMobile,
  autoOpenMeetingMode,
  onAutoOpenMeetingModeConsumed,
}) {
  var [briefLoading, setBriefLoading] = useState(false);
  var [briefError, setBriefError]     = useState(null);
  var [briefExpanded, setBriefExpanded] = useState(false);
  var [tab, setTab] = useState("notes");
  var [meetingMode, setMeetingMode] = useState(null); // { draft } when active
  var [startingMeeting, setStartingMeeting] = useState(false);
  // Summarize-preview state — keyed by draft id so multiple draft cards
  // each track their own in-flight state without colliding.
  var [summarizingId, setSummarizingId]     = useState(null);
  var [summarizeErrors, setSummarizeErrors] = useState({}); // { draftId: msg }
  var [previewPlan, setPreviewPlan]         = useState(null); // { plan, summary, draftId }

  var hintsApi = usePipAssignmentHints(userId, account.id);

  var cadenceMeetings = useMemo(function () {
    return (meetings || []).filter(function (m) { return m.cadence_id === cadence.id; });
  }, [meetings, cadence.id]);

  var drafts = useMemo(function () {
    return cadenceMeetings
      .filter(function (m) { return m.status === "draft"; })
      .sort(function (a, b) {
        var aTime = new Date(a.updated_at || a.created_at).getTime();
        var bTime = new Date(b.updated_at || b.created_at).getTime();
        return bTime - aTime;
      });
  }, [cadenceMeetings]);

  // History — widened to ALL meetings on the account, not just this cadence
  var history = useMemo(function () {
    return (meetings || [])
      .filter(function (m) { return m.status !== "draft"; })
      .sort(function (a, b) {
        return (b.meeting_date || "") > (a.meeting_date || "") ? 1 : -1;
      });
  }, [meetings]);

  var openItems = useMemo(function () {
    return (items || []).filter(function (i) { return !i.done; });
  }, [items]);

  var accountNameById = useMemo(function () {
    var map = {};
    (accounts || []).forEach(function (a) { map[a.id] = a.name; });
    return map;
  }, [accounts]);

  var activeProjects = useMemo(function () {
    return (projects || [])
      .filter(function (p) { return p.status !== "complete"; })
      .map(function (p) {
        var ownerName = p.account_id && p.account_id !== account.id
          ? (accountNameById[p.account_id] || null)
          : null;
        return Object.assign({}, p, { _childAccountName: ownerName });
      });
  }, [projects, accountNameById, account.id]);

  var scheduledFollowUps = useMemo(function () {
    var today = todayISO();
    return cadenceMeetings
      .filter(function (m) { return m.follow_up_date && m.follow_up_date >= today; })
      .sort(function (a, b) { return a.follow_up_date > b.follow_up_date ? 1 : -1; });
  }, [cadenceMeetings]);

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var nextDue = getNextOccurrence(cadence, today);
  var lastConv = history[0] || null;
  var lastConvAt = lastConv && lastConv.meeting_date
    ? Math.floor((Date.now() - new Date(lastConv.meeting_date + "T00:00:00").getTime()) / 86400000)
    : null;

  var cadenceLabel = getFrequencyLabel(cadence) || "Cadence";

  var BRIEF_FRESH_MS = 6 * 60 * 60 * 1000; // 6 hours

  function handleRefreshBrief() {
    if (cadence.pip_brief && cadence.pip_brief_at) {
      var generatedMs = new Date(cadence.pip_brief_at).getTime();
      if (!isNaN(generatedMs) && Date.now() - generatedMs < BRIEF_FRESH_MS) {
        showToast("Brief is fresh — using cached version");
        return;
      }
    }
    setBriefLoading(true);
    setBriefError(null);
    callCadenceBriefPip({
      cadence:        cadence,
      account:        account,
      cadenceLabel:   cadenceLabel,
      meetings:       history,
      openItems:      openItems,
      activeProjects: activeProjects,
    }).then(function (out) {
      var brief = out.brief || "";
      var when  = new Date().toISOString();
      return onUpdateCadence(cadence.id, { pip_brief: brief, pip_brief_at: when })
        .then(function () {
          setBriefLoading(false);
        });
    }).catch(function () {
      setBriefLoading(false);
      setBriefError("Pip is unavailable right now.");
    });
  }

  function handleStartMeeting() {
    if (startingMeeting) return;
    // Reuse today's draft for this cadence if one exists
    var today = todayISO();
    var existing = drafts.find(function (d) { return d.meeting_date === today; });
    if (existing) {
      setMeetingMode({ draft: existing });
      return;
    }
    setStartingMeeting(true);
    var title = cadenceLabel + " — " + formatTodayLong();
    addMeeting({
      account_id:   account.id,
      user_id:      userId,
      cadence_id:   cadence.id,
      title:        title,
      method:       "phone",
      meeting_date: today,
      notes:        "",
      status:       "draft",
    }).then(function (m) {
      setStartingMeeting(false);
      setMeetingMode({ draft: m });
    }).catch(function (e) {
      setStartingMeeting(false);
      showToast("Couldn't start meeting — try again");
      console.error(e);
    });
  }

  function handleResumeDraft(draft) {
    setMeetingMode({ draft: draft });
  }

  // When AutoOpenMeetingMode is requested (from a "just started" reminder),
  // programmatically click Start Meeting once on mount. The flag is then
  // consumed so re-renders don't refire.
  var autoOpenedRef = useRef(false);
  useEffect(function () {
    if (!autoOpenMeetingMode || autoOpenedRef.current) return;
    if (meetingMode || startingMeeting) return;
    autoOpenedRef.current = true;
    handleStartMeeting();
    if (onAutoOpenMeetingModeConsumed) onAutoOpenMeetingModeConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenMeetingMode]);

  function handleSummarizeRequest(draftPayload) {
    var draftId = draftPayload.id;
    if (summarizingId) return;
    setSummarizingId(draftId);
    setSummarizeErrors(function (prev) { var next = Object.assign({}, prev); delete next[draftId]; return next; });
    summarizeDraftPip({
      draft:            draftPayload,
      accountName:      account.name,
      cadenceLabel:     cadenceLabel,
      accountId:        account.id,
      existingItems:    openItems,
      activeProjects:   activeProjects,
      orgMembers:       members,
      assignmentHints:  hintsApi.hints,
    }).then(function (out) {
      var followUp = out.follow_up_date || null;
      return updateMeeting(draftId, {
        pip_summary:     out.summary || null,
        pip_short_title: out.short_title || null,
        follow_up_date:  followUp,
        status:          "summarized",
      }).then(function () { return out; });
    }).then(function (out) {
      setSummarizingId(null);
      setPreviewPlan({ plan: out.plan || [], summary: out.summary || "", draftId: draftId });
      // The meeting is already marked summarized; close meeting mode if it was open.
      if (meetingMode && meetingMode.draft && meetingMode.draft.id === draftId) {
        setMeetingMode(null);
      }
    }).catch(function (err) {
      setSummarizingId(null);
      setSummarizeErrors(function (prev) {
        var next = Object.assign({}, prev);
        next[draftId] = err && err.message ? err.message : "Pip couldn't summarize.";
        return next;
      });
    });
  }

  function handleApplyPlan(selected) {
    var draftId = previewPlan && previewPlan.draftId;
    return applyPipPlan(selected, {
      addItem:        addItem,
      updateItem:     function (id, fields) {
        return updateItem(id, fields);
      },
      closeItem:      closeItem,
      updateProject:  updateProject,
      addHint:        hintsApi.addHint,
      accountId:      account.id,
      activeProjects: activeProjects,
    }).then(function (result) {
      if (draftId) {
        updateMeeting(draftId, { plan_applied_at: new Date().toISOString() })
          .catch(function () { /* badge is nice-to-have; don't fail apply on it */ });
      }
      setPreviewPlan(null);
      return result;
    });
  }

  function handleCancelPlan() { setPreviewPlan(null); }

  // After updateMeeting in meeting mode, the draft object passed to the
  // overlay can fall behind. The overlay reads only `draft.notes` for its
  // initial state, so passing the latest meeting from the meetings list keeps
  // it consistent if the user re-enters meeting mode.
  var currentMeetingModeDraft = useMemo(function () {
    if (!meetingMode) return null;
    var match = (meetings || []).find(function (m) { return m.id === meetingMode.draft.id; });
    return match || meetingMode.draft;
  }, [meetingMode, meetings]);

  /* ---- Sections ---- */
  var briefSection = (
    <PipBriefPanel
      brief={cadence.pip_brief}
      briefAt={cadence.pip_brief_at}
      loading={briefLoading}
      error={briefError}
      onRefresh={handleRefreshBrief}
      mobileCollapsed={isMobile && !briefExpanded}
      onExpand={function () { setBriefExpanded(true); }}
    />
  );

  var startMeetingSection = (
    <button
      onClick={handleStartMeeting}
      disabled={startingMeeting}
      style={{
        width: "100%",
        background: C.accentDeep,
        border: "none",
        borderRadius: 12,
        padding: isMobile ? "16px 18px" : "18px 22px",
        fontSize: isMobile ? 15 : 16, fontWeight: 700,
        color: C.bg, fontFamily: INTER,
        cursor: startingMeeting ? "default" : "pointer",
        opacity: startingMeeting ? 0.7 : 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        letterSpacing: "0.01em",
      }}
    >
      {startingMeeting ? "Starting…" : "▶ Start Meeting"}
    </button>
  );

  var draftsSection = drafts.length > 0 ? (
    <div>
      <SectionHeader count={drafts.length}>Active Drafts</SectionHeader>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {drafts.map(function (d) {
          return (
            <DraftCard
              key={d.id}
              draft={d}
              onUpdate={updateMeeting}
              onDelete={deleteMeeting}
              onResume={handleResumeDraft}
              onSummarizeRequest={handleSummarizeRequest}
              summarizing={summarizingId === d.id}
              summarizeErr={summarizeErrors[d.id] || null}
            />
          );
        })}
      </div>
    </div>
  ) : null;

  var projectsSection = (
    <div>
      <SectionHeader count={activeProjects.length}>Gauge Projects · Account</SectionHeader>
      {activeProjects.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textMuted, padding: "6px 0" }}>
          No active projects on this account.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {activeProjects.map(function (p) {
            return (
              <HubProjectCard
                key={p.id}
                project={p}
                accounts={accounts}
                members={members}
                userEmail={userEmail}
                onUpdateProject={updateProject}
              />
            );
          })}
        </div>
      )}
    </div>
  );

  var tasksSection = (
    <div>
      <SectionHeader count={openItems.length}>Open Items · Account</SectionHeader>
      {openItems.length === 0 ? (
        <div style={{ fontSize: 12, color: C.green, padding: "6px 0" }}>
          All clear — no open items on this account.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {openItems.map(function (i) {
            return <OpenItemRow key={i.id} item={i} onClose={closeItem} />;
          })}
        </div>
      )}
    </div>
  );

  var followUpsSection = (
    <div>
      <SectionHeader count={scheduledFollowUps.length}>Scheduled Follow-ups</SectionHeader>
      {scheduledFollowUps.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textMuted, padding: "6px 0" }}>
          Nothing scheduled. Add a follow-up date when you summarize a conversation.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {scheduledFollowUps.map(function (m) {
            return (
              <div key={m.id} style={Object.assign({}, glass, {
                borderRadius: 8, padding: "9px 12px",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
              })}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{m.title || "Follow-up"}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>
                    From conversation on {m.meeting_date && new Date(m.meeting_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.accent, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {new Date(m.follow_up_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  var historySection = (
    <div>
      <SectionHeader count={history.length}>Meeting History · Account</SectionHeader>
      {history.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textMuted, padding: "6px 0" }}>
          No summarized conversations yet on this account.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {history.map(function (m) {
            return (
              <HistoryRow
                key={m.id}
                meeting={m}
                onEdit={onEditMeeting}
                onDelete={deleteMeeting}
                accountId={account.id}
                openItems={openItems}
                addItem={addItem}
                isCadenceTied={!!m.cadence_id}
              />
            );
          })}
        </div>
      )}
    </div>
  );

  /* ---- Header ---- */
  var header = (
    <div style={{ marginBottom: 14 }}>
      {onBack && (
        <button
          onClick={onBack}
          style={{
            background: "none", border: "none", color: C.textMuted, cursor: "pointer",
            fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
            padding: 0, marginBottom: 12,
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          ← Back
        </button>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontSize: isMobile ? 22 : 28, fontWeight: 400, color: C.text, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            {account.name}
          </div>
          <div style={{ fontSize: 12, color: C.accent, marginTop: 4, fontWeight: 600 }}>
            {cadenceLabel}
            {cadence.meeting_time ? " · " + formatTime(cadence.meeting_time) : ""}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap", fontVariantNumeric: "tabular-nums" }}>
            {lastConvAt !== null && <span>Last: {lastConvAt}d ago</span>}
            {nextDue && <span>Next: {daysUntil(nextDue).toLowerCase()}</span>}
          </div>
        </div>
        {onOpenAccount && (
          <button
            onClick={onOpenAccount}
            style={{
              background: C.accentFaint, border: "1px solid " + C.accentLine,
              borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 600,
              color: C.accent, fontFamily: INTER, cursor: "pointer", flexShrink: 0,
            }}
          >
            Account →
          </button>
        )}
      </div>
    </div>
  );

  /* ---- Meeting mode overlay (renders into portal, covers global chrome) ---- */
  var overlay = (meetingMode && currentMeetingModeDraft) ? (
    <CadenceMeetingMode
      draft={currentMeetingModeDraft}
      account={account}
      cadenceLabel={cadenceLabel}
      brief={cadence.pip_brief}
      briefAt={cadence.pip_brief_at}
      projects={activeProjects}
      openItems={openItems}
      contacts={contacts || []}
      accounts={accounts}
      members={members}
      userEmail={userEmail}
      lastMeetingAt={history.length ? history[0].meeting_date : null}
      onUpdate={updateMeeting}
      onAddItem={addItem}
      onCloseItem={closeItem}
      onUpdateProject={updateProject}
      onClose={function () { setMeetingMode(null); }}
      onSummarizeRequest={handleSummarizeRequest}
      summarizing={summarizingId != null && meetingMode && summarizingId === meetingMode.draft.id}
      summarizeErr={meetingMode ? summarizeErrors[meetingMode.draft.id] || null : null}
    />
  ) : null;

  var previewModal = previewPlan ? (
    <PipSummarizePreview
      plan={previewPlan.plan}
      existingItems={openItems}
      activeProjects={activeProjects}
      orgMembers={members}
      onApply={handleApplyPlan}
      onCancel={handleCancelPlan}
    />
  ) : null;

  /* ---- Mobile (segmented tabs) ---- */
  if (isMobile) {
    var tabs = [
      ["notes",     "Notes"],
      ["history",   "History"],
      ["tasks",     "Tasks"],
      ["followups", "Follow-ups"],
    ];
    return (
      <div>
        {header}
        <CadenceBackfillBanner
          account={account}
          cadences={cadences}
          meetings={meetings}
          onUpdateMeeting={updateMeeting}
          defaultCadenceId={cadence.id}
        />
        {briefSection}
        <div style={{ marginTop: 14 }}>{startMeetingSection}</div>
        <div style={{
          display: "flex", gap: 4,
          background: C.surface, borderRadius: 10, padding: 3,
          margin: "14px 0",
        }}>
          {tabs.map(function (pair) {
            var active = tab === pair[0];
            return (
              <button
                key={pair[0]}
                onClick={function () { setTab(pair[0]); }}
                style={{
                  flex: 1, padding: "8px 4px", borderRadius: 8, cursor: "pointer",
                  fontSize: 11, fontWeight: active ? 600 : 400,
                  fontFamily: INTER,
                  background: active ? C.bgCardAlt : "transparent",
                  color: active ? C.accent : C.textMuted,
                  border: "1px solid " + (active ? C.border : "transparent"),
                }}
              >
                {pair[1]}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {tab === "notes" && (
            <>
              {draftsSection}
              {projectsSection}
            </>
          )}
          {tab === "history" && historySection}
          {tab === "tasks" && (
            <>
              {projectsSection}
              {tasksSection}
            </>
          )}
          {tab === "followups" && followUpsSection}
        </div>
        {overlay}
        {previewModal}
      </div>
    );
  }

  /* ---- Desktop (top-to-bottom) ---- */
  return (
    <div>
      {header}
      <CadenceBackfillBanner
        account={account}
        cadences={cadences}
        meetings={meetings}
        onUpdateMeeting={updateMeeting}
        defaultCadenceId={cadence.id}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {briefSection}
        {startMeetingSection}
        {draftsSection}
        {projectsSection}
        {tasksSection}
        {followUpsSection}
        {historySection}
      </div>
      {overlay}
      {previewModal}
    </div>
  );
}
