import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { C, glass } from "../../lib/colors";
import { fmtShort, fmtMedium } from "../../lib/dateUtils";
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
function SidebarSection({ title, count, children, collapsed, action }) {
  if (collapsed) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
        fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
        marginBottom: 8,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span>{title}{typeof count === "number" ? " (" + count + ")" : ""}</span>
        {action}
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

/* Collapsible secondary section (Open Items / People) — keeps the projects
   panel primary while everything stays one tap away. */
function CollapsibleSection({ title, count, open, onToggle, action, children }) {
  return (
    <div style={{
      marginBottom: 12,
      border: "1px solid " + C.rule, borderRadius: 8,
      background: C.surface, overflow: "hidden",
    }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); }
        }}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "9px 12px", cursor: "pointer", userSelect: "none",
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, lineHeight: 1 }}>
          {open ? "▾" : "▸"}
        </span>
        <span style={{
          flex: 1,
          fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
          fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {title}{typeof count === "number" ? " (" + count + ")" : ""}
        </span>
        {action}
      </div>
      {open && <div style={{ padding: "2px 12px 12px" }}>{children}</div>}
    </div>
  );
}

/* Inline quick-add contact form — one implementation shared by the desktop
   People section and the mobile Projects pane (coherence rule). */
function AddContactInline({ isMobile, onSave, onCancel }) {
  var [name,   setName]   = useState("");
  var [role,   setRole]   = useState("");
  var [email,  setEmail]  = useState("");
  var [saving, setSaving] = useState(false);
  var inputStyle = {
    background: C.bg, border: "1px solid " + C.rule, borderRadius: 4,
    padding: "5px 8px", fontSize: 16, color: C.text,
    fontFamily: INTER, outline: "none",
    width: "100%", boxSizing: "border-box",
  };
  function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    Promise.resolve(onSave({
      name:  name.trim(),
      title: role.trim()  || null,
      email: email.trim() || null,
    })).catch(function () { /* parent shows the toast; keep the form open */ })
      .finally(function () { setSaving(false); });
  }
  return (
    <div style={{
      background: C.surface3, border: "1px solid " + C.rule,
      borderRadius: 6, padding: "8px 10px",
      marginBottom: 8,
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <input type="text" value={name} onChange={function (e) { setName(e.target.value); }} placeholder="Name *" autoFocus style={inputStyle} />
      <input type="text" value={role} onChange={function (e) { setRole(e.target.value); }} placeholder="Role / Title" style={inputStyle} />
      <input type="email" value={email} onChange={function (e) { setEmail(e.target.value); }} placeholder="Email" style={inputStyle} />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "none", border: "1px solid " + C.rule, borderRadius: 4,
            padding: "4px 10px", fontSize: 11, color: C.textMuted,
            fontFamily: INTER, cursor: "pointer",
          }}
        >Cancel</button>
        <button
          type="button"
          disabled={!name.trim() || saving}
          onClick={save}
          style={{
            background: !name.trim() || saving ? C.accentFaint : C.accentDeep,
            border: "none", borderRadius: 4,
            padding: "4px 10px", fontSize: 11, fontWeight: 700,
            color: !name.trim() || saving ? C.textMuted : C.bg,
            fontFamily: INTER,
            cursor: !name.trim() || saving ? "default" : "pointer",
          }}
        >{saving ? "Saving…" : "Add"}</button>
      </div>
    </div>
  );
}

/* Project card + its own meeting-note field (item 41). Marking a project
   discussed reveals the note field; the note is optional. Un-discussing a
   project with typed notes asks before discarding — a stray tap must never
   nuke notes. */
