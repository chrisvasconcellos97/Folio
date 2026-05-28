import { useState, useEffect } from "react";
import { C } from "../../lib/colors";
import { showToast } from "../../components/Toast";
import { MarkdownText } from "../../components/MarkdownText";
import { Modal } from "../../components/Modal";
import { PipMark } from "../../components/PipMark";

import { useMeetings } from "../../hooks/useMeetings";
import { useItems } from "../../hooks/useItems";
import { useContacts } from "../../hooks/useContacts";
import { useCadences } from "../../hooks/useCadences";
import { useProjects } from "../../hooks/useProjects";
import { callBriefMePip } from "../../lib/pip";
import { usePipAccountState } from "../../hooks/usePipAccountState";
import { AccountDetailHeader } from "./AccountDetailHeader";
import { AccountDetailTabs } from "./AccountDetailTabs";
import { OverviewTab } from "./tabs/OverviewTab";
import { MeetingsTab } from "./tabs/MeetingsTab";
import { ItemsTab } from "./tabs/ItemsTab";
import { ContactsTab } from "./tabs/ContactsTab";
import { CadenceTab } from "./tabs/CadenceTab";
import { ProjectsTab } from "./tabs/ProjectsTab";
import { ShopsTab } from "./tabs/ShopsTab";
import { AddAccountModal } from "./AddAccountModal";
import { AccountMergeModal } from "./AccountMergeModal";
import { LogConversationModal } from "./LogConversationModal";
import { QuickMeetingModal } from "./QuickMeetingModal";
import { AddItemModal } from "./AddItemModal";
import { AddContactModal } from "./AddContactModal";
import { PrintAccountSheet } from "../../components/PrintAccountSheet";
import { CadenceHub } from "../cadence/CadenceHub";
import { CadenceBackfillBanner } from "../cadence/CadenceBackfillBanner";
import { ErrorBanner } from "../../components/ErrorBanner";
import { supabase } from "../../lib/supabase";
import { buildAccountExport, downloadAccountExport } from "../../lib/accountExport";

function getDefaultTab(accountId) {
  try { return localStorage.getItem("folio_default_tab_" + accountId) || null; } catch(e) { return null; }
}
function setDefaultTab(accountId, tab) {
  try { localStorage.setItem("folio_default_tab_" + accountId, tab); } catch(e) {}
}

