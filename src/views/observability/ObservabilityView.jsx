import { useState, useMemo } from "react";
import { C } from "../../lib/colors";
import { Card } from "../../components/Card";
import { NavMark } from "../../components/NavMark";
import { showToast } from "../../components/Toast";
import { useErrors } from "../../hooks/useErrors";

var SERIF = "'Fraunces', Georgia, serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SANS  = "'Inter', system-ui, sans-serif";

var TYPE_LABELS = {
  react:      "React",
  network:    "Network",
  pip:        "Pip",
  unhandled:  "Unhandled",
  rejection:  "Rejection",
};

var TYPE_COLOR = function (type) {
  if (type === "react")    return { fg: C.red,    bg: C.redFaint    };
  if (type === "network")  return { fg: C.yellow, bg: C.yellowFaint };
  if (type === "pip")      return { fg: C.blue,   bg: C.blueFaint   };
  return { fg: C.textSub, bg: "transparent" };
};

function timeAgo(iso) {
  if (!iso) return "";
  var diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  var s = Math.floor(diff / 1000);
  if (s < 60)  return s + "s ago";
  var m = Math.floor(s / 60);
  if (m < 60)  return m + "m ago";
  var h = Math.floor(m / 60);
  if (h < 48)  return h + "h ago";
  var d = Math.floor(h / 24);
  return d + "d ago";
}

var FILTERS = [
  { id: "all",        label: "All"        },
  { id: "unresolved", label: "Unresolved" },
  { id: "week",       label: "This week"  },
  { id: "month",      label: "This month" },
];

