// Account-detail header — extracted from AccountDetail.jsx during the Phase 4
// refactor. Owns the entire top block: back link, account name (with the
// trailing-word italic), account-number row, pills (tier / status / open
// count / region / parent / owner), tags, address, Brief Me + Resync Pip
// memory CTAs, and the right-hand column with revenue/spend YTD, meeting
// cadence sparkline, and the Print/Edit/Delete button stack.
//
// All Brief Me / delete-confirm state is owned by the parent (AccountDetail)
// — this component is purely presentational, taking callbacks for every
// interactive bit. That keeps the modal state colocated with the modal
// markup in AccountDetail.jsx.

import { C } from "../../lib/colors";
import { Pill } from "../../components/Pill";
import { SecBtn, DangerBtn } from "../../components/Buttons";
import { ownerInitials, findOwner } from "../../lib/ownerLabel";
import { useBreakpoint } from "../../hooks/useBreakpoint";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

var STATUS_COLORS = { green: C.green, yellow: C.yellow, red: C.red, new: C.textMuted };
var STATUS_LABELS = { green: "Healthy", yellow: "Watch", red: "At Risk", new: "New" };
var TIER_COLORS   = { Major: C.blue, Mid: C.purple, Growth: C.green };

export function AccountDetailHeader({
  account,
  health,
  userId,
  members,
  meetings,
  openCount,
  parentAccount,
  workspaceLabel,
  isCustomerType,
  isPartner,
  mergedIntoAccount,
  onBack,
  onSelectAccount,
  onUpdate,
  onOpenTasksTab,
  onBriefMe,
  onBusinessReview,
  onResyncPipMemory,
  resyncingPip,
  onEdit,
  onPrint,
  onExport,
  onDelete,
  onReactivate,
  onOpenMerge,
  onOpenHealthOverride,
  confirmDelete,
  onConfirmDelete,
  onCancelDelete,
}) {
  var isDesktop   = useBreakpoint();
  var isMobile    = !isDesktop;
  var isInactive  = !!account.is_inactive;
  // Use computed health if provided, fall back to account.status
  var computedHealth  = health || { status: account.status || "green", reason: null, pinned: false };
  var statusColor     = STATUS_COLORS[computedHealth.status] || C.textSub;

  var meetingBars = (function () {
    if (!meetings || meetings.length === 0) return null;
    var now = new Date();
    var bars = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var m = d.getMonth(); var y = d.getFullYear();
      var count = meetings.filter(function (mt) {
        if (!mt.meeting_date) return false;
        var md = new Date(mt.meeting_date);
        return md.getFullYear() === y && md.getMonth() === m;
      }).length;
      bars.push({ count: count, label: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m] });
    }
    var maxCount = Math.max.apply(null, bars.map(function (b) { return b.count; }));
    if (maxCount === 0) return null;
    return { bars: bars, maxCount: maxCount };
  })();

  return (
    <div style={{ marginBottom: 18 }}>
      {isMobile && (
        <style>{`
          .acc-hdr-pills > * {
            font-size: 9px !important;
            padding: 2px 7px !important;
          }
        `}</style>
      )}
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: C.textMuted,
          cursor: "pointer",
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: 0,
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        ← {workspaceLabel} › {account.name}
      </button>

      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          justifyContent: "space-between",
          alignItems: isMobile ? "stretch" : "flex-start",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: isMobile ? 26 : 36,
              fontWeight: 400,
              letterSpacing: "-0.022em",
              lineHeight: 1.05,
              color: C.text,
              marginBottom: 10,
            }}
          >
            {(function() {
              var words = account.name.split(" ");
              if (words.length > 1) {
                return (
                  <>
                    {words.slice(0, -1).join(" ") + " "}
                    <em>{words[words.length - 1]}</em>
                  </>
                );
              }
              return account.name;
            })()}
          </div>
          {account.account_number && isCustomerType && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, fontFeatureSettings: '"tnum"', marginBottom: 8 }}>
              #{account.account_number}
            </div>
          )}
          <div className="acc-hdr-pills" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", overflow: "hidden", maxWidth: "100%" }}>
            {isInactive && (
              <Pill color={C.yellow}>
                <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: C.yellow, marginRight: 4, verticalAlign: "middle" }} />
                Inactive
              </Pill>
            )}
            {mergedIntoAccount && (
              <button
                onClick={function () { onSelectAccount && onSelectAccount(mergedIntoAccount); }}
                style={{
                  background: C.accentFaint, border: '1px solid ' + C.accentLine,
                  borderRadius: 999, padding: '3px 10px',
                  fontFamily: MONO, fontSize: 10,
                  color: C.accent, cursor: 'pointer',
                }}
              >
                Merged into {mergedIntoAccount.name} →
              </button>
            )}
            {account.tier && isCustomerType && (
              <Pill color={TIER_COLORS[account.tier] || C.textSoft}>
                {account.tier}
              </Pill>
            )}
            {isCustomerType && (
              <button
                onClick={onOpenHealthOverride || undefined}
                title={computedHealth.reason ? "Health: " + computedHealth.reason + (computedHealth.pinned ? " (pinned)" : " (Pip-computed)") : "Pip-computed health"}
                style={{
                  background: "transparent", border: "none", padding: 0,
                  cursor: onOpenHealthOverride ? "pointer" : "default",
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}
              >
                <Pill color={statusColor}>
                  <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: statusColor, marginRight: 4, verticalAlign: "middle" }} />
                  {STATUS_LABELS[computedHealth.status] || computedHealth.status}
                  {computedHealth.pinned && (
                    <span style={{ marginLeft: 4, fontSize: 9 }}>📌</span>
                  )}
                </Pill>
                {computedHealth.reason && !computedHealth.pinned && (
                  <span style={{
                    fontFamily: MONO, fontSize: 9, color: statusColor,
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    opacity: 0.85,
                  }}>
                    {computedHealth.reason}
                  </span>
                )}
              </button>
            )}
            {openCount > 0 && (
              <Pill
                color={C.yellow}
                onClick={onOpenTasksTab}
                style={{ fontFeatureSettings: '"tnum"', cursor: "pointer" }}
              >
                {openCount + " open"}
              </Pill>
            )}
            {account.region && isCustomerType && (
              <Pill color={C.accent}>{account.region}</Pill>
            )}
            {parentAccount && isCustomerType && (
              <button
                onClick={function () { onSelectAccount && onSelectAccount(parentAccount); }}
                style={{
                  background: C.accentFaint, border: '1px solid ' + C.accentLine,
                  borderRadius: 999, padding: '3px 10px',
                  fontFamily: MONO, fontSize: 10,
                  color: C.accent, cursor: 'pointer',
                }}
              >
                ↑ {parentAccount.name}
              </button>
            )}
            {members && members.length > 1 && (function () {
              // Compute owner display — falls back to current user if unset.
              // (Result unused directly; the <select> below shows initials per option.)
              findOwner(members, account.owner_user_id) || findOwner(members, userId);
              return (
                <select
                  value={account.owner_user_id || userId}
                  onChange={function (e) { onUpdate && onUpdate({ owner_user_id: e.target.value }); }}
                  title="Account owner"
                  style={{
                    background: C.surface, border: "1px solid " + C.rule,
                    borderRadius: 999, padding: "3px 10px",
                    fontFamily: MONO, fontSize: 10, color: C.textSoft,
                    cursor: "pointer", appearance: "none",
                  }}
                >
                  {members.map(function (m) {
                    return <option key={m.user_id || m.id} value={m.user_id || ""}>Owner: {ownerInitials(m)}</option>;
                  })}
                </select>
              );
            })()}
          </div>
          {account.tags && account.tags.length > 0 && isCustomerType && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8, overflow: "hidden", maxWidth: "100%" }}>
              {account.tags.map(function (t) {
                return (
                  <span key={t} style={{
                    fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.08em",
                    textTransform: "uppercase", color: C.textSoft,
                    background: C.surface2, borderRadius: 4,
                    padding: "2px 7px",
                  }}>{t}</span>
                );
              })}
            </div>
          )}
          {account.address && isCustomerType && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginTop: 6 }}>
              {account.address}
            </div>
          )}
          <button
            onClick={onBriefMe}
            style={{
              background: "oklch(0.32 0.05 178 / 0.5)",
              border: "1px solid " + C.accentBorder,
              borderRadius: 6, padding: "6px 14px",
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 12, fontWeight: 500,
              color: C.accent, cursor: "pointer",
              marginTop: 12, display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <span style={{ fontSize: 13 }}>✦</span> Brief Me
          </button>
          <button
            onClick={onBusinessReview}
            style={{
              background: "transparent",
              border: "1px solid " + C.accentLine,
              borderRadius: 6, padding: "6px 14px",
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 12, fontWeight: 500,
              color: C.accent, cursor: "pointer",
              marginTop: 6, display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <span style={{ fontSize: 11 }}>◈</span> Business Review
          </button>
          <button
            onClick={onResyncPipMemory}
            disabled={resyncingPip}
            title="Tells Pip to re-read this account from scratch — every meeting, item, contact, and project — and rebuild its cached understanding of where things stand. Use after a big update if Pip's next response should reflect the latest state. Otherwise it auto-refreshes in the background when stale."
            style={{
              background: "transparent",
              border: "1px solid " + C.border,
              borderRadius: 6, padding: "6px 12px",
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 11, fontWeight: 500,
              color: C.textMuted, cursor: resyncingPip ? "default" : "pointer",
              marginTop: 8, marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 5,
              opacity: resyncingPip ? 0.5 : 1,
            }}
          >
            {resyncingPip ? "Resyncing…" : "Resync Pip memory"}
          </button>
        </div>

        <div style={{ textAlign: isMobile ? "left" : "right", flexShrink: 0 }}>
          {isPartner && account.spend_ytd != null && (
            <>
              <div
                style={{
                  fontFamily: SERIF,
                  fontSize: 28,
                  fontWeight: 400,
                  color: C.accent,
                  fontFeatureSettings: '"tnum"',
                }}
              >
                ${Number(account.spend_ytd).toLocaleString()}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  color: C.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginTop: 2,
                }}
              >
                Spend YTD
              </div>
            </>
          )}
          {meetingBars && (
            <div style={{ marginTop: 10, marginBottom: 4 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Meeting Cadence</div>
              <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 20, justifyContent: isMobile ? "flex-start" : "flex-end" }}>
                {meetingBars.bars.map(function (b, i) {
                  var h = b.count === 0 ? 2 : Math.max(3, Math.round((b.count / meetingBars.maxCount) * 20));
                  var isLast = i === meetingBars.bars.length - 1;
                  return (
                    <div key={i} title={b.label + ": " + b.count} style={{ width: 8, height: h, background: isLast ? C.accent : C.accentDim, borderRadius: 1, opacity: isLast ? 0.9 : (b.count > 0 ? 0.5 : 0.15) }} />
                  );
                })}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: isMobile ? "flex-start" : "flex-end", flexWrap: "wrap" }}>
            <SecBtn
              onClick={onPrint}
              style={{ fontSize: 11, padding: "5px 12px" }}
            >
              Print
            </SecBtn>
            {onExport && (
              <SecBtn
                onClick={onExport}
                style={{ fontSize: 11, padding: "5px 12px" }}
              >
                Export
              </SecBtn>
            )}
            <SecBtn
              onClick={onEdit}
              style={{ fontSize: 11, padding: "5px 12px" }}
            >
              Edit
            </SecBtn>
            {!isInactive && onOpenMerge && (
              <SecBtn
                onClick={onOpenMerge}
                style={{ fontSize: 11, padding: "5px 12px" }}
                title="Merge this account into another"
              >
                Merge into…
              </SecBtn>
            )}
            {isInactive ? (
              <SecBtn
                onClick={onReactivate}
                style={{ fontSize: 11, padding: "5px 12px", color: C.accent, borderColor: C.accentBorder }}
              >
                Reactivate
              </SecBtn>
            ) : !confirmDelete ? (
              <DangerBtn
                onClick={onConfirmDelete}
                style={{ fontSize: 11, padding: "5px 12px" }}
              >
                Archive
              </DangerBtn>
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: C.red }}>Sure?</span>
                <DangerBtn
                  onClick={onDelete}
                  style={{ fontSize: 11, padding: "5px 12px" }}
                >
                  Archive it
                </DangerBtn>
                <SecBtn
                  onClick={onCancelDelete}
                  style={{ fontSize: 11, padding: "5px 12px" }}
                >
                  No
                </SecBtn>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