export function AccountDetail({ account, userId, orgId, accounts, members, onBack, onEdit, onDelete, onReactivate, onMerge, onUpdate, onSelectAccount, pipPrefill, onPipPrefillHandled, initialHubCadenceId, onHubConsumed, revenueHistory, shopMetrics, onAddAccount }) {
  var isInternalTeam = account.account_type === 'internal_team';
  var isPartner      = account.account_type === 'partner';
  var isCustomerType = !isInternalTeam && !isPartner;

  var TABS = account.account_type === 'mso'
    ? ["overview", "shops", "meetings", "tasks", "contacts", "cadence", "projects"]
    : ["overview", "meetings", "tasks", "contacts", "cadence", "projects"];

  var workspaceLabel = isInternalTeam ? "Departments" : isPartner ? "Partners" : "Accounts";

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
  var [showMergeModal, setShowMergeModal] = useState(false);

  var [cadencePrefill, setCadencePrefill] = useState(null);
  var [hubCadence, setHubCadence]         = useState(null);
  var [logConvDefaultCadenceId, setLogConvDefaultCadenceId] = useState(null);

  var [showBriefModal, setBriefModal]   = useState(false);
  var [briefText, setBriefText]         = useState(null);
  var [briefLoading, setBriefLoading]   = useState(false);
  var [briefError, setBriefError]       = useState(null);

  var pipAcctState = usePipAccountState(userId);
  var [refreshingState, setRefreshingState] = useState(false);

  function handleExport() {
    // Fetch the user's account-notes row inline so we don't drag an
    // extra hook subscription into AccountDetail just for export. Other
    // collections are already in memory via their existing hooks.
    if (!account || !account.id) return;
    var notesPromise = userId
      ? supabase
          .from("folio_account_notes")
          .select("*")
          .eq("user_id", userId)
          .eq("account_id", account.id)
          .maybeSingle()
          .then(function (r) { return r && r.data ? r.data : null; })
          .catch(function () { return null; })
      : Promise.resolve(null);

    notesPromise.then(function (notes) {
      var payload = buildAccountExport({
        account: account,
        meetings: meetings,
        items: items,
        contacts: contacts,
        cadences: cadences,
        projects: projects,
        notes: notes,
      });
      var filename = downloadAccountExport(payload, account);
      if (filename) showToast("Exported " + filename);
    });
  }

  function handleRefreshPipMemory() {
    if (!account || !account.id || refreshingState) return;
    setRefreshingState(true);
    Promise.resolve(pipAcctState.refreshState(account.id)).finally(function () {
      setRefreshingState(false);
      showToast("Pip memory resynced");
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

  var { meetings, addMeeting, updateMeeting, deleteMeeting, error: meetingsError, refetch: refetchMeetings } = useMeetings(userId, account.id, orgId);
  var { items, addItem, closeItem, updateItem, error: itemsError, refetch: refetchItems }                   = useItems(userId, account.id, orgId);
  var { contacts, addContact, updateContact, deleteContact, error: contactsError, refetch: refetchContacts } = useContacts(userId, account.id, orgId);
  var { cadences, addCadence, updateCadence, deleteCadence, error: cadencesError, refetch: refetchCadences } = useCadences(userId, account.id);
  var { projects, addProject, updateProject, deleteProject, error: projectsError, refetch: refetchProjects } = useProjects(userId, account.id, orgId);

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
  var mergedIntoAccount = account.merged_into_account_id
    ? allAccounts.find(function (a) { return a.id === account.merged_into_account_id; })
    : null;

  var openCount = items.filter(function (i) { return !i.done; }).length;

  function handleBriefMe() {
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
  }

  if (hubCadence) {
    return (
      <CadenceHub
        cadence={hubCadence}
        account={account}
        userId={userId}
        meetings={meetings}
        items={items}
        cadences={cadences}
        projects={projects}
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
      <AccountDetailHeader
        account={account}
        userId={userId}
        members={members}
        meetings={meetings}
        openCount={openCount}
        parentAccount={parentAccount}
        mergedIntoAccount={mergedIntoAccount}
        workspaceLabel={workspaceLabel}
        isCustomerType={isCustomerType}
        isPartner={isPartner}
        onBack={onBack}
        onSelectAccount={onSelectAccount}
        onUpdate={onUpdate}
        onOpenTasksTab={function () { setTab("tasks"); }}
        onBriefMe={handleBriefMe}
        onResyncPipMemory={handleRefreshPipMemory}
        resyncingPip={refreshingState}
        onEdit={onEdit}
        onPrint={function () { window.print(); }}
        onExport={handleExport}
        onDelete={onDelete}
        onReactivate={onReactivate}
        onOpenMerge={function () { setShowMergeModal(true); }}
        confirmDelete={confirmDelete}
        onConfirmDelete={function () { setConfirmDelete(true); }}
        onCancelDelete={function () { setConfirmDelete(false); }}
      />

      {/* Backfill prompt — surfaces once per account when cadences exist with un-tagged meetings */}
      <CadenceBackfillBanner
        account={account}
        cadences={cadences}
        meetings={meetings}
        onUpdateMeeting={updateMeeting}
      />

      <AccountDetailTabs
        tabs={TABS}
        activeTab={tab}
        shopCount={subAccounts.length}
        onChange={function (next, dir) {
          setTabSlideDir(dir);
          setTab(next);
          setDefaultTab(account.id, next);
        }}
      />

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
        <>
          <ErrorBanner message={meetingsError ? "Couldn't load meetings — check your connection" : null} onRetry={refetchMeetings} />
        <MeetingsTab
          meetings={meetings}
          accountName={account.name}
          accountId={account.id}
          userId={userId}
          openItems={items}
          addItem={function (data) { return addItem(Object.assign({ account_id: account.id }, data)); }}
          onLogMeeting={function () { setMeetingModal(true); }}
          onDelete={deleteMeeting}
          onAddMeeting={addMeeting}
          onUpdateMeeting={updateMeeting}
        />
        </>
      )}

      {tab === "tasks" && (
        <>
          <ErrorBanner message={itemsError ? "Couldn't load tasks — check your connection" : null} onRetry={refetchItems} />
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
        </>
      )}

      {tab === "contacts" && (
        <>
          <ErrorBanner message={contactsError ? "Couldn't load contacts — check your connection" : null} onRetry={refetchContacts} />
        <ContactsTab
          contacts={contacts}
          accountId={account.id}
          accountName={account.name}
          onAdd={function () { setContactModal(true); }}
          onDelete={deleteContact}
          onAddContact={addContact}
          onUpdate={updateContact}
        />
        </>
      )}

      {tab === "cadence" && (
        <>
          <ErrorBanner message={cadencesError ? "Couldn't load cadences — check your connection" : null} onRetry={refetchCadences} />
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
        </>
      )}

      {tab === "projects" && (
        <>
          <ErrorBanner message={projectsError ? "Couldn't load projects — check your connection" : null} onRetry={refetchProjects} />
        <ProjectsTab
          projects={projects}
          accounts={accounts}
          accountId={account.id}
          userId={userId}
          addProject={addProject}
          updateProject={updateProject}
          deleteProject={deleteProject}
        />
        </>
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

      {showMergeModal && (
        <AccountMergeModal
          source={account}
          accounts={allAccounts}
          onConfirm={function (targetId) {
            return Promise.resolve(onMerge && onMerge(targetId)).finally(function () {
              setShowMergeModal(false);
            });
          }}
          onClose={function () { setShowMergeModal(false); }}
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
