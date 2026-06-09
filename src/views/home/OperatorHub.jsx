import { useState } from "react";
import { C } from "../../lib/colors";
import { PipOrb } from "../../components/PipMark";
import { Glow } from "../../components/Glow";
import { MarkdownText } from "../../components/MarkdownText";
import { showToast } from "../../components/Toast";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

// Section identity — color, faint wash for the header strip, and a glyph.
// fire = today's fires, watch = this week, win = good news, signal = pattern.
var SECTION_META = {
  fire:   { label: "Today",     color: C.red,    faint: C.redFaint,    glyph: "▴" },
  watch:  { label: "This Week", color: C.yellow, faint: C.yellowFaint, glyph: "◆" },
  win:    { label: "Good News", color: C.accent, faint: C.accentFaint, glyph: "✦" },
  signal: { label: "Pattern",   color: C.blue,   faint: C.blueFaint,   glyph: "◇" },
};

// A single account row inside a section card. Anatomy is vertical and
// scannable: account name (tappable) → the line → an action/buttons row.
function SectionRow({ it, meta, first, accounts, draftFor, onOpenAccount }) {
  var acc = it.account_name ? (accounts || []).find(function (a) { return a.name === it.account_name; }) : null;
  var draft = it.has_draft && it.account_name ? draftFor(it.account_name) : null;
  var hasActions = it.action || draft || acc;
  return (
    <div style={{
      padding: "11px 14px",
      borderTop: first ? "none" : "1px solid " + C.ruleSoft,
      display: "flex", flexDirection: "column", gap: 5,
    }}>
      {it.account_name && (
        <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>
          {acc
            ? <Glow onClick={function () { onOpenAccount(acc.id); }}>{it.account_name}</Glow>
            : <span style={{ color: C.accent }}>{it.account_name}</span>}
        </div>
      )}
      {it.line && (
        <div style={{ fontFamily: INTER, fontSize: 13, color: C.textSoft, lineHeight: 1.5 }}>
          {it.line}
        </div>
      )}
      {hasActions && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 1 }}>
          {it.action && (
            <span style={{
              fontFamily: MONO, fontSize: 9, color: meta.color, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.05em",
              background: meta.faint, border: "1px solid " + meta.color,
              borderRadius: 6, padding: "2px 7px",
            }}>
              {it.action}
            </span>
          )}
          {draft && (
            <button
              onClick={function () {
                try { navigator.clipboard.writeText(draft.email); showToast("Draft copied — review before sending"); }
                catch (_) { showToast("Couldn't copy"); }
              }}
              style={{
                fontFamily: MONO, fontSize: 9, color: C.accent, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.05em",
                background: C.accentFaint, border: "1px solid " + C.accentLine,
                borderRadius: 6, padding: "2px 8px", cursor: "pointer",
              }}
            >
              ✦ Draft ready
            </button>
          )}
          {acc && (
            <button
              onClick={function () { onOpenAccount(acc.id); }}
              style={{
                marginLeft: "auto",
                fontFamily: MONO, fontSize: 9, color: C.textMuted, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.05em",
                background: "none", border: "1px solid " + C.rule,
                borderRadius: 6, padding: "2px 8px", cursor: "pointer",
              }}
            >
              Open →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// One section as a self-contained card: tinted header strip with a count
// badge, then a clean stack of rows.
function SectionCard({ sec, accounts, draftFor, onOpenAccount }) {
  var meta = SECTION_META[sec.kind] || { label: "Notes", color: C.textMuted, faint: C.surface2, glyph: "•" };
  var items = Array.isArray(sec.items) ? sec.items : [];
  return (
    <div style={{
      background: C.surface,
      border: "1px solid " + C.rule,
      borderRadius: 14,
      overflow: "hidden",
      height: "100%",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 14px",
        background: meta.faint,
        borderBottom: "1px solid " + C.rule,
      }}>
        <span style={{ color: meta.color, fontSize: 11, lineHeight: 1 }}>{meta.glyph}</span>
        <span style={{
          fontFamily: MONO, fontSize: 10.5, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.12em", color: meta.color,
        }}>
          {meta.label}
        </span>
        <span style={{
          marginLeft: "auto",
          fontFamily: MONO, fontSize: 10, fontWeight: 700, color: meta.color,
          minWidth: 18, textAlign: "center",
          border: "1px solid " + meta.color, borderRadius: 999, padding: "1px 7px",
        }}>
          {items.length}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {items.map(function (it, ii) {
          return (
            <SectionRow
              key={ii}
              it={it}
              meta={meta}
              first={ii === 0}
              accounts={accounts}
              draftFor={draftFor}
              onOpenAccount={onOpenAccount}
            />
          );
        })}
      </div>
    </div>
  );
}

// Compact "glance" Pip card — orb + the one-line headline + scannable count
// chips + a collapsible full read. This replaces the wall-of-text prose card.
function PipGlanceCard({ report, chips, linkify }) {
  var [open, setOpen] = useState(false);
  var ranAt = report.generated_at
    ? new Date(report.generated_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;
  // Headline is the tight at-a-glance read; fall back to the first line of the
  // prose if the operator didn't emit one.
  var headline = (report.headline && report.headline.trim())
    || (report.report_prose ? report.report_prose.split(/\n|(?<=\.)\s/)[0] : "");
  var hasProse = !!(report.report_prose && report.report_prose.trim());

  return (
    <div style={{
      background: C.surface,
      border: "1px solid " + C.rule,
      borderRadius: 14,
      padding: "14px 16px 15px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{ flexShrink: 0, marginTop: 1 }}><PipOrb size="md" isStatic /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              ✦ Pip
            </span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
              {(report.accounts_worked || 0) + " worked"}{ranAt ? " · " + ranAt : ""}
            </span>
          </div>
          {headline && (
            <div style={{ fontFamily: SERIF, fontSize: 17, color: C.text, lineHeight: 1.35, letterSpacing: "-0.01em" }}>
              {headline}
            </div>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 12 }}>
          {chips.map(function (ch, i) {
            return (
              <div key={i} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: C.surface2, border: "1px solid " + C.rule,
                borderRadius: 999, padding: "4px 11px 4px 9px",
              }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: ch.color, flexShrink: 0 }} />
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{ch.count}</span>
                <span style={{ fontFamily: INTER, fontSize: 11.5, color: C.textMuted }}>{ch.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {hasProse && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={function () { setOpen(function (v) { return !v; }); }}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontFamily: MONO, fontSize: 10, color: C.textMuted, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.08em",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            {open ? "Hide Pip's full read ▴" : "Pip's full read ▾"}
          </button>
          {open && (
            <div style={{ marginTop: 10, paddingTop: 12, borderTop: "1px solid " + C.ruleSoft }}>
              <MarkdownText
                text={report.report_prose}
                linkify={linkify}
                style={{ fontFamily: INTER, fontSize: 14, color: C.textSoft, lineHeight: 1.7 }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The full operator dashboard: compact Pip glance card + structured section
// cards. Today (fire) gets full width; the rest fall into a 2-up grid on
// desktop and a single stack on mobile.
export function OperatorHub({ report, drafts, accounts, isMobile, mounted, onOpenAccount, linkify }) {
  var sections = Array.isArray(report.plan_items) ? report.plan_items : [];

  function draftFor(name) {
    return (drafts || []).find(function (d) { return d.account_name === name; });
  }
  function byKind(k) {
    return sections.find(function (s) { return s && s.kind === k && Array.isArray(s.items) && s.items.length; });
  }
  function countKind(k) {
    var s = byKind(k);
    return s ? s.items.length : 0;
  }

  // Count chips for the glance card — only non-empty sections, plus a drafts
  // chip when Pip pre-wrote any follow-ups.
  var chips = [];
  ["fire", "watch", "win", "signal"].forEach(function (k) {
    var n = countKind(k);
    if (n > 0) chips.push({ label: SECTION_META[k].label, count: n, color: SECTION_META[k].color });
  });
  var draftCount = (drafts || []).length;
  if (draftCount > 0) chips.push({ label: draftCount === 1 ? "Draft" : "Drafts", count: draftCount, color: C.accent });

  var fire = byKind("fire");
  var gridCards = [byKind("watch"), byKind("signal"), byKind("win")].filter(Boolean);

  return (
    <div style={{
      padding: isMobile ? "0 12px 14px" : "0 32px 14px",
      maxWidth: 980, margin: "0 auto",
      opacity: mounted ? 1 : 0,
      transition: "opacity 0.4s ease 0.4s",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <PipGlanceCard
        report={report}
        chips={chips}
        linkify={linkify}
      />

      {fire && (
        <SectionCard sec={fire} accounts={accounts} draftFor={draftFor} onOpenAccount={onOpenAccount} />
      )}

      {gridCards.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, alignItems: "stretch" }}>
          {gridCards.map(function (sec, i) {
            return (
              <SectionCard key={i} sec={sec} accounts={accounts} draftFor={draftFor} onOpenAccount={onOpenAccount} />
            );
          })}
        </div>
      )}
    </div>
  );
}