export function ObservabilityView({ userId }) {
  var { errors, loading, error, refetch, markResolved, markAllResolved } = useErrors(userId, { limit: 200 });
  var [filter, setFilter] = useState("unresolved");
  var [expanded, setExpanded] = useState({}); // id -> bool

  var filtered = useMemo(function () {
    var now = Date.now();
    return errors.filter(function (e) {
      if (filter === "unresolved") return !e.resolved;
      if (filter === "week")  return now - new Date(e.created_at).getTime() <= 7  * 24 * 60 * 60 * 1000;
      if (filter === "month") return now - new Date(e.created_at).getTime() <= 30 * 24 * 60 * 60 * 1000;
      return true;
    });
  }, [errors, filter]);

  function toggleExpanded(id) {
    setExpanded(function (prev) {
      var next = Object.assign({}, prev);
      next[id] = !prev[id];
      return next;
    });
  }

  function handleResolve(id, e) {
    e.stopPropagation();
    markResolved(id).then(function () { showToast("Marked resolved"); }).catch(function (err) {
      showToast(err.message || "Couldn't mark resolved", "error");
    });
  }

  function handleResolveAll() {
    if (!filtered.length) return;
    markAllResolved().then(function () { showToast("All resolved"); }).catch(function (err) {
      showToast(err.message || "Couldn't mark resolved", "error");
    });
  }

  function buildErrorReport(e) {
    var lines = [];
    lines.push("=== " + (TYPE_LABELS[e.error_type] || e.error_type) + " error ===");
    lines.push("Time: " + new Date(e.created_at).toLocaleString());
    if (e.source_url) lines.push("URL: " + e.source_url);
    lines.push("");
    lines.push("Message:");
    lines.push(e.message || "(none)");
    if (e.stack) {
      lines.push("");
      lines.push("Stack:");
      lines.push(e.stack);
    }
    if (e.context && Object.keys(e.context).length > 0) {
      lines.push("");
      lines.push("Context:");
      lines.push(JSON.stringify(e.context, null, 2));
    }
    return lines.join("\n");
  }

  function handleCopy(e, ev) {
    if (ev) ev.stopPropagation();
    var text = buildErrorReport(e);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast("Copied — paste to Claude");
      }).catch(function () {
        showToast("Couldn't copy", "error");
      });
    } else {
      showToast("Clipboard not available", "error");
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "8px 0 40px" }}>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 14 }}>
        <NavMark id="diagnostics" size={52} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
            Diagnostics
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>
            Errors · network · render · pip
          </div>
        </div>
        <button
          onClick={refetch}
          style={{
            background: "transparent", border: "1px solid " + C.rule, borderRadius: 8,
            padding: "7px 14px", fontSize: 12, color: C.textSoft, cursor: "pointer",
            fontFamily: SANS,
          }}
        >
          Refresh
        </button>
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTERS.map(function (f) {
          var active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={function () { setFilter(f.id); }}
              style={{
                background: active ? C.accentFaint : "transparent",
                border: "1px solid " + (active ? C.accentBorder : C.rule),
                color: active ? C.accent : C.textSoft,
                borderRadius: 999,
                padding: "5px 14px",
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                fontFamily: SANS,
              }}
            >
              {f.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {filtered.length > 0 && filter === "unresolved" && (
          <button
            onClick={handleResolveAll}
            style={{
              background: "transparent", border: "1px solid " + C.rule, borderRadius: 999,
              padding: "5px 14px", fontSize: 12, color: C.textSoft, cursor: "pointer",
              fontFamily: SANS,
            }}
          >
            Resolve all
          </button>
        )}
      </div>

      {/* States */}
      {error && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5 }}>
            Couldn't load errors — run <code style={{ fontFamily: MONO }}>supabase/phase6_observability.sql</code> in production.
          </div>
        </Card>
      )}

      {loading && !errors.length && (
        <div style={{ fontSize: 13, color: C.textMuted, padding: 24, textAlign: "center" }}>Loading…</div>
      )}

      {!loading && !filtered.length && !error && (
        <Card>
          <div style={{ fontSize: 13.5, color: C.textSub, lineHeight: 1.5, textAlign: "center", padding: 8 }}>
            {filter === "unresolved"
              ? "All clear. Nothing unresolved."
              : "No errors in this window."}
          </div>
        </Card>
      )}

      {/* Error rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(function (e) {
          var color = TYPE_COLOR(e.error_type);
          var isOpen = !!expanded[e.id];
          return (
            <Card key={e.id} style={{ padding: 0, opacity: e.resolved ? 0.55 : 1 }}>
              <div
                onClick={function () { toggleExpanded(e.id); }}
                role="button"
                style={{
                  padding: "12px 14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    background: color.bg,
                    color: color.fg,
                    border: "1px solid " + color.fg,
                    fontFamily: MONO,
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    padding: "3px 8px",
                    borderRadius: 4,
                    flexShrink: 0,
                  }}
                >
                  {TYPE_LABELS[e.error_type] || e.error_type}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: C.text,
                      fontFamily: SANS,
                      lineHeight: 1.4,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {e.message}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, fontFamily: MONO, letterSpacing: "0.04em" }}>
                    {timeAgo(e.created_at)}
                    {e.source_url ? " · " + e.source_url : ""}
                    {e.resolved ? " · resolved" : ""}
                  </div>
                </div>
                {!e.resolved && (
                  <button
                    onClick={function (ev) { handleResolve(e.id, ev); }}
                    style={{
                      background: "transparent", border: "1px solid " + C.rule, borderRadius: 6,
                      padding: "5px 10px", fontSize: 11, color: C.textSoft, cursor: "pointer",
                      fontFamily: SANS, flexShrink: 0,
                    }}
                  >
                    Resolve
                  </button>
                )}
              </div>

              {isOpen && (
                <div style={{
                  borderTop: "1px solid " + C.ruleSoft,
                  padding: "12px 14px",
                  fontFamily: MONO,
                  fontSize: 11.5,
                  lineHeight: 1.55,
                  color: C.textSub,
                }}>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                    <button
                      onClick={function (ev) { handleCopy(e, ev); }}
                      style={{
                        background: C.accentFaint, border: "1px solid " + C.accentBorder,
                        color: C.accent, borderRadius: 6, padding: "5px 12px",
                        fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: SANS,
                        letterSpacing: "0.04em",
                      }}
                    >
                      Copy all
                    </button>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10 }}>Message</span>
                    <div style={{ color: C.text, marginTop: 2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{e.message}</div>
                  </div>
                  {e.stack && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10 }}>Stack</span>
                      <pre style={{
                        marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word",
                        background: C.surface2, padding: 10, borderRadius: 6,
                        maxHeight: 280, overflow: "auto", fontSize: 10.5,
                        color: C.textSoft, border: "1px solid " + C.ruleSoft,
                      }}>{e.stack}</pre>
                    </div>
                  )}
                  {e.context && Object.keys(e.context).length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10 }}>Context</span>
                      <pre style={{
                        marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word",
                        background: C.surface2, padding: 10, borderRadius: 6,
                        fontSize: 10.5, color: C.textSoft, border: "1px solid " + C.ruleSoft,
                      }}>{JSON.stringify(e.context, null, 2)}</pre>
                    </div>
                  )}
                  <div style={{ color: C.textMuted, fontSize: 10.5, marginTop: 6 }}>
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
