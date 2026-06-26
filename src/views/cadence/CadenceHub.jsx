import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { C, glass } from "../../lib/colors";
import { showToast } from "../../components/Toast";
import { PipMark } from "../../components/PipMark";
import { MarkdownText } from "../../components/MarkdownText";
import { SecBtn, DangerBtn } from "../../components/Buttons";
import { getFrequencyLabel, getNextOccurrence, daysUntil, formatTime } from "../../lib/cadenceUtils";
import { summarizeDraftPip, callCadenceBriefPip, callPortfolioBriefPip } from "../../lib/pip";
import { computeBriefReceipts } from "../../lib/briefReceipts";
import { AddToTasksButton } from "../../components/AddToTasksButton";
import { CadenceMeetingMode } from "./CadenceMeetingMode";
import { PipSummarizePreview } from "./PipSummarizePreview";
import { SummarizeStreamingOverlay } from "./SummarizeStreamingOverlay";
import { MondayPackSection } from "./MondayPackSection";
import { ProjectStageEditor } from "../gauge/ProjectStageEditor";
import { StandingBoardView } from "../gauge/StandingBoardView";
import { ProjectNotesEditor } from "../gauge/ProjectNotesEditor";
import { usePipAssignmentHints } from "../../hooks/usePipAssignmentHints";
import { usePipCorrections } from "../../hooks/usePipCorrections";
import { usePipFacts } from "../../hooks/usePipFacts";
import { useLeadershipTasks } from "../../hooks/useLeadershipTasks";
import { useGlossary } from "../../hooks/useGlossary";
import { useAccountSnapshots } from "../../hooks/useAccountSnapshots";
import { usePipPromiseLog } from "../../hooks/usePipPromiseLog";
import { useAccountUpdates } from "../../hooks/useAccountUpdates";
import { useUserProfile } from "../../hooks/useUserProfile";
import { applyPipPlan } from "../../lib/pipPlanApply";
import { updateTask, insertTask } from "../../hooks/useTasks";
import { ownerLabel } from "../../lib/ownerLabel";
import { autoStatusPatch } from "../../lib/gaugeStatus";
import { reconcileProjectTasks } from "../../lib/projectTaskWrites";
import { fmtShort, fmtMedium } from "../../lib/dateUtils";

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
  return fmtMedium(new Date());
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
            color: C.text, fontSize: 16, fontWeight: 600, fontFamily: INTER, padding: 0,
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
        {draft.meeting_date && <span>{fmtShort(draft.meeting_date)}</span>}
        {draft.method && <span>{METHOD_LABEL[draft.method] || draft.method}</span>}
      </div>

      <textarea
        value={notes}
        onChange={function (e) { setNotes(e.target.value); }}
        placeholder="Notes — autosaves as you type."
        style={{
          width: "100%", background: C.surface,
          border: "1px solid " + C.rule, borderRadius: 8,
          padding: "10px 12px", color: C.text, fontSize: 16, lineHeight: 1.55,
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
export function PipBriefPanel({ brief, briefAt, loading, error, onRefresh, mobileCollapsed, onExpand, lessonsLearned, glossary, facts }) {
  var [lessonsExpanded, setLessonsExpanded] = useState(false);

  // Receipts — which taught terms/facts actually surfaced in this brief (honest:
  // appearance-verified, not "was in the prompt"). Felt-Intelligence Rule #4.
  var receipts = brief ? computeBriefReceipts(brief, { glossary: glossary, facts: facts, max: 4 }) : [];

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

  var firstSentence = lessonsLearned
    ? lessonsLearned.split(/\.\s+/)[0].slice(0, 120) + (lessonsLearned.length > 120 ? "…" : "")
    : null;

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
          {receipts.length > 0 && (
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 9, lineHeight: 1.5, fontFamily: INTER }}>
              <span style={{ color: C.accent }}>✦ Pip used: </span>
              {receipts.join(" · ")}
            </div>
          )}
          {briefAt && (
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 8, fontFamily: MONO }}>
              Updated {fmtShort(briefAt)}
            </div>
          )}
        </>
      ) : (!loading && !error && (
        <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
          No brief yet. Hit Generate when you want Pip's read on this cadence.
        </div>
      ))}
      {firstSentence && (
        <div style={{ marginTop: 10, borderTop: "1px solid " + C.accentLine, paddingTop: 8 }}>
          <button
            onClick={function () { setLessonsExpanded(function (v) { return !v; }); }}
            style={{
              background: "none", border: "none", padding: 0,
              cursor: "pointer", textAlign: "left", width: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
              <span style={{ fontSize: 10, color: C.accent, flexShrink: 0 }}>✦</span>
              <div>
                <span style={{ fontSize: 9, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: MONO }}>
                  Pip remembers
                </span>
                {" · "}
                <span style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5, fontFamily: INTER }}>
                  {lessonsExpanded ? lessonsLearned : firstSentence}
                </span>
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

/* ---- Meeting history row (with CADENCE/AD-HOC tag) ----
   Tap to expand: full raw notes (kept verbatim on every summarized meeting),
   per-project meeting notes, and the tasks that came out of the meeting
   (folio_tasks.source_meeting_id). Collapsed view keeps the summary preview. */
function HistoryRow({ meeting, onEdit, onDelete, accountId, openItems, addItem, isCadenceTied, projectTitleById }) {
  var [confirm, setConfirm] = useState(false);
  var [open, setOpen] = useState(false);
  var [tasks, setTasks] = useState(null);      // null = not fetched yet
  var [tasksLoading, setTasksLoading] = useState(false);
  var tagBg    = isCadenceTied ? C.accentFaint : C.surface2;
  var tagBorder = isCadenceTied ? C.accentLine : C.rule;
  var tagColor = isCadenceTied ? C.accent     : C.textMuted;

  function toggleOpen() {
    var next = !open;
    setOpen(next);
    if (next && tasks === null && !tasksLoading) {
      setTasksLoading(true);
      supabase
        .from("folio_tasks")
        .select("id, title, done, status, assignee_email, recipient, due_date, is_commitment")
        .eq("source_meeting_id", meeting.id)
        .order("created_at", { ascending: true })
        .then(function (res) {
          setTasks(res.error ? [] : (res.data || []));
          setTasksLoading(false);
        });
    }
  }

  var projectNotes = meeting.project_notes && typeof meeting.project_notes === "object"
    ? Object.keys(meeting.project_notes).filter(function (pid) {
        return (meeting.project_notes[pid] || "").trim().length > 0;
      })
    : [];

  var labelStyle = {
    fontSize: 9, fontWeight: 700, color: C.textMuted, fontFamily: MONO,
    letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5,
  };

  return (
    <div style={Object.assign({}, glass, { borderRadius: 10, padding: "11px 13px" })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div
          role="button"
          tabIndex={0}
          onClick={toggleOpen}
          onKeyDown={function (e) {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleOpen(); }
          }}
          aria-expanded={open}
          style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
        >
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
            <span aria-hidden="true" style={{ fontSize: 10, color: C.textMuted, marginLeft: "auto", flexShrink: 0 }}>
              {open ? "▴ Close" : "▾ Open"}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>
            {meeting.meeting_date && fmtMedium(meeting.meeting_date)}
          </div>
          {meeting.pip_summary && (
            <MarkdownText text={meeting.pip_summary} style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, marginTop: 6 }} />
          )}
          {!meeting.pip_summary && meeting.notes && !open && (
            <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, marginTop: 6, whiteSpace: "pre-wrap" }}>
              {meeting.notes.length > 240 ? meeting.notes.slice(0, 240) + "…" : meeting.notes}
            </div>
          )}
          {meeting.follow_up_date && (
            <div style={{ fontSize: 11, color: C.accent, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
              Follow-up: {fmtShort(meeting.follow_up_date)}
            </div>
          )}

          {open && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
              {meeting.notes && (
                <div>
                  <div style={labelStyle}>Your notes</div>
                  <div style={{
                    fontSize: 13, color: C.textSub, lineHeight: 1.6, whiteSpace: "pre-wrap",
                    background: "var(--c-input-fill)", border: "1px solid " + C.ruleSoft,
                    borderRadius: 8, padding: "10px 12px",
                  }}>
                    {meeting.notes}
                  </div>
                </div>
              )}
              {projectNotes.map(function (pid) {
                return (
                  <div key={pid}>
                    <div style={labelStyle}>
                      Project notes · {(projectTitleById && projectTitleById[pid]) || "Project"}
                    </div>
                    <div style={{
                      fontSize: 13, color: C.textSub, lineHeight: 1.6, whiteSpace: "pre-wrap",
                      background: "var(--c-input-fill)", border: "1px solid " + C.ruleSoft,
                      borderRadius: 8, padding: "10px 12px",
                    }}>
                      {meeting.project_notes[pid]}
                    </div>
                  </div>
                );
              })}
              <div>
                <div style={labelStyle}>Tasks from this meeting</div>
                {tasksLoading && (
                  <div style={{ fontSize: 12, color: C.textMuted }}>Loading…</div>
                )}
                {!tasksLoading && tasks && tasks.length === 0 && (
                  <div style={{ fontSize: 12, color: C.textMuted }}>No tasks were created from this meeting.</div>
                )}
                {!tasksLoading && tasks && tasks.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {tasks.map(function (t) {
                      var closed = t.done || t.status === "complete";
                      return (
                        <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                          <span aria-hidden="true" style={{
                            fontSize: 12, lineHeight: "19px", flexShrink: 0,
                            color: closed ? C.accent : C.textMuted,
                          }}>
                            {closed ? "✓" : "◯"}
                          </span>
                          <span style={{
                            fontSize: 13, color: closed ? C.textMuted : C.textSub, lineHeight: 1.5,
                            textDecoration: closed ? "line-through" : "none",
                          }}>
                            {t.is_commitment ? "✦ " : ""}{t.title}
                            {(t.assignee_email || t.due_date) && (
                              <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 6, fontVariantNumeric: "tabular-nums" }}>
                                {t.assignee_email ? "· " + ownerLabel(t.assignee_email) + " " : ""}
                                {t.due_date ? "· due " + fmtShort(t.due_date) : ""}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {meeting.action_items && addItem && accountId && (
            <div style={{ marginTop: 8 }} onClick={function (e) { e.stopPropagation(); }}>
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
export function OpenItemRow({ item, onClose, discussed, mentioned, onToggleDiscussed }) {
  return (
    <div
      role={onToggleDiscussed ? "button" : undefined}
      tabIndex={onToggleDiscussed ? 0 : undefined}
      onClick={onToggleDiscussed ? function () { onToggleDiscussed(); } : undefined}
      onKeyDown={onToggleDiscussed ? function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleDiscussed(); }
      } : undefined}
      style={Object.assign({}, glass, {
        display: "flex", alignItems: "flex-start", gap: 6, borderRadius: 10, padding: "10px 12px",
        cursor: onToggleDiscussed ? "pointer" : "default",
        borderLeft: discussed ? "3px solid " + C.accent : undefined,
        boxShadow: mentioned && !discussed ? "0 0 0 1.5px " + C.accentLine : undefined,
      })}
    >
      <button
        onClick={function (e) { e.stopPropagation(); onClose(item.id); }}
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
          border: "1.5px solid " + (discussed ? C.accent : C.accentDim), background: "transparent",
          display: "inline-block",
        }} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, color: C.text, lineHeight: 1.45,
          textDecoration: mentioned && !discussed ? "underline" : undefined,
          textDecorationStyle: mentioned && !discussed ? "dashed" : undefined,
          textDecorationColor: mentioned && !discussed ? C.accentLine : undefined,
        }}>
          {item.text}
          {discussed && (
            <span style={{ marginLeft: 6, fontSize: 9, color: C.accent, fontFamily: MONO }}>✦</span>
          )}
        </div>
        {item.due_date && (
          <div style={{ fontSize: 10, color: C.yellow, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
            Due {fmtShort(item.due_date)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Compact inline task row with quick-action controls ---- */
function MeetingTaskRow({ task, userId, members, contacts, onUpdate }) {
  var [editingTitle, setEditingTitle] = useState(false);
  var [titleDraft,   setTitleDraft]   = useState(task.title || task.text || "");
  var [saving,       setSaving]       = useState(false);
  var [done,         setDone]         = useState(!!(task.completed_at || task.done));
  var [showAssign,   setShowAssign]   = useState(false);
  var [showDate,     setShowDate]     = useState(false);

  var assigneeOptions = (members || []).map(function (m) {
    return { value: m.invited_email || m.email, label: ownerLabel(m) };
  }).concat(
    (contacts || []).filter(function (c) { return c.email; }).map(function (c) {
      return { value: c.email, label: c.name || c.email };
    })
  );

  function handleMarkDone(e) {
    e.stopPropagation();
    if (saving) return;
    var newDone = !done;
    setDone(newDone);
    setSaving(true);
    onUpdate({ done: newDone })
      .catch(function () { setDone(!newDone); showToast("Couldn't update task"); })
      .finally(function () { setSaving(false); });
  }

  function handleTitleBlur() {
    var trimmed = titleDraft.trim();
    if (!trimmed || trimmed === (task.title || task.text || "")) {
      setEditingTitle(false);
      return;
    }
    setSaving(true);
    onUpdate({ title: trimmed })
      .catch(function () { showToast("Couldn't rename task"); })
      .finally(function () { setSaving(false); setEditingTitle(false); });
  }

  function handleReassign(e) {
    var email = e.target.value;
    if (!email) return;
    setShowAssign(false);
    onUpdate({ assignee_email: email })
      .catch(function () { showToast("Couldn't reassign task"); });
  }

  function handleDateChange(e) {
    var val = e.target.value;
    setShowDate(false);
    onUpdate({ due_date: val || null })
      .catch(function () { showToast("Couldn't set due date"); });
  }

  var displayTitle = task.title || task.text || "Untitled";
  var currentAssignee = task.assignee_email || task.owner || null;
  var currentDue = task.due_date || null;
  var isOverdue = currentDue && currentDue < new Date().toISOString().slice(0, 10);

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8,
      padding: "7px 10px",
      background: done ? C.surface3 : C.surface,
      borderRadius: 8,
      border: "1px solid " + C.rule,
      marginBottom: 5,
      opacity: done ? 0.55 : 1,
      transition: "opacity 0.2s",
    }}>
      {/* Checkbox */}
      <button
        type="button"
        onClick={handleMarkDone}
        aria-label={done ? "Mark incomplete" : "Mark done"}
        style={{
          flexShrink: 0, width: 22, height: 22,
          border: "1.5px solid " + (done ? C.accent : C.accentDim),
          borderRadius: 5, background: done ? C.accent : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", marginTop: 1,
        }}
      >
        {done && <span style={{ color: C.bg, fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}
      </button>

      {/* Title + sub-row actions */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editingTitle ? (
          <input
            type="text"
            value={titleDraft}
            onChange={function (e) { setTitleDraft(e.target.value); }}
            onBlur={handleTitleBlur}
            onKeyDown={function (e) {
              if (e.key === "Enter") { e.preventDefault(); handleTitleBlur(); }
              if (e.key === "Escape") { setEditingTitle(false); setTitleDraft(task.title || task.text || ""); }
            }}
            autoFocus
            style={{
              width: "100%", background: C.bg,
              border: "1px solid " + C.accentLine, borderRadius: 4,
              padding: "3px 6px", fontSize: 16, color: C.text,
              fontFamily: INTER, outline: "none",
              boxSizing: "border-box",
            }}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={function () { setEditingTitle(true); setTitleDraft(task.title || task.text || ""); }}
            onKeyDown={function (e) {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditingTitle(true); }
            }}
            style={{
              fontSize: 12.5, color: done ? C.textMuted : C.text,
              lineHeight: 1.4, cursor: "text",
              textDecoration: done ? "line-through" : "none",
              wordBreak: "break-word",
            }}
          >
            {displayTitle}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
          {/* Assignee chip */}
          {showAssign ? (
            <select
              autoFocus
              onChange={handleReassign}
              onBlur={function () { setShowAssign(false); }}
              style={{
                fontSize: 16, padding: "2px 5px",
                background: C.surface, border: "1px solid " + C.rule,
                borderRadius: 4, color: C.text,
                fontFamily: INTER, outline: "none",
              }}
            >
              <option value="">Select…</option>
              {assigneeOptions.map(function (opt) {
                return <option key={opt.value} value={opt.value}>{opt.label}</option>;
              })}
            </select>
          ) : (
            <button
              type="button"
              onClick={function (e) { e.stopPropagation(); setShowAssign(true); setShowDate(false); }}
              title="Reassign"
              style={{
                background: currentAssignee ? C.accentFaint : "transparent",
                border: "1px solid " + (currentAssignee ? C.accentLine : C.rule),
                borderRadius: 12, padding: "2px 7px",
                fontSize: 10, color: currentAssignee ? C.accent : C.textMuted,
                fontFamily: INTER, cursor: "pointer", lineHeight: 1.4,
              }}
            >
              {currentAssignee
                ? ownerLabel(currentAssignee).slice(0, 14)
                : "Assign"}
            </button>
          )}
          {/* Due date chip */}
          {showDate ? (
            <input
              type="date"
              defaultValue={currentDue || ""}
              autoFocus
              onChange={handleDateChange}
              onBlur={function () { setShowDate(false); }}
              style={{
                fontSize: 16, padding: "2px 5px",
                background: C.surface, border: "1px solid " + C.rule,
                borderRadius: 4, color: C.text, fontFamily: INTER, outline: "none",
              }}
            />
          ) : (
            <button
              type="button"
              onClick={function (e) { e.stopPropagation(); setShowDate(true); setShowAssign(false); }}
              title="Set due date"
              style={{
                background: isOverdue ? C.yellowFaint : (currentDue ? C.accentFaint : "transparent"),
                border: "1px solid " + (isOverdue ? C.yellow : (currentDue ? C.accentLine : C.rule)),
                borderRadius: 12, padding: "2px 7px",
                fontSize: 10, color: isOverdue ? C.yellow : (currentDue ? C.accent : C.textMuted),
                fontFamily: INTER, cursor: "pointer", lineHeight: 1.4,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {currentDue
                ? fmtShort(currentDue)
                : "Due date"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Inline add-task form for a project ---- */
function AddTaskInlineForm({ projectId, accountId, userId, members, contacts, onAddTask, onCancel }) {
  var [title,    setTitle]    = useState("");
  var [assignee, setAssignee] = useState("");
  var [dueDate,  setDueDate]  = useState("");
  var [saving,   setSaving]   = useState(false);

  var assigneeOptions = (members || []).map(function (m) {
    return { value: m.invited_email || m.email, label: ownerLabel(m) };
  }).concat(
    (contacts || []).filter(function (c) { return c.email; }).map(function (c) {
      return { value: c.email, label: c.name || c.email };
    })
  );

  function handleAdd() {
    var t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    onAddTask({
      title:          t,
      project_id:     projectId,
      account_id:     accountId || null,
      assignee_email: assignee || null,
      due_date:       dueDate  || null,
      status:         "in_progress",
      done:           false,
      user_added:     true,
    }).then(function () {
      setSaving(false);
      onCancel();
      showToast("Task added");
    }).catch(function () {
      setSaving(false);
      showToast("Couldn't add task");
    });
  }

  return (
    <div style={{
      background: C.surface2, border: "1px solid " + C.accentLine,
      borderRadius: 8, padding: "10px 12px", marginBottom: 8,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <input
        type="text"
        value={title}
        onChange={function (e) { setTitle(e.target.value); }}
        onKeyDown={function (e) {
          if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
          if (e.key === "Escape") { onCancel(); }
        }}
        placeholder="Task title…"
        autoFocus
        style={{
          background: C.bg, border: "1px solid " + C.rule, borderRadius: 6,
          padding: "6px 10px", fontSize: 16, color: C.text,
          fontFamily: INTER, outline: "none",
          width: "100%", boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {assigneeOptions.length > 0 && (
          <select
            value={assignee}
            onChange={function (e) { setAssignee(e.target.value); }}
            style={{
              fontSize: 16, padding: "4px 8px",
              background: C.surface, border: "1px solid " + C.rule,
              borderRadius: 6, color: C.text,
              fontFamily: INTER, outline: "none", flex: 1, minWidth: 100,
            }}
          >
            <option value="">Assignee…</option>
            {assigneeOptions.map(function (opt) {
              return <option key={opt.value} value={opt.value}>{opt.label}</option>;
            })}
          </select>
        )}
        <input
          type="date"
          value={dueDate}
          onChange={function (e) { setDueDate(e.target.value); }}
          style={{
            fontSize: 16, padding: "4px 8px",
            background: C.surface, border: "1px solid " + C.rule,
            borderRadius: 6, color: C.text,
            fontFamily: INTER, outline: "none",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "none", border: "1px solid " + C.rule, borderRadius: 6,
            padding: "5px 12px", fontSize: 11, color: C.textMuted,
            fontFamily: INTER, cursor: "pointer",
          }}
        >Cancel</button>
        <button
          type="button"
          disabled={!title.trim() || saving}
          onClick={handleAdd}
          style={{
            background: !title.trim() || saving ? C.accentFaint : C.accentDeep,
            border: "none", borderRadius: 6,
            padding: "5px 14px", fontSize: 11, fontWeight: 700,
            color: !title.trim() || saving ? C.textMuted : C.bg,
            fontFamily: INTER, cursor: !title.trim() || saving ? "default" : "pointer",
          }}
        >{saving ? "Adding…" : "Add Task"}</button>
      </div>
    </div>
  );
}

/* ---- Inline-expandable Gauge project card ---- */
export function HubProjectCard({ project, accounts, members, userEmail, onUpdateProject, discussed, mentioned, onToggleDiscussed, onUpdateTask, onAddTask, userId, contacts }) {
  var [open,          setOpen]          = useState(false);
  var [addTaskOpen,   setAddTaskOpen]   = useState(false);
  var isPlanning   = project.status === "planned" || project.status === "on_hold";
  var statusColor  = isPlanning ? C.yellow : C.accent;
  var statusKey    = (project.status || "planned").split("_").map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join("");
  var statusStyle  = C["status" + statusKey] || C.statusPlanned;
  var tasks        = project.tasks || [];
  var doneCount    = tasks.filter(function (t) { return t.completed_at; }).length;

  // Meeting-hub task edits operate on the project's folio_tasks (the canonical
  // store, hydrated onto project.tasks). Build the full next-array, reconcile
  // it to folio_tasks, and auto-flip project status (autoStatusPatch).
  function persistStages(nextStages) {
    var sp = autoStatusPatch(nextStages, project.status, project.is_standing);
    if (sp) onUpdateProject(project.id, sp);
    // Pass the editor's OWN pre-mutation view (project.tasks) as currentStages so
    // reconcile diffs against what the next-array was built from — not a possibly
    // realtime-refreshed project.tasks — preventing duplicate re-inserts on edit.
    return reconcileProjectTasks(userId, project, nextStages, project.tasks || []);
  }
  function updateStageAt(idx, fields) {
    var next = (project.tasks || []).map(function (s, i) {
      if (i !== idx) return s;
      var patch = Object.assign({}, s);
      if (Object.prototype.hasOwnProperty.call(fields, "done")) {
        patch.completed_at = fields.done ? (s.completed_at || new Date().toISOString()) : null;
      }
      if (Object.prototype.hasOwnProperty.call(fields, "title")) patch.title = fields.title;
      if (Object.prototype.hasOwnProperty.call(fields, "assignee_email")) patch.assignee_email = fields.assignee_email;
      if (Object.prototype.hasOwnProperty.call(fields, "due_date")) patch.due_date = fields.due_date;
      return patch;
    });
    return persistStages(next);
  }
  function addStage(payload) {
    var newStage = {
      title:          payload.title,
      completed_at:   null,
      is_external:    false,
      blocked_reason: null,
      sub_stages:     [],
      assignee_email: payload.assignee_email || null,
      due_date:       payload.due_date || null,
    };
    return persistStages((project.tasks || []).concat([newStage]));
  }

  return (
    <div style={{
      background: C.surface,
      border: "1px solid " + (project.status === "blocked" ? C.statusBlocked.border : C.rule),
      borderLeft: discussed ? "3px solid " + C.accent : undefined,
      borderRadius: 10,
      overflow: "hidden",
      boxShadow: mentioned && !discussed ? "0 0 0 1.5px " + C.accentLine : undefined,
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
            {project.due_date && <span>Due {fmtShort(project.due_date)}</span>}
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
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 10, color: statusColor, fontFamily: MONO,
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {onToggleDiscussed && (
            <button
              type="button"
              onClick={function (e) { e.stopPropagation(); onToggleDiscussed(); }}
              title={discussed ? "Remove discussed flag" : "Mark as discussed"}
              aria-label={discussed ? "Remove discussed flag" : "Mark as discussed"}
              style={{
                background: discussed ? C.accentFaint : "transparent",
                border: "1px solid " + (discussed ? C.accentLine : C.rule),
                borderRadius: 6,
                padding: "6px 8px",
                fontFamily: MONO, fontSize: 9,
                color: discussed ? C.accent : C.textMuted,
                cursor: "pointer",
                letterSpacing: "0.07em", textTransform: "uppercase",
                lineHeight: 1,
                minWidth: 44, minHeight: 44,
                display: "flex", alignItems: "center", justifyContent: "center",
                whiteSpace: "nowrap",
              }}
            >
              {discussed ? "✦ Discussed" : "◇ Mark discussed"}
            </button>
          )}
          <span>{open ? "Collapse" : "Expand"}</span>
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

          {/* Quick-action task list — shown when onUpdateTask is wired (meeting mode) */}
          {onUpdateTask && tasks.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{
                fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
                textTransform: "uppercase", letterSpacing: "0.08em",
                marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span>Tasks · Quick Actions</span>
                {onAddTask && (
                  <button
                    type="button"
                    onClick={function (e) { e.stopPropagation(); setAddTaskOpen(function (v) { return !v; }); }}
                    style={{
                      background: C.accentFaint, border: "1px solid " + C.accentLine,
                      borderRadius: 5, padding: "2px 8px",
                      fontSize: 10, fontFamily: MONO, color: C.accent,
                      cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
                    }}
                  >+ Task</button>
                )}
              </div>
              {addTaskOpen && onAddTask && (
                <AddTaskInlineForm
                  projectId={project.id}
                  accountId={project.account_id || null}
                  userId={userId}
                  members={members}
                  contacts={contacts}
                  onAddTask={addStage}
                  onCancel={function () { setAddTaskOpen(false); }}
                />
              )}
              {tasks.map(function (t, idx) {
                if (t.completed_at) return null;
                return (
                  <MeetingTaskRow
                    key={t.id || idx}
                    task={t}
                    userId={userId}
                    members={members}
                    contacts={contacts}
                    onUpdate={function (fields) { return updateStageAt(idx, fields); }}
                  />
                );
              })}
              {tasks.filter(function (t) { return !!t.completed_at; }).length > 0 && (
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4, fontFamily: MONO }}>
                  + {tasks.filter(function (t) { return !!t.completed_at; }).length} completed
                </div>
              )}
            </div>
          )}

          {/* + Task button when no tasks exist yet */}
          {onUpdateTask && tasks.length === 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{
                fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
                textTransform: "uppercase", letterSpacing: "0.08em",
                marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span>Tasks</span>
                {onAddTask && (
                  <button
                    type="button"
                    onClick={function (e) { e.stopPropagation(); setAddTaskOpen(function (v) { return !v; }); }}
                    style={{
                      background: C.accentFaint, border: "1px solid " + C.accentLine,
                      borderRadius: 5, padding: "2px 8px",
                      fontSize: 10, fontFamily: MONO, color: C.accent,
                      cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
                    }}
                  >+ Task</button>
                )}
              </div>
              {addTaskOpen && onAddTask && (
                <AddTaskInlineForm
                  projectId={project.id}
                  accountId={project.account_id || null}
                  userId={userId}
                  members={members}
                  contacts={contacts}
                  onAddTask={addStage}
                  onCancel={function () { setAddTaskOpen(false); }}
                />
              )}
              {!addTaskOpen && (
                <div style={{ fontSize: 11, color: C.textMuted }}>No tasks yet.</div>
              )}
            </div>
          )}

          {/* Full editor — always shown when onUpdateTask is NOT wired (outside meeting mode) */}
          {!onUpdateTask && (
            <>
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
                  contacts={contacts}
                  aliases={[]}
                  userId={userId}
                  userEmail={userEmail}
                  onUpdate={onUpdateProject}
                />
              ) : (
                <ProjectStageEditor
                  project={project}
                  userId={userId}
                  onUpdate={onUpdateProject}
                  accounts={accounts}
                  members={members}
                  userEmail={userEmail}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Portfolio brief panel (for person 1:1 cadences) ---- */
function PortfolioBriefPanel({ brief, loading, error, onRefresh }) {
  return (
    <div style={{
      background: C.accentGlow, border: "1px solid " + C.accentLine,
      borderRadius: 12, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <PipMark size={8} color={C.accent} glow pulse={loading} />
          <div style={{ fontSize: 10, color: C.accent, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
            Pip · Portfolio Brief
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            background: "none", border: "1px solid " + C.accentSubtle, borderRadius: 6,
            padding: "3px 9px", fontSize: 10, fontWeight: 600,
            color: C.accent, fontFamily: "'Inter', system-ui, sans-serif", cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "Working…" : (brief ? "Refresh" : "Generate")}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: C.red }}>{error}</div>}
      {brief ? (
        <MarkdownText text={brief} style={{ fontSize: 14, color: C.textSub, lineHeight: 1.65 }} />
      ) : (!loading && !error && (
        <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
          No portfolio brief yet. Hit Generate for a cross-account morning brief from Pip.
        </div>
      ))}
    </div>
  );
}

/* ---- Main hub ---- */
export function CadenceHub({
  cadence,
  account,
  contact,
  globalPeople,
  userId,
  userEmail,
  orgId,
  members,
  accounts,
  meetings,
  items,
  cadences,
  projects,
  deptProjects,
  contacts,
  addContact,
  addMeeting,
  updateMeeting,
  deleteMeeting,
  updateProject,
  addProject,
  addItem,
  updateItem,
  closeItem,
  onUpdateCadence,
  onUpdateAccount,
  onEditMeeting,
  onBack,
  onOpenAccount,
  isMobile,
  autoOpenMeetingMode,
  onAutoOpenMeetingModeConsumed,
  pipLessonsLearned,
  pipAccountStateRow,
  contactAliases,
}) {
  var isPersonCadence = cadence.cadence_scope === 'person' || !account;
  // Leadership tasks — account-less items from this person/internal cadence.
  var leadershipApi = useLeadershipTasks(userId, isPersonCadence ? cadence.id : null);

  var [briefLoading, setBriefLoading] = useState(false);
  var [briefError, setBriefError]     = useState(null);
  var [briefExpanded, setBriefExpanded] = useState(false);
  var [portfolioBrief, setPortfolioBrief] = useState(null);
  var [portfolioBriefLoading, setPortfolioBriefLoading] = useState(false);
  var [portfolioBriefError, setPortfolioBriefError] = useState(null);
  var [tab, setTab] = useState("notes");
  var [meetingMode, setMeetingMode] = useState(null); // { draft } when active
  var [startingMeeting, setStartingMeeting] = useState(false);
  // Summarize-preview state — keyed by draft id so multiple draft cards
  // each track their own in-flight state without colliding.
  var [summarizingId, setSummarizingId]     = useState(null);
  var [summarizeErrors, setSummarizeErrors] = useState({}); // { draftId: msg }
  var [previewPlan, setPreviewPlan]         = useState(null); // { plan, summary, draftId, suggestedTitle, meetingTitle, unknownPeople }
  var [previewTitleDraft, setPreviewTitleDraft] = useState(null); // edited title from preview modal
  var [prepDismissed, setPrepDismissed] = useState({}); // { questionId: true }
  var [lastDiscussedProjectIds, setLastDiscussedProjectIds] = useState([]);
  var [lastDiscussedItemIds,    setLastDiscussedItemIds]    = useState([]);
  var [readoutMeetingId, setReadoutMeetingId] = useState(null);
  var [readoutEmail, setReadoutEmail]         = useState("");
  var [readoutLoading, setReadoutLoading]     = useState(false);

  var accountId = account ? account.id : null;
  var hintsApi       = usePipAssignmentHints(userId, accountId);
  var correctionsApi = usePipCorrections(userId, accountId);
  var pipFactsApi    = usePipFacts(userId);
  var glossaryApi    = useGlossary(userId, null, accountId);
  var snapshotsApi   = useAccountSnapshots(userId);
  var promiseLog     = usePipPromiseLog(userId, accountId);
  var updatesApi     = useAccountUpdates(userId, accountId);

  // Multi-department cadences (Game Plan 1.8): when the cadence spans extra
  // departments (account_ids beyond the primary), merge their contacts into
  // the roster so attendees/briefs/summarize see everyone.
  var [extraContacts, setExtraContacts] = useState([]);
  useEffect(function () {
    var extraIds = (cadence && Array.isArray(cadence.account_ids) ? cadence.account_ids : [])
      .filter(function (id) { return id && id !== accountId; });
    if (!extraIds.length || !userId) { setExtraContacts([]); return; }
    var cancelled = false;
    supabase.from("folio_contacts").select("*").eq("user_id", userId).in("account_id", extraIds)
      .then(function (r) { if (!cancelled && !r.error) setExtraContacts(r.data || []); });
    return function () { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadence && cadence.id, (cadence && Array.isArray(cadence.account_ids) ? cadence.account_ids.join(",") : ""), userId]);
  var rosterContacts = useMemo(function () {
    if (!extraContacts.length) return contacts || [];
    var seen = {};
    return (contacts || []).concat(extraContacts).filter(function (c) {
      if (seen[c.id]) return false;
      seen[c.id] = true;
      return true;
    });
  }, [contacts, extraContacts]);
  var userProfileApi = useUserProfile(userId);
  var userProfile    = userProfileApi.profile;

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

  // History — for an account hub, widened to ALL meetings on the account; for a
  // person 1:1 hub, scoped to this cadence so it shows the 1:1's history, not
  // the parent account's unrelated meetings.
  var history = useMemo(function () {
    var source = isPersonCadence ? cadenceMeetings : (meetings || []);
    return source
      .filter(function (m) { return m.status !== "draft"; })
      .sort(function (a, b) {
        return (b.meeting_date || "") > (a.meeting_date || "") ? 1 : -1;
      });
  }, [meetings, cadenceMeetings, isPersonCadence]);

  var openItems = useMemo(function () {
    return (items || []).filter(function (i) { return !i.done; });
  }, [items]);

  var accountNameById = useMemo(function () {
    var map = {};
    (accounts || []).forEach(function (a) { map[a.id] = a.name; });
    return map;
  }, [accounts]);

  // Titles for ALL projects (incl. completed) so expanded history rows can
  // label per-project meeting notes even after the project ships.
  var projectTitleById = useMemo(function () {
    var map = {};
    (projects || []).forEach(function (p) { map[p.id] = p.title; });
    return map;
  }, [projects]);

  var activeProjects = useMemo(function () {
    return (projects || [])
      .filter(function (p) { return p.status !== "complete"; })
      .map(function (p) {
        var ownerName = p.account_id && p.account_id !== accountId
          ? (accountNameById[p.account_id] || null)
          : null;
        return Object.assign({}, p, { _childAccountName: ownerName });
      });
  }, [projects, accountNameById, accountId]);

  var scheduledFollowUps = useMemo(function () {
    var today = todayISO();
    return cadenceMeetings
      .filter(function (m) { return m.follow_up_date && m.follow_up_date >= today; })
      .sort(function (a, b) { return a.follow_up_date > b.follow_up_date ? 1 : -1; });
  }, [cadenceMeetings]);

  var accountRoster = useMemo(function () {
    var glossaryEntries = glossaryApi.entries || [];
    var aliasesByAccount = {};
    glossaryEntries.forEach(function (g) {
      if (!g.account_id) return;
      if (!aliasesByAccount[g.account_id]) aliasesByAccount[g.account_id] = [];
      if (g.aliases && g.aliases.length) {
        aliasesByAccount[g.account_id] = aliasesByAccount[g.account_id].concat(g.aliases);
      }
      if (g.term) aliasesByAccount[g.account_id].push(g.term);
    });
    return (accounts || []).map(function (a) {
      return {
        id:           a.id,
        name:         a.name || "",
        account_type: a.account_type || "standard",
        aliases:      aliasesByAccount[a.id] || [],
      };
    });
  }, [accounts, glossaryApi.entries]);

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
      cadence:          cadence,
      account:          account || {},
      userId:           userId, // H2 — lets the RELATIONSHIP_OWNER:NO guard fire on the pre-call brief
      cadenceLabel:     cadenceLabel,
      meetings:         history,
      openItems:        openItems,
      activeProjects:   activeProjects,
      accountObjective: account ? (account.objective || "") : "",
      accountSystems:   account ? (account.systems   || []) : [],
      glossary:         glossaryApi.entries,
      contacts:         rosterContacts || [],
      pipAccountState:  pipAccountStateRow || null,
      facts:            pipFactsApi.activeFactStrings || [],
      profileProse:     userProfile && userProfile.profile_prose ? userProfile.profile_prose : null,
      // Health momentum + recent account changes → buildAccountContext renders a
      // "trending better/worse and why" line so the brief reads direction, not
      // just a point-in-time snapshot (item 55 #3 follow-up).
      healthSnapshots:  (snapshotsApi.snapshots || []).filter(function (s) { return s.account_id === accountId; }),
      recentUpdates:    (updatesApi.updates || []).slice(0, 6),
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

  // Portfolio brief for person cadences — cached in localStorage per day
  var PORTFOLIO_BRIEF_KEY = "folio_portfolio_brief_" + (userId || "");
  function handleRefreshPortfolioBrief() {
    // Check daily cache
    try {
      var cached = JSON.parse(localStorage.getItem(PORTFOLIO_BRIEF_KEY) || "null");
      if (cached && cached.date === new Date().toISOString().slice(0, 10) && cached.brief) {
        setPortfolioBrief(cached.brief);
        return;
      }
    } catch (e) {}
    setPortfolioBriefLoading(true);
    setPortfolioBriefError(null);
    var rawSnapshots = snapshotsApi.snapshots || [];
    var todayStr = new Date().toISOString().slice(0, 10);
    // Build overdue item text per account so Pip can name them specifically
    var overdueByAccount = {};
    (openItems || []).forEach(function (item) {
      if (!item.done && item.due_date && item.due_date < todayStr) {
        if (!overdueByAccount[item.account_id]) overdueByAccount[item.account_id] = [];
        overdueByAccount[item.account_id].push(item.text || item.title || "Unnamed item");
      }
    });
    var enrichedSnapshots = rawSnapshots.map(function (s) {
      var acct = (accounts || []).find(function (a) { return a.id === s.account_id; });
      return Object.assign({}, s, {
        account_name: acct ? acct.name : s.account_id,
        overdue_items: (overdueByAccount[s.account_id] || []).slice(0, 3),
      });
    });
    callPortfolioBriefPip({
      snapshots: enrichedSnapshots,
      userId: userId,
      // Your own open to-dos from this 1:1 — so Pip can surface them pre-call.
      leadershipTasks: (leadershipApi.tasks || []).slice(0, 8).map(function (t) {
        return { title: t.title, due: t.due_date || null };
      }),
    })
      .then(function (out) {
        var brief = out.brief || out.content || "";
        setPortfolioBrief(brief);
        setPortfolioBriefLoading(false);
        try {
          localStorage.setItem(PORTFOLIO_BRIEF_KEY, JSON.stringify({ date: new Date().toISOString().slice(0, 10), brief: brief }));
        } catch (e) {}
      }).catch(function () {
        setPortfolioBriefLoading(false);
        setPortfolioBriefError("Pip is unavailable right now.");
      });
  }

  // Load portfolio brief from cache on mount for person cadences
  useEffect(function () {
    if (!isPersonCadence) return;
    try {
      var cached = JSON.parse(localStorage.getItem(PORTFOLIO_BRIEF_KEY) || "null");
      if (cached && cached.date === new Date().toISOString().slice(0, 10) && cached.brief) {
        setPortfolioBrief(cached.brief);
      }
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPersonCadence]);

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
      account_id:   accountId || null,
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

  function handleSummarizeRequest(draftPayload, discussedProjectIds, discussedItemIds) {
    var draftId = draftPayload.id;
    if (summarizingId) return;
    setSummarizingId(draftId);
    setLastDiscussedProjectIds(discussedProjectIds || []);
    setLastDiscussedItemIds(discussedItemIds || []);
    setSummarizeErrors(function (prev) { var next = Object.assign({}, prev); delete next[draftId]; return next; });
    // Item 39: open the streaming overlay immediately; Pip's recap streams in
    // live, then the resolve below swaps it for the full plan modal.
    setPreviewPlan({ streaming: true, summary: "", draftId: draftId });
    summarizeDraftPip({
      draft:             draftPayload,
      accountName:       account ? account.name : (contact ? contact.name + " (1:1)" : "1:1 Meeting"),
      cadenceLabel:      cadenceLabel,
      accountId:         accountId,
      existingItems:     openItems,
      activeProjects:    activeProjects,
      orgMembers:        members,
      assignmentHints:   hintsApi.hints,
      corrections:       correctionsApi.corrections,
      accountObjective:  account ? (account.objective || "") : "",
      accountSystems:    account ? (account.systems   || []) : [],
      ownerUserId:       account ? (account.owner_user_id || null) : null,
      userId:            userId || null,
      glossary:          glossaryApi.entries,
      accountRoster:     accountRoster,
      accountType:       account ? (account.account_type || "standard") : "internal_team",
      pipAccountState:   pipAccountStateRow || null,
      isPersonCadence:   isPersonCadence,
      contactName:       contact ? contact.name : null,
      contacts:          rosterContacts || [],
      meetingHistory:    (meetings || [])
        .filter(function (m) { return m.status === "summarized" || m.pip_summary; })
        .slice(0, 5),
      cadence:           cadence || null,
      facts:             pipFactsApi.activeFactStrings || [],
      healthSnapshots:   (snapshotsApi.snapshots || []).filter(function (s) { return s.account_id === accountId; }),
      promiseStats:      promiseLog || null,
      recentUpdates:     (updatesApi.updates || []).slice(0, 6),
      globalPeople:      globalPeople || [],
      openItems:         openItems,
      profileProse:      userProfile && userProfile.profile_prose ? userProfile.profile_prose : null,
      discussedProjectIds: discussedProjectIds || [],
      discussedItemIds:    discussedItemIds    || [],
    }, {
      onRecap: function (txt) {
        setPreviewPlan(function (prev) {
          return prev && prev.streaming && prev.draftId === draftId
            ? Object.assign({}, prev, { summary: txt }) : prev;
        });
      },
    }).then(function (out) {
      var followUp = out.follow_up_date || null;
      return updateMeeting(draftId, {
        pip_summary:     out.summary || null,
        pip_short_title: out.short_title || null,
        pip_tone:        out.tone || null,
        theme:           out.theme || null,
        follow_up_date:  followUp,
        status:          "summarized",
      }).then(function () {
        if (out.tone && onUpdateAccount && account) onUpdateAccount({ pip_tone: out.tone });
        return out;
      });
    }).then(function (out) {
      setSummarizingId(null);
      setPreviewTitleDraft(null);
      setPreviewPlan({
        plan:           out.plan || [],
        summary:        out.summary || "",
        draftId:        draftId,
        skippedByPip:   !!out.skippedByPip,
        suggestedTitle: out.suggested_title || null,
        meetingTitle:   draftPayload.title || null,
        unknownPeople:  out.unknown_people || [],
        receipts:       out.receipts || [],
      });
      // The meeting is already marked summarized; close meeting mode if it was open.
      if (meetingMode && meetingMode.draft && meetingMode.draft.id === draftId) {
        setMeetingMode(null);
      }
    }).catch(function (err) {
      setSummarizingId(null);
      setPreviewPlan(function (prev) { return prev && prev.streaming ? null : prev; });
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
      // Person/internal 1:1 → default items account-less (leadership tasks);
      // per-row routing can still send a specific item to an account.
      accountId:      isPersonCadence ? null : accountId,
      cadenceId:      cadence ? cadence.id : null,
      meetingId:      draftId || null,
      activeProjects: activeProjects,
      userId:         userId,
      orgId:          orgId || null,
    }).then(function (result) {
      if (draftId) {
        updateMeeting(draftId, { plan_applied_at: new Date().toISOString() })
          .catch(function () { /* badge is nice-to-have; don't fail apply on it */ });
      }
      setPreviewPlan(null);
      setPreviewTitleDraft(null);
      return result;
    });
  }

  function handleCancelPlan() { setPreviewPlan(null); setPreviewTitleDraft(null); }

  function handleGenerateReadout(meeting) {
    if (readoutLoading) return;
    setReadoutMeetingId(meeting.id);
    setReadoutEmail("");
    setReadoutLoading(true);
    supabase.auth.getSession().then(function (result) {
      var token = result.data.session ? result.data.session.access_token : null;
      var headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;
      // Recent logged wins (brag file) → the boss readout can bank what went right,
      // not just surface risks. One-shot fetch; the readout is infrequent.
      var winsSinceIso = new Date(Date.now() - 30 * 86400000).toISOString();
      return supabase.from("folio_wins")
        .select("title, created_at").eq("user_id", userId)
        .gte("created_at", winsSinceIso)
        .order("created_at", { ascending: false }).limit(15)
        .then(function (wr) {
          var recentWins = (wr && wr.data ? wr.data : []).map(function (w) { return w.title; });
          return fetch("/api/leadership-readout", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
              userId: userId,
              meetingSummary: meeting.pip_summary || meeting.notes || "",
              actionItems: [],
              contactName: contact ? contact.name : null,
              portfolioState: (snapshotsApi.snapshots || []).map(function (s) {
                var acc = (accounts || []).find(function (a) { return a.id === s.account_id; });
                return Object.assign({}, s, { account_name: acc ? acc.name : "Account" });
              }),
              wins:         recentWins,
              facts:        pipFactsApi.activeFactStrings || [],
              profileProse: userProfile && userProfile.profile_prose ? userProfile.profile_prose : null,
            }),
          });
        });
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        setReadoutLoading(false);
        if (data.email) setReadoutEmail(data.email);
        else setReadoutEmail("Pip couldn't generate the readout. Try again.");
      })
      .catch(function () {
        setReadoutLoading(false);
        setReadoutEmail("Something went wrong. Check your connection.");
      });
  }

  // After updateMeeting in meeting mode, the draft object passed to the
  // overlay can fall behind. The overlay reads only `draft.notes` for its
  // initial state, so passing the latest meeting from the meetings list keeps
  // it consistent if the user re-enters meeting mode.
  var currentMeetingModeDraft = useMemo(function () {
    if (!meetingMode) return null;
    var match = (meetings || []).find(function (m) { return m.id === meetingMode.draft.id; });
    return match || meetingMode.draft;
  }, [meetingMode, meetings]);

  /* ---- Pre-meeting check-in questions (deterministic, zero AI cost) ---- */
  var prepQuestions = useMemo(function () {
    if (isPersonCadence) return [];
    var today = new Date().toISOString().slice(0, 10);
    var qs = [];
    // 1. Waiting-on projects
    activeProjects.forEach(function (p) {
      if (p.waiting_on && qs.length < 3) {
        qs.push({
          id: "wait_" + p.id,
          text: "Did " + p.waiting_on + " get back to you on " + p.title + "?",
          yesLabel: "Yes — clear it",
          noLabel: "Still waiting",
          onYes: function () { updateProject(p.id, { waiting_on: null, waiting_on_since: null }); },
        });
      }
    });
    // 2. Blocked projects
    activeProjects.forEach(function (p) {
      if (p.status === "blocked" && qs.length < 3) {
        qs.push({
          id: "blocked_" + p.id,
          text: p.title + " is blocked — resolved?",
          yesLabel: "Unblocked",
          noLabel: "Still blocked",
          onYes: function () { updateProject(p.id, { status: "in_progress" }); },
        });
      }
    });
    // 3. Overdue commitments
    openItems.forEach(function (i) {
      if (i.is_commitment && i.due_date && i.due_date < today && qs.length < 3) {
        qs.push({
          id: "commit_" + i.id,
          text: "Did you deliver on “" + (i.text || i.title) + "”?",
          yesLabel: "Done ✓",
          noLabel: "Not yet",
          onYes: function () { closeItem(i.id); },
        });
      }
    });
    return qs;
  }, [activeProjects, openItems, isPersonCadence, updateProject, closeItem]);

  var visiblePrepQuestions = prepQuestions.filter(function (q) { return !prepDismissed[q.id]; });

  var prepCheckInSection = visiblePrepQuestions.length > 0 ? (
    <div style={{
      background: C.surface2, border: "1px solid " + C.rule,
      borderLeft: "2px solid " + C.accent,
      borderRadius: 10, padding: "12px 14px",
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 9.5, color: C.accent, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10,
      }}>
        ✦ Before you start
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visiblePrepQuestions.map(function (q) {
          return (
            <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, fontFamily: "'Inter', system-ui, sans-serif" }}>
                {q.text}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={function () {
                    q.onYes();
                    setPrepDismissed(function (prev) { return Object.assign({}, prev, { [q.id]: true }); });
                  }}
                  style={{
                    padding: "4px 12px", borderRadius: 6, fontSize: 11,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    cursor: "pointer", fontWeight: 600,
                    background: C.accentFaint, border: "1px solid " + C.accentLine,
                    color: C.accent,
                  }}
                >
                  {q.yesLabel}
                </button>
                <button
                  type="button"
                  onClick={function () {
                    setPrepDismissed(function (prev) { return Object.assign({}, prev, { [q.id]: true }); });
                  }}
                  style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 11,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    cursor: "pointer",
                    background: "transparent", border: "1px solid " + C.rule,
                    color: C.textMuted,
                  }}
                >
                  {q.noLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

  /* ---- Sections ---- */
  // Monday 1:1 pack — promised-vs-done, boss's open asks pre-answered, what
  // moved, who has the ball. Renders for any person/1:1 cadence (prep for the
  // 1:1); the Home card auto-surfaces the Monday one. (Phase 2 #1.)
  var packSection = isPersonCadence ? (
    <MondayPackSection
      userId={userId}
      cadence={cadence}
      accounts={accounts}
      userProfile={userProfile}
      facts={pipFactsApi.activeFactStrings || []}
      personName={contact ? contact.name : null}
      onOpenAccount={onOpenAccount}
      isMobile={isMobile}
    />
  ) : null;

  var briefSection = isPersonCadence ? (
    <PortfolioBriefPanel
      brief={portfolioBrief}
      loading={portfolioBriefLoading}
      error={portfolioBriefError}
      onRefresh={handleRefreshPortfolioBrief}
    />
  ) : (() => {
    // When the nightly operator left a prepped block for this account, show
    // The overnight operator read (when present) shows on top as a situational
    // heads-up. The on-demand cadence brief ALWAYS renders below it so Chris can
    // hit "Brief me for this call" whenever he's about to jump on — it was
    // previously suppressed whenever operator prep existed, which hid the brief
    // (the rich buildAccountContext one) almost all the time. (Chris feedback
    // June 24 2026: "there's no brief button I can find." On mobile it collapses
    // to a single tappable button so the two don't compete for space.)
    var hasOperatorPrep = !!(pipAccountStateRow && pipAccountStateRow.operator_generated_at &&
      (pipAccountStateRow.operator_agenda || pipAccountStateRow.operator_situation));
    return (
      <>
        {hasOperatorPrep && (
          <div style={{
            background: C.surface, border: "1px solid " + C.rule, borderLeft: "2px solid " + C.accent,
            borderRadius: 12, padding: "12px 14px 14px", marginBottom: 10,
          }}>
            <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 7 }}>
              ✦ Pip prepped this overnight
            </div>
            {pipAccountStateRow.operator_situation && (
              <MarkdownText text={pipAccountStateRow.operator_situation} style={{ fontSize: 13.5, color: C.textSub, lineHeight: 1.6 }} />
            )}
            {pipAccountStateRow.operator_agenda && (
              <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1px solid " + C.rule }}>
                <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 9, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
                  Suggested agenda
                </div>
                <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{pipAccountStateRow.operator_agenda}</div>
              </div>
            )}
          </div>
        )}
        <PipBriefPanel
          brief={cadence.pip_brief}
          briefAt={cadence.pip_brief_at}
          loading={briefLoading}
          error={briefError}
          onRefresh={handleRefreshBrief}
          mobileCollapsed={isMobile && (hasOperatorPrep || !briefExpanded)}
          onExpand={function () { setBriefExpanded(true); }}
          lessonsLearned={pipLessonsLearned || null}
          glossary={glossaryApi.entries}
          facts={pipFactsApi.activeFactStrings || []}
        />
      </>
    );
  })();

  var startMeetingSection = (
    <button
      onClick={handleStartMeeting}
      disabled={startingMeeting}
      className="cta-glow"
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

  var projectsSection = isPersonCadence ? null : (
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
                userId={userId}
                onUpdateProject={updateProject}
              />
            );
          })}
        </div>
      )}
    </div>
  );

  var tasksSection = isPersonCadence ? (
    <div>
      <SectionHeader count={leadershipApi.tasks.length}>Leadership Tasks</SectionHeader>
      {leadershipApi.tasks.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textMuted, padding: "6px 0", lineHeight: 1.5 }}>
          Your own to-dos from this 1:1 land here. Items you route to an account during summarize go to that account instead.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {leadershipApi.tasks.map(function (t) {
            var item = { id: t.id, text: t.title, due_date: t.due_date, owner: t.assignee_email, recipient: t.recipient };
            return <OpenItemRow key={t.id} item={item} onClose={leadershipApi.closeTask} />;
          })}
        </div>
      )}
    </div>
  ) : (
    <div>
      <SectionHeader count={openItems.length}>Tasks · Account</SectionHeader>
      {openItems.length === 0 ? (
        <div style={{ fontSize: 12, color: C.green, padding: "6px 0" }}>
          All clear — no open tasks on this account.
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
                    From conversation on {m.meeting_date && fmtShort(m.meeting_date)}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.accent, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {fmtShort(m.follow_up_date)}
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
      {/* Person 1:1 history is scoped to this cadence, not the whole account —
          label it accordingly (item 9a). */}
      <SectionHeader count={history.length}>{isPersonCadence ? "1:1 History" : "Meeting History · Account"}</SectionHeader>
      {history.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textMuted, padding: "6px 0" }}>
          {isPersonCadence ? "No 1:1s logged yet." : "No summarized conversations yet on this account."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {history.map(function (m) {
            return (
              <div key={m.id}>
                <HistoryRow
                  meeting={m}
                  onEdit={onEditMeeting}
                  onDelete={deleteMeeting}
                  accountId={accountId}
                  openItems={openItems}
                  addItem={addItem}
                  isCadenceTied={!!m.cadence_id}
                  projectTitleById={projectTitleById}
                />
                {isPersonCadence && m.pip_summary && (
                  <button
                    onClick={function () { handleGenerateReadout(m); }}
                    style={{
                      background: "none", border: "1px solid " + C.accentLine,
                      borderRadius: 6, padding: "3px 10px", fontSize: 11,
                      color: C.accent, cursor: "pointer", marginTop: 6,
                      fontFamily: INTER, fontWeight: 600,
                    }}
                  >
                    ✦ Leadership Readout
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  /* ---- Header ---- */
  var displayName = isPersonCadence
    ? ("1:1 with " + (contact ? contact.name : "(contact deleted)"))
    : (account ? account.name : "Meeting");
  var displaySubtitle = isPersonCadence
    ? (contact && contact.title ? contact.title : "Person 1:1")
    : null;

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
            {displayName}
          </div>
          {isPersonCadence && displaySubtitle && (
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>
              {displaySubtitle}
            </div>
          )}
          <div style={{ fontSize: 12, color: C.accent, marginTop: 4, fontWeight: 600 }}>
            {cadenceLabel}
            {cadence.meeting_time ? " · " + formatTime(cadence.meeting_time) : ""}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap", fontVariantNumeric: "tabular-nums" }}>
            {lastConvAt !== null && <span>Last: {lastConvAt}d ago</span>}
            {nextDue && <span>Next: {daysUntil(nextDue).toLowerCase()}</span>}
          </div>
        </div>
        {onOpenAccount && !isPersonCadence && (
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
      account={account || null}
      contact={contact || null}
      cadenceLabel={cadenceLabel}
      brief={isPersonCadence ? (portfolioBrief || null) : cadence.pip_brief}
      briefAt={isPersonCadence ? null : cadence.pip_brief_at}
      projects={activeProjects}
      deptProjects={deptProjects ? deptProjects.filter(function (p) { return p.status !== "complete"; }) : undefined}
      openItems={openItems}
      contacts={rosterContacts || []}
      contactAliases={contactAliases || []}
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
      onAddContact={addContact || undefined}
      userId={userId}
      onUpdateTask={userId ? function (taskId, fields) {
        return updateTask(userId, taskId, fields);
      } : undefined}
      onAddTask={userId ? function (payload) {
        return insertTask(userId, payload);
      } : undefined}
    />
  ) : null;

  var streamingOverlay = previewPlan && previewPlan.streaming ? (
    <SummarizeStreamingOverlay summary={previewPlan.summary} />
  ) : null;

  var previewModal = previewPlan && !previewPlan.streaming ? (
    <PipSummarizePreview
      plan={previewPlan.plan}
      assignmentHints={hintsApi.hints}
      existingItems={openItems}
      activeProjects={activeProjects}
      orgMembers={members}
      onApply={handleApplyPlan}
      onCancel={handleCancelPlan}
      onLogCorrections={correctionsApi.logCorrections}
      meetingId={previewPlan.draftId}
      accountRoster={accountRoster}
      currentAccountId={isPersonCadence ? null : accountId}
      skippedByPip={!!previewPlan.skippedByPip}
      isPersonCadence={isPersonCadence}
      suggestedTitle={previewPlan.suggestedTitle || null}
      meetingTitle={previewPlan.meetingTitle || null}
      onTitleChange={function (v) { setPreviewTitleDraft(v); }}
      onTitleSave={function (title) {
        var draftId = previewPlan && previewPlan.draftId;
        if (!draftId) return;
        updateMeeting(draftId, { title: title })
          .catch(function () { /* title save is nice-to-have */ });
      }}
      unknownPeople={previewPlan.unknownPeople || []}
      receipts={previewPlan.receipts || []}
      onAddContact={addContact ? function (data) {
        return addContact(Object.assign({ account_id: accountId }, data));
      } : undefined}
      onCreateProject={addProject ? function (acctId, data) {
        return addProject(Object.assign({}, data, {
          account_id: acctId,
          status: "planned",
        }));
      } : undefined}
      accountContacts={rosterContacts || []}
      discussedProjectIds={lastDiscussedProjectIds}
      discussedItemIds={lastDiscussedItemIds}
    />
  ) : null;

  var readoutModal = readoutMeetingId ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Leadership Readout"
      onClick={function (e) {
        if (e.target === e.currentTarget) {
          setReadoutMeetingId(null);
          setReadoutEmail("");
        }
      }}
      onKeyDown={function (e) {
        if (e.key === "Escape") { setReadoutMeetingId(null); setReadoutEmail(""); }
      }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{
        background: C.surface, borderRadius: 12, padding: 24,
        width: "100%", maxWidth: 520,
        border: "1px solid " + C.rule,
        boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: SERIF, fontSize: 18, color: C.text }}>
            Leadership Readout
          </div>
          <button
            onClick={function () { setReadoutMeetingId(null); setReadoutEmail(""); }}
            aria-label="Close Leadership Readout"
            style={{ background: "none", border: "none", color: C.textMuted, fontSize: 20, cursor: "pointer", padding: "0 4px" }}
          >×</button>
        </div>
        <div style={{ fontFamily: INTER, fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
          {readoutLoading
            ? "Pip is drafting your readout…"
            : "Copy and paste into an email to your manager."}
        </div>
        {readoutLoading && (
          <div style={{ color: C.textMuted, fontSize: 13, fontFamily: INTER }}>
            Generating…
          </div>
        )}
        {readoutEmail && (
          <>
            <textarea
              readOnly
              value={readoutEmail}
              style={{
                width: "100%", minHeight: 200, resize: "vertical",
                background: C.bg, border: "1px solid " + C.rule,
                borderRadius: 8, padding: "10px 12px",
                fontFamily: INTER, fontSize: 16,
                color: C.text, lineHeight: 1.6,
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={function () {
                navigator.clipboard.writeText(readoutEmail).then(function () {
                  showToast("Copied to clipboard");
                }).catch(function () {
                  showToast("Couldn't copy — try again", "error");
                });
              }}
              style={{
                background: C.accent, border: "none", borderRadius: 8,
                padding: "9px 18px", color: C.onAccent, fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: INTER,
                alignSelf: "flex-start",
              }}
            >
              Copy to clipboard
            </button>
          </>
        )}
      </div>
    </div>
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
        {prepCheckInSection && <div style={{ marginBottom: 10 }}>{prepCheckInSection}</div>}
        {packSection && <div style={{ marginBottom: 14 }}>{packSection}</div>}
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
        {streamingOverlay}
      {previewModal}
        {readoutModal}
      </div>
    );
  }

  /* ---- Desktop (top-to-bottom) ---- */
  return (
    <div>
      {header}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {prepCheckInSection}
        {packSection}
        {briefSection}
        {startMeetingSection}
        {draftsSection}
        {projectsSection}
        {tasksSection}
        {followUpsSection}
        {historySection}
      </div>
      {overlay}
      {streamingOverlay}
      {previewModal}
      {readoutModal}
    </div>
  );
}
