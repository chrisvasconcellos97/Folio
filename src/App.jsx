import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { supabase } from "./lib/supabase";
import { useAuth } from "./hooks/useAuth";
import { useBreakpoint } from "./hooks/useBreakpoint";
import { useAccounts } from "./hooks/useAccounts";
import { useMeetings } from "./hooks/useMeetings";
import { useCadences } from "./hooks/useCadences";
import { useCadenceSync } from "./hooks/useCadenceSync";
import { useQuickTasks } from "./hooks/useQuickTasks";
import { useAccountMetrics } from "./hooks/useAccountMetrics";
import { useProjects } from "./hooks/useProjects";
import { useOrg } from "./hooks/useOrg";
import { AuthView } from "./views/auth/AuthView";
import { AccountsView } from "./views/accounts/AccountsView";
import { AccountDetail } from "./views/accounts/AccountDetail";
import { AddAccountModal } from "./views/accounts/AddAccountModal";
import { OnboardingTour } from "./views/welcome/OnboardingTour";
import { ReturningWelcome } from "./views/welcome/ReturningWelcome";
import { PipLoader } from "./components/PipLoader";

// Code-split heavy views — only fetched when navigated to. Cuts initial
// bundle and speeds up first paint by ~30-40%.
var MeetingsView   = lazy(function () { return import("./views/meetings/MeetingsView").then(function (m) { return { default: m.MeetingsView }; }); });
var PipelineView   = lazy(function () { return import("./views/pipeline/PipelineView").then(function (m) { return { default: m.PipelineView }; }); });
var PipView        = lazy(function () { return import("./views/pip/PipView").then(function (m) { return { default: m.PipView }; }); });
var CadenceView    = lazy(function () { return import("./views/cadence/CadenceView").then(function (m) { return { default: m.CadenceView }; }); });
var GaugeView      = lazy(function () { return import("./views/gauge/GaugeView").then(function (m) { return { default: m.GaugeView }; }); });
var RouteBuilder   = lazy(function () { return import("./views/routes/RouteBuilder").then(function (m) { return { default: m.RouteBuilder }; }); });
var SettingsView   = lazy(function () { return import("./views/settings/SettingsView").then(function (m) { return { default: m.SettingsView }; }); });
var LeadershipView = lazy(function () { return import("./views/leadership/LeadershipView").then(function (m) { return { default: m.LeadershipView }; }); });
import { DesktopLayout } from "./layout/DesktopLayout";
import { MobileLayout } from "./layout/MobileLayout";
import { PipOrb, PipMark } from "./components/PipMark";
import { CommandPalette } from "./components/CommandPalette";
import { Toast, showToast } from "./components/Toast";
import { C } from "./lib/colors";

