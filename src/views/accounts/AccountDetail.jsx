import { useState } from "react";
import { C } from "../../lib/colors";
import { Pill } from "../../components/Pill";
import { AmberBtn, SecBtn, DangerBtn } from "../../components/Buttons";
import { useMeetings } from "../../hooks/useMeetings";
import { useItems } from "../../hooks/useItems";
import { useContacts } from "../../hooks/useContacts";
import { OverviewTab } from "./tabs/OverviewTab";
import { MeetingsTab } from "./tabs/MeetingsTab";
import { ItemsTab } from "./tabs/ItemsTab";
import { ContactsTab } from "./tabs/ContactsTab";
import { LogMeetingModal } from "./LogMeetingModal";
import { QuickMeetingModal } from "./QuickMeetingModal";
import { AddItemModal } from "./AddItemModal";
import { AddContactModal } from "./AddContactModal";

var TABS = ["overview", "meetings", "items", "contacts"];
var STATUS_COLORS = { green: C.green, yellow: C.yellow, red: C.red };
var STATUS_LABELS = { green: "Healthy", yellow: "Watch", red: "At Risk" };
var TIER_COLORS   = { Major: C.blue, Mid: C.purple, Growth: C.green };

export function AccountDetail({ account, userId, onBack, onEdit, onDelete }) {
  var [tab, setTab]               = useState("overview");
  var [showMeetingModal, setMeetingModal] = useState(false);
  var [showQuickModal, setQuickModal]     = useState(false);
  var [showItemModal, setItemModal]       = useState(false);
  var [showContactModal, setContactModal] = useState(false);
  var [confirmDelete, setConfirmDelete]   = useState(false);

  var { meetings, addMeeting, deleteMeeting } = useMeetings(userId, account.id);
  var { items, addItem, closeItem }            = useItems(userId, account.id);
  var { contacts, addContact, deleteContact }  = useContacts(userId, account.id);

  var statusColor = STATUS_COLORS[account.status] || C.textSub;
  var openCount   = items.filter(function (i) { return !i.done; }).length;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: C.textMuted,
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "'DM Sans', sans-serif",
            padding: 0,
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          ← Back
        </button>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: C.text,
                marginBottom: 8,
                lineHeight: 1.2,
              }}
            >
              {account.name}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {account.tier && (
                <Pill color={TIER_COLORS[account.tier] || C.textSub}>
                  {account.tier}
                </Pill>
              )}
              <Pill color={statusColor}>
                {STATUS_LABELS[account.status] || account.status}
              </Pill>
              {openCount > 0 && (
                <Pill color={C.yellow}>
                  {openCount + " open"}
                </Pill>
              )}
              {account.region && (
                <Pill color={C.accent}>{account.region}</Pill>
              )}
            </div>
            {account.tags && account.tags.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                {account.tags.map(function (t) {
                  return (
                    <Pill key={t} color={C.blue}>{t}</Pill>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: C.accent,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {account.revenue || "—"}
            </div>
            <div
              style={{
                fontSize: 9,
                color: C.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginTop: 2,
              }}
            >
              YTD Revenue
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
              <SecBtn
                onClick={onEdit}
                style={{ fontSize: 11, padding: "5px 12px" }}
              >
                Edit
              </SecBtn>
              {!confirmDelete && (
                <DangerBtn
                  onClick={function () { setConfirmDelete(true); }}
                  style={{ fontSize: 11, padding: "5px 12px" }}
                >
                  Delete
                </DangerBtn>
              )}
              {confirmDelete && (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: C.red }}>Sure?</span>
                  <DangerBtn
                    onClick={onDelete}
                    style={{ fontSize: 11, padding: "5px 12px" }}
                  >
                    Yes, Delete
                  </DangerBtn>
                  <SecBtn
                    onClick={function () { setConfirmDelete(false); }}
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

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          background: "rgba(0,0,0,0.25)",
          borderRadius: 10,
          padding: 3,
          gap: 2,
          marginBottom: 16,
        }}
      >
        {TABS.map(function (t) {
          return (
            <button
              key={t}
              onClick={function () { setTab(t); }}
              style={{
                flex: 1,
                padding: "7px 4px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                textTransform: "capitalize",
                background: tab === t ? C.bgCardAlt : "transparent",
                color: tab === t ? C.accent : C.textMuted,
                border: "1px solid " + (tab === t ? C.border : "transparent"),
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <OverviewTab
          account={account}
          openItems={items}
          onQuickMeeting={function () { setQuickModal(true); }}
          onLogMeeting={function () { setMeetingModal(true); }}
          onAddItem={function () { setItemModal(true); }}
        />
      )}

      {tab === "meetings" && (
        <MeetingsTab
          meetings={meetings}
          onLogMeeting={function () { setMeetingModal(true); }}
          onDelete={deleteMeeting}
        />
      )}

      {tab === "items" && (
        <ItemsTab
          items={items}
          onClose={closeItem}
          onAdd={function () { setItemModal(true); }}
        />
      )}

      {tab === "contacts" && (
        <ContactsTab
          contacts={contacts}
          onAdd={function () { setContactModal(true); }}
          onDelete={deleteContact}
        />
      )}

      {/* Modals */}
      {showQuickModal && (
        <QuickMeetingModal
          accountId={account.id}
          userId={userId}
          accountName={account.name}
          onSave={addMeeting}
          onClose={function () { setQuickModal(false); }}
        />
      )}

      {showMeetingModal && (
        <LogMeetingModal
          accountId={account.id}
          userId={userId}
          onSave={addMeeting}
          onClose={function () { setMeetingModal(false); }}
        />
      )}

      {showItemModal && (
        <AddItemModal
          accountId={account.id}
          userId={userId}
          onSave={addItem}
          onClose={function () { setItemModal(false); }}
        />
      )}

      {showContactModal && (
        <AddContactModal
          accountId={account.id}
          userId={userId}
          onSave={addContact}
          onClose={function () { setContactModal(false); }}
        />
      )}
    </div>
  );
}
