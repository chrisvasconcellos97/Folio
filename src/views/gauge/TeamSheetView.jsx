import { useState, useMemo } from "react";
import { C } from "../../lib/colors";
import { EmptyState } from "../../components/EmptyState";
import {
  TEAM_TRACKER_COLUMNS,
  projectToTrackerRow,
  buildTrackerTSV,
  isTrackerDirty,
  trackerProjects,
} from "../../lib/teamTracker";

// Team Sheet — the Tuesday request tracker as a lens over Gauge projects.
// Folios is master; this view renders the projects flagged "Track on team
// sheet" in the Excel sheet's exact column order, and lets Chris copy
// changed-since-last-export rows as tab-separated lines that paste straight
// into the team's spreadsheet. Read-only table (the screen-share view) + a
// copy/export bar. See src/lib/teamTracker.js for the data-line note on
// "# of Shops" (deliberately blank — never stored in Folios).

export function TeamSheetView({ projects, accounts, members, onEditProject, onMarkExported }) {
  var [copied, setCopied] = useState(null); // {count, kind} | "error"

  var rows = useMemo(function () { return trackerProjects(projects); }, [projects]);
  var dirty = useMemo(function () { return rows.filter(isTrackerDirty); }, [rows]);
  var ctx = { accounts: accounts, members: members };

  function copy(list, kind) {
    if (!list.length) return;
    var tsv = buildTrackerTSV(list, ctx);
    var stamp = function () {
      // Mark each copied project as exported so it leaves the "dirty" set.
      var at = new Date().toISOString();
      if (onMarkExported) onMarkExported(list.map(function (p) { return p.id; }), at);
      setCopied({ count: list.length, kind: kind });
      setTimeout(function () { setCopied(null); }, 3500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).then(stamp).catch(function () { setCopied("error"); });
    } else {
      setCopied("error");
    }
  }

  if (!rows.length) {
    return (
      <EmptyState
        title="No requests on the team sheet yet"
        subtitle={'Open any Gauge project and turn on "Track on team sheet" to add it here. Folios then generates the Tuesday tracker rows for you — no double entry.'}
      />
    );
  }

  var shopIdx = TEAM_TRACKER_COLUMNS.indexOf("# of Shops");

  return (
    <div>
      {/* Export bar */}
      <div style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
        marginBottom: 14,
      }}>
        <button
          onClick={function () { copy(dirty, "dirty"); }}
          disabled={!dirty.length}
          style={{
            background: dirty.length ? C.accent : "transparent",
            color: dirty.length ? "#fff" : C.textMuted,
            border: "1px solid " + (dirty.length ? C.accent : C.rule),
            borderRadius: 8, padding: "8px 16px",
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 13, fontWeight: 600,
            cursor: dirty.length ? "pointer" : "default",
          }}
        >
          Copy unsynced rows{dirty.length ? " (" + dirty.length + ")" : ""}
        </button>
        <button
          onClick={function () { copy(rows, "all"); }}
          style={{
            background: "transparent", color: C.textMuted,
            border: "1px solid " + C.rule, borderRadius: 8, padding: "8px 16px",
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}
        >
          Copy all rows
        </button>
        <span style={{ fontSize: 12, color: C.textMuted, fontFamily: "'Inter', system-ui, sans-serif" }}>
          {copied === "error"
            ? "Couldn't copy — check clipboard permissions"
            : copied
              ? "Copied " + copied.count + " row" + (copied.count === 1 ? "" : "s") + " — paste into the sheet ✓"
              : dirty.length
                ? dirty.length + " row" + (dirty.length === 1 ? "" : "s") + " changed since last export"
                : "Sheet is up to date"}
        </span>
      </div>

      <p style={{
        fontSize: 11.5, color: C.textMuted, margin: "0 0 12px",
        fontFamily: "'Inter', system-ui, sans-serif", lineHeight: 1.5,
      }}>
        Paste copies straight into the spreadsheet's cells, columns in order. The
        <b style={{ color: C.text }}> # of Shops</b> cell stays blank on purpose —
        fill it in Excel (that figure never lives in Folios).
      </p>

      {/* The sheet — horizontally scrollable (11 columns). */}
      <div style={{ overflowX: "auto", border: "1px solid " + C.rule, borderRadius: 10 }}>
        <table style={{
          borderCollapse: "collapse", width: "100%", minWidth: 1000,
          fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12.5,
        }}>
          <thead>
            <tr>
              {TEAM_TRACKER_COLUMNS.map(function (col) {
                return (
                  <th key={col} style={{
                    textAlign: "left", padding: "9px 11px", whiteSpace: "nowrap",
                    fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em",
                    textTransform: "uppercase", color: C.textMuted,
                    borderBottom: "1px solid " + C.rule, background: C.accentFaint,
                  }}>
                    {col}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(function (p) {
              var cells = projectToTrackerRow(p, ctx);
              var d = isTrackerDirty(p);
              return (
                <tr
                  key={p.id}
                  onClick={function () { if (onEditProject) onEditProject(p); }}
                  style={{ cursor: onEditProject ? "pointer" : "default", color: C.text }}
                >
                  {cells.map(function (cell, i) {
                    var isShop = i === shopIdx;
                    return (
                      <td key={i} style={{
                        padding: "9px 11px", verticalAlign: "top",
                        borderBottom: "1px solid " + C.rule,
                        borderLeft: i === 0 ? "3px solid " + (d ? C.accent : "transparent") : undefined,
                        whiteSpace: i === 6 || i === 10 ? "normal" : "nowrap",
                        maxWidth: i === 10 ? 280 : undefined,
                        color: isShop ? C.textMuted : undefined,
                        fontStyle: isShop ? "italic" : undefined,
                      }}>
                        {isShop ? "— in Excel —" : (cell || "")}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
