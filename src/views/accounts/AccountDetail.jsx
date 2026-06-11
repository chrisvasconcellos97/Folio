import { useState, useEffect, useMemo } from "react";
import { C } from "../../lib/colors";
import { fmtMedium } from "../../lib/dateUtils";
import { showToast } from "../../components/Toast";
import { MarkdownText } from "../../components/MarkdownText";
import { Modal } from "../../components/Modal";
import { PipMark } from "../../components/PipMark";

import { useMeetings } from "../../hooks/useMeetings";
import { useItems } from "../../hooks/useItems";
import { useContacts } from "../../hooks/useContacts";
import { useCadences, usePersonCadences } from "../../hooks/useCadences";
import { useProjects } from "../../hooks/useProjects";
import { useAccountUpdates } from "../../hooks/useAccountUpdates";
import { callBriefMePip } from "../../lib/pip";
import { BusinessReviewModal } from "./BusinessReviewModal";
import { PipMemoryPanel } from "./PipMemoryPanel";
import { usePipAccountState } from "../../hooks/usePipAccountState";
import { OperatorPanel } from "../../components/OperatorPanel";
import { AccountDetailHeader } from "./AccountDetailHeader";
import { AccountDetailTabs } from "./AccountDetailTabs";
import { OverviewTab } from "./tabs/OverviewTab";
import { MeetingsTab } from "./tabs/MeetingsTab";
import { ItemsTab } from "./tabs/ItemsTab";
import { ContactsTab } from "./tabs/ContactsTab";
import { CadenceTab } from "./tabs/CadenceTab";
import { SetCadenceModal } from "../cadence/SetCadenceModal";
import { ProjectsTab } from "./tabs/ProjectsTab";
import { ShopsTab } from "./tabs/ShopsTab";
import { UpdatesTab } from "./tabs/UpdatesTab";
import { AddAccountModal } from "./AddAccountModal";
import { AccountMergeModal } from "./AccountMergeModal";
import { StartConversationModal } from "./StartConversationModal";
import { updateTask as updateGaugeTask, insertTask as insertGaugeTask } from "../../hooks/useTasks";
import { AddItemModal } from "./AddItemModal";
import { AddContactModal } from "./AddContactModal";
import { PrintAccountSheet } from "../../components/PrintAccountSheet";
import { CadenceHub } from "../cadence/CadenceHub";
import { CadenceMeetingMode } from "../cadence/CadenceMeetingMode";
import { SummarizeStreamingOverlay } from "../cadence/SummarizeStreamingOverlay";
import { PipSummarizePreview } from "../cadence/PipSummarizePreview";
import { summarizeDraftPip } from "../../lib/pip";
import { applyPipPlan } from "../../lib/pipPlanApply";
import { usePipAssignmentHints } from "../../hooks/usePipAssignmentHints";
import { usePipCorrections } from "../../hooks/usePipCorrections";
import { useGlossary } from "../../hooks/useGlossary";
import { useUserProfile } from "../../hooks/useUserProfile";
import { usePipFacts } from "../../hooks/usePipFacts";
import { ErrorBanner } from "../../components/ErrorBanner";
import { supabase } from "../../lib/supabase";
import { buildAccountExport, downloadAccountExport } from "../../lib/accountExport";
import { computeAccountHealth, gatherSignals } from "../../lib/accountHealth";
import { AccountHealthOverrideModal } from "./AccountHealthOverrideModal";
import { useContactAliases } from "../../hooks/useContactAliases";

function getDefaultTab(accountId) {
  try { return localStorage.getItem("folio_default_tab_" + accountId) || null; } catch(e) { return null; }
}
function setDefaultTab(accountId, tab) {
  try { localStorage.setItem("folio_default_tab_" + accountId, tab); } catch(e) {}
}

