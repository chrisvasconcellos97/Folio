import React from "react";
import { C } from "../lib/colors";
import { logError, appendErrorNote, looksLikeChunkReload } from "../lib/errorLog";
import { PipOrb } from "./PipMark";

var SERIF = "'Fraunces', Georgia, serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SANS  = "'Inter', system-ui, sans-serif";

// Pip's voice on the fallback — varied so it doesn't feel canned. Pip is
// loyal, slightly anxious, observant. Picks one per mount based on the
// error message hash so the same error reads the same way each time.
var PIP_LINES = [
  { heading: "Hm. Something tripped.",     body: "I caught it before it spread. Reload and we'll keep going — I'll remember where you were." },
  { heading: "Okay, that's on me.",        body: "Pip noticed. I've logged the details so we can chase it down later. Reload to keep going." },
  { heading: "Something went sideways.",   body: "Already wrote it down. Reload and we should be back where you were — nothing autosaved is lost." },
  { heading: "Got a hiccup.",              body: "Don't worry about it — I have everything. Reload and we'll pick up clean." },
  { heading: "Wait, that wasn't right.",   body: "Logged it. Reload should sort us out. If you remember what you were doing, tell me below." },
];

function pickPipLine(msg) {
  var seed = 0;
  for (var i = 0; i < (msg || "").length; i++) seed = (seed * 31 + msg.charCodeAt(i)) | 0;
  return PIP_LINES[Math.abs(seed) % PIP_LINES.length];
}

/**
 * Catches React render errors. Three things happen on catch:
 *   1. Log the error to folio_errors (best-effort, rate-limited in errorLog.js).
 *   2. Render a friendly fallback UI ("Something went sideways. Pip's noticed.")
 *      so we never hand the user a blank page.
 *   3. Offer a textarea so the user can describe what they were doing — that
 *      note is upserted back onto the same error row via appendErrorNote.
 *
 * Used in two layers: once around <App /> (catches everything), and again
 * around each <Suspense> boundary in App.jsx so a single broken view doesn't
 * crash the sidebar / nav shell.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      message:  "",
      errorId:  null,
      noteOpen: false,
      noteText: "",
      noteSent: false,
    };
    this.onReload = this.onReload.bind(this);
    this.openNote = this.openNote.bind(this);
    this.sendNote = this.sendNote.bind(this);
    this.onChange = this.onChange.bind(this);
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error && error.message ? error.message : "Something went wrong",
    };
  }

  componentDidUpdate(prevProps) {
    // If a resetKey prop changes while we're showing the fallback, clear the
    // error so the boundary can recover without a full reload (the per-view
    // boundaries also reset via their `key`, but this covers in-place changes).
    if (this.state.hasError && this.props.resetKey !== undefined &&
        prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: "", errorId: null, noteOpen: false, noteText: "", noteSent: false });
    }
  }

  componentDidCatch(error, info) {
    var stack = (error && error.stack) || (info && info.componentStack) || null;
    var msg = error && error.message ? error.message : "react render error";
    var context = {
      componentStack: info && info.componentStack ? String(info.componentStack).slice(0, 4000) : null,
      boundary: this.props.label || "app",
    };

    // Stale-chunk Lazy/Suspense failure — known, self-healing. Log it as
    // auto-recovered and signal main.jsx to reload immediately instead of
    // making the user stare at the fallback waiting for the 3-min poll.
    if (looksLikeChunkReload(msg, stack)) {
      context.auto_recovered = true;
      logError("chunk_reload", msg, { stack: stack, resolved: true, context: context });
      try { window.dispatchEvent(new CustomEvent("folio:chunk-reload-detected")); } catch (e) { /* swallow */ }
      return;
    }

    var self = this;
    logError("react", msg, { stack: stack, context: context })
      .then(function (row) {
        if (row && row.id) self.setState({ errorId: row.id });
      })
      .catch(function () { /* guard-ok: logError failure; meta-logging must never throw */ });
  }

  onReload() {
    try { window.location.reload(); } catch (e) { /* swallow */ }
  }

  openNote() { this.setState({ noteOpen: true }); }
  onChange(e) { this.setState({ noteText: e.target.value }); }

  sendNote() {
    var self = this;
    var id = this.state.errorId;
    var note = this.state.noteText.trim();
    if (!id || !note) { this.setState({ noteSent: true }); return; }
    appendErrorNote(id, note).then(function () { self.setState({ noteSent: true }); });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    var inline = this.props.inline;
    var pipLine = pickPipLine(this.state.message);
    return (
      <div
        role="alert"
        style={{
          minHeight: inline ? "auto" : "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          color: C.text,
          background: inline ? "transparent" : C.bg,
          fontFamily: SANS,
          textAlign: "center",
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <PipOrb size="xl" sonar />
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 9.5, color: C.accent,
          textTransform: "uppercase", letterSpacing: "0.12em",
          marginBottom: 10,
        }}>
          Pip caught it
        </div>
        <div style={{
          fontFamily: SERIF, fontSize: 28, fontWeight: 400, letterSpacing: "-0.01em",
          color: C.text, marginBottom: 8,
        }}>
          {pipLine.heading}
        </div>
        <div style={{ fontSize: 13.5, color: C.textSub, lineHeight: 1.55, maxWidth: 460, marginBottom: 4 }}>
          {pipLine.body}
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 10.5, color: C.textMuted,
          textTransform: "uppercase", letterSpacing: "0.08em",
          marginTop: 12, marginBottom: 20, maxWidth: 460,
          wordBreak: "break-word",
        }}>
          {this.state.message}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={this.onReload}
            style={{
              background: C.accent, border: "none", borderRadius: 8,
              padding: "9px 18px", fontSize: 13, fontWeight: 600,
              color: "#fff", cursor: "pointer", fontFamily: SANS,
            }}
          >
            Reload
          </button>
          {!this.state.noteOpen && !this.state.noteSent && (
            <button
              onClick={this.openNote}
              style={{
                background: "transparent", border: "1px solid " + C.rule,
                borderRadius: 8, padding: "9px 16px", fontSize: 13,
                color: C.textSoft, cursor: "pointer", fontFamily: SANS,
              }}
            >
              Tell me what happened
            </button>
          )}
        </div>

        {this.state.noteOpen && !this.state.noteSent && (
          <div style={{ marginTop: 18, width: "100%", maxWidth: 460 }}>
            <textarea
              value={this.state.noteText}
              onChange={this.onChange}
              placeholder="What were you doing when this happened?"
              rows={4}
              style={{
                width: "100%", padding: 12, fontSize: 16.5, lineHeight: 1.5,
                fontFamily: SANS, color: C.text, background: C.surface2,
                border: "1px solid " + C.rule, borderRadius: 10, resize: "vertical",
                outline: "none", boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button
                onClick={this.sendNote}
                disabled={!this.state.noteText.trim()}
                style={{
                  background: C.accent, border: "none", borderRadius: 8,
                  padding: "7px 14px", fontSize: 12.5, fontWeight: 600,
                  color: "#fff", cursor: this.state.noteText.trim() ? "pointer" : "not-allowed",
                  opacity: this.state.noteText.trim() ? 1 : 0.5,
                  fontFamily: SANS,
                }}
              >
                Send to Pip
              </button>
            </div>
          </div>
        )}

        {this.state.noteSent && (
          <div style={{ marginTop: 14, fontSize: 12, color: C.textMuted, fontFamily: SANS }}>
            Thanks — added to the report.
          </div>
        )}
      </div>
    );
  }
}
