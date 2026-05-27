import { useState, useEffect, useRef, useMemo } from "react";
import { C, glass } from "../../lib/colors";
import { showToast } from "../../components/Toast";
import { PipMark } from "../../components/PipMark";
import { MarkdownText } from "../../components/MarkdownText";
import { AmberBtn, SecBtn, DangerBtn } from "../../components/Buttons";
import { FL } from "../../components/FieldLabel";
import { getFrequencyLabel, getNextOccurrence, daysUntil, formatDateFull, formatTime } from "../../lib/cadenceUtils";
import { summarizeDraftPip, callCadenceBriefPip } from "../../lib/pip";
import { supabase } from "../../lib/supabase";
import { CadenceBackfillBanner } from "./CadenceBackfillBanner";

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

/* ---- Draft scratchpad card ---- */
function DraftCard({ draft, accountName, cadenceLabel, onUpdate, onDelete, onSummarized, onAddItem }) {
  var [notes, setNotes]     = useState(draft.notes || "");
  var [title, setTitle]     = useState(draft.title || "");
  var [summarizing, setSummarizing] = useState(false);
  var [summarizeErr, setSummarizeErr] = useState(null);
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
  }, [notes, title]);

  function handleSummarize() {
    if (summarizing) return;
    // Force-flush any pending edit before summarizing
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    setSummarizing(true);
    setSummarizeErr(null);
    var draftPayload = Object.assign({}, draft, { notes: notes, title: title });
    onUpdate(draft.id, { notes: notes, title: title })
      .then(function () {
        return summarizeDraftPip({
          draft:        draftPayload,
          accountName:  accountName,
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
      })
      .catch(function (err) {
        setSummarizing(false);
        setSummarizeErr(err && err.message ? err.message : "Pip couldn't summarize.");
      });
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
              background: "rgba(212,147,42,0.12)", border: "1px solid rgba(212,147,42,0.3)",
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
        placeholder="Notes — autosaves as you type. Add as much or as little as you want, then summarize when you're done."
        style={{
          width: "100%", background: "rgba(0,0,0,0.2)",
          border: "1px solid " + C.border, borderRadius: 8,
          padding: "10px 12px", color: C.text, fontSize: 14, lineHeight: 1.55,
          fontFamily: INTER, resize: "vertical", minHeight: 110, outline: "none",
          boxSizing: "border-box",
        }}
      />

      {summarizeErr && (
        <div style={{ fontSize: 11, color: C.red }}>{summarizeErr}</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
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

/* ---- New conversation composer (always visible) ---- */
function NewConversationComposer({ onCreate, accountName, cadenceLabel }) {
  var [open, setOpen]       = useState(false);
  var [title, setTitle]     = useState("");
  var [method, setMethod]   = useState("phone");
  var [date, setDate]       = useState(todayISO());
  var [saving, setSaving]   = useState(false);

  function reset() {
    setTitle(""); setMethod("phone"); setDate(todayISO()); setSaving(false);
  }

  function handleStart() {
    if (!title.trim()) return;
    setSaving(true);
    onCreate({
      title:        title.trim(),
      method:       method,
      meeting_date: date,
      notes:        "",
      status:       "draft",
    }).then(function () {
      reset();
      setOpen(false);
    }).catch(function () {
      setSaving(false);
    });
  }

  if (!open) {
    return (
      <button
        onClick={function () { setOpen(true); }}
        style={{
          width: "100%",
          background: C.accentFaint, border: "1px dashed " + C.accentSubtle,
          borderRadius: 10, padding: "12px 14px",
          fontSize: 13, fontWeight: 600, color: C.accent,
          fontFamily: INTER, cursor: "pointer",
        }}
      >
        + New conversation
      </button>
    );
  }

  return (
    <div style={Object.assign({}, glass, {
      borderRadius: 10, padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: 10,
    })}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: MONO }}>
        New Conversation · {cadenceLabel}
      </div>
      <input
        type="text"
        value={title}
        onChange={function (e) { setTitle(e.target.value); }}
        placeholder="What's this conversation about?"
        autoFocus
        style={{
          background: "rgba(0,0,0,0.2)", border: "1px solid " + C.border,
          borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 14,
          fontFamily: INTER, outline: "none", boxSizing: "border-box",
        }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input
          type="date"
          value={date}
          onChange={function (e) { setDate(e.target.value); }}
          style={{
            background: "rgba(0,0,0,0.2)", border: "1px solid " + C.border,
            borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 13,
            fontFamily: INTER, outline: "none", colorScheme: "dark",
          }}
        />
        <select
          value={method}
          onChange={function (e) { setMethod(e.target.value); }}
          style={{
            background: "rgba(0,0,0,0.2)", border: "1px solid " + C.border,
            borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 13,
            fontFamily: INTER, outline: "none", cursor: "pointer", appearance: "none",
            colorScheme: "dark",
          }}
        >
          <option value="phone">Phone</option>
          <option value="email">Email</option>
          <option value="video">Video</option>
          <option value="in_person">In Person</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <SecBtn onClick={function () { reset(); setOpen(false); }} style={{ fontSize: 11, padding: "5px 12px" }}>Cancel</SecBtn>
        <AmberBtn onClick={handleStart} disabled={saving || !title.trim()} style={{ fontSize: 11, padding: "5px 12px" }}>
          {saving ? "Starting…" : "Start draft"}
        </AmberBtn>
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
function PipBriefPanel({ brief, briefAt, loading, error, onRefresh, mobileCollapsed, onExpand }) {
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

/* ---- Meeting history row ---- */
function HistoryRow({ meeting, onEdit, onDelete }) {
  var [confirm, setConfirm] = useState(false);
  return (
    <div style={Object.assign({}, glass, { borderRadius: 10, padding: "11px 13px" })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{meeting.title || "Conversation"}</span>
            {meeting.method && (
              <span style={{ fontSize: 9, color: C.textMuted, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {METHOD_LABEL[meeting.method] || meeting.method}
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
function OpenItemRow({ item, onClose }) {
  return (
    <div style={Object.assign({}, glass, { display: "flex", alignItems: "flex-start", gap: 10, borderRadius: 10, padding: "10px 12px" })}>
      <button
        onClick={function () { onClose(item.id); }}
        aria-label="Mark complete"
        style={{
          width: 16, height: 16, borderRadius: 4,
          border: "1.5px solid " + C.accentDim, background: "transparent",
          cursor: "pointer", flexShrink: 0, marginTop: 2,
        }}
      />
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

/* ---- Main hub ---- */
export function CadenceHub({
  cadence,
  account,
  userId,
  meetings,         // all meetings for the account
  items,            // all items for the account
  cadences,         // all cadences for the account (for backfill banner)
  addMeeting,
  updateMeeting,
  deleteMeeting,
  addItem,
  closeItem,
  onUpdateCadence,
  onEditMeeting,
  onBack,
  onOpenAccount,
  isMobile,
}) {
  var [briefLoading, setBriefLoading] = useState(false);
  var [briefError, setBriefError]     = useState(null);
  var [briefExpanded, setBriefExpanded] = useState(false);
  var [tab, setTab] = useState("notes");

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

  var history = useMemo(function () {
    return cadenceMeetings
      .filter(function (m) { return m.status !== "draft"; })
      .sort(function (a, b) {
        return (b.meeting_date || "") > (a.meeting_date || "") ? 1 : -1;
      });
  }, [cadenceMeetings]);

  var openItems = useMemo(function () {
    return (items || []).filter(function (i) { return !i.done; });
  }, [items]);

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

  function handleNewDraft(partial) {
    return addMeeting(Object.assign({
      account_id: account.id,
      user_id:    userId,
      cadence_id: cadence.id,
    }, partial)).then(function (m) {
      showToast("Draft started");
      return m;
    });
  }

  function handleRefreshBrief() {
    setBriefLoading(true);
    setBriefError(null);
    callCadenceBriefPip({
      cadence:      cadence,
      account:      account,
      cadenceLabel: cadenceLabel,
      meetings:     history,
      openItems:    openItems,
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

  var draftsSection = (
    <div>
      <SectionHeader count={drafts.length}>Active Drafts</SectionHeader>
      {drafts.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textMuted, padding: "6px 0 10px" }}>
          No active drafts. Start one below.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {drafts.map(function (d) {
            return (
              <DraftCard
                key={d.id}
                draft={d}
                accountName={account.name}
                cadenceLabel={cadenceLabel}
                onUpdate={updateMeeting}
                onDelete={deleteMeeting}
                onAddItem={addItem}
                onSummarized={function () { /* state syncs via parent hook refetch */ }}
              />
            );
          })}
        </div>
      )}
    </div>
  );

  var composerSection = (
    <NewConversationComposer
      onCreate={handleNewDraft}
      accountName={account.name}
      cadenceLabel={cadenceLabel}
    />
  );

  var historySection = (
    <div>
      <SectionHeader count={history.length}>Meeting History</SectionHeader>
      {history.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textMuted, padding: "6px 0" }}>
          No summarized conversations yet for this cadence.
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
        <div style={{
          display: "flex", gap: 4,
          background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: 3,
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
              {composerSection}
            </>
          )}
          {tab === "history" && historySection}
          {tab === "tasks" && tasksSection}
          {tab === "followups" && followUpsSection}
        </div>
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
        {draftsSection}
        {composerSection}
        {historySection}
        {tasksSection}
        {followUpsSection}
      </div>
    </div>
  );
}
