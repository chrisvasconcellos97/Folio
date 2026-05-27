import { useState, useEffect } from "react";
import { C } from "../../lib/colors";
import { showToast } from "../../components/Toast";
import { Pill } from "../../components/Pill";
import { AmberBtn, SecBtn, DangerBtn } from "../../components/Buttons";
import { MarkdownText } from "../../components/MarkdownText";
import { Modal } from "../../components/Modal";
import { PipOrb, PipMark } from "../../components/PipMark";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";
import { useMeetings } from "../../hooks/useMeetings";
import { useItems } from "../../hooks/useItems";
import { useContacts } from "../../hooks/useContacts";
import { useCadences } from "../../hooks/useCadences";
import { useProjects } from "../../hooks/useProjects";
import { callBriefMePip } from "../../lib/pip";
import { usePipAccountState } from "../../hooks/usePipAccountState";
import { displayRevenue } from "../../lib/metricsUtils";
import { OverviewTab } from "./tabs/OverviewTab";
import { MeetingsTab } from "./tabs/MeetingsTab";
import { ItemsTab } from "./tabs/ItemsTab";
import { ContactsTab } from "./tabs/ContactsTab";
import { CadenceTab } from "./tabs/CadenceTab";
import { ProjectsTab } from "./tabs/ProjectsTab";
import { ShopsTab } from "./tabs/ShopsTab";
import { AddAccountModal } from "./AddAccountModal";
import { LogConversationModal } from "./LogConversationModal";
import { QuickMeetingModal } from "./QuickMeetingModal";
import { AddItemModal } from "./AddItemModal";
import { AddContactModal } from "./AddContactModal";
import { PrintAccountSheet } from "../../components/PrintAccountSheet";
import { CadenceHub } from "../cadence/CadenceHub";
import { CadenceBackfillBanner } from "../cadence/CadenceBackfillBanner";

var STATUS_COLORS = { green: C.green, yellow: C.yellow, red: C.red };
var STATUS_LABELS = { green: "Healthy", yellow: "Watch", red: "At Risk" };
var TIER_COLORS   = { Major: C.blue, Mid: C.purple, Growth: C.green };

function getDefaultTab(accountId) {
  try { return localStorage.getItem("folio_default_tab_" + accountId) || null; } catch(e) { return null; }
}
function setDefaultTab(accountId, tab) {
  try { localStorage.setItem("folio_default_tab_" + accountId, tab); } catch(e) {}
}