export default function App() {
  var { session, loading: authLoading, signIn, signUp, signOut, inactiveBlock, dismissInactiveBlock } = useAuth();
  var userId    = session ? session.user.id : null;
  var userEmail = session ? session.user.email : null;
  var userMeta  = session ? session.user.user_metadata : null;
  var isDesktop = useBreakpoint();

  var [view, setView]                   = useState("accounts");
  var [selectedAccount, setSelected]    = useState(null);
  var [pendingHubCadenceId, setPendingHubCadenceId] = useState(null);
  var [bannerFilter, setBannerFilter]   = useState(null); // 'cold' | 'overdue' | null
  var [showAddAccount, setShowAddAccount] = useState(false);
  var [addAccountDefaultType, setAddAccountDefaultType] = useState(null);
  var [editingAccount, setEditingAccount] = useState(null);
  var [pipPrefill, setPipPrefill]       = useState(null);
  var [showOnboarding, setShowOnboarding] = useState(false);
  var [showReturning, setShowReturning]   = useState(false);
  var [pipTransition, setPipTransition] = useState("idle");
  var [showPalette, setShowPalette]     = useState(false);
  var welcomeShown = useRef(false);

  function replayTour() {
    setShowReturning(false);
    setShowOnboarding(true);
  }

  var { accounts, loading: acctLoading, error: acctError, refetch: refetchAccounts, addAccount, updateAccount, deleteAccount, archiveAccount, reactivateAccount, mergeAccounts } = useAccounts(userId);
  var { org, orgId, role, members, pendingInvites, myInvite, createOrg, inviteMember, revokeMember, archiveMember, reactivateMember, acceptInvite, dismissInvite } = useOrg(userId, userEmail);

  // Surface read-path errors from the top-level hooks. Show once per error
  // transition (string identity in the ref guards against the effect retoasting
  // when other state in App.jsx changes). Toast carries a Retry action that
  // fires the hook's refetch — gives the user something to do besides reload.
  var lastErrorToastRef = useRef({});
  useEffect(function () {
    if (!session) return;
    function maybeToast(key, msg, refetch) {
      if (!msg) {
        if (lastErrorToastRef.current[key]) lastErrorToastRef.current[key] = null;
        return;
      }
      if (lastErrorToastRef.current[key] === msg) return;
      lastErrorToastRef.current[key] = msg;
      showToast("Couldn't load " + key + " — check your connection", "error", {
        action: { label: "Retry", run: refetch },
      });
    }
    maybeToast("accounts", acctError, refetchAccounts);
    maybeToast("meetings", meetError, refetchMeetings);
    maybeToast("cadences", cadenceError, refetchCadencesApp);
    maybeToast("tasks",    tasksError,   null);
    maybeToast("projects", projectsErrorApp, refetchProjectsApp);
  }, [session, acctError, meetError, cadenceError, tasksError, projectsErrorApp, refetchAccounts, refetchMeetings, refetchCadencesApp, refetchProjectsApp]);

  useEffect(function () {
    if (!session || welcomeShown.current) return;
    welcomeShown.current = true;
    var uid         = session.user.id;
    var onboarded   = localStorage.getItem("folio_onboarded_" + uid);
    var createdAt   = new Date(session.user.created_at);
    var featureDate = new Date("2026-05-22T00:00:00Z");
    var isNewUser   = createdAt >= featureDate;
    if (!onboarded && isNewUser) {
      setShowOnboarding(true);
    } else {
      if (!onboarded) localStorage.setItem("folio_onboarded_" + uid, "true");
      setShowReturning(true);
    }
  }, [session]);
  useEffect(function() {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette(function(p) { return !p; });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return function() { window.removeEventListener("keydown", handleKeyDown); };
  }, []);

  var { meetings, loading: meetLoading, error: meetError, refetch: refetchMeetings, addMeeting } = useMeetings(userId);
  var [allItems, setAllItems]       = useState([]);
  var [allContacts, setAllContacts] = useState([]);
  useEffect(function () {
    if (!userId) return;
    supabase.from("folio_items").select("*").eq("user_id", userId).then(function (r) {
      if (!r.error) setAllItems(r.data || []);
    });
    supabase.from("folio_contacts").select("*").eq("user_id", userId).then(function (r) {
      if (!r.error) setAllContacts(r.data || []);
    });
  }, [userId, accounts.length, meetings.length]);
  var { cadences, loading: cadenceLoading, addCadence, error: cadenceError, refetch: refetchCadencesApp } = useCadences(userId);
  useCadenceSync(userId, cadences, cadenceLoading);
  var { tasks, addTask, updateTask, deleteTask, error: tasksError } = useQuickTasks(userId);
  var { projects: allProjects, error: projectsErrorApp, refetch: refetchProjectsApp } = useProjects(userId);
  var { revenueHistory, shopMetrics, upsertRevenue, upsertShopMetrics } = useAccountMetrics(userId);

  // Top-level write helpers used by Pip's native tool calls.
  // These mirror the hook-level addItem/setFollowUp paths so RLS still applies
  // through the user's Supabase session.
  function pipAddItem(data) {
    return supabase
      .from("folio_items")
      .insert([Object.assign({}, data, { user_id: userId })])
      .select()
      .then(function (r) {
        if (r.error) throw r.error;
        if (data.account_id) {
          supabase.from("folio_accounts")
            .update({ last_interaction_at: new Date().toISOString() })
            .eq("id", data.account_id)
            .then(function () {});
        }
        setAllItems(function (prev) { return prev.concat(r.data || []); });
        return r.data && r.data[0];
      });
  }

  function pipSetFollowUp(accountId, followUpDate) {
    // Find the most-recent meeting on this account, then update its
    // follow_up_date column.
    return supabase
      .from("folio_meetings")
      .select("id")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .order("meeting_date", { ascending: false })
      .limit(1)
      .then(function (r) {
        if (r.error) throw r.error;
        if (!r.data || !r.data.length) throw new Error("no meeting to attach follow-up to");
        return supabase.from("folio_meetings")
          .update({ follow_up_date: followUpDate })
          .eq("id", r.data[0].id);
      })
      .then(function (r) {
        if (r && r.error) throw r.error;
      });
  }

  function handleSelectAccount(a) {
    setSelected(a);
  }

  function handleBack() {
    setSelected(null);
  }

  function handleSetView(v) {
    if (v === view) return;
    setPipTransition("out");
    setTimeout(function () {
      setView(v);
      setSelected(null);
      setPipTransition("in");
      setTimeout(function () { setPipTransition("idle"); }, 400);
    }, 200);
  }

  function handlePipAction(action, account) {
    if (action.type === "navigate") {
      handleSetView(action.view);
      return;
    }
    if (account) {
      setView("accounts");
      setSelected(account);
      if (action.type === "open_cadence") {
        setPipPrefill({ tab: "cadence", modal: "set_cadence", data: action.prefill || {} });
      } else if (action.type === "open_meeting") {
        setPipPrefill({ tab: "meetings", modal: "log_meeting" });
      } else if (action.type === "open_item") {
        setPipPrefill({ tab: "tasks", modal: "add_item" });
      } else if (action.type === "open_contact") {
        setPipPrefill({ tab: "contacts", modal: "add_contact" });
      }
    }
  }

  function handleAddAccount(data) {
    return addAccount(data).then(function (acct) {
      showToast("Account added");
      return acct;
    });
  }

  function handleEditAccount(data) {
    return updateAccount(editingAccount.id, data).then(function () {
      setEditingAccount(null);
      if (selectedAccount && selectedAccount.id === editingAccount.id) {
        setSelected(Object.assign({}, selectedAccount, data));
      }
      showToast("Account updated");
    });
  }

  function handleUpdateSelectedAccount(data) {
    if (!selectedAccount) return Promise.resolve();
    return updateAccount(selectedAccount.id, data).then(function () {
      setSelected(function (prev) { return Object.assign({}, prev, data); });
    });
  }

  // "Delete" on the account header now soft-archives. Hard delete is no
  // longer exposed in the UI — inactive accounts stay editable and can
  // be reactivated.
  function handleArchiveAccount() {
    if (!selectedAccount) return;
    archiveAccount(selectedAccount.id).then(function () {
      setSelected(function (prev) { return prev ? Object.assign({}, prev, { is_inactive: true, inactivated_at: new Date().toISOString() }) : prev; });
      showToast("Account archived");
    }).catch(function (e) { showToast(e.message || "Couldn't archive — check your connection", "error"); });
  }

  function handleReactivateAccount() {
    if (!selectedAccount) return;
    reactivateAccount(selectedAccount.id).then(function () {
      setSelected(function (prev) { return prev ? Object.assign({}, prev, { is_inactive: false, inactivated_at: null, merged_into_account_id: null }) : prev; });
      showToast("Account reactivated");
    }).catch(function (e) { showToast(e.message || "Couldn't reactivate — check your connection", "error"); });
  }

  function handleMergeAccounts(targetId) {
    if (!selectedAccount) return Promise.resolve();
    var sourceId   = selectedAccount.id;
    var sourceName = selectedAccount.name;
    var target = accounts.find(function (a) { return a.id === targetId; });
    return mergeAccounts(sourceId, targetId).then(function (moved) {
      showToast("Merged " + sourceName + (target ? " into " + target.name : "") + " — " + moved + " record" + (moved === 1 ? "" : "s") + " moved");
      if (target) setSelected(target);
    }).catch(function (e) { showToast(e.message || "Couldn't merge — check your connection", "error"); });
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <PipOrb size="lg" sonar />
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <Toast />
        {inactiveBlock && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 300,
            background: C.bgCard, borderBottom: "1px solid " + C.redLine,
            padding: "12px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, fontFamily: "'Inter', system-ui, sans-serif",
          }}>
            <div style={{ fontSize: 13, color: C.text }}>
              <span style={{ color: C.red, fontWeight: 700 }}>Account deactivated.</span>{" "}
              <span style={{ color: C.textSub }}>Your access has been turned off by an admin. Reach out to your team owner to restore it.</span>
            </div>
            <button
              onClick={dismissInactiveBlock}
              style={{
                background: "none", border: "1px solid " + C.border, borderRadius: 8,
                padding: "6px 12px", fontSize: 12, color: C.textSub, cursor: "pointer",
                fontFamily: "'Inter', system-ui, sans-serif", flexShrink: 0,
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        <AuthView
          onSignIn={signIn}
          onSignUp={signUp}
        />
      </>
    );
  }

  if (role === "leadership") {
    return (
      <>
        <Toast />
        <Suspense fallback={<PipLoader />}>
          <LeadershipView
            org={org}
            orgId={orgId}
            userId={userId}
            userMeta={userMeta}
            onSignOut={signOut}
          />
        </Suspense>
      </>
    );
  }

  /* ---------- Content panes ---------- */

  function workspaceTypeFor(v) {
    if (v === "departments") return "internal_team";
    if (v === "partners")    return "partner";
    return "customer";
  }

  function buildWorkspacePane(typeFilter) {
    return (
      <AccountsView
        accounts={accounts}
        loading={acctLoading}
        typeFilter={typeFilter}
        userId={userId}
        members={members}
        onSelect={handleSelectAccount}
        onAddAccount={function () {
          var t = typeFilter === "internal_team" ? "internal_team"
                : typeFilter === "partner"       ? "partner"
                : null;
          setAddAccountDefaultType(t);
          setShowAddAccount(true);
        }}
        tasks={tasks}
        addTask={addTask}
        updateTask={updateTask}
        deleteTask={deleteTask}
        hasMeetings={meetings.length > 0}
        hasCadences={cadences.length > 0}
        revenueHistory={revenueHistory}
        items={allItems}
        meetings={meetings}
        contacts={allContacts}
        onColdClick={function() { setBannerFilter("cold");    handleSetView("accounts"); }}
        onOverdueClick={function() { setBannerFilter("overdue"); handleSetView("accounts"); }}
        onFollowUpClick={function() { handleSetView("meetings"); }}
        bannerFilter={bannerFilter}
        onClearBannerFilter={function() { setBannerFilter(null); }}
        onLogMeeting={function(accountId, date, title) {
          return addMeeting({ account_id: accountId, meeting_date: date, title: title });
        }}
      />
    );
  }

  var currentWorkspaceType = workspaceTypeFor(view);
  var accountsListPane = buildWorkspacePane(currentWorkspaceType);

  var mainContent = null;

  var isWorkspaceView = view === "accounts" || view === "departments" || view === "partners";

  if (isWorkspaceView) {
    if (selectedAccount) {
      mainContent = (
        <div key={selectedAccount.id} className="view-fade-in">
          <AccountDetail
            account={selectedAccount}
            userId={userId}
            orgId={orgId}
            accounts={accounts}
            members={members}
            onBack={handleBack}
            onEdit={function () { setEditingAccount(selectedAccount); }}
            onDelete={handleArchiveAccount}
            onReactivate={handleReactivateAccount}
            onMerge={handleMergeAccounts}
            onUpdate={handleUpdateSelectedAccount}
            onSelectAccount={function (acct) { setSelected(acct); }}
            pipPrefill={pipPrefill}
            onPipPrefillHandled={function () { setPipPrefill(null); }}
            initialHubCadenceId={pendingHubCadenceId}
            onHubConsumed={function () { setPendingHubCadenceId(null); }}
            revenueHistory={revenueHistory}
            shopMetrics={shopMetrics}
            onAddAccount={addAccount}
          />
        </div>
      );
    } else if (!isDesktop) {
      mainContent = accountsListPane;
    } else {
      mainContent = (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            flexDirection: "column",
            gap: 12,
            color: C.textMuted,
          }}
        >
          <PipMark size={18} color={C.accentDim} glow />
          <div style={{ fontSize: 13 }}>Select an account</div>
        </div>
      );
    }
  }

  if (view === "meetings") {
    mainContent = <MeetingsView meetings={meetings} loading={meetLoading} allItems={allItems} addItem={pipAddItem} accounts={accounts} />;
  }

  if (view === "pipeline") {
    mainContent = <PipelineView accounts={accounts} loading={acctLoading} revenueHistory={revenueHistory} shopMetrics={shopMetrics} onUpsertRevenue={upsertRevenue} onUpsertShopMetrics={upsertShopMetrics} />;
  }

  if (view === "pip") {
    mainContent = <PipView
      accounts={accounts}
      meetings={meetings}
      items={allItems}
      contacts={allContacts}
      tasks={tasks}
      addTask={addTask}
      updateTask={updateTask}
      onAction={handlePipAction}
      revenueHistory={revenueHistory}
      shopMetrics={shopMetrics}
      cadences={cadences}
      projects={allProjects}
      userId={userId}
      addItem={pipAddItem}
      addMeeting={addMeeting}
      addCadence={addCadence}
      updateAccount={updateAccount}
      setFollowUp={pipSetFollowUp}
      onNavigate={handleSetView}
    />;
  }

  if (view === "gauge") {
    mainContent = (
      <GaugeView
        userId={userId}
        userEmail={session && session.user ? session.user.email : null}
        accounts={accounts}
        members={members}
        orgId={orgId}
      />
    );
  }

  if (view === "cadence") {
    mainContent = (
      <CadenceView
        cadences={cadences}
        cadencesError={cadenceError}
        onRetryCadences={refetchCadencesApp}
        accounts={accounts}
        addCadence={addCadence}
        onOpenHub={function (cadence) {
          var acct = accounts.find(function (a) { return a.id === cadence.account_id; });
          if (acct) {
            setSelected(acct);
            setPendingHubCadenceId(cadence.id);
            setView("accounts");
          }
        }}
        onSelectAccount={function (accountId) {
          var acct = accounts.find(function (a) { return a.id === accountId; });
          if (acct) {
            setSelected(acct);
            setView("accounts");
            setPipPrefill({ tab: "cadence" });
          }
        }}
        onCreateItem={function (cadence) {
          var today = new Date().toISOString().slice(0, 10);
          var acct = accounts.find(function (a) { return a.id === cadence.account_id; });
          supabase.from("folio_items")
            .insert([{ user_id: userId, account_id: cadence.account_id, text: cadence.task_title || "Cadence task", due_date: today }])
            .then(function (r) {
              if (r && r.error) { showToast(r.error.message || "Couldn't create task", "error"); return; }
              showToast("Task logged" + (acct ? " for " + acct.name : ""));
            })
            .catch(function (err) { showToast(err.message || "Couldn't create task", "error"); });
        }}
      />
    );
  }

  if (view === "routes") {
    mainContent = <RouteBuilder accounts={accounts} userId={userId} />;
  }

  if (view === "settings") {
    mainContent = (
      <SettingsView
        userId={userId}
        userEmail={userEmail}
        userMeta={userMeta}
        org={org}
        orgId={orgId}
        role={role}
        members={members}
        pendingInvites={pendingInvites}
        onCreateOrg={createOrg}
        onInvite={inviteMember}
        onRevoke={revokeMember}
        onArchiveMember={archiveMember}
        onReactivateMember={reactivateMember}
      />
    );
  }

  /* ---------- Render ---------- */

  var addAccountModal = (showAddAccount || editingAccount) && (
    <AddAccountModal
      userId={userId}
      existing={editingAccount || null}
      accounts={accounts}
      members={members}
      defaultType={editingAccount ? null : addAccountDefaultType}
      onSave={editingAccount ? handleEditAccount : handleAddAccount}
      onClose={function () { setShowAddAccount(false); setEditingAccount(null); setAddAccountDefaultType(null); }}
    />
  );

  var inviteBanner = myInvite && (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
      background: C.bgCard, borderBottom: "1px solid " + C.accentLine,
      padding: "12px 24px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12,
    }}>
      <div style={{ fontSize: 13, color: C.text }}>
        You've been invited to join <span style={{ color: C.accent, fontWeight: 600 }}>{myInvite.folio_orgs ? myInvite.folio_orgs.name : "a team"}</span> as{" "}
        <span style={{ color: C.textSub }}>{myInvite.role}</span>.
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={function () { acceptInvite(myInvite.id).then(function () { showToast("Joined the team!"); }).catch(function (e) { showToast(e.message || "Couldn't accept invite", "error"); }); }}
          style={{
            background: C.accent, border: "none", borderRadius: 8, padding: "6px 16px",
            fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer",
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          Accept
        </button>
        <button
          onClick={dismissInvite}
          style={{
            background: "none", border: "1px solid " + C.border, borderRadius: 8,
            padding: "6px 12px", fontSize: 12, color: C.textSub, cursor: "pointer",
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <>
        <Toast />
        {inviteBanner}
        <DesktopLayout
          view={view}
          setView={handleSetView}
          onAddAccount={function () {
            var t = view === "departments" ? "internal_team"
                  : view === "partners"    ? "partner"
                  : null;
            setAddAccountDefaultType(t);
            setShowAddAccount(true);
          }}
          onSignOut={signOut}
          onTour={replayTour}
          userMeta={userMeta}
          accountsPane={isWorkspaceView ? accountsListPane : null}
          detailPane={<Suspense fallback={<PipLoader />}>{mainContent}</Suspense>}
        />
        {addAccountModal}
        {/* Floating Pip (desktop) */}
        {view !== "pip" && (
          <div
            style={{
              position: "fixed",
              bottom: 28,
              right: 28,
              zIndex: 90,
            }}
          >
            <PipOrb
              size="lg"
              sonar
              className={pipTransition === "out" ? "pip-out" : pipTransition === "in" ? "pip-in" : ""}
              onClick={function () { handleSetView("pip"); }}
              style={{ cursor: "pointer" }}
            />
          </div>
        )}
        {showOnboarding && (
          <OnboardingTour onComplete={function () {
            localStorage.setItem("folio_onboarded_" + userId, "true");
            setShowOnboarding(false);
          }} />
        )}
        {!showOnboarding && showReturning && (
          <ReturningWelcome
            userId={userId}
            userName={userMeta ? userMeta.full_name : ""}
            accountCount={accounts.length}
            onDismiss={function () { setShowReturning(false); }}
          />
        )}
        {isDesktop && showPalette && (
          <CommandPalette
            accounts={accounts}
            contacts={allContacts}
            onSelectAccount={function(a) { setSelected(a); setView("accounts"); setShowPalette(false); }}
            onSelectContact={function(c) {
              var acct = accounts.find(function(a) { return a.id === c.account_id; });
              if (acct) { setSelected(acct); setView("accounts"); setPipPrefill({ tab: "contacts" }); }
              setShowPalette(false);
            }}
            onNavigate={function(v) { handleSetView(v); setShowPalette(false); }}
            onClose={function() { setShowPalette(false); }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <Toast />
      {inviteBanner}
      <MobileLayout
        view={view}
        setView={handleSetView}
        onAddAccount={function () {
          var t = view === "departments" ? "internal_team"
                : view === "partners"    ? "partner"
                : null;
          setAddAccountDefaultType(t);
          setShowAddAccount(true);
        }}
        onSignOut={signOut}
        onTour={replayTour}
        onSettings={function () { handleSetView("settings"); }}
        userMeta={userMeta}
      >
        <Suspense fallback={<PipLoader />}>{mainContent}</Suspense>
      </MobileLayout>
      {addAccountModal}
      {/* Floating Pip (mobile) */}
      {view !== "pip" && (
        <div
          style={{
            position: "fixed",
            bottom: 90,
            right: 20,
            zIndex: 90,
          }}
        >
          <PipOrb
            size="lg"
            sonar
            className={pipTransition === "out" ? "pip-out" : pipTransition === "in" ? "pip-in" : ""}
            onClick={function () { handleSetView("pip"); }}
            style={{ cursor: "pointer" }}
          />
        </div>
      )}
      {showOnboarding && (
        <OnboardingTour onComplete={function () {
          localStorage.setItem("folio_onboarded_" + userId, "true");
          setShowOnboarding(false);
        }} />
      )}
      {!showOnboarding && showReturning && (
        <ReturningWelcome
          userId={userId}
          userName={userMeta ? userMeta.full_name : ""}
          accountCount={accounts.length}
          onDismiss={function () { setShowReturning(false); }}
        />
      )}
    </>
  );
}
