import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { supabase } from "./lib/supabase";
import { touchAccount } from "./lib/touchAccount";
import { useAuth } from "./hooks/useAuth";
import { useBreakpoint } from "./hooks/useBreakpoint";
import { useAccounts } from "./hooks/useAccounts";
import { useMeetings } from "./hooks/useMeetings";
import { useCadences } from "./hooks/useCadences";
import { useCadenceSync } from "./hooks/useCadenceSync";
import { useCadenceReminders } from "./hooks/useCadenceReminders";
import { useQuickTasks } from "./hooks/useQuickTasks";
import { useProjects } from "./hooks/useProjects";
import { useOrg } from "./hooks/useOrg";
import { usePipAccountState } from "./hooks/usePipAccountState";
import { useUserProfile } from "./hooks/useUserProfile";
import { useCustomWorkspaces } from "./hooks/useCustomWorkspaces";
import { AuthView } from "./views/auth/AuthView";
import { AccountsView } from "./views/accounts/AccountsView";
import { AccountDetail } from "./views/accounts/AccountDetail";
import { AddAccountModal } from "./views/accounts/AddAccountModal";
import { StartConversationModal } from "./views/accounts/StartConversationModal";
import { AdHocConversationFlow } from "./views/accounts/AdHocConversationFlow";
import { OnboardingTour } from "./views/welcome/OnboardingTour";
import { PipLoader } from "./components/PipLoader";

// Code-split heavy views — only fetched when navigated to. Cuts initial
// bundle and speeds up first paint by ~30-40%.
var HomeView       = lazy(function () { return import("./views/home/HomeView").then(function (m) { return { default: m.HomeView }; }); });
var CalendarView   = lazy(function () { return import("./views/calendar/CalendarView").then(function (m) { return { default: m.CalendarView }; }); });
var PipView        = lazy(function () { return import("./views/pip/PipView").then(function (m) { return { default: m.PipView }; }); });
var CadenceView    = lazy(function () { return import("./views/cadence/CadenceView").then(function (m) { return { default: m.CadenceView }; }); });
var GaugeView      = lazy(function () { return import("./views/gauge/GaugeView").then(function (m) { return { default: m.GaugeView }; }); });
var SettingsView   = lazy(function () { return import("./views/settings/SettingsView").then(function (m) { return { default: m.SettingsView }; }); });
var TeamView       = lazy(function () { return import("./views/team/TeamView").then(function (m) { return { default: m.TeamView }; }); });
var LeadershipView = lazy(function () { return import("./views/leadership/LeadershipView").then(function (m) { return { default: m.LeadershipView }; }); });
var ObservabilityView = lazy(function () { return import("./views/observability/ObservabilityView").then(function (m) { return { default: m.ObservabilityView }; }); });
var CommitmentsView = lazy(function () { return import("./views/commitments/CommitmentsView").then(function (m) { return { default: m.CommitmentsView }; }); });
var ShareTargetView = lazy(function () { return import("./views/share/ShareTargetView").then(function (m) { return { default: m.ShareTargetView }; }); });
import { DesktopLayout } from "./layout/DesktopLayout";
import { MobileLayout } from "./layout/MobileLayout";
import { PipOrb, PipMark } from "./components/PipMark";
import { CommandPalette } from "./components/CommandPalette";
import { MeetingReminderBanner } from "./components/MeetingReminderBanner";
import { Toast, showToast } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useErrors } from "./hooks/useErrors";
import { usePipState } from "./lib/pipState";
import { compressCorrectionsPip } from "./lib/pip";
import { PipOnboardingView } from "./views/onboarding/PipOnboardingView";
import { computeAndSaveSnapshots } from "./lib/accountSnapshots";
import { detectKnowledgeGaps, purgeEvergreenQuestions } from "./lib/detectKnowledgeGaps.js";
import { usePipDripQuestions } from "./hooks/usePipDripQuestions.js";
import { usePipFacts as usePipFactsApp } from "./hooks/usePipFacts.js";
import { useCommitmentNudges } from "./hooks/useCommitmentNudges.js";
import { useRecentThemes } from "./hooks/useRecentThemes";
import { C } from "./lib/colors";
import { QuickTaskModal } from "./views/quicktasks/QuickTaskModal";