export function AccountDetail({ account, userId, orgId, accounts, onBack, onEdit, onDelete, onUpdate, onSelectAccount, pipPrefill, onPipPrefillHandled, initialHubCadenceId, onHubConsumed, revenueHistory, shopMetrics, onAddAccount }) {
  var TABS = account.account_type === 'mso'
    ? ["overview", "shops", "meetings", "tasks", "contacts", "cadence", "projects"]
    : ["overview", "meetings", "tasks", "contacts", "cadence", "projects"];

  var [tab, setTab]               = useState(function() {
    return getDefaultTab(account.id) || "overview";
  });
  var [tabSlideDir, setTabSlideDir] = useState("right");
  var [showMeetingModal, setMeetingModal] = useState(false);
  var [showQuickModal, setQuickModal]     = useState(false);
  var [showItemModal, setItemModal]       = useState(false);
  var [showContactModal, setContactModal] = useState(false);
  var [showAddShopModal, setAddShopModal] = useState(false);
  var [confirmDelete, setConfirmDelete]   = useState(false);

  var [cadencePrefill, setCadencePrefill] = useState(null);
  var [hubCadence, setHubCadence]         = useState(null);
  var [logConvDefaultCadenceId, setLogConvDefaultCadenceId] = useState(null);

  var [showBriefModal, setBriefModal]   = useState(false);
  var [briefText, setBriefText]         = useState(null);
  var [briefLoading, setBriefLoading]   = useState(false);
  var [briefError, setBriefError]       = useState(null);

  var pipAcctState = usePipAccountState(userId);
  var [refreshingState, setRefreshingState] = useState(false);

  function handleRefreshPipMemory() {
    if (!account || !account.id || refreshingState) return;
    setRefreshingState(true);
    Promise.resolve(pipAcctState.refreshState(account.id)).finally(function () {
      setRefreshingState(false);
      showToast("Pip's memory refreshed");
    });
  }

  useEffect(function () {
    if (!pipPrefill) return;
    if (pipPrefill.tab) setTab(pipPrefill.tab);
    if (pipPrefill.modal === "log_meeting")  setMeetingModal(true);
    if (pipPrefill.modal === "add_item")     setItemModal(true);
    if (pipPrefill.modal === "add_contact")  setContactModal(true);
    if (pipPrefill.modal === "set_cadence")  setCadencePrefill(pipPrefill.data || {});
    if (onPipPrefillHandled) onPipPrefillHandled();
  }, [pipPrefill]);

  useEffect(function () {
    setBriefText(null);
    setBriefError(null);
  }, [account.id]);

  var { meetings, addMeeting, updateMeeting, deleteMeeting } = useMeetings(userId, account.id, orgId);
  var { items, addItem, closeItem, updateItem }            = useItems(userId, account.id, orgId);
  var { contacts, addContact, updateContact, deleteContact }  = useContacts(userId, account.id, orgId);
  var { cadences, addCadence, updateCadence, deleteCadence } = useCadences(userId, account.id);
  var { projects, addProject, updateProject, deleteProject } = useProjects(userId, account.id, orgId);

  useEffect(function () {
    if (!initialHubCadenceId || !cadences || cadences.length === 0) return;
    var match = cadences.find(function (c) { return c.id === initialHubCadenceId; });
    if (match) {
      setHubCadence(match);
      if (onHubConsumed) onHubConsumed();
    }
  }, [initialHubCadenceId, cadences]);

  var allAccounts   = accounts || [];
  var subAccounts   = allAccounts.filter(function (a) { return a.parent_account_id === account.id; });
  var parentAccount = account.parent_account_id ? allAccounts.find(function (a) { return a.id === account.parent_account_id; }) : null;

  var statusColor = STATUS_COLORS[account.status] || C.textSub;
  var openCount   = items.filter(function (i) { return !i.done; }).length;

  if (hubCadence) {
    return (
      <CadenceHub
        cadence={hubCadence}
        account={account}
        userId={userId}
        meetings={meetings}
        items={items}
        cadences={cadences}
        addMeeting={addMeeting}
        updateMeeting={updateMeeting}
        deleteMeeting={deleteMeeting}
        addItem={function (data) { return addItem(Object.assign({ account_id: account.id }, data)); }}
        closeItem={closeItem}
        onUpdateCadence={function (id, data) {
          return updateCadence(id, data).then(function () {
            setHubCadence(function (prev) { return prev && prev.id === id ? Object.assign({}, prev, data) : prev; });
          });
        }}
        onBack={function () { setHubCadence(null); }}
        onOpenAccount={function () { setHubCadence(null); setTab("overview"); }}
      />
    );
  }

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
          ← Accounts › {account.name}
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
                fontFamily: SERIF,
                fontSize: 36,
                fontWeight: 400,
                letterSpacing: "-0.022em",
                lineHeight: 1,
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
            {account.account_number && (
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, fontFeatureSettings: '"tnum"', marginBottom: 8 }}>
                #{account.account_number}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {account.tier && (
                <Pill color={TIER_COLORS[account.tier] || C.textSoft}>
                  {account.tier}
                </Pill>
              )}
              <Pill color={statusColor}>
                <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: statusColor, marginRight: 4, verticalAlign: "middle" }} />
                {STATUS_LABELS[account.status] || account.status}
              </Pill>
              {openCount > 0 && (
                <Pill
                  color={C.yellow}
                  onClick={function () { setTab("tasks"); }}
                  style={{ fontFeatureSettings: '"tnum"', cursor: "pointer" }}
                >
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
                    background: C.accentFaint, border: '1px solid ' + C.accentLine,
                    borderRadius: 999, padding: '3px 10px',
                    fontFamily: MONO, fontSize: 10,
                    color: C.accent, cursor: 'pointer',
                  }}
                >
                  ↑ {parentAccount.name}
                </button>
              )}
            </div>
            {account.tags && account.tags.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
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
            {account.address && (
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginTop: 6 }}>
                {account.address}
              </div>
            )}
            <button
              onClick={function () {
                setBriefModal(true);
                if (briefText) return;
                setBriefLoading(true);
                setBriefError(null);
                callBriefMePip({
                  mode: "brief",
                  account: account,
                  meetings: meetings.slice(0, 5),
                  openItems: items.filter(function (i) { return !i.done; }),
                  contacts: contacts,
                  recentDeliveries: items
                    .filter(function(i) { return i.done && i.text && i.text.indexOf("✓ Delivered:") === 0; })
                    .sort(function(a, b) { return (b.closed_at || "") > (a.closed_at || "") ? 1 : -1; })
                    .slice(0, 5)
                    .map(function(i) { return { title: i.text.replace("✓ Delivered: ", ""), date: i.closed_at ? new Date(i.closed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null }; }),
                  activeProjects: (projects || [])
                    .filter(function(p) { return p.status === "in_progress" || p.status === "blocked"; })
                    .map(function(p) { return { title: p.title, status: p.status, due_date: p.due_date }; }),
                }).then(function (data) {
                  setBriefLoading(false);
                  setBriefText(data.brief || "Pip couldn't generate a brief right now.");
                }).catch(function () {
                  setBriefLoading(false);
                  setBriefError("Pip is unavailable right now.");
                });
              }}
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
              onClick={handleRefreshPipMemory}
              disabled={refreshingState}
              title="Have Pip re-read this account and refresh its cached memory."
              style={{
                background: "transparent",
                border: "1px solid " + C.border,
                borderRadius: 6, padding: "6px 12px",
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 11, fontWeight: 500,
                color: C.textMuted, cursor: refreshingState ? "default" : "pointer",
                marginTop: 8, marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 5,
                opacity: refreshingState ? 0.5 : 1,
              }}
            >
              {refreshingState ? "Refreshing…" : "Refresh Pip's memory"}
            </button>
          </div>

          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 28,
                fontWeight: 400,
                color: C.accent,
                fontFeatureSettings: '"tnum"',
              }}
            >
              {displayRevenue(account)}
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
              Revenue YTD
            </div>
            {(function() {
              if (meetings.length === 0) return null;
              var now = new Date();
              var bars = [];
              for (var i = 5; i >= 0; i--) {
                var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                var m = d.getMonth(); var y = d.getFullYear();
                var count = meetings.filter(function(mt) {
                  if (!mt.meeting_date) return false;
                  var md = new Date(mt.meeting_date);
                  return md.getFullYear() === y && md.getMonth() === m;
                }).length;
                bars.push({ count: count, label: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m] });
              }
              var maxCount = Math.max.apply(null, bars.map(function(b) { return b.count; }));
              if (maxCount === 0) return null;
              return (
                <div style={{ marginTop: 10, marginBottom: 4 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Meeting Cadence</div>
                  <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 20, justifyContent: "flex-end" }}>
                    {bars.map(function(b, i) {
                      var h = b.count === 0 ? 2 : Math.max(3, Math.round((b.count / maxCount) * 20));
                      var isLast = i === bars.length - 1;
                      return (
                        <div key={i} title={b.label + ": " + b.count} style={{ width: 8, height: h, background: isLast ? C.accent : C.accentDim, borderRadius: 1, opacity: isLast ? 0.9 : (b.count > 0 ? 0.5 : 0.15) }} />
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
              <SecBtn
                onClick={function () { window.print(); }}
                style={{ fontSize: 11, padding: "5px 12px" }}
              >
                Print
              </SecBtn>
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

      {/* Backfill prompt — surfaces once per account when cadences exist with un-tagged meetings */}
      <CadenceBackfillBanner
        account={account}
        cadences={cadences}
        meetings={meetings}
        onUpdateMeeting={updateMeeting}
      />

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 16,
          borderBottom: "1px solid " + C.rule,
          paddingBottom: 0,
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
                setDefaultTab(account.id, t);
              }}
              style={{
                padding: "8px 0",
                marginRight: 26,
                cursor: "pointer",
                fontFamily: MONO,
                fontSize: 10.5,
                fontWeight: 400,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                background: "transparent",
                color: active ? (isGauge ? C.blue : C.accent) : C.textMuted,
                border: "none",
                borderBottom: active ? "1.5px solid " + (isGauge ? C.blue : C.accent) : "1.5px solid transparent",
                marginBottom: -1,
              }}
            >
              {isGauge ? "Gauge" : t === "shops" ? (
                <span>
                  Shops
                  {subAccounts.length > 0 && (
                    <span style={{
                      marginLeft: 5,
                      fontFamily: MONO, fontSize: 9.5,
                      color: active ? C.accent : C.textMuted,
                    }}>
                      ({subAccounts.length})
                    </span>
                  )}
                </span>
              ) : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div key={tab} className={tabSlideDir === "left" ? "tab-slide-left" : "tab-slide-right"}>
      {tab === "overview" && (
        <OverviewTab
          account={account}
          userId={userId}
          orgId={orgId}
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
          onUpdateAccount={onUpdate}
          subAccounts={subAccounts}
          onSelectAccount={onSelectAccount}
          revenueHistory={revenueHistory || []}
          shopMetrics={shopMetrics || []}
          projects={projects}
          onSwitchTab={setTab}
        />
      )}

      {tab === "shops" && (
        <ShopsTab
          shops={subAccounts.sort(function (a, b) { return a.name.localeCompare(b.name); })}
          onAddShop={function () { setAddShopModal(true); }}
          onSelectShop={function (shop) { onSelectAccount && onSelectAccount(shop); }}
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
          accountName={account.name}
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
          onOpenHub={function (cad) { setHubCadence(cad); }}
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
        <LogConversationModal
          accountId={account.id}
          userId={userId}
          contacts={contacts}
          cadences={cadences}
          defaultCadenceId={logConvDefaultCadenceId}
          onSave={function (data) {
            return addMeeting(data).then(function (m) {
              showToast(data.status === "draft" ? "Draft started" : "Conversation logged");
              if (data.cadence_id && data.status === "draft") {
                var c = cadences.find(function (cc) { return cc.id === data.cadence_id; });
                if (c) setHubCadence(c);
              }
              return m;
            });
          }}
          onClose={function () { setMeetingModal(false); setLogConvDefaultCadenceId(null); }}
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

      {showAddShopModal && onAddAccount && (
        <AddAccountModal
          userId={userId}
          accounts={accounts}
          defaultType="shop"
          defaultParentId={account.id}
          onSave={function (data) {
            return onAddAccount(Object.assign({}, data, {
              account_type: 'shop',
              parent_account_id: account.id,
            })).then(function (shop) {
              showToast("Shop added");
              setAddShopModal(false);
              return shop;
            });
          }}
          onClose={function () { setAddShopModal(false); }}
        />
      )}

      {showBriefModal && (
        <Modal title="Pre-Call Brief" onClose={function () { setBriefModal(false); }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <PipMark size={8} color={C.accent} glow pulse />
            <span style={{ fontSize: 11, color: C.accent, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>Pip</span>
          </div>
          {briefLoading && (
            <div style={{ color: C.textMuted, fontSize: 14, textAlign: "center", padding: "20px 0" }}>Pip is pulling your brief…</div>
          )}
          {briefError && (
            <div style={{ color: C.red, fontSize: 13 }}>{briefError}</div>
          )}
          {briefText && (
            <MarkdownText text={briefText} style={{ fontSize: 14, color: C.textSub, lineHeight: 1.75 }} />
          )}
        </Modal>
      )}

      <PrintAccountSheet
        account={account}
        contacts={contacts}
        meetings={meetings}
        items={items}
      />
    </div>
  );
}
