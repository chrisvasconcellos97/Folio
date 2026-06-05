import { useState } from "react";
import { C } from "../../lib/colors";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// Relative-time label: "2h ago", "3d ago", "just now".
export function relUpdateTime(iso) {
  if (!iso) return "";
  var then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  var diff = Date.now() - then;
  if (diff < 60000) return "just now";
  var mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + "m ago";
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  var days = Math.floor(hrs / 24);
  if (days < 7) return days + "d ago";
  var wks = Math.floor(days / 7);
  if (wks < 5) return wks + "w ago";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function shortDate(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Email-local-part fallback for the author chip when no member name is resolvable.
export function updateAuthorLabel(by) {
  if (!by) return "";
  return String(by).split("@")[0];
}

/**
 * ProjectStatusUpdate — append-only pulse log for a Gauge project. Distinct from
 * ProjectNotesEditor (notes = durable scratchpad; updates = timestamped heartbeat).
 *
 * Storage: project.status_updates jsonb array, newest-first, each
 * { body, at (ISO), by (user email) }. Posting prepends a new entry; the array
 * IS the history. Rides the existing updateProject path.
 *
 * Props:
 *   project    — the gauge_projects row (reads status_updates)
 *   onUpdate   — function(id, patch) => Promise (updateProject)
 *   userEmail  — current user's email, stamped as `by`
 *   compact    — tighter spacing for hub/sidebar contexts
 */
export function ProjectStatusUpdate({ project, onUpdate, userEmail, compact }) {
  var updates = Array.isArray(project.status_updates) ? project.status_updates : [];
  var latest = updates[0] || null;

  var [draft, setDraft]   = useState("");
  var [saving, setSaving] = useState(false);

  function post() {
    var body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    var entry = { body: body, at: new Date().toISOString(), by: userEmail || null };
    var next = [entry].concat(updates);
    onUpdate(project.id, { status_updates: next })
      .then(function () { setDraft(""); setSaving(false); })
      .catch(function () { setSaving(false); });
  }

  function onKeyDown(e) {
    // Enter posts; Shift+Enter for a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      post();
    }
  }

  return (
    <div style={{ marginTop: compact ? 8 : 12, marginBottom: compact ? 8 : 12 }}>
      <div style={{
        fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
      }}>
        Latest update
      </div>

      {latest ? (
        <div style={{
          background: C.surface2, border: "1px solid " + C.rule,
          borderLeft: "2px solid " + C.accent, borderRadius: 8,
          padding: "8px 11px", marginBottom: 8,
        }}>
          <div style={{ fontFamily: INTER, fontSize: 13, color: C.text, lineHeight: 1.5 }}>
            {latest.body}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, marginTop: 4, letterSpacing: "0.04em" }}>
            Updated {relUpdateTime(latest.at)} · {shortDate(latest.at)}
            {latest.by ? " · " + updateAuthorLabel(latest.by) : ""}
            {updates.length > 1 ? " · " + updates.length + " total" : ""}
          </div>
        </div>
      ) : (
        <div style={{ fontFamily: INTER, fontSize: 12, color: C.textMuted, marginBottom: 8, fontStyle: "italic" }}>
          No updates yet — post the first pulse below.
        </div>
      )}

      <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        <textarea
          value={draft}
          onChange={function (e) { setDraft(e.target.value); }}
          onKeyDown={onKeyDown}
          placeholder="Post an update — e.g. 'waiting on legal sign-off'"
          rows={1}
          style={{
            flex: 1, background: C.surface2, border: "1px solid " + C.rule,
            borderRadius: 8, padding: "8px 11px", color: C.text, fontSize: 13,
            lineHeight: 1.5, fontFamily: INTER, resize: "vertical", outline: "none",
            boxSizing: "border-box", minHeight: 38,
          }}
        />
        <button
          type="button"
          onClick={post}
          disabled={!draft.trim() || saving}
          style={{
            background: draft.trim() ? C.accentFaint : "transparent",
            border: "1px solid " + (draft.trim() ? C.accentLine : C.rule),
            borderRadius: 8, padding: "8px 14px",
            color: draft.trim() ? C.accent : C.textMuted,
            fontFamily: INTER, fontSize: 13, fontWeight: 600,
            cursor: draft.trim() && !saving ? "pointer" : "default",
            whiteSpace: "nowrap",
          }}
        >
          {saving ? "Posting…" : "Post"}
        </button>
      </div>
    </div>
  );
}
