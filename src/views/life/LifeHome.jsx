import { useMemo, useState } from "react";
import { C } from "../../lib/colors";
import { PipOrb } from "../../components/PipMark";
import { useSportsFeed } from "../../hooks/useSportsFeed";
import { SportsCard } from "../home/SportsCard";
import { upcomingItems, honeyDoSorted } from "../../lib/lifeLadder";

var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

function greeting(name) {
  var h = new Date().getHours();
  var n = name ? ", " + name : "";
  if (h < 5)  return "Late" + n + ".";
  if (h < 12) return "Morning" + n + ".";
  if (h < 17) return "Afternoon" + n + ".";
  if (h < 21) return "Evening" + n + ".";
  return "Late" + n + ".";
}
function dateLabel() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function fmtDate(d) {
  if (!d) return "";
  var p = String(d).slice(0, 10).split("-");
  if (p.length !== 3) return "";
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtTime(t) {
  if (!t) return "";
  var p = String(t).split(":");
  if (p.length < 2) return "";
  var h = Number(p[0]); var m = p[1];
  var ap = h >= 12 ? "PM" : "AM";
  var hh = h % 12; if (hh === 0) hh = 12;
  return hh + ":" + m + " " + ap;
}
function dayCountLabel(d) {
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return "in " + d + "d";
}

function CardShell({ glyph, label, count, children }) {
  return (
    <div style={{ background: C.surface, border: "1px solid " + C.rule, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: C.accentFaint, borderBottom: "1px solid " + C.rule }}>
        <span style={{ color: C.accent, fontSize: 11, lineHeight: 1 }}>{glyph}</span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: C.accent }}>{label}</span>
        {count != null && (
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.accent, minWidth: 18, textAlign: "center", border: "1px solid " + C.accent, borderRadius: 999, padding: "1px 7px" }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ children }) {
  return <div style={{ padding: "14px", fontFamily: INTER, fontSize: 13, color: C.textMuted }}>{children}</div>;
}

export function LifeHome({ userName, items, completeItem, onAddLifeItem, isMobile }) {
  var [showSports, setShowSports] = useState(function () {
    try { return localStorage.getItem("folio_show_sports") !== "0"; } catch (_) { return true; }
  });
  function onHideSports() {
    try { localStorage.setItem("folio_show_sports", "0"); } catch (_) { /* ignore */ }
    setShowSports(false);
  }
  var sportsFeed = useSportsFeed(showSports);

  var upcoming = useMemo(function () { return upcomingItems(items, 45); }, [items]);
  var honey    = useMemo(function () { return honeyDoSorted(items); }, [items]);

  return (
    <div style={{ position: "relative", minHeight: "100%", paddingBottom: isMobile ? 120 : 32 }}>
      <div style={{ padding: isMobile ? "16px 16px 0" : "28px 32px 0", textAlign: "center" }}>
        <div style={{ fontFamily: SERIF, fontSize: isMobile ? 26 : 34, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          {greeting(userName)}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 6 }}>
          {dateLabel()} · Life
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: isMobile ? 12 : 16, padding: isMobile ? "16px 16px 18px" : "26px 32px 28px" }}>
        <PipOrb size={isMobile ? "xl" : "xxl"} heartbeat />
        <button
          onClick={onAddLifeItem}
          style={{ background: C.surface2, border: "1px solid " + C.accentLine, borderRadius: 999, padding: "8px 18px", color: C.accent, fontFamily: INTER, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          + Add to Life
        </button>
      </div>

      <div style={{ padding: isMobile ? "0 12px 14px" : "0 32px 16px", maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Upcoming */}
        <CardShell glyph="◷" label="Upcoming" count={upcoming.length}>
          {upcoming.length === 0
            ? <EmptyRow>Nothing on the calendar. Add an appointment or a birthday.</EmptyRow>
            : <div style={{ display: "flex", flexDirection: "column" }}>
                {upcoming.map(function (row, i) {
                  var it = row.item;
                  var vip = it.importance === "vip";
                  return (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderTop: i === 0 ? "none" : "1px solid " + C.ruleSoft }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text, minWidth: 60, fontVariantNumeric: "tabular-nums" }}>{fmtDate(it.item_date)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {vip && <span style={{ color: C.accent }}>★ </span>}{it.title}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: row.headsUp ? C.accent : C.textMuted, marginTop: 2, letterSpacing: "0.03em" }}>
                          {dayCountLabel(row.daysUntil)}{it.item_time ? " · " + fmtTime(it.item_time) : ""}{row.headsUp ? " · " + row.headsUp.label : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>}
        </CardShell>

        {/* Honey-do */}
        <CardShell glyph="✓" label="Honey-do" count={honey.length}>
          {honey.length === 0
            ? <EmptyRow>List's clear. Add something around the house.</EmptyRow>
            : <div style={{ display: "flex", flexDirection: "column" }}>
                {honey.map(function (row, i) {
                  var it = row.item;
                  return (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px", borderTop: i === 0 ? "none" : "1px solid " + C.ruleSoft }}>
                      <button
                        onClick={function () { if (completeItem) completeItem(it.id); }}
                        aria-label="Mark done"
                        style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px solid " + C.accentLine, background: "transparent", cursor: "pointer", flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginTop: 2, letterSpacing: "0.03em" }}>
                          {it.complexity ? it.complexity.toUpperCase() + " · " : ""}{row.ageDays === 0 ? "added today" : "open " + row.ageDays + "d"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>}
        </CardShell>
      </div>

      {showSports && sportsFeed.data && (
        <SportsCard data={sportsFeed.data} isMobile={isMobile} onHide={onHideSports} />
      )}
    </div>
  );
}
