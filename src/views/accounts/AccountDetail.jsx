import { useState, useEffect } from "react";
import { C } from "../../lib/colors";
import { showToast } from "../../components/Toast";
import { Pill } from "../../components/Pill";
import { AmberBtn, SecBtn, DangerBtn } from "../../components/Buttons";
import { useMeetings } from "../../hooks/useMeetings";
import { useItems } from "../../hooks/useItems";
import { useContacts } from "../../hooks/useContacts";
import { useCadences } from "../../hooks/useCadences";
import { useProjects } from "../../hooks/useProjects";
import { OverviewTab } from "./tabs/OverviewTab";
import { MeetingsTab } from "./tabs/MeetingsTab";
import { ItemsTab } from "./tabs/ItemsTab";
import { ContactsTab } from "./tabs/ContactsTab";
import { CadenceTab } from "./tabs/CadenceTab";
import { ProjectsTab } from "./tabs/ProjectsTab";
import { LogMeetingModal } from "./LogMeetingModal";
import { QuickMeetingModal } from "./QuickMeetingModal";
import { AddItemModal } from "./AddItemModal";
import { AddContactModal } from "./AddContactModal";

var TABS = ["overview", "meetings", "tasks", "contacts", "cadence", "projects"];
var STATUS_COLORS = { green: C.green, yellow: C.yellow, red: C.red };
var STATUS_LABELS = { green: "Healthy", yellow: "Watch", red: "At Risk" };
var TIER_COLORS   = { Major: C.blue, Mid: C.purple, Growth: C.green };