export default function App() {
  var { session, loading: authLoading, signIn, signUp, signOut, inactiveBlock, dismissInactiveBlock } = useAuth();
  var userId    = session ? session.user.id : null;
  var userEmail = session ? session.user.email : null;
  var userMeta  = session ? session.user.user_metadata : null;
  var isDesktop = useBreakpoint();

  var [view, setView]                   = useState("home");
  var [selectedAccount, setSelected]    = useState(null);
  var [pendingHubCadenceId, setPendingHubCadenceId] = useState(null);
  var [pendingPersonHubCadenceId, setPendingPersonHubCadenceId] = useState(null);
  var [pendingAutoOpenMeetingMode, setPendingAutoOpenMeetingMode] = useState(false);
  var [bannerFilter, setBannerFilter]   = useState(null); // 'cold' | 'overdue' | null
  var [showAddAccount, setShowAddAccount] = useState(false);
  var [addAccountDefaultType, setAddAccountDefaultType] = useState(null);
  var [editingAccount, setEditingAccount] = useState(null);
  var [pipPrefill, setPipPrefill]       = useState(null);
  var [showOnboarding, setShowOnboarding] = useState(false);
  var [pipTransition, setPipTransition] = useState("idle");
  var [showPalette, setShowPalette]     = useState(false);
  var [showStartConv, setShowStartConv] = useState(false);
  var [convPrefillDate, setConvPrefillDate] = useState(null); // ISO date string from calendar click
  var [adHocFlow, setAdHocFlow]         = useState(null); // { accountId, draftId }
  // Ref so handleSetView's setTimeout can pick up the intended account without
  // the setSelected(null) inside the delay wiping it out.
  var pendingNavAccountRef = useRef(null);
  var welcomeShown = useRef(false);
  var navTimerRef = useRef(null);

  function replayTour() {
    setShowOnboarding(true);
  }

  var { accounts, loading: acctLoading, error: acctError, refetch: refetchAccounts, addAccount, updateAccount, deleteAccount, archiveAccount, reactivateAccount, mergeAccounts } = useAccounts(userId);
  var { org, orgId, role, lens, members, pendingInvites, myInvite, createOrg, inviteMember, revokeMember, archiveMember, reactivateMember, acceptInvite, dismissInvite } = useOrg(userId, userEmail);
  var userProfileApi  = useUserProfile(userId);
  var userProfile     = userProfileApi.profile;
  var profileLoading  = userProfileApi.loading;

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
    } else if (!onboarded) {
      localStorage.setItem("folio_onboarded_" + uid, "true");
    }
    // ReturningWelcome was deprecated: the HomeView does the same job
    // (Pip greeting + day orientation) without an extra modal step.
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
  var [allUpdates, setAllUpdates]   = useState([]);
  function fetchAllItems() {
    if (!userId) return;
    supabase.from("folio_tasks").select("*").eq("user_id", userId).is("project_id", null).then(function (r) {
      if (r.error) { console.warn("[App] failed to load folio_tasks:", r.error && r.error.message); return; }
      setAllItems((r.data || []).map(function (row) { return Object.assign({}, row, { text: row.title, owner: row.assignee_email }); }));
    });
  }
  useEffect(function () {
    if (!userId) return;
    fetchAllItems();
    supabase.from("folio_contacts").select("*").eq("user_id", userId).then(function (r) {
      if (r.error) { console.warn("[App] failed to load folio_contacts:", r.error && r.error.message); return; }
      setAllContacts(r.data || []);
    });
    supabase.from("folio_account_updates").select("*").eq("user_id", userId).order("update_date", { ascending: false }).then(function (r) {
      if (r.error) { console.warn("[App] failed to load folio_account_updates:", r.error && r.error.message); return; }
      setAllUpdates(r.data || []);
    });

    // Realtime subscription so allItems stays fresh when Pip applies a plan
    // and creates/updates tasks without a full page reload.
    var debounceRef = null;
    var channel = supabase
      .channel("app-all-items-" + userId)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "folio_tasks",
        filter: "user_id=eq." + userId,
      }, function () {
        if (debounceRef) clearTimeout(debounceRef);
        debounceRef = setTimeout(function () { fetchAllItems(); }, 500);
      })
      .subscribe();

    return function cleanup() {
      if (debounceRef) clearTimeout(debounceRef);
      try { supabase.removeChannel(channel); } catch (e) { /* swallow */ }
    };
  }, [userId]);
  var { cadences, loading: cadenceLoading, addCadence, error: cadenceError, refetch: refetchCadencesApp } = useCadences(userId);
  useCadenceSync(userId, cadences, cadenceLoading);
  var reminderApi = useCadenceReminders(userId, cadences, accounts);

  // Discreet one-time permission prompt — surfaces the first time a cadence
  // with a meeting_time exists, the user hasn't been asked yet, and the
  // browser supports Notifications. Persist "asked" so the prompt never
  // re-appears regardless of grant/deny outcome.
  var [showNotifPrompt, setShowNotifPrompt] = useState(false);
  // Global Quick Task modal — triggered from HomeView "Quick capture +" popover
  var [showGlobalQuickTask, setShowGlobalQuickTask] = useState(false);
  // Pip onboarding interview
  var [showInterview, setShowInterview]                     = useState(false);
  var [dismissedOnboardingCard, setDismissedOnboardingCard] = useState(function () {
    try { return localStorage.getItem("folio_onboarding_dismissed") === "1"; } catch (e) { return false; }
  });
  // Persists the user's last-selected workspace pill (customer/internal_team/partner)
  // so the Accounts page reopens to whichever they were just viewing.
  var [pillWorkspaceType, setPillWorkspaceType] = useState(function () {
    try { return localStorage.getItem("folio_account_workspace") || "customer"; } catch (e) { return "customer"; }
  });
  useEffect(function () {
    try { localStorage.setItem("folio_account_workspace", pillWorkspaceType); } catch (e) {}
  }, [pillWorkspaceType]);
  useEffect(function () {
    if (!session || !cadences || cadences.length === 0) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    var prompted = false;
    try { prompted = localStorage.getItem("folio_meeting_notif_prompted") === "1"; } catch (e) {}
    if (prompted) return;
    var hasTimedCadence = cadences.some(function (c) { return c && c.meeting_time; });
    if (hasTimedCadence) setShowNotifPrompt(true);
  }, [session, cadences]);

  function handleOpenReminder(reminder) {
    var acct = (accounts || []).find(function (a) { return a.id === reminder.accountId; });
    if (!acct) return;
    setSelected(acct);
    setPendingHubCadenceId(reminder.cadenceId);
    setPendingAutoOpenMeetingMode(reminder.threshold === "start");
    setView("accounts");
    reminderApi.dismissReminder(reminder.id);
  }
  var { tasks, addTask, updateTask, deleteTask, error: tasksError } = useQuickTasks(userId);
  var { projects: allProjects, error: projectsErrorApp, refetch: refetchProjectsApp, addProject: addProjectApp } = useProjects(userId);
  var pipAcctStateApp = usePipAccountState(userId);
  var { workspaces: customWorkspaces, addWorkspace: addCustomWorkspace, deleteWorkspace: deleteCustomWorkspace } = useCustomWorkspaces(userId);

  // Part 9 — periodic background pip_account_state refresh.
  // Once per 6h, silently refresh the top 10 accounts by last_interaction_at.
  // No UI, no toasts. Swallows all failures. Keeps Pip's per-account memory
  // stale-by-at-most-6h so V2 brain reads current baselines.
  useEffect(function () {
    if (!userId || !accounts || accounts.length === 0) return;
    var key = 'folio_pip_state_refresh_last_' + userId;
    var last = 0;
    try { last = parseInt(localStorage.getItem(key) || '0', 10); } catch (e) {}
    if (Date.now() - last < 6 * 60 * 60 * 1000) return; // throttle: once per 6h
    var recent = accounts
      .filter(function (a) { return !a.is_inactive && a.last_interaction_at; })
      .sort(function (a, b) { return new Date(b.last_interaction_at) - new Date(a.last_interaction_at); })
      .slice(0, 10);
    recent.forEach(function (a, i) {
      setTimeout(function () { pipAcctStateApp.refreshState(a.id).catch(function () {}); }, i * 1200);
    });
    try { localStorage.setItem(key, String(Date.now())); } catch (e) {}
  }, [userId, accounts]);

  // V2 brain — compression pass. Once per 6h, check each account for 5+
  // unprocessed corrections. For qualifying accounts, distill them into
  // lessons_learned on pip_account_state. Move processed rows to the archive.
  // Fire-and-forget; never blocks the UI.
  var compressionInFlightRef = useRef(new Set());
  useEffect(function () {
    if (!userId || !accounts || accounts.length === 0) return;
    var key = 'folio_pip_compression_last_' + userId;
    var last = 0;
    try { last = parseInt(localStorage.getItem(key) || '0', 10); } catch (e) {}
    if (Date.now() - last < 6 * 60 * 60 * 1000) return;

    var activeAccounts = accounts.filter(function (a) { return !a.is_inactive; });
    if (!activeAccounts.length) return;

    try { localStorage.setItem(key, String(Date.now())); } catch (e) {}

    supabase
      .from("pip_correction_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(function (result) {
        if (result.error || !result.data) return;
        var allRows = result.data;

        var rowsByAccount = {};
        allRows.forEach(function (row) {
          if (!row.account_id) return;
          if (!rowsByAccount[row.account_id]) rowsByAccount[row.account_id] = [];
          rowsByAccount[row.account_id].push(row);
        });

        activeAccounts.forEach(function (acct) {
          var rows = rowsByAccount[acct.id];
          if (!rows || rows.length < 5) return;
          if (compressionInFlightRef.current.has(acct.id)) return;

          var stateRow = pipAcctStateApp.states.find(function (s) { return s.account_id === acct.id; });
          var lastCompAt = stateRow && stateRow.last_compression_at
            ? new Date(stateRow.last_compression_at).getTime()
            : 0;
          var unprocessed = rows.filter(function (r) {
            return new Date(r.created_at).getTime() > lastCompAt;
          });
          if (unprocessed.length < 5) return;

          compressionInFlightRef.current.add(acct.id);
          var existingLessons = stateRow && stateRow.lessons_learned ? stateRow.lessons_learned : "";
          var userName = userEmail || "";
          var accountName = acct.name || "";

          compressCorrectionsPip({ corrections: unprocessed, accountName: accountName, userName: userName, existingLessons: existingLessons })
            .then(function (paragraph) {
              compressionInFlightRef.current.delete(acct.id);
              if (!paragraph) return;

              var now = new Date().toISOString();
              supabase
                .from("folio_pip_account_state")
                .upsert([{
                  account_id:          acct.id,
                  user_id:             userId,
                  state_prose:         (stateRow && stateRow.state_prose) || "",
                  lessons_learned:     paragraph,
                  last_compression_at: now,
                }], { onConflict: "account_id" })
                .then(function () {
                  pipAcctStateApp.refetch();
                  var archiveRows = unprocessed.map(function (r) {
                    return Object.assign({}, r);
                  });
                  return supabase.from("pip_correction_log_archive").insert(archiveRows)
                    .then(function (archiveResult) {
                      if (archiveResult.error) return;
                      var ids = unprocessed.map(function (r) { return r.id; });
                      supabase.from("pip_correction_log").delete().in("id", ids).then(function () {});
                    });
                })
                .catch(function (err) { console.warn("[pip-compress] upsert failed:", err && err.message); });
            })
            .catch(function (err) {
              compressionInFlightRef.current.delete(acct.id);
              console.warn("[pip-compress] failed for", acct.id, err && err.message);
            });
        });
      })
      .catch(function (err) { console.warn("[pip-compress] fetch failed:", err && err.message); });
  }, [userId, accounts]);

  // Observability — gate the Diagnostics nav entry on unresolved errors in
  // the last 7 days. Hook fails soft if the phase6 SQL hasn't been run yet
  // (returns unresolvedRecent=0, so the nav stays hidden).
  var { unresolvedRecent: diagnosticsCount } = useErrors(userId, { limit: 50 });

  // Ambient Pip mood — turn the orb red when there's an unresolved error.
  var pipStateCtx = usePipState();
  useEffect(function () { pipStateCtx.setAlert(diagnosticsCount > 0); }, [diagnosticsCount, pipStateCtx]);

  // Pip Tier A — daily snapshot compute. Fire-and-forget once per day after
  // auth resolves. No-ops if already computed today (localStorage gate).
  useEffect(function () {
    if (userId) computeAndSaveSnapshots(userId);
  }, [userId]);

  // Top-level write helpers used by Pip's native tool calls.
  // These mirror the hook-level addItem/setFollowUp paths so RLS still applies
  // through the user's Supabase session.
  function pipAddItem(data) {
    // Map consumer-facing field names (text, owner) to folio_tasks column names.
    var payload = Object.assign({}, data, { user_id: userId });
    if ("text"  in payload) { payload.title          = payload.text;  delete payload.text;  }
    if ("owner" in payload) { payload.assignee_email = payload.owner; delete payload.owner; }
    return supabase
      .from("folio_tasks")
      .insert([payload])
      .select()
      .then(function (r) {
        if (r.error) throw r.error;
        if (data.account_id) {
          touchAccount(data.account_id);
        }
        // Map returned rows back to consumer shape before appending to allItems.
        var mapped = (r.data || []).map(function (row) { return Object.assign({}, row, { text: row.title, owner: row.assignee_email }); });
        setAllItems(function (prev) { return prev.concat(mapped); });
        return mapped[0];
      });
  }

  function closeItem(id) {
    var closedAt = new Date().toISOString();
    return supabase
      .from("folio_tasks")
      .update({ done: true, status: "complete", closed_at: closedAt })
      .eq("id", id)
      .eq("user_id", userId)
      .then(function (result) {
        if (result.error) throw result.error;
        setAllItems(function (prev) { return prev.filter(function (item) { return item.id !== id; }); });
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
    // Cancel any pending nav timer so rapid nav events don't drop the last click.
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    setPipTransition("out");
    navTimerRef.current = setTimeout(function () {
      navTimerRef.current = null;
      setView(v);
      if (pendingNavAccountRef.current) {
        setSelected(pendingNavAccountRef.current);
        pendingNavAccountRef.current = null;
      } else {
        setSelected(null);
      }
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

  // Pip drip questions (Phase 2) — global facts hook for writing terminology answers.
  var pipFactsAppApi = usePipFactsApp(userId);

  // Drip question hook — loads gap_observed questions, applies throttle, exposes active question.
  var dripHook = usePipDripQuestions(
    userId,
    userProfile,
    function onTermLearned(term, definition) {
      if (!term || !definition) return;
      pipFactsAppApi.addFact({ fact: term + " — " + definition, source: "pip_inferred" }).catch(function () {});
    }
  );

  // Daily detectKnowledgeGaps — once per calendar day, pure JS, zero LLM cost.
  useEffect(function () {
    if (!userId || !accounts || !allContacts) return;
    var key = "folio_detect_gaps_last_" + userId;
    var last = 0;
    try { last = parseInt(localStorage.getItem(key) || "0", 10); } catch (e) {}
    var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    if (last >= todayStart.getTime()) return; // already ran today
    try { localStorage.setItem(key, String(Date.now())); } catch (e) {}
    detectKnowledgeGaps({ userId: userId, supabase: supabase, accounts: accounts, meetings: meetings || [], contacts: allContacts, profile: userProfile })
      .then(function () { return purgeEvergreenQuestions({ userId: userId, supabase: supabase }); })
      .catch(function (err) { console.warn("[detectKnowledgeGaps] failed:", err && err.message); });
  }, [userId, accounts && accounts.length, allContacts && allContacts.length]);

  // Daily terminology scan — one lightweight Haiku call, fire-and-forget.
  // Runs daily (was weekly) so Pip keeps a steady stream of "what's this term
  // you keep using?" questions flowing. Skip if user has paused drip questions.
  useEffect(function () {
    if (!userId || !session) return;
    if (userProfile && userProfile.pip_questions_paused) return;
    var key = "folio_terminology_scan_last_" + userId;
    var last = 0;
    try { last = parseInt(localStorage.getItem(key) || "0", 10); } catch (e) {}
    if (Date.now() - last < 24 * 60 * 60 * 1000) return; // once per day
    try { localStorage.setItem(key, String(Date.now())); } catch (e) {}
    fetch("/api/detect-terminology", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": "Bearer " + session.access_token,
      },
      body: JSON.stringify({}),
    }).catch(function (err) { console.warn("[detect-terminology] failed:", err && err.message); });
  }, [userId]);

  // Weekly portfolio-aware question generator (Lane D) — one cheap Haiku pass
  // that reasons across the whole portfolio and writes a few insightful
  // questions in Pip's voice + simple term clarifiers. The endpoint self-skips
  // (no Haiku call) when a queue backlog already exists, so token cost stays
  // near zero. Skip entirely if the user paused drip questions.
  useEffect(function () {
    if (!userId || !session) return;
    if (userProfile && userProfile.pip_questions_paused) return;
    var key = "folio_generate_questions_last_" + userId;
    var last = 0;
    try { last = parseInt(localStorage.getItem(key) || "0", 10); } catch (e) {}
    if (Date.now() - last < 7 * 24 * 60 * 60 * 1000) return; // once per 7 days
    try { localStorage.setItem(key, String(Date.now())); } catch (e) {}
    fetch("/api/generate-questions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": "Bearer " + session.access_token,
      },
      body: JSON.stringify({}),
    }).catch(function (err) { console.warn("[generate-questions] failed:", err && err.message); });
  }, [userId]);

  // Re-synthesis trigger — when drip hook reports >= 3 new answers since last synthesis.
  useEffect(function () {
    if (!userId || !session) return;
    if (dripHook.answeredSinceSynthesis < 3) return;
    var key = "folio_resynth_last_" + userId;
    var last = 0;
    try { last = parseInt(localStorage.getItem(key) || "0", 10); } catch (e) {}
    if (Date.now() - last < 24 * 60 * 60 * 1000) return; // once per 24h
    try { localStorage.setItem(key, String(Date.now())); } catch (e) {}

    // Gather all answered Q&A pairs (bank + drip) for synthesis.
    Promise.all([
      supabase.from("folio_pip_questions").select("question_text, answer_text, category, source").eq("user_id", userId).eq("status", "answered"),
    ]).then(function (results) {
      var allAnswered = results[0].data || [];
      var pairs = allAnswered
        // Terminology answers ("Fuse5 — John's IMS") are glossary facts, not
        // facts about who the user is — they already ride onTermLearned into
        // folio_pip_facts. Keep them out of the personal profile narrative.
        .filter(function (r) { return r.answer_text && r.category !== "terminology"; })
        .map(function (r) { return { question: r.question_text, answer: r.answer_text }; });
      if (!pairs.length) return;
      return fetch("/api/profile-synthesis", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": "Bearer " + session.access_token,
        },
        body: JSON.stringify({ pairs: pairs }),
      }).then(function (r) { return r.json(); }).then(function (parsed) {
        if (!parsed || parsed.error) return;
        var update = Object.assign({}, parsed, { prose_generated_at: new Date().toISOString() });
        userProfileApi.upsertProfile(update).catch(function () {});
      });
    }).catch(function (err) { console.warn("[resynth] failed:", err && err.message); });
  }, [userId, dripHook.answeredSinceSynthesis]);

  var commitmentNudgesHook = useCommitmentNudges(userId, accounts);
  var recentThemes         = useRecentThemes(userId);

  // Share Target — detect when the app is launched via the PWA Web Share Target.
  // GET params title/text/url are set by the OS share sheet. Initialized once from
  // the URL so it doesn't reset on re-renders. Cleared when user navigates away.
  var [isShareTarget, setIsShareTarget] = useState(function () {
    try {
      var p = new URLSearchParams(window.location.search);
      return !!(p.get("title") || p.get("text") || p.get("url"));
    } catch (e) { return false; }
  });

  // ──── ALL HOOKS MUST BE ABOVE THIS LINE — see React Hook Order Rule in CLAUDE.md ────
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

  // Derive onboarding routing state (post-auth, post-session guards)
  var activeAccounts  = (accounts || []).filter(function (a) { return !a.is_inactive; });
  var hasNoAccounts   = activeAccounts.length === 0;
  // profilePending is true when the profile row signals an incomplete interview,
  // OR when no row exists yet (new users who have never started). Guard with
  // !profileLoading so we don't flash the interview during the initial fetch.
  var profilePending  = (!profileLoading && userProfile === null) ||
    (userProfile && (userProfile.onboarding_status === "pending" || userProfile.onboarding_status === "in_progress"));
  var isNewUserInterview = showInterview || (
    !dismissedOnboardingCard && profilePending && hasNoAccounts
  );
  var showOnboardingCard = !dismissedOnboardingCard && !isNewUserInterview && profilePending && !hasNoAccounts;

  // Show the full-page interview screen for new users (no accounts yet)
  if (isNewUserInterview && userId) {
    return (
      <>
        <Toast />
        <PipOnboardingView
          userId={userId}
          profileApi={userProfileApi}
          accessToken={session ? session.access_token : null}
          onDone={function () { setShowInterview(false); }}
          onSkip={function () {
            setShowInterview(false);
            setDismissedOnboardingCard(true);
            try { localStorage.setItem("folio_onboarding_dismissed", "1"); } catch (e) {}
          }}
        />
      </>
    );
  }

  // Share Target — when launched via the OS share sheet, show a full-page
  // tray so the user can pick an account and open it in a meeting note.
  if (isShareTarget && userId) {
    return (
      <>
        <Toast />
        <ErrorBoundary label="share-target">
          <Suspense fallback={<PipLoader />}>
            <ShareTargetView
              userId={userId}
              onOpenConversation={function (opts) {
                // Strip the share params from the URL so a refresh doesn't
                // re-trigger the share target flow.
                try {
                  window.history.replaceState({}, "", window.location.pathname);
                } catch (e) {}
                setIsShareTarget(false);
                // Launch the ad-hoc conversation flow pre-filled with the shared text.
                // We need a draft meeting first — use addMeeting then open the overlay.
                var method = "in_person";
                var today  = new Date().toISOString().slice(0, 10);
                addMeeting({
                  account_id:   opts.accountId,
                  meeting_date: today,
                  method:       method,
                  notes:        opts.prefillNotes || "",
                  status:       "draft",
                }).then(function (m) {
                  if (m && m.id) {
                    setAdHocFlow({ accountId: opts.accountId, draftId: m.id });
                  }
                }).catch(function () {});
                // Navigate to accounts view so the overlay has the right backdrop.
                var acct = (accounts || []).find(function (a) { return a.id === opts.accountId; });
                if (acct) {
                  setSelected(acct);
                  var target = acct.account_type === "internal_team" ? "departments"
                             : acct.account_type === "partner" ? "partners"
                             : "accounts";
                  setView(target);
                }
              }}
              onBack={function () {
                try { window.history.replaceState({}, "", window.location.pathname); } catch (e) {}
                setIsShareTarget(false);
              }}
            />
          </Suspense>
        </ErrorBoundary>
      </>
    );
  }

  if (role === "leadership") {
    return (
      <>
        <Toast />
        <ErrorBoundary label="leadership-view">
          <Suspense fallback={<PipLoader />}>
            <LeadershipView
              org={org}
              orgId={orgId}
              userId={userId}
              userMeta={userMeta}
              onSignOut={signOut}
            />
          </Suspense>
        </ErrorBoundary>
      </>
    );
  }

  /* ---------- Content panes ---------- */

  // Workspace type pill state — persisted across sessions.
  // When the pill is used in AccountsView, it calls onTypeFilterChange.
  // Desktop nav still works: clicking "Departments" or "Partners" sets view,
  // which sets currentWorkspaceType. The pill just adds in-view switching.
  function workspaceTypeFor(v) {
    if (v === "departments") return "internal_team";
    if (v === "partners")    return "partner";
    return pillWorkspaceType || "customer";
  }

  function buildWorkspacePane(typeFilter) {
    return (
      <AccountsView
        accounts={accounts}
        allAccounts={accounts}
        loading={acctLoading}
        typeFilter={typeFilter}
        onTypeFilterChange={function (t) {
          setPillWorkspaceType(t);
          // Also update the nav view so the nav item highlights correctly.
          if (t === "internal_team") handleSetView("departments");
          else if (t === "partner")  handleSetView("partners");
          else if (t && t.startsWith("cws_")) handleSetView("accounts");
          else                       handleSetView("accounts");
        }}
        customWorkspaces={customWorkspaces}
        addCustomWorkspace={addCustomWorkspace}
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
        items={allItems}
        meetings={meetings}
        contacts={allContacts}
        onColdClick={function() { setBannerFilter("cold");    handleSetView("accounts"); }}
        onOverdueClick={function() { setBannerFilter("overdue"); handleSetView("accounts"); }}
        onFollowUpClick={function() { handleSetView("meetings"); }}
        bannerFilter={bannerFilter}
        onClearBannerFilter={function() { setBannerFilter(null); }}
        onOpenConversation={function () { setShowStartConv(true); }}
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
            userEmail={userEmail}
            isDesktop={isDesktop}
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
            initialPersonHubCadenceId={pendingPersonHubCadenceId}
            onPersonHubConsumed={function () { setPendingPersonHubCadenceId(null); }}
            autoOpenMeetingMode={pendingAutoOpenMeetingMode}
            onAutoOpenMeetingModeConsumed={function () { setPendingAutoOpenMeetingMode(false); }}
            onAddAccount={addAccount}
            allProjects={allProjects}
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

  if (view === "home") {
    mainContent = (
      <HomeView
        userName={(userMeta && userMeta.full_name) ? String(userMeta.full_name).split(" ")[0] : ""}
        userId={userId}
        accounts={accounts}
        meetings={meetings}
        items={allItems}
        cadences={cadences}
        projects={allProjects}
        onOpenAccount={function (accountId) {
          var a = (accounts || []).find(function (x) { return x.id === accountId; });
          if (a) {
            setSelected(a);
            var target = a.account_type === "internal_team" ? "departments" : a.account_type === "partner" ? "partners" : "accounts";
            setView(target);
          }
        }}
        onOpenAccountTab={function (accountId, tab) {
          var a = (accounts || []).find(function (x) { return x.id === accountId; });
          if (a) {
            setSelected(a);
            setPipPrefill({ tab: tab });
            var target = a.account_type === "internal_team" ? "departments" : a.account_type === "partner" ? "partners" : "accounts";
            setView(target);
          }
        }}
        onOpenCadenceHub={function (accountId, cadenceId) {
          var a = (accounts || []).find(function (x) { return x.id === accountId; });
          if (a) {
            setSelected(a);
            setPendingHubCadenceId(cadenceId);
            var target = a.account_type === "internal_team" ? "departments" : a.account_type === "partner" ? "partners" : "accounts";
            setView(target);
          }
        }}
        onOpenConversation={function () { setShowStartConv(true); }}
        onOpenQuickTask={function () { setShowGlobalQuickTask(true); }}
        showOnboardingCard={showOnboardingCard}
        onStartInterview={function () { setShowInterview(true); }}
        onDismissOnboardingCard={function () {
          setDismissedOnboardingCard(true);
          try { localStorage.setItem("folio_onboarding_dismissed", "1"); } catch (e) {}
        }}
        dripQuestion={dripHook.activeQuestion}
        onAnswerDrip={dripHook.answerQuestion}
        onSkipDrip={dripHook.skipQuestion}
        onDismissDrip={dripHook.dismissQuestion}
        commitmentNudges={commitmentNudgesHook.nudges}
        onSnoozeNudge={commitmentNudgesHook.snooze}
        onMarkNudgeDone={commitmentNudgesHook.markDone}
        contacts={allContacts}
        themes={recentThemes}
      />
    );
  }

  if (view === "meetings") {
    mainContent = (
      <CalendarView
        meetings={meetings}
        cadences={cadences}
        items={allItems}
        projects={allProjects}
        quickTasks={tasks}
        accounts={accounts}
        onOpenAccount={function (accountId) {
          var a = (accounts || []).find(function (x) { return x.id === accountId; });
          if (a) { setSelected(a); handleSetView("accounts"); }
        }}
        onOpenCadenceHub={function (accountId, cadenceId) {
          var a = (accounts || []).find(function (x) { return x.id === accountId; });
          if (a) {
            setSelected(a);
            setPendingHubCadenceId(cadenceId);
            handleSetView("accounts");
          }
        }}
        onOpenConversation={function (opts) { setConvPrefillDate((opts && opts.prefillDate) || null); setShowStartConv(true); }}
      />
    );
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
      cadences={cadences}
      projects={allProjects}
      updates={allUpdates}
      userId={userId}
      addItem={pipAddItem}
      addMeeting={addMeeting}
      addCadence={addCadence}
      updateAccount={updateAccount}
      setFollowUp={pipSetFollowUp}
      onNavigate={handleSetView}
      lens={lens}
    />;
  }

  if (view === "gauge") {
    mainContent = (
      <GaugeView
        userId={userId}
        userEmail={session && session.user ? session.user.email : null}
        accounts={accounts}
        members={members}
        contacts={allContacts}
        orgId={orgId}
        lens={lens}
      />
    );
  }

  if (view === "commitments") {
    mainContent = (
      <ErrorBoundary key="commitments" label="commitments" inline>
        <Suspense fallback={<PipLoader />}>
          <CommitmentsView
            items={allItems}
            accounts={accounts}
            onOpenAccount={function (acct) { setSelected(acct); setView("accounts"); }}
            onMarkDone={closeItem}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (view === "cadence") {
    mainContent = (
      <CadenceView
        cadences={cadences}
        cadencesError={cadenceError}
        onRetryCadences={refetchCadencesApp}
        accounts={accounts}
        contacts={allContacts}
        addCadence={addCadence}
        onOpenHub={function (cadence) {
          if (cadence.cadence_scope === 'person' || !cadence.account_id) {
            // Person 1:1 cadence — find the contact's parent account and navigate there
            var contactId = cadence.contact_id;
            var contact = (allContacts || []).find(function (c) { return c.id === contactId; });
            var acctForContact = contact && contact.account_id
              ? accounts.find(function (a) { return a.id === contact.account_id; })
              : null;
            if (acctForContact) {
              setSelected(acctForContact);
              setPendingPersonHubCadenceId(cadence.id);
              setView("accounts");
            } else {
              showToast("Couldn't open this 1:1 — the linked account wasn't found.", "warn");
            }
            return;
          }
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
          supabase.from("folio_tasks")
            .insert([{ user_id: userId, account_id: cadence.account_id, title: cadence.task_title || "Cadence task", due_date: today }])
            .then(function (r) {
              if (r && r.error) { showToast(r.error.message || "Couldn't create task", "error"); return; }
              showToast("Task logged" + (acct ? " for " + acct.name : ""));
            })
            .catch(function (err) { showToast(err.message || "Couldn't create task", "error"); });
        }}
      />
    );
  }


  if (view === "diagnostics") {
    mainContent = <ObservabilityView userId={userId} />;
  }

  if (view === "settings") {
    mainContent = (
      <SettingsView
        userId={userId}
        userMeta={userMeta}
        orgId={orgId}
        role={role}
        members={members}
        accounts={accounts}
      />
    );
  }

  if (view === "team") {
    mainContent = (
      <TeamView
        org={org}
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
      customWorkspaces={customWorkspaces}
      defaultType={editingAccount ? null : addAccountDefaultType}
      onSave={editingAccount ? handleEditAccount : handleAddAccount}
      onAddContacts={function (accountId, contacts) {
        return Promise.all(contacts.map(function (c) {
          return supabase
            .from("folio_contacts")
            .insert([{ user_id: userId, account_id: accountId, name: c.name.trim(), nickname: c.nickname || null, title: c.role || null, email: c.email || null, is_leader: !!c.is_leader, is_poc: !!c.is_poc }]);
        }));
      }}
      onClose={function () { setShowAddAccount(false); setEditingAccount(null); setAddAccountDefaultType(null); }}
    />
  );

  // Global Quick Task modal — fired from HomeView "Quick capture +" popover
  var globalQuickTaskModal = showGlobalQuickTask && (
    <QuickTaskModal
      accounts={accounts}
      onSave={addTask}
      onClose={function () { setShowGlobalQuickTask(false); }}
    />
  );

  // Global Log Conversation flow — fired by the "+ Conversation" pill in the
  // workspace quick-action bar. The modal collects account/method/date, drops
  // a draft meeting, then mounts AdHocConversationFlow to host the full-screen
  // notepad + Pip summarize-with-preview. Self-contained so it survives view
  // changes underneath.
  var startConvModal = showStartConv && (
    <StartConversationModal
      accounts={accounts}
      userId={userId}
      orgId={orgId}
      members={members}
      defaultDate={convPrefillDate}
      onStart={function (data) {
        return addMeeting(data).then(function (m) {
          if (data.status === "summarized") {
            // Quick log path — modal handles its own close + toast after
            // any action items get created via onAddItems.
            touchAccount(data.account_id);
          } else {
            // Real-time conversation → open the meeting overlay and close
            // the modal here so we get a clean handoff.
            setShowStartConv(false);
            setConvPrefillDate(null);
            setAdHocFlow({ accountId: data.account_id, draftId: m.id });
          }
          return m;
        });
      }}
      onAddItems={function (accountId, items) {
        var creations = (items || []).map(function (it) {
          return pipAddItem(Object.assign({ account_id: accountId }, {
            text:       it.text,
            due_date:   it.due_date || null,
            owner:      it.owner || null,
            project_id: it.project_id || null,
          }));
        });
        return Promise.all(creations);
      }}
      allGaugeProjects={allProjects}
      onCreateProject={addProjectApp ? function (accountId, data) {
        return addProjectApp(Object.assign({}, data, {
          account_id: accountId,
          status: "in_progress",
        }));
      } : null}
      onClose={function () { setShowStartConv(false); setConvPrefillDate(null); }}
    />
  );

  var adHocFlowOverlay = adHocFlow && (function () {
    var acct = (accounts || []).find(function (a) { return a.id === adHocFlow.accountId; });
    if (!acct) return null;
    return (
      <AdHocConversationFlow
        draftId={adHocFlow.draftId}
        account={acct}
        accounts={accounts}
        members={members}
        userId={userId}
        userEmail={userEmail}
        orgId={orgId}
        onClose={function () { setAdHocFlow(null); }}
        pipAccountStateRow={pipAcctStateApp.getStateRow(acct.id) || null}
      />
    );
  })();

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

  var reminderBanner = (
    <MeetingReminderBanner
      reminders={reminderApi.reminders}
      onDismiss={reminderApi.dismissReminder}
      onOpen={handleOpenReminder}
    />
  );

  function handleAllowNotifs() {
    reminderApi.requestPermission().finally(function () {
      setShowNotifPrompt(false);
    });
  }
  function handleDismissNotifPrompt() {
    try { localStorage.setItem("folio_meeting_notif_prompted", "1"); } catch (e) {}
    setShowNotifPrompt(false);
  }

  var notifPrompt = showNotifPrompt && (
    <div style={{
      position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
      zIndex: 170,
      background: C.bgCard, border: "1px solid " + C.accentBorder,
      borderRadius: 12, padding: "12px 16px",
      display: "flex", alignItems: "center", gap: 12,
      fontFamily: "'Inter', system-ui, sans-serif",
      boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
      maxWidth: "min(560px, calc(100vw - 32px))",
    }}>
      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>
        Want Pip to ping you before cadence meetings?
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={handleAllowNotifs} style={{
          background: C.accent, border: "none", borderRadius: 8, padding: "6px 12px",
          fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}>Yes</button>
        <button onClick={handleDismissNotifPrompt} style={{
          background: "none", border: "1px solid " + C.border, borderRadius: 8,
          padding: "6px 12px", fontSize: 12, color: C.textSub, cursor: "pointer",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}>Not now</button>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <>
        <Toast />
        {reminderBanner}
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
          detailPane={
            <ErrorBoundary key={"view-" + view} label={"view:" + view} inline>
              <Suspense fallback={<PipLoader />}>{mainContent}</Suspense>
            </ErrorBoundary>
          }
          diagnosticsCount={diagnosticsCount}
        />
        {addAccountModal}
        {startConvModal}
        {adHocFlowOverlay}
        {globalQuickTaskModal}
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
        {notifPrompt}
        {isDesktop && showPalette && (
          <CommandPalette
            accounts={accounts}
            contacts={allContacts}
            userId={userId}
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
      {reminderBanner}
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
        onTeam={function () { handleSetView("team"); }}
        onDiagnostics={diagnosticsCount > 0 ? function () { handleSetView("diagnostics"); } : null}
        diagnosticsCount={diagnosticsCount}
        userMeta={userMeta}
      >
        <ErrorBoundary key={"view-" + view} label={"view:" + view} inline>
          <Suspense fallback={<PipLoader />}>{mainContent}</Suspense>
        </ErrorBoundary>
      </MobileLayout>
      {addAccountModal}
      {startConvModal}
      {adHocFlowOverlay}
      {globalQuickTaskModal}
      {/* Floating Pip (mobile) — hidden on home (home has its own centerpiece orb) and pip itself */}
      {view !== "pip" && view !== "home" && (
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
      {notifPrompt}
    </>
  );
}
