import { useState } from "react";
import { Modal } from "../../components/Modal";
import { MarkdownText } from "../../components/MarkdownText";
import { C } from "../../lib/colors";
import { callBusinessReviewPip } from "../../lib/pip";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";

function getQuarterStart() {
  var now   = new Date();
  var month = now.getMonth(); // 0-indexed
  var year  = now.getFullYear();
  var qStartMonth = Math.floor(month / 3) * 3; // 0, 3, 6, or 9
  var d = new Date(year, qStartMonth, 1);
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return "";
  var parts = iso.split("-");
  if (parts.length < 3) return iso;
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return months[parseInt(parts[1], 10) - 1] + " " + parseInt(parts[2], 10) + ", " + parts[0];
}

export function BusinessReviewModal({ account, meetings, contacts, items, projects, updates, onClose }) {
  var [startDate, setStartDate] = useState(getQuarterStart);
  var [endDate,   setEndDate]   = useState(todayISO);
  var [generating, setGenerating] = useState(false);
  var [error,      setError]      = useState(null);
  var [sections,   setSections]   = useState(null);
  var [copiedKey,  setCopiedKey]  = useState(null);
  var [copiedAll,  setCopiedAll]  = useState(false);

  function handleGenerate() {
    setGenerating(true);
    setError(null);

    var filteredMeetings = (meetings || []).filter(function (m) {
      var d = m.meeting_date || "";
      return d >= startDate && d <= endDate;
    });

    var filteredUpdates = (updates || []).filter(function (u) {
      var d = u.update_date || "";
      return d >= startDate && d <= endDate;
    });

    var filteredItems = (items || []).filter(function (i) {
      if (!i.done && !i.closed_at) return true;
      var closeDate = i.closed_at ? i.closed_at.slice(0, 10) : null;
      return closeDate ? (closeDate >= startDate && closeDate <= endDate) : false;
    });

    var filteredProjects = (projects || []).filter(function (p) {
      return p.account_id === account.id ||
        (Array.isArray(p.account_ids) && p.account_ids.indexOf(account.id) >= 0);
    });

    callBusinessReviewPip({
      account:   account,
      startDate: startDate,
      endDate:   endDate,
      meetings:  filteredMeetings,
      contacts:  contacts || [],
      items:     filteredItems,
      projects:  filteredProjects,
      updates:   filteredUpdates,
    }).then(function (data) {
      setSections(data);
      setGenerating(false);
    }).catch(function () {
      setError("Pip couldn't generate the review right now.");
      setGenerating(false);
    });
  }

  function copySection(key, text) {
    navigator.clipboard.writeText(text).catch(function () { /* guard-ok: clipboard API; copy button stays visible if denied */ });
    setCopiedKey(key);
    setTimeout(function () { setCopiedKey(null); }, 1500);
  }

  function copyAll() {
    var text = [
      "BUSINESS REVIEW — " + (account.name || "Account").toUpperCase(),
      fmtDate(startDate) + " – " + fmtDate(endDate),
      "",
      "[ SALES METRICS ]",
      "Add your revenue, quota attainment, and pipeline numbers here.",
      "",
      "[ ACCOUNT CONNECTIONS ]",
      sections.connections,
      "",
      "[ OEC OPPORTUNITIES ]",
      sections.oec_opportunities,
      "",
      "[ CLIENT OPPORTUNITIES ]",
      sections.client_opportunities,
    ].join("\n");
    navigator.clipboard.writeText(text).catch(function () { /* guard-ok: clipboard API; copy button stays visible if denied */ });
    setCopiedAll(true);
    setTimeout(function () { setCopiedAll(false); }, 1500);
  }

  function renderSection(label, key, content, isPlaceholder) {
    return (
      <div
        key={key}
        style={{
          borderBottom: "1px solid " + C.rule,
          paddingBottom: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{
            fontFamily: MONO,
            fontSize: 9.5,
            color: C.textMuted,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}>{label}</span>
          {!isPlaceholder && (
            <button
              onClick={function () { copySection(key, content); }}
              style={{
                background: "transparent",
                border: "1px solid " + C.rule,
                borderRadius: 4,
                padding: "2px 8px",
                fontFamily: MONO,
                fontSize: 10,
                color: copiedKey === key ? C.accent : C.textMuted,
                cursor: "pointer",
              }}
            >
              {copiedKey === key ? "Copied ✓" : "Copy"}
            </button>
          )}
        </div>
        {isPlaceholder ? (
          <div style={{
            border: "1px dashed " + C.rule,
            borderRadius: 6,
            padding: 12,
            background: "transparent",
            color: C.textFaint,
            fontSize: 13,
            fontStyle: "italic",
            fontFamily: INTER,
            lineHeight: 1.6,
          }}>
            {content}
          </div>
        ) : (
          <MarkdownText
            text={content}
            style={{
              fontFamily: INTER,
              fontSize: 13,
              lineHeight: 1.6,
              color: C.text,
            }}
          />
        )}
      </div>
    );
  }

  return (
    <Modal title={"Business Review · " + account.name} onClose={onClose}>
      {/* Date range row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          type="date"
          value={startDate}
          onChange={function (e) { setStartDate(e.target.value); }}
          style={{
            border: "1px solid " + C.rule,
            background: C.surface,
            color: C.text,
            borderRadius: 6,
            padding: "6px 10px",
            fontFamily: MONO,
            fontSize: 16,
            outline: "none",
          }}
        />
        <span style={{ color: C.textMuted, fontFamily: MONO, fontSize: 12 }}>–</span>
        <input
          type="date"
          value={endDate}
          onChange={function (e) { setEndDate(e.target.value); }}
          style={{
            border: "1px solid " + C.rule,
            background: C.surface,
            color: C.text,
            borderRadius: 6,
            padding: "6px 10px",
            fontFamily: MONO,
            fontSize: 16,
            outline: "none",
          }}
        />
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            background: C.accentFaint,
            border: "1px solid " + C.accentLine,
            borderRadius: 6,
            padding: "6px 16px",
            fontFamily: INTER,
            fontSize: 12,
            fontWeight: 600,
            color: C.accent,
            cursor: generating ? "default" : "pointer",
            opacity: generating ? 0.6 : 1,
          }}
        >
          {generating ? "Generating…" : sections ? "Regenerate" : "Generate"}
        </button>
      </div>

      {/* Loading state */}
      {generating && (
        <div style={{ textAlign: "center", padding: "32px 0", color: C.textMuted, fontFamily: INTER, fontSize: 13 }}>
          <span>✦</span> Pip is preparing your review…
        </div>
      )}

      {/* Error state */}
      {error && !generating && (
        <div style={{ color: C.red, fontSize: 13, padding: "8px 0" }}>{error}</div>
      )}

      {/* Sections */}
      {sections && !generating && (
        <div>
          {renderSection("Sales Metrics", "sales", "Add your revenue, quota attainment, and pipeline numbers here.", true)}
          {renderSection("Account Connections", "connections", sections.connections, false)}
          {renderSection("OEC Opportunities", "oec_opportunities", sections.oec_opportunities, false)}
          <div style={{ borderBottom: "none", paddingBottom: 0, marginBottom: 16 }}>
            {renderSection("Client Opportunities", "client_opportunities", sections.client_opportunities, false)}
          </div>

          {/* Copy all for Claude */}
          <button
            onClick={copyAll}
            style={{
              width: "100%",
              background: C.accentFaint,
              border: "1px solid " + C.accentLine,
              borderRadius: 6,
              padding: "9px 0",
              fontFamily: INTER,
              fontSize: 12,
              fontWeight: 500,
              color: C.accent,
              cursor: "pointer",
              textAlign: "center",
              marginTop: 4,
            }}
          >
            {copiedAll ? "Copied ✓" : "Copy all for Claude"}
          </button>
        </div>
      )}
    </Modal>
  );
}