export function AccountDetail({ account, userId, accounts, onBack, onEdit, onDelete, onUpdate, onSelectAccount, pipPrefill, onPipPrefillHandled, revenueHistory, shopMetrics }) {
  var [tab, setTab]               = useState("overview");
  var [tabSlideDir, setTabSlideDir] = useState("right");
  var [showMeetingModal, setMeetingModal] = useState(false);
  var [showQuickModal, setQuickModal]     = useState(false);
  var [showItemModal, setItemModal]       = useState(false);
  var [showContactModal, setContactModal] = useState(false);
  var [confirmDelete, setConfirmDelete]   = useState(false);

  var [cadencePrefill, setCadencePrefill] = useState(null);

  useEffect(function () {
    if (!pipPrefill) return;
    if (pipPrefill.tab) setTab(pipPrefill.tab);
    if (pipPrefill.modal === "log_meeting")  setMeetingModal(true);
    if (pipPrefill.modal === "add_item")     setItemModal(true);
    if (pipPrefill.modal === "add_contact")  setContactModal(true);
    if (pipPrefill.modal === "set_cadence")  setCadencePrefill(pipPrefill.data || {});
    if (onPipPrefillHandled) onPipPrefillHandled();
  }, [pipPrefill]);

  var { meetings, addMeeting, updateMeeting, deleteMeeting } = useMeetings(userId, account.id);
  var { items, addItem, closeItem, updateItem }            = useItems(userId, account.id);
  var { contacts, addContact, updateContact, deleteContact }  = useContacts(userId, account.id);
  var { cadences, addCadence, updateCadence, deleteCadence } = useCadences(userId, account.id);
  var { projects, addProject, updateProject, deleteProject } = useProjects(userId, account.id);

  var allAccounts   = accounts || [];
  var subAccounts   = allAccounts.filter(function (a) { return a.parent_account_id === account.id; });
  var parentAccount = account.parent_account_id ? allAccounts.find(function (a) { return a.id === account.parent_account_id; }) : null;

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
              {parentAccount && (
                <button
                  onClick={function () { onSelectAccount && onSelectAccount(parentAccount); }}
                  style={{
                    background: 'rgba(74,155,130,0.08)', border: '1px solid rgba(74,155,130,0.2)',
                    borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                    color: C.accent, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                  }}
                >
                  ↑ {parentAccount.name}
                </button>
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
                fontSize: 10,
                color: C.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
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
                    Delete it
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
          var isGauge  = t === "projects";
          var active   = tab === t;
          return (
            <button
              key={t}
              onClick={function () {
                var oldIdx = TABS.indexOf(tab);
                var newIdx = TABS.indexOf(t);
                setTabSlideDir(newIdx >= oldIdx ? "right" : "left");
                setTab(t);
              }}
              style={{
                flex: 1,
                padding: "7px 4px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                textTransform: "capitalize",
                background: active ? C.bgCardAlt : "transparent",
                color: active ? (isGauge ? C.blue : C.accent) : C.textMuted,
                border: "1px solid " + (active ? (isGauge ? "rgba(123,108,246,0.2)" : C.border) : "transparent"),
              }}
            >
              {isGauge ? "gauge" : t}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div key={tab} className={tabSlideDir === "left" ? "tab-slide-left" : "tab-slide-right"}>
      {tab === "overview" && (
        <OverviewTab
          account={account}
          openItems={items}
          meetings={meetings}
          onQuickMeeting={function () { setQuickModal(true); }}
          onLogMeeting={function () { setMeetingModal(true); }}
          onAddItem={function () { setItemModal(true); }}
          onSaveSummary={function (summary) {
            return onUpdate && onUpdate({
              pip_account_summary: summary,
              pip_account_summary_at: new Date().toISOString(),
            });
          }}
          subAccounts={subAccounts}
          onSelectAccount={onSelectAccount}
          revenueHistory={revenueHistory || []}
          shopMetrics={shopMetrics || []}
        />
      )}

      {tab === "meetings" && (
        <MeetingsTab
          meetings={meetings}
          accountName={account.name}
          userId={userId}
          onLogMeeting={function () { setMeetingModal(true); }}
          onDelete={deleteMeeting}
          onAddMeeting={addMeeting}
          onUpdateMeeting={updateMeeting}
        />
      )}

      {tab === "tasks" && (
        <ItemsTab
          items={items}
          taskCadences={cadences.filter(function (c) { return c.type === 'task'; })}
          accountId={account.id}
          userId={userId}
          onClose={closeItem}
          onAdd={function () { setItemModal(true); }}
          onUpdate={updateItem}
          onGoToCadence={function () { setTab("cadence"); }}
        />
      )}

      {tab === "contacts" && (
        <ContactsTab
          contacts={contacts}
          accountId={account.id}
          onAdd={function () { setContactModal(true); }}
          onDelete={deleteContact}
          onAddContact={addContact}
          onUpdate={updateContact}
        />
      )}

      {tab === "cadence" && (
        <CadenceTab
          account={account}
          cadences={cadences}
          items={items}
          meetings={meetings}
          contacts={contacts}
          onAddCadence={function (data) {
            return addCadence(data).then(function (c) { showToast("Cadence set"); return c; });
          }}
          onUpdateCadence={updateCadence}
          onDeleteCadence={deleteCadence}
          onAddItem={function () { setItemModal(true); }}
          onCloseItem={closeItem}
          onLogMeeting={function () { setMeetingModal(true); }}
          onDeleteMeeting={deleteMeeting}
          prefill={cadencePrefill}
          onPrefillHandled={function () { setCadencePrefill(null); }}
        />
      )}

      {tab === "projects" && (
        <ProjectsTab
          projects={projects}
          accounts={accounts}
          accountId={account.id}
          userId={userId}
          addProject={addProject}
          updateProject={updateProject}
          deleteProject={deleteProject}
        />
      )}
      </div>

      {/* Modals */}
      {showQuickModal && (
        <QuickMeetingModal
          accountId={account.id}
          userId={userId}
          accountName={account.name}
          contacts={contacts}
          onSave={function (data) {
            return addMeeting(data).then(function (m) { showToast("Meeting logged"); return m; });
          }}
          onClose={function () { setQuickModal(false); }}
        />
      )}

      {showMeetingModal && (
        <LogMeetingModal
          accountId={account.id}
          userId={userId}
          contacts={contacts}
          onSave={function (data) {
            return addMeeting(data).then(function (m) { showToast("Meeting logged"); return m; });
          }}
          onClose={function () { setMeetingModal(false); }}
        />
      )}

      {showItemModal && (
        <AddItemModal
          accountId={account.id}
          userId={userId}
          onSave={function (data) {
            return addItem(data).then(function (i) { showToast("Item added"); return i; });
          }}
          onClose={function () { setItemModal(false); }}
        />
      )}

      {showContactModal && (
        <AddContactModal
          accountId={account.id}
          userId={userId}
          onSave={function (data) {
            return addContact(data).then(function (c) { showToast("Contact added"); return c; });
          }}
          onClose={function () { setContactModal(false); }}
        />
      )}
    </div>
  );
}