export function AccountDetail({ account, userId, userEmail, isDesktop, orgId, accounts, members, globalPeople, onBack, onEdit, onDelete, onReactivate, onMerge, onUpdate, onSelectAccount, pipPrefill, onPipPrefillHandled, initialHubCadenceId, onHubConsumed, initialPersonHubCadenceId, onPersonHubConsumed, autoOpenMeetingMode, onAutoOpenMeetingModeConsumed, onAddAccount, allProjects, onOpenSettings }) {
  var isInternalTeam = account.account_type === 'internal_team';
  var isPartner      = account.account_type === 'partner';
  var isCustomerType = !isInternalTeam && !isPartner;

  var TABS = account.account_type === 'mso'
    ? ["overview", "shops", "meetings", "tasks", "contacts", "cadence", "projects", "updates"]
    : ["overview", "meetings", "tasks", "contacts", "cadence", "projects", "updates"];

  var workspaceLabel = isInternalTeam ? "Departments" : isPartner ? "Partners" : "Accounts";

  var [tab, setTab]               = useState(function() {
    return getDefaultTab(account.id) || "overview";
  });
  var [tabSlideDir, setTabSlideDir] = useState("right");
  var [showMeetingModal, setMeetingModal] = useState(false);
  var [adHocDraftId, setAdHocDraftId]     = useState(null);
  var [adHocSummarizing, setAdHocSummarizing] = useState(false);
  var [adHocSummarizeErr, setAdHocSummarizeErr] = useState(null);
  var [adHocPreviewPlan, setAdHocPreviewPlan] = useState(null);
  var [adHocTitleDraft, setAdHocTitleDraft]   = useState(null);
  var [showItemModal, setItemModal]       = useState(false);
  var [showContactModal, setContactModal] = useState(false);
  var [showAddShopModal, setAddShopModal] = useState(false);
  var [confirmDelete, setConfirmDelete]   = useState(false);
  var [showMergeModal, setShowMergeModal] = useState(false);

  var [cadencePrefill, setCadencePrefill] = useState(null);
  var [hubCadence, setHubCadence]         = useState(null);

  var [showBriefModal, setBriefModal]   = useState(false);
  var [briefText, setBriefText]         = useState(null);
  var [briefLoading, setBriefLoading]   = useState(false);
  var [briefError, setBriefError]       = useState(null);
  var [showReviewModal, setShowReviewModal] = useState(false);

  var [showHealthOverride, setShowHealthOverride] = useState(false);
  var [showPipMemory, setShowPipMemory] = useState(false);
  var [showAdd1on1Modal, setShowAdd1on1Modal] = useState(false);
  var [hubPersonCadence, setHubPersonCadence] = useState(null); // { cadence, contact }

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

  var childAccountIds = (accounts || [])
    .filter(function (a) { return a.parent_account_id === account.id; })
    .map(function (a) { return a.id; });

  var { meetings, addMeeting, updateMeeting, deleteMeeting, error: meetingsError, refetch: refetchMeetings } = useMeetings(userId, account.id, orgId);
  var { items, addItem, closeItem, updateItem, deleteItem, error: itemsError, refetch: refetchItems }      = useItems(userId, account.id, orgId);
  var { contacts, addContact, updateContact, deleteContact, error: contactsError, refetch: refetchContacts } = useContacts(userId, account.id, orgId);
  var { cadences, addCadence, updateCadence, deleteCadence, error: cadencesError, refetch: refetchCadences } = useCadences(userId, account.id);
  var { cadences: personCadencesAll, addCadence: addPersonCadence, refetch: refetchPersonCadences } = useCadences(userId);
  var { projects, addProject, updateProject, deleteProject, error: projectsError, refetch: refetchProjects } = useProjects(userId, account.id, orgId, childAccountIds);
  var { updates, addUpdate, updateUpdate, deleteUpdate, error: updatesError, refetch: refetchUpdates } = useAccountUpdates(userId, account.id, orgId);
  var contactAliasesApi = useContactAliases(orgId || null, userId);

  // Filter person cadences to those whose contact_id belongs to this account's contacts
  var personCadences = useMemo(function () {
    if (!account.is_my_department) return [];
    var contactIds = new Set((contacts || []).map(function (c) { return c.id; }));
    return (personCadencesAll || []).filter(function (c) {
      return c.cadence_scope === 'person' && c.contact_id && contactIds.has(c.contact_id);
    });
  }, [personCadencesAll, contacts, account.is_my_department]);

  useEffect(function () {
    if (!initialHubCadenceId || !cadences || cadences.length === 0) return;
    var match = cadences.find(function (c) { return c.id === initialHubCadenceId; });
    if (match) {
      setHubCadence(match);
      if (onHubConsumed) onHubConsumed();
    }
  }, [initialHubCadenceId, cadences]);

  useEffect(function () {
    if (!initialPersonHubCadenceId || !personCadencesAll || personCadencesAll.length === 0) return;
    var match = personCadencesAll.find(function (c) { return c.id === initialPersonHubCadenceId; });
    if (match) {
      var matchContact = (contacts || []).find(function (c) { return c.id === match.contact_id; });
      setHubPersonCadence({ cadence: match, contact: matchContact || null });
      if (onPersonHubConsumed) onPersonHubConsumed();
    }
  }, [initialPersonHubCadenceId, personCadencesAll, contacts]);

  var allAccounts   = accounts || [];
  var subAccounts   = allAccounts.filter(function (a) { return a.parent_account_id === account.id; });
  var parentAccount = account.parent_account_id ? allAccounts.find(function (a) { return a.id === account.parent_account_id; }) : null;
  var mergedIntoAccount = account.merged_into_account_id
    ? allAccounts.find(function (a) { return a.id === account.merged_into_account_id; })
    : null;

  var openCount = items.filter(function (i) { return !i.done; }).length;

  // Compute Pip health for this account (used by header pill + override modal).
  var todayISO   = new Date().toISOString().slice(0, 10);
  var healthSignals = gatherSignals(account, items, projects, todayISO);
  var computedHealth = computeAccountHealth(account, healthSignals);

  function handleSaveHealthOverride(data) {
    return onUpdate(data).then(function () {
      showToast("Health " + (data.status_override ? "pinned to " + data.status_override : "cleared"));
    });
  }

  /* ---- Ad-hoc conversation (Log Conversation → full-screen meeting mode) ---- */
  var adHocHintsApi       = usePipAssignmentHints(userId, account.id);
  var adHocCorrectionsApi = usePipCorrections(userId, account.id);
  var glossaryApi         = useGlossary(userId, orgId, account.id);
  var userProfileApi      = useUserProfile(userId);
  var profileProse        = userProfileApi.profile && userProfileApi.profile.profile_prose ? userProfileApi.profile.profile_prose : null;
  var pipFactsApi         = usePipFacts(userId);

  var accountRoster = useMemo(function () {
    var glossaryEntries = glossaryApi.entries || [];
    var aliasesByAccount = {};
    glossaryEntries.forEach(function (g) {
      if (!g.account_id) return;
      if (!aliasesByAccount[g.account_id]) aliasesByAccount[g.account_id] = [];
      if (g.aliases && g.aliases.length) {
        aliasesByAccount[g.account_id] = aliasesByAccount[g.account_id].concat(g.aliases);
      }
      if (g.term) aliasesByAccount[g.account_id].push(g.term);
    });
    return (accounts || []).map(function (a) {
      return {
        id:           a.id,
        name:         a.name || "",
        account_type: a.account_type || "standard",
        aliases:      aliasesByAccount[a.id] || [],
      };
    });
  }, [accounts, glossaryApi.entries]);

  var adHocDraft = adHocDraftId
    ? (meetings || []).find(function (m) { return m.id === adHocDraftId; }) || null
    : null;
  var openItemsList = items.filter(function (i) { return !i.done; });
  var activeProjects = (projects || []).filter(function (p) { return p.status !== "complete"; });
  // For meeting hubs: show all portfolio projects so cross-account work is visible.
  // Falls back to account-scoped activeProjects if allProjects not provided.
  var allActiveProjects = allProjects
    ? (allProjects || []).filter(function (p) { return p.status !== "complete"; })
    : activeProjects;
  // Meeting-hub sidebar scoping: a customer cadence should show only THIS
  // account's (and child accounts') projects. Internal-team (department) and
  // partner meetings are inherently cross-account, so they show the whole
  // portfolio. (Person 1:1 hubs keep the portfolio-wide view below.)
  var hubProjects = (isInternalTeam || isPartner) ? allActiveProjects : activeProjects;
  var lastNonDraftMeetingAt = (meetings || [])
    .filter(function (m) { return m.status !== "draft" && m.id !== adHocDraftId; })
    .map(function (m) { return m.meeting_date; })
    .filter(Boolean)
    .sort()
    .reverse()[0] || null;

  function handleAdHocSummarize(draftPayload, discussedProjectIds, discussedItemIds) {
    if (adHocSummarizing || !draftPayload) return;
    setAdHocSummarizing(true);
    setAdHocSummarizeErr(null);
    setAdHocPreviewPlan({ streaming: true, summary: "", draftId: draftPayload.id });
    var methodLabel = draftPayload.method
      ? ({ phone: "Phone", in_person: "In Person", video: "Video", email: "Email" }[draftPayload.method] || draftPayload.method)
      : "Ad-hoc conversation";
    summarizeDraftPip({
      draft:            draftPayload,
      accountName:      account.name,
      cadenceLabel:     methodLabel,
      accountId:        account.id,
      existingItems:    openItemsList,
      activeProjects:   activeProjects,
      orgMembers:       members,
      assignmentHints:  adHocHintsApi.hints,
      corrections:      adHocCorrectionsApi.corrections,
      accountObjective: account.objective || "",
      accountSystems:   account.systems   || [],
      glossary:         glossaryApi.entries,
      accountRoster:    accountRoster,
      accountType:      account.account_type || "standard",
      pipAccountState:  pipAcctState.getStateRow(account.id) || null,
      contacts:         contacts || [],
      meetingHistory:   (meetings || []).filter(function(m) { return m.id !== draftPayload.id; }).slice(0, 5),
      ownerUserId:         account.owner_user_id || null,
      userId:              userId,
      isPersonCadence:     false,
      profileProse:        profileProse,
      facts:               pipFactsApi.activeFactStrings || [],
      servicedStates:      account.serviced_states || null,
      recentUpdates:       (updates || []).slice(0, 6),
      globalPeople:        globalPeople || [],
      discussedProjectIds: discussedProjectIds || [],
      discussedItemIds:    discussedItemIds    || [],
    }, {
      onRecap: function (txt) {
        setAdHocPreviewPlan(function (prev) {
          return prev && prev.streaming ? Object.assign({}, prev, { summary: txt }) : prev;
        });
      },
    }).then(function (out) {
      var followUp = out.follow_up_date || null;
      return updateMeeting(draftPayload.id, {
        pip_summary:     out.summary || null,
        pip_short_title: out.short_title || null,
        pip_tone:        out.tone || null,
        follow_up_date:  followUp,
        status:          "summarized",
        theme:           out.theme || null,
      }).then(function () {
        if (out.tone && onUpdate) onUpdate({ pip_tone: out.tone });
        return out;
      });
    }).then(function (out) {
      setAdHocSummarizing(false);
      setAdHocTitleDraft(out.suggested_title || null);
      setAdHocPreviewPlan({ plan: out.plan || [], summary: out.summary || "", draftId: draftPayload.id, skippedByPip: !!out.skippedByPip, suggestedTitle: out.suggested_title || null, meetingTitle: draftPayload.title || null, unknownPeople: out.unknown_people || [], receipts: out.receipts || [], discussedProjectIds: discussedProjectIds || [], discussedItemIds: discussedItemIds || [] });
    }).catch(function (err) {
      setAdHocSummarizing(false);
      setAdHocPreviewPlan(function (prev) { return prev && prev.streaming ? null : prev; });
      setAdHocSummarizeErr((err && err.message) || "Pip couldn't summarize.");
    });
  }

  function handleAdHocApplyPlan(selected) {
    var pDraftId = adHocPreviewPlan && adHocPreviewPlan.draftId;
    return applyPipPlan(selected, {
      addItem:        function (data) { return addItem(Object.assign({ account_id: account.id }, data)); },
      updateItem:     updateItem,
      closeItem:      closeItem,
      updateProject:  updateProject,
      addHint:        adHocHintsApi.addHint,
      accountId:      account.id,
      meetingId:      pDraftId || null,
      activeProjects: activeProjects,
      userId:         userId,
      orgId:          orgId,
    }).then(function (result) {
      if (pDraftId) {
        updateMeeting(pDraftId, { plan_applied_at: new Date().toISOString() })
          .catch(function () { /* badge-only failure */ });
      }
      setAdHocPreviewPlan(null);
      setAdHocTitleDraft(null);
      setAdHocDraftId(null);
      showToast("Conversation summarized");
      return result;
    });
  }

  function handleAdHocCancelPlan() {
    setAdHocPreviewPlan(null);
    setAdHocTitleDraft(null);
    setAdHocDraftId(null);
  }

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
        .map(function(i) { return { title: i.text.replace("✓ Delivered: ", ""), date: i.closed_at ? fmtMedium(i.closed_at) : null }; }),
      activeProjects: (projects || [])
        .filter(function(p) { return p.status === "in_progress" || p.status === "blocked"; })
        .map(function(p) { return { title: p.title, status: p.status, due_date: p.due_date }; }),
      accountObjective: account.objective || "",
      glossary:         glossaryApi.entries,
      facts:            pipFactsApi.activeFactStrings || [],
      profileProse:     profileProse,
    }).then(function (data) {
      setBriefLoading(false);
      setBriefText(data.brief || "Pip couldn't generate a brief right now.");
    }).catch(function () {
      setBriefLoading(false);
      setBriefError("Pip is unavailable right now.");
    });
  }

  function handleBusinessReview() {
    setShowReviewModal(true);
  }

  if (hubCadence) {
    return (
      <CadenceHub
        globalPeople={globalPeople}
        cadence={hubCadence}
        account={account}
        userId={userId}
        userEmail={userEmail}
        orgId={orgId}
        members={members}
        accounts={accounts}
        meetings={meetings}
        items={items}
        cadences={cadences}
        projects={hubProjects}
        contacts={contacts}
        addContact={addContact}
        addMeeting={addMeeting}
        updateMeeting={updateMeeting}
        deleteMeeting={deleteMeeting}
        updateProject={updateProject}
        addProject={addProject}
        addItem={function (data) { return addItem(Object.assign({ account_id: account.id }, data)); }}
        updateItem={updateItem}
        closeItem={closeItem}
        onUpdateCadence={function (id, data) {
          return updateCadence(id, data).then(function () {
            setHubCadence(function (prev) { return prev && prev.id === id ? Object.assign({}, prev, data) : prev; });
          });
        }}
        onUpdateAccount={onUpdate}
        onBack={function () { setHubCadence(null); }}
        onOpenAccount={function () { setHubCadence(null); setTab("overview"); }}
        isMobile={!isDesktop}
        autoOpenMeetingMode={autoOpenMeetingMode}
        onAutoOpenMeetingModeConsumed={onAutoOpenMeetingModeConsumed}
        pipLessonsLearned={(pipAcctState.getStateRow(account.id) || {}).lessons_learned || null}
        pipAccountStateRow={pipAcctState.getStateRow(account.id) || null}
        contactAliases={contactAliasesApi.aliases}
      />
    );
  }

  if (hubPersonCadence) {
    var hpcContact = hubPersonCadence.contact;
    var hpcCadence = hubPersonCadence.cadence;
    // Fetch meetings for this person cadence (all meetings linked to this cadence)
    // We pass the account-level meetings array; CadenceHub filters by cadence_id
    return (
      <CadenceHub
        globalPeople={globalPeople}
        cadence={hpcCadence}
        account={null}
        contact={hpcContact}
        userId={userId}
        userEmail={userEmail}
        orgId={orgId}
        members={members}
        accounts={accounts}
        meetings={meetings}
        items={items}
        cadences={personCadences}
        projects={allActiveProjects}
        contacts={contacts}
        addContact={addContact}
        addMeeting={function (data) {
          // The 1:1 contact belongs to THIS account, so tag person-cadence
          // meetings with it instead of the null CadenceHub passes for a person
          // scope. Otherwise they're orphaned (account_id null), invisible to
          // the account-scoped `meetings` array, and the hub re-creates a fresh
          // draft every time. With the account_id set, CadenceHub's cadence_id
          // filter surfaces them as the 1:1's history.
          return addMeeting(Object.assign({}, data, { account_id: account.id }));
        }}
        updateMeeting={updateMeeting}
        deleteMeeting={deleteMeeting}
        updateProject={function () { return Promise.resolve(); }}
        addProject={undefined}
        addItem={function (data) { return addItem(Object.assign({ account_id: account.id }, data)); }}
        updateItem={updateItem}
        closeItem={closeItem}
        onUpdateCadence={function (id, data) {
          return updateCadence(id, data).then(function () {
            setHubPersonCadence(function (prev) {
              if (!prev || prev.cadence.id !== id) return prev;
              return Object.assign({}, prev, { cadence: Object.assign({}, prev.cadence, data) });
            });
          });
        }}
        onBack={function () { setHubPersonCadence(null); }}
        onOpenAccount={null}
        isMobile={!isDesktop}
        autoOpenMeetingMode={false}
        onAutoOpenMeetingModeConsumed={null}
        pipLessonsLearned={null}
        pipAccountStateRow={null}
      />
    );
  }

  return (
    <div>
      <AccountDetailHeader
        account={account}
        health={computedHealth}
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
        onBusinessReview={handleBusinessReview}
        onResyncPipMemory={handleRefreshPipMemory}
        resyncingPip={refreshingState}
        onPipMemory={function () { setShowPipMemory(true); }}
        onEdit={onEdit}
        onPrint={function () { window.print(); }}
        onExport={handleExport}
        onDelete={onDelete}
        onReactivate={onReactivate}
        onOpenMerge={function () { setShowMergeModal(true); }}
        onOpenHealthOverride={isCustomerType ? function () { setShowHealthOverride(true); } : undefined}
        confirmDelete={confirmDelete}
        onConfirmDelete={function () { setConfirmDelete(true); }}
        onCancelDelete={function () { setConfirmDelete(false); }}
      />

      <OperatorPanel
        stateRow={pipAcctState.getStateRow(account.id) || null}
        accountName={account.name}
        onAddTask={function (title) { return addItem(Object.assign({ account_id: account.id }, { text: title })); }}
        onChanged={pipAcctState.refetch}
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
          suppressPipInsight={!!((pipAcctState.getStateRow(account.id) || {}).operator_generated_at)}
          openItems={items}
          meetings={meetings}
          onQuickMeeting={function () { setMeetingModal(true); }}
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
          projects={projects}
          updates={updates}
          onSwitchTab={setTab}
          contacts={contacts}
          health={computedHealth}
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
          logCorrection={adHocCorrectionsApi.logCorrection}
          accountObjective={account.objective || ""}
          accountSystems={account.systems || []}
          glossary={glossaryApi.entries}
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
          userEmail={userEmail}
          onClose={closeItem}
          onAdd={function () { setItemModal(true); }}
          onUpdate={updateItem}
          onDelete={deleteItem}
          onGoToCadence={function () { setTab("cadence"); }}
          logCorrection={adHocCorrectionsApi.logCorrection}
          projects={allActiveProjects}
          accounts={[account]}
          members={members}
          onUpdateProject={updateProject}
          onCreateProject={addProject}
        />
        </>
      )}

      {tab === "contacts" && (
        <>
          <ErrorBanner message={contactsError ? "Couldn't load contacts — check your connection" : null} onRetry={refetchContacts} />
        <ContactsTab
          contacts={contacts}
          meetings={meetings}
          accountId={account.id}
          accountName={account.name}
          onAdd={function () { setContactModal(true); }}
          onDelete={deleteContact}
          onAddContact={addContact}
          onUpdate={updateContact}
          aliases={contactAliasesApi.aliases}
          addAlias={contactAliasesApi.addAlias}
          removeAlias={contactAliasesApi.removeAlias}
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
        {account.is_my_department && (
          <div style={{ padding: "0 16px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>Leadership 1:1s</span>
              <button
                onClick={function () { setShowAdd1on1Modal(true); }}
                style={{ background: "none", border: "1px solid " + C.accent, borderRadius: 6, color: C.accent, fontSize: 12, fontWeight: 600, padding: "3px 10px", cursor: "pointer" }}
              >+ Add 1:1</button>
            </div>
            {personCadences.length === 0 && (
              <div style={{ fontSize: 13, color: C.textMuted, padding: "10px 0" }}>No 1:1 cadences yet. Add one to track regular check-ins with your manager, mentor, or cross-functional partners.</div>
            )}
            {personCadences.map(function (pc) {
              var pcContact = (contacts || []).find(function (c) { return c.id === pc.contact_id; });
              return (
                <div
                  key={pc.id}
                  onClick={function () { setHubPersonCadence({ cadence: pc, contact: pcContact || null }); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: C.surface, borderRadius: 8, border: "1px solid " + C.border, marginBottom: 6, cursor: "pointer" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                      {pcContact ? pcContact.name : "Unknown contact"}
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted }}>
                      {pcContact && pcContact.title ? pcContact.title + " · " : ""}
                      {pc.label || pc.frequency || "1:1"}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, whiteSpace: "nowrap" }}>Open →</div>
                </div>
              );
            })}
          </div>
        )}
        {showAdd1on1Modal && (
          <SetCadenceModal
            accountId={account.id}
            userId={userId}
            contacts={contacts}
            initialScope="person"
            onSave={function (data) {
              return addPersonCadence(Object.assign({}, data, {
                cadence_scope: 'person',
                account_id: null,
                user_id: userId,
              })).then(function (c) {
                showToast("1:1 cadence added");
                setShowAdd1on1Modal(false);
                refetchPersonCadences();
                return c;
              });
            }}
            onClose={function () { setShowAdd1on1Modal(false); }}
          />
        )}
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

      {tab === "updates" && (
        <>
          <ErrorBanner message={updatesError ? "Couldn't load updates — check your connection" : null} onRetry={refetchUpdates} />
          <UpdatesTab
            account={account}
            updates={updates}
            orgMembers={members}
            contacts={contacts}
            addUpdate={addUpdate}
            updateUpdate={updateUpdate}
            deleteUpdate={deleteUpdate}
          />
        </>
      )}
      </div>

      {/* Modals */}
      {showMeetingModal && (
        <StartConversationModal
          accountId={account.id}
          userId={userId}
          orgId={orgId}
          members={members}
          onStart={function (data) {
            return addMeeting(data).then(function (m) {
              setMeetingModal(false);
              setAdHocDraftId(m.id);
              return m;
            });
          }}
          onAddItems={function (acctId, newItems) {
            // Quick email-touchpoint path: persist Pip-extracted action items.
            // Without onAddItems they were silently dropped despite a success toast.
            var creations = (newItems || []).map(function (it) {
              return addItem(Object.assign({ account_id: acctId || account.id }, {
                text:       it.text,
                due_date:   it.due_date || null,
                owner:      it.owner || null,
                project_id: it.project_id || null,
              }));
            });
            return Promise.all(creations);
          }}
          allGaugeProjects={projects}
          onCreateProject={addProject ? function (acctId, data) {
            return addProject(Object.assign({}, data, {
              account_id: acctId || account.id,
              status: "in_progress",
            }));
          } : null}
          onClose={function () { setMeetingModal(false); }}
        />
      )}

      {adHocDraft && !adHocPreviewPlan && (
        <CadenceMeetingMode
          draft={adHocDraft}
          account={account}
          cadenceLabel={null}
          brief={null}
          briefAt={null}
          projects={hubProjects}
          openItems={openItemsList}
          contacts={contacts || []}
          contactAliases={contactAliasesApi.aliases}
          accounts={accounts}
          members={members}
          userEmail={userEmail}
          lastMeetingAt={lastNonDraftMeetingAt}
          onUpdate={updateMeeting}
          onAddItem={function (data) { return addItem(Object.assign({ account_id: account.id }, data)); }}
          onCloseItem={closeItem}
          onUpdateProject={updateProject}
          onAddContact={addContact || undefined}
          onUpdateTask={userId ? function (taskId, fields) { return updateGaugeTask(userId, taskId, fields); } : undefined}
          onAddTask={userId ? function (payload) { return insertGaugeTask(userId, payload); } : undefined}
          onClose={function () { setAdHocDraftId(null); }}
          onSummarizeRequest={handleAdHocSummarize}
          summarizing={adHocSummarizing}
          summarizeErr={adHocSummarizeErr}
        />
      )}

      {adHocPreviewPlan && adHocPreviewPlan.streaming && (
        <SummarizeStreamingOverlay summary={adHocPreviewPlan.summary} />
      )}
      {adHocPreviewPlan && !adHocPreviewPlan.streaming && (
        <PipSummarizePreview
          plan={adHocPreviewPlan.plan}
          existingItems={openItemsList}
          activeProjects={activeProjects}
          orgMembers={members}
          onApply={handleAdHocApplyPlan}
          onCancel={handleAdHocCancelPlan}
          onLogCorrections={adHocCorrectionsApi.logCorrections}
          meetingId={adHocPreviewPlan.draftId}
          accountRoster={accountRoster}
          currentAccountId={account.id}
          skippedByPip={!!adHocPreviewPlan.skippedByPip}
          suggestedTitle={adHocPreviewPlan.suggestedTitle || null}
          meetingTitle={adHocPreviewPlan.meetingTitle || null}
          onTitleChange={function (v) { setAdHocTitleDraft(v); }}
          onTitleSave={function (title) {
            var draftId = adHocPreviewPlan && adHocPreviewPlan.draftId;
            if (!draftId) return;
            updateMeeting(draftId, { title: title })
              .catch(function () { /* title save is nice-to-have */ });
          }}
          unknownPeople={adHocPreviewPlan.unknownPeople || []}
          receipts={adHocPreviewPlan.receipts || []}
          onAddContact={addContact ? function (data) {
            return addContact(Object.assign({ account_id: account.id }, data));
          } : undefined}
          onCreateProject={addProject ? function (acctId, data) {
            return addProject(Object.assign({}, data, {
              account_id: acctId || account.id,
              status: "planned",
            }));
          } : undefined}
          accountContacts={contacts || []}
          discussedProjectIds={adHocPreviewPlan.discussedProjectIds || []}
          discussedItemIds={adHocPreviewPlan.discussedItemIds || []}
        />
      )}

      {showItemModal && (
        <AddItemModal
          accountId={account.id}
          userId={userId}
          members={members}
          accounts={accounts}
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

      {showReviewModal && (
        <BusinessReviewModal
          account={account}
          meetings={meetings}
          contacts={contacts}
          items={items}
          projects={projects || []}
          updates={updates || []}
          onClose={function () { setShowReviewModal(false); }}
        />
      )}

      {showPipMemory && (
        <PipMemoryPanel
          account={account}
          userId={userId}
          onClose={function () { setShowPipMemory(false); }}
          onOpenSettings={onOpenSettings}
        />
      )}

      <PrintAccountSheet
        account={account}
        contacts={contacts}
        meetings={meetings}
        items={items}
      />

      {showHealthOverride && (
        <AccountHealthOverrideModal
          account={account}
          onSave={handleSaveHealthOverride}
          onClose={function () { setShowHealthOverride(false); }}
        />
      )}
    </div>
  );
}