function MeetingProjectCard({
  project, isMobile, discussed, mentioned, note, pendingUndiscuss,
  onToggleDiscussed, onNoteChange, onDiscardNote, onKeepNote, hubProps,
}) {
  return (
    <div>
      <HubProjectCard
        project={project}
        accounts={hubProps.accounts}
        members={hubProps.members}
        contacts={hubProps.contacts}
        userEmail={hubProps.userEmail}
        onUpdateProject={hubProps.onUpdateProject}
        userId={hubProps.userId}
        onUpdateTask={hubProps.onUpdateTask}
        onAddTask={hubProps.onAddTask}
        discussed={discussed}
        mentioned={mentioned}
        onToggleDiscussed={onToggleDiscussed}
      />
      {discussed && (
        <div style={{ marginTop: 6, marginLeft: 10, paddingLeft: 10, borderLeft: "2px solid " + C.accentLine }}>
          {pendingUndiscuss && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              background: C.yellowFaint || C.surface3,
              border: "1px solid " + (C.yellow || C.rule),
              borderRadius: 6, padding: "6px 10px", marginBottom: 6,
            }}>
              <span style={{ fontSize: 11.5, color: C.text, flex: 1, minWidth: 140 }}>
                Un-discussing discards this project's typed notes.
              </span>
              <button
                type="button"
                onClick={onDiscardNote}
                style={{
                  background: "none", border: "1px solid " + C.redLine,
                  borderRadius: 4, padding: "3px 9px", fontSize: 11,
                  color: C.red, fontFamily: INTER, cursor: "pointer", fontWeight: 600,
                }}
              >Discard notes</button>
              <button
                type="button"
                onClick={onKeepNote}
                style={{
                  background: "none", border: "1px solid " + C.rule,
                  borderRadius: 4, padding: "3px 9px", fontSize: 11,
                  color: C.textMuted, fontFamily: INTER, cursor: "pointer",
                }}
              >Keep</button>
            </div>
          )}
          <textarea
            value={note || ""}
            onChange={function (e) { onNoteChange(e.target.value); }}
            placeholder={'Notes for "' + (project.title || "this project") + '" — optional, Pip routes them here'}
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box",
              background: C.surface, color: C.text,
              border: "1px solid " + C.rule, borderRadius: 8,
              padding: "8px 10px",
              fontFamily: INTER, fontSize: isMobile ? 16 : 13.5, lineHeight: 1.55,
              resize: "vertical", outline: "none", minHeight: 56,
            }}
          />
        </div>
      )}
    </div>
  );
}

export function CadenceMeetingMode({
  draft,
  account,
  contact,
  cadenceLabel,
  brief,
  briefAt,
  projects,
  deptProjects,
  openItems,
  contacts,
  contactAliases,
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
  onAddContact,
  userId,
  onUpdateTask,
  onAddTask,
}) {
  var isDesktop                         = useBreakpoint();
  var isMobile                          = !isDesktop;
  var [notes, setNotes]                 = useState(draft.notes || "");
  var [discussedProjectIds, setDiscussedProjectIds] = useState([]);
  var [discussedItemIds,    setDiscussedItemIds]    = useState([]);
  var [mentionedProjectIds, setMentionedProjectIds] = useState([]);
  var [mentionedItemIds,    setMentionedItemIds]    = useState([]);
  var [projectScope, setProjectScope]              = useState("all"); // "all" | "dept"
  var effectiveProjects = (deptProjects && projectScope === "dept") ? deptProjects : (projects || []);
  // Voice dictation state
  var [recording, setRecording]         = useState(false);
  var recognitionRef                    = useRef(null);
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
  // Mobile split-screen-in-time: "notes" = full-width general notepad,
  // "projects" = full-width projects pane (item 41's locked mobile design).
  var [mobileMode, setMobileMode]       = useState("notes");
  var [quickItem, setQuickItem]         = useState("");
  var [addContactOpen, setAddContactOpen]   = useState(false);
  var [focusMode, setFocusMode]         = useState(false);
  var [attendees, setAttendees]         = useState(Array.isArray(draft.attendees) ? draft.attendees.slice() : []);
  // Per-project meeting notes — { [projectId]: noteText }, persisted to
  // folio_meetings.project_notes (item 41).
  var [projectNotes, setProjectNotes]   = useState(function () {
    return draft.project_notes && typeof draft.project_notes === "object"
      ? Object.assign({}, draft.project_notes) : {};
  });
  var [pendingUndiscussId, setPendingUndiscussId] = useState(null);
  var [itemsOpen,  setItemsOpen]  = useState(false);
  var [peopleOpen, setPeopleOpen] = useState(false);
  var saveTimer = useRef(null);
  var attendeesTimer = useRef(null);
  var projectNotesTimer = useRef(null);
  // Tombstones for project-note keys the user deleted locally. The autosave merges
  // local notes over the realtime-fresh DB map; without a tombstone, a key cleared
  // on this device gets resurrected from the DB copy. Cleared when the key is set again.
  var deletedNotesRef = useRef({});
  var notesRef  = useRef(null);
  var handleCloseRef = useRef(null);

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

  // Debounced per-project notes sync — same cadence as the main notes autosave.
  // Read-modify-write: merge our local changes on top of the DB's current state
  // (draft.project_notes is kept fresh by the realtime hook) so two devices
  // editing different project note fields never clobber each other.
  useEffect(function () {
    if (projectNotesTimer.current) clearTimeout(projectNotesTimer.current);
    var saved = draft.project_notes && typeof draft.project_notes === "object" ? draft.project_notes : {};
    if (JSON.stringify(saved) === JSON.stringify(projectNotes)) return;
    projectNotesTimer.current = setTimeout(function () {
      // Merge: start from the latest DB state, overlay our local keys, then drop
      // any key we deleted locally (tombstone) so a concurrent device's copy can't
      // resurrect a note the user cleared here.
      var latest = draft.project_notes && typeof draft.project_notes === "object" ? draft.project_notes : {};
      var merged = Object.assign({}, latest, projectNotes);
      Object.keys(deletedNotesRef.current).forEach(function (pid) { delete merged[pid]; });
      onUpdate(draft.id, { project_notes: merged }).catch(function (e) {
        console.error("Meeting mode project notes save failed:", e);
      });
    }, 1500);
    return function () { if (projectNotesTimer.current) clearTimeout(projectNotesTimer.current); };
  }, [projectNotes]);

  function toggleAttendee(name) {
    setAttendees(function (prev) {
      return prev.indexOf(name) >= 0
        ? prev.filter(function (n) { return n !== name; })
        : prev.concat([name]);
    });
  }

  function toggleProjectDiscussed(pid) {
    var isDiscussed = discussedProjectIds.indexOf(pid) !== -1;
    var hasNote = projectNotes[pid] && String(projectNotes[pid]).trim();
    if (isDiscussed && hasNote) { setPendingUndiscussId(pid); return; }
    setPendingUndiscussId(null);
    setDiscussedProjectIds(function (prev) {
      return prev.indexOf(pid) !== -1
        ? prev.filter(function (id) { return id !== pid; })
        : prev.concat([pid]);
    });
  }
  function discardProjectNote(pid) {
    deletedNotesRef.current[pid] = true; // tombstone — survive the merge until re-set
    setProjectNotes(function (prev) { var next = Object.assign({}, prev); delete next[pid]; return next; });
    setDiscussedProjectIds(function (prev) { return prev.filter(function (id) { return id !== pid; }); });
    setPendingUndiscussId(null);
  }
  function setProjectNote(pid, text) {
    delete deletedNotesRef.current[pid]; // re-typing clears the tombstone
    setProjectNotes(function (prev) { var next = Object.assign({}, prev); next[pid] = text; return next; });
  }

  // Live fuzzy match — highlight sidebar cards whose title/text appears in notes.
  // Runs debounced 300ms after each keystroke so it never blocks typing.
  useEffect(function () {
    var timer = setTimeout(function () {
      var lower = (notes || "").toLowerCase();
      var pIds = (projects || []).filter(function (p) {
        if (!p || !p.title) return false;
        var title = p.title.toLowerCase();
        if (title.length >= 3 && lower.indexOf(title) !== -1) return true;
        return title.split(/\s+/).filter(function (w) {
          return w.length >= 3 && ["and","the","for","auto","inc","llc","corp","ltd","group"].indexOf(w) === -1;
        }).some(function (w) {
          return new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(notes);
        });
      }).map(function (p) { return p.id; });

      var iIds = (openItems || []).filter(function (item) {
        if (!item || !item.text) return false;
        var text = item.text.toLowerCase();
        return text.length >= 4 && lower.indexOf(text.substring(0, Math.min(text.length, 20))) !== -1;
      }).map(function (item) { return item.id; });

      setMentionedProjectIds(pIds);
      setMentionedItemIds(iIds);
    }, 300);
    return function () { clearTimeout(timer); };
  }, [notes, projects, openItems]);

  // ESC closes. handleCloseRef.current is updated on every render so this
  // stable (empty-dep) listener always invokes the latest handleClose without
  // re-registering on every keystroke.
  useEffect(function () {
    function onKey(e) {
      if (e.key === "Escape") handleCloseRef.current && handleCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return function () { window.removeEventListener("keydown", onKey); };
  }, []); // stable — never re-registers

  // Stop recognition on unmount so the mic doesn't stay open if the overlay closes.
  useEffect(function () {
    return function () {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
        recognitionRef.current = null;
      }
    };
  }, []);

  function startRecording() {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Voice input isn't supported in this browser", "warning");
      return;
    }
    var rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = function (e) {
      var transcript = Array.from(e.results)
        .filter(function (r) { return r.isFinal; })
        .map(function (r) { return r[0].transcript; })
        .join(" ");
      if (transcript) {
        setNotes(function (prev) {
          return prev ? prev + "\n• " + transcript : "• " + transcript;
        });
      }
    };
    rec.onerror = function (e) {
      if (e.error !== "aborted") showToast("Voice input error: " + e.error, "warning");
      setRecording(false);
    };
    rec.onend = function () { setRecording(false); };
    recognitionRef.current = rec;
    rec.start();
    setRecording(true);
  }

  function stopRecording() {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
      recognitionRef.current = null;
    }
    setRecording(false);
  }

  function toggleRecording() {
    if (recording) stopRecording();
    else startRecording();
  }

  function flushPendingSave() {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (attendeesTimer.current) { clearTimeout(attendeesTimer.current); attendeesTimer.current = null; }
    if (projectNotesTimer.current) { clearTimeout(projectNotesTimer.current); projectNotesTimer.current = null; }
    var pending = {};
    if (notes !== (draft.notes || "")) pending.notes = notes;
    var draftAttendees = Array.isArray(draft.attendees) ? draft.attendees : [];
    var attendeesChanged = draftAttendees.length !== attendees.length ||
                           draftAttendees.some(function (n, i) { return n !== attendees[i]; });
    if (attendeesChanged) pending.attendees = attendees.length ? attendees : null;
    var savedProjectNotes = draft.project_notes && typeof draft.project_notes === "object" ? draft.project_notes : {};
    if (JSON.stringify(savedProjectNotes) !== JSON.stringify(projectNotes)) pending.project_notes = projectNotes;
    if (Object.keys(pending).length === 0) return Promise.resolve();
    return onUpdate(draft.id, pending);
  }

  function handleClose() {
    flushPendingSave().finally(function () {
      if (onClose) onClose();
    });
  }
  // Keep the ref current on every render so the stable ESC listener always
  // calls the latest handleClose (which closes over current notes/attendees).
  handleCloseRef.current = handleClose;

  function handleSummarize() {
    if (summarizing) return;
    var draftPayload = Object.assign({}, draft, { notes: notes, project_notes: projectNotes });
    flushPendingSave().finally(function () {
      onSummarizeRequest(draftPayload, discussedProjectIds, discussedItemIds);
    });
  }

  function handleAddQuickItem() {
    var t = quickItem.trim();
    if (!t) return;
    onAddItem({ text: t, due_date: null })
      .then(function () {
        setQuickItem("");
        showToast("Added to tasks");
      })
      .catch(function () {
        showToast("Couldn't add item");
      });
  }

  // Desktop split (item 41): projects pane takes ~42% so per-project notes
  // are comfortably typeable; general notes keep the rest. Collapsible to a
  // 44px strip; focus mode hides it entirely.
  var sidebarWidth = sidebarCollapsed ? 44 : "42%";
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
    var list = effectiveProjects;
    if (!list.length) return null;
    var atRisk = list.filter(function (p) {
      return p.status === "blocked" || p.status === "on_hold" ||
             (p.due_date && p.due_date < new Date().toISOString().slice(0, 10) && p.status !== "complete");
    }).length;
    return atRisk > 0
      ? { label: atRisk + " at risk", tone: "warn" }
      : { label: list.length + " on track", tone: "ok" };
  })();

  // Shared renderers — the desktop projects pane and the mobile Projects mode
  // show the same content (coherence rule: one implementation each).
  var hubProps = {
    accounts: accounts, members: members, contacts: contacts, userEmail: userEmail,
    onUpdateProject: onUpdateProject, userId: userId,
    onUpdateTask: onUpdateTask, onAddTask: onAddTask,
  };

  function renderAgenda() {
    if (!draft.agenda || !draft.agenda.trim()) return null;
    return (
      <SidebarSection title="Agenda">
        <div style={{
          fontSize: 13, color: C.textSoft, lineHeight: 1.55,
          whiteSpace: "pre-wrap", fontFamily: INTER,
          background: C.surface2, border: "1px solid " + C.rule,
          borderLeft: "2px solid " + C.accent, borderRadius: 8, padding: "9px 11px",
        }}>
          {draft.agenda}
        </div>
      </SidebarSection>
    );
  }

  function renderProjectCards() {
    var scopeToggle = deptProjects ? (
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {[{ key: "dept", label: "This dept" }, { key: "all", label: "All" }].map(function (opt) {
          var active = projectScope === opt.key;
          return (
            <button key={opt.key} type="button"
              onClick={function () { setProjectScope(opt.key); }}
              style={{
                padding: "3px 10px", borderRadius: 5, fontSize: 11,
                fontFamily: MONO, cursor: "pointer",
                border: "1px solid " + (active ? C.accent : C.rule),
                background: active ? C.accentFaint : "transparent",
                color: active ? C.accent : C.textMuted,
                fontWeight: active ? 600 : 400,
              }}
            >{opt.label}</button>
          );
        })}
      </div>
    ) : null;
    if (effectiveProjects.length === 0) {
      return <>{scopeToggle}<div style={{ fontSize: 11, color: C.textMuted }}>No active projects.</div></>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {scopeToggle}
        {effectiveProjects.map(function (p) {
          return (
            <MeetingProjectCard
              key={p.id}
              project={p}
              isMobile={isMobile}
              discussed={discussedProjectIds.indexOf(p.id) !== -1}
              mentioned={mentionedProjectIds.indexOf(p.id) !== -1}
              note={projectNotes[p.id] || ""}
              pendingUndiscuss={pendingUndiscussId === p.id}
              onToggleDiscussed={function () { toggleProjectDiscussed(p.id); }}
              onNoteChange={function (text) { setProjectNote(p.id, text); }}
              onDiscardNote={function () { discardProjectNote(p.id); }}
              onKeepNote={function () { setPendingUndiscussId(null); }}
              hubProps={hubProps}
            />
          );
        })}
      </div>
    );
  }

  function renderItemRows() {
    if ((openItems || []).length === 0) {
      return <div style={{ fontSize: 11, color: C.green }}>All clear.</div>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(openItems || []).map(function (i) {
          return (
            <OpenItemRow
              key={i.id}
              item={i}
              onClose={onCloseItem}
              discussed={discussedItemIds.indexOf(i.id) !== -1}
              mentioned={mentionedItemIds.indexOf(i.id) !== -1}
              onToggleDiscussed={function () {
                setDiscussedItemIds(function (prev) {
                  return prev.indexOf(i.id) !== -1
                    ? prev.filter(function (id) { return id !== i.id; })
                    : prev.concat([i.id]);
                });
              }}
            />
          );
        })}
      </div>
    );
  }

  function renderPeople() {
    return (
      <>
        {addContactOpen && (
          <AddContactInline
            isMobile={isMobile}
            onCancel={function () { setAddContactOpen(false); }}
            onSave={function (p) {
              return Promise.resolve(onAddContact(p)).then(function () {
                toggleAttendee(p.name);
                setAddContactOpen(false);
              });
            }}
          />
        )}
        {(contacts || []).length === 0 && !addContactOpen ? (
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
      </>
    );
  }

  var addContactAction = onAddContact ? (
    <button
      type="button"
      onClick={function (e) {
        e.stopPropagation();
        setPeopleOpen(true);
        setAddContactOpen(function (v) { return !v; });
      }}
      title="Add contact"
      aria-label="Add contact"
      style={{
        background: "none", border: "1px solid " + C.rule,
        borderRadius: 4, color: C.accent, cursor: "pointer",
        fontFamily: MONO, fontSize: 11, lineHeight: 1,
        padding: "2px 7px", flexShrink: 0, fontWeight: 700,
      }}
    >+ Add</button>
  ) : null;

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
            {account ? account.name : (contact ? "1:1 · " + contact.name : "Meeting")}
          </div>
          <div style={{
            fontFamily: MONO, fontSize: isMobile ? 9 : 10, color: C.accent,
            letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {isMobile
              ? topLabel + " · " + fmtShort(new Date())
              : topLabel + " · " + fmtMedium(new Date())}
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
          flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ flex: 1 }}>{summarizeErr} — your notes are safe, tap "End &amp; Summarize" to try again.</span>
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
              label="Tasks"
              value={openItemCount + (overdueItems > 0 ? " (" + overdueItems + " overdue)" : "")}
              tone={overdueItems > 0 ? "warn" : "muted"}
            />
          ) : (
            <MetaChip label="Tasks" value="0 — all clear" tone="ok" />
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
        {/* Sidebar — desktop only, hidden in focus mode */}
        {!isMobile && !focusMode && (
        <div style={{
          width: sidebarWidth,
          minWidth: sidebarCollapsed ? 44 : 400,
          maxWidth: sidebarCollapsed ? 44 : 600,
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
                Projects & notes
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
              {renderAgenda()}
              <SidebarSection title="Projects — mark ✦ discussed to add notes" count={effectiveProjects.length}>
                {renderProjectCards()}
              </SidebarSection>
              <CollapsibleSection
                title="Tasks"
                count={(openItems || []).length}
                open={itemsOpen}
                onToggle={function () { setItemsOpen(function (v) { return !v; }); }}
              >
                {renderItemRows()}
              </CollapsibleSection>
              <CollapsibleSection
                title={"People" + (attendees.length ? " · " + attendees.length + " attending" : "")}
                count={(contacts || []).length}
                open={peopleOpen}
                onToggle={function () { setPeopleOpen(function (v) { return !v; }); }}
                action={addContactAction}
              >
                {renderPeople()}
              </CollapsibleSection>
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
          {/* Mobile mode toggle — Notes | Projects, two full-width modes
              (item 41's locked mobile design). Hidden in focus mode. */}
          {isMobile && !focusMode && (
            <div style={{
              display: "flex", gap: 6,
              padding: "8px 10px 0 10px",
              background: C.bg, flexShrink: 0,
            }}>
              {[
                { id: "notes",    label: "✎ Notes" },
                { id: "projects", label: "Projects", count: (projects || []).length },
              ].map(function (t) {
                var active = mobileMode === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={function () { setMobileMode(t.id); }}
                    aria-pressed={active}
                    style={{
                      flex: 1,
                      background: active ? C.accentFaint : C.surface,
                      border: "1px solid " + (active ? C.accentLine : C.rule),
                      borderRadius: 8,
                      padding: "9px 8px",
                      fontSize: 12.5, fontWeight: active ? 700 : 400,
                      color: active ? C.accent : C.textMuted,
                      fontFamily: INTER, cursor: "pointer",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    {t.label}
                    {typeof t.count === "number" && (
                      <span style={{
                        fontFamily: MONO, fontSize: 10,
                        color: active ? C.accent : C.textMuted,
                        background: active ? "transparent" : C.surface2,
                        border: "1px solid " + (active ? C.accentLine : C.rule),
                        borderRadius: 999, padding: "0 6px",
                      }}>{t.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {(!isMobile || focusMode || mobileMode === "notes") && (
          <div style={{
            flex: 1, minHeight: 0,
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
                    {/* eslint-ok: one-off locale format (full weekday + long date) */}
                    {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </div>
                ) : <span />}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={toggleRecording}
                    title={recording ? "Stop recording" : "Dictate notes"}
                    style={{
                      background: recording ? "rgba(239,68,68,0.12)" : "transparent",
                      border: "1px solid " + (recording ? "rgba(239,68,68,0.4)" : C.rule),
                      borderRadius: 6, padding: "3px 10px",
                      fontFamily: MONO, fontSize: 9.5,
                      textTransform: "uppercase", letterSpacing: "0.08em",
                      color: recording ? C.red : C.textMuted,
                      cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 4,
                    }}
                  >
                    <span>{recording ? "⏹" : "🎙"}</span>
                    {recording ? "Stop" : "Dictate"}
                  </button>
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
                  <button
                    onClick={function () { setFocusMode(function (v) { return !v; }); }}
                    aria-pressed={focusMode}
                    title={focusMode ? "Exit focus mode" : "Focus mode"}
                    style={{
                      background: focusMode ? C.accentFaint : "transparent",
                      border: "1px solid " + (focusMode ? C.accentLine : C.rule),
                      borderRadius: 6, color: focusMode ? C.accent : C.textMuted,
                      fontFamily: MONO, fontSize: 11, padding: "4px 10px",
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    {focusMode ? "⊠ Focus" : "⊡ Focus"}
                  </button>
                  <span style={{
                    fontFamily: MONO, fontSize: 10, color: C.textFaint,
                    padding: "4px 6px", userSelect: "none", flexShrink: 0,
                  }}>[ ] tasks</span>
                </div>
              </div>
              {(function () {
                var todayStr = new Date().toISOString().slice(0, 10);
                var stuckCount = effectiveProjects.filter(function (p) {
                  return p.status === "blocked" ||
                    (p.expected_complete_date && p.expected_complete_date < todayStr && p.status !== "complete");
                }).length;
                if (openItemCount === 0) return null;
                var parts = ["Open: " + openItemCount + " item" + (openItemCount === 1 ? "" : "s")];
                if (overdueItems > 0) parts.push(overdueItems + " overdue");
                var loopStr = parts.join(", ");
                if (stuckCount > 0) loopStr += " · " + stuckCount + " project" + (stuckCount === 1 ? "" : "s") + " stuck";
                return (
                  <div style={{
                    fontFamily: MONO, fontSize: 11, color: C.textMuted,
                    marginBottom: 8, lineHeight: 1.4,
                    letterSpacing: "0.03em",
                  }}>
                    {loopStr}
                  </div>
                );
              })()}
              <textarea
                ref={notesRef}
                value={notes}
                onChange={function (e) { setNotes(e.target.value); }}
                onKeyDown={bulletProps.onKeyDown}
                onFocus={bulletProps.onFocus}
                onPaste={bulletProps.onPaste}
                autoCapitalize="sentences"
                autoCorrect="on"
                placeholder="Start typing — Pip will summarize when you end the meeting…"
                style={{
                  flex: 1, width: "100%",
                  minHeight: isMobile ? 260 : 440,
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
          )}

          {/* Mobile Projects mode — full-width projects pane with per-project
              note fields + collapsible Items / People beneath (item 41). */}
          {isMobile && !focusMode && mobileMode === "projects" && (
            <div style={{
              flex: 1, minHeight: 0, overflowY: "auto",
              padding: "12px 10px 16px",
              background: C.surface,
              borderTop: "1px solid " + C.rule,
              marginTop: 8,
            }}>
              {renderAgenda()}
              <SidebarSection title="Projects — mark ✦ discussed to add notes" count={effectiveProjects.length}>
                {renderProjectCards()}
              </SidebarSection>
              <CollapsibleSection
                title="Tasks"
                count={(openItems || []).length}
                open={itemsOpen}
                onToggle={function () { setItemsOpen(function (v) { return !v; }); }}
              >
                {renderItemRows()}
              </CollapsibleSection>
              <CollapsibleSection
                title={"People" + (attendees.length ? " · " + attendees.length + " attending" : "")}
                count={(contacts || []).length}
                open={peopleOpen}
                onToggle={function () { setPeopleOpen(function (v) { return !v; }); }}
                action={addContactAction}
              >
                {renderPeople()}
              </CollapsibleSection>
            </div>
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
              placeholder="+ Quick task — press Enter"
              style={{
                flex: 1, background: C.surface, border: "1px solid " + C.rule,
                borderRadius: 8, padding: "8px 12px",
                color: C.text, fontSize: 16, fontFamily: INTER, outline: "none",
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
