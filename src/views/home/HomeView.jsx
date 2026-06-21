import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
var AddItemModal = lazy(function () { return import("../accounts/AddItemModal").then(function (m) { return { default: m.AddItemModal }; }); });
import { C } from "../../lib/colors";
import { supabase } from "../../lib/supabase";
import { PipOrb } from "../../components/PipMark";
import { LitPill } from "../../components/LitPill";
import { Glow } from "../../components/Glow";
import { MarkdownText } from "../../components/MarkdownText";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { getNextOccurrence, formatTime } from "../../lib/cadenceUtils";
import { useAccountSnapshots } from "../../hooks/useAccountSnapshots";
import { useOperatorReport } from "../../hooks/useOperatorReport";
import { OperatorHub } from "./OperatorHub";
import { OperatorRunButton } from "./OperatorRunButton";
import { generateCheckInQuestions } from "../../lib/checkIn";
import { trackerProjects, isTrackerDirty, buildTrackerTSV, isTrackerReminderWindow } from "../../lib/teamTracker";
import { callPortfolioBriefPip, callWeekWrapPip } from "../../lib/pip";
import { weeklyMovement, candidateWins, isFridayWrapWindow } from "../../lib/weekReview";
import { isProjectComplete } from "../../lib/gaugeStatus";
import { notMyRelationship } from "../../lib/accountHealth";
import { suggestionLabel } from "../pip/PipCatchUp";
import { showToast } from "../../components/Toast";
import { HexField, HexSignature } from "../../lib/hexMotif";
import { fmtShort } from "../../lib/dateUtils";
import { InfoCard } from "../../components/InfoCard";
import { useKokoroTTS } from "../../lib/useKokoroTTS";
import { HexRingCanvas } from "../../components/HexRingCanvas";
import { buildCardScript } from "../../lib/buildCardScript";
import { MondayPackCard } from "./MondayPackCard";
import { pickMondayCadence, shouldShowMondayCard } from "../../lib/mondayPack";

var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

function timeOfDayGreeting(name) {
  var h = new Date().getHours();
  var n = name ? ", " + name : "";
  if (h < 5)  return "Late" + n + ".";
  if (h < 12) return "Morning" + n + ".";
  if (h < 17) return "Afternoon" + n + ".";
  if (h < 21) return "Evening" + n + ".";
  return "Late" + n + ".";
}

function dateLabel() {
  // eslint-ok: one-off locale format (full weekday + long month + day header)
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function startOfToday() {
  var d = new Date(); d.setHours(0, 0, 0, 0); return d;
}
function isToday(d) {
  if (!d) return false;
  var s = startOfToday();
  var dt = new Date(d);
  return dt.getFullYear() === s.getFullYear() && dt.getMonth() === s.getMonth() && dt.getDate() === s.getDate();
}

function pickHeroLine(c) {
  // Short, accurate, Pip-voiced one-liner for under the orb. The DETAILED read
  // lives in the operator report below — this is just the at-a-glance vibe.
  // Accurate to the real workload; varies day to day, stable within a day.
  var calls       = c.calls || 0;
  var overdue     = c.overdue || 0;
  var cold        = c.cold || 0;
  var commitments = c.commitments || 0;
  var load        = overdue + commitments;

  function pick(arr) {
    var d = new Date();
    return arr[(d.getDate() + d.getMonth()) % arr.length];
  }

  // Heavy day — lots to get done.
  if (load >= 5 || (load >= 3 && calls >= 2)) {
    return pick([
      "Busy one today. Let's dig in.",
      "Lot on the plate — start with the fires.",
      "Big day. Let's pick a path and go.",
      "Plenty to get through. Triage first.",
    ]);
  }
  // A promise or two is the story.
  if (commitments > 0 && overdue <= 1) {
    return pick([
      commitments === 1 ? "A promise due — don't let it slip." : commitments + " promises due. Stay on them.",
      "You made some promises — let's keep them.",
    ]);
  }
  // Some things need eyes.
  if (overdue > 0) {
    return pick([
      overdue === 1 ? "One thing needs your eyes today." : overdue + " things need your eyes.",
      "A few loose ends to tie up.",
      "Couple things to clear — won't take long.",
    ]);
  }
  // Calls on the books, nothing burning.
  if (calls > 0) {
    return pick([
      calls === 1 ? "One call today, nothing burning." : calls + " calls today, nothing burning.",
      calls === 1 ? "A call on the books. Otherwise clear." : calls + " calls booked. Otherwise clear.",
    ]);
  }
  // Quiet — nudge toward proactive outreach.
  if (cold > 0) {
    return pick([
      "Slow day — good time to warm up a cold account.",
      cold === 1 ? "Quiet. One account's gone cold — reach out?" : "Quiet. A few accounts have gone cold — reach out?",
      "Calm one. Let's get ahead of someone we haven't talked to.",
    ]);
  }
  // Genuinely clear.
  return pick([
    "Calm morning. Nothing pressing.",
    "Quiet day. Let's stay ahead.",
    "All clear — good day to get proactive.",
  ]);
}

// Home's narrative panels are now the shared InfoCard grammar (App Coherence
// Rule) — one card anatomy across Home. minHeight keeps the 2-up grid even.
function Panel({ title, accent, children }) {
  return (
    <InfoCard label={title} accent={accent} style={{ minHeight: 110, height: "100%" }}>
      {children}
    </InfoCard>
  );
}

// Account name from a row's accountId, short.
function acctName(accountById, accountId) {
  var a = accountById[accountId];
  return a ? a.name : "an account";
}

// Build a linkify(str, keyBase) that wraps known account names in <Glow> so
// MarkdownText can keep the brief's tap-to-open-account behavior inside its
// structured (headers + bullets + glyph) rendering.
function makeAccountLinkify(accounts, onOpenAccount) {
  if (!accounts || !accounts.length || !onOpenAccount) return null;
  var named = accounts
    .filter(function (a) { return a.name && a.name.length > 3; })
    .sort(function (a, b) { return b.name.length - a.name.length; });
  return function linkify(str, keyBase) {
    var segments = [str];
    named.forEach(function (account) {
      var next = [];
      segments.forEach(function (seg) {
        if (typeof seg !== "string") { next.push(seg); return; }
        var parts = seg.split(account.name);
        if (parts.length === 1) { next.push(seg); return; }
        parts.forEach(function (part, i) {
          if (part) next.push(part);
          if (i < parts.length - 1) {
            next.push(
              <Glow key={keyBase + "-" + account.id + "-" + i} onClick={function () { onOpenAccount(account.id); }}>
                {account.name}
              </Glow>
            );
          }
        });
      });
      segments = next;
    });
    return segments;
  };
}

export function HomeView({ userName, userId, userEmail, accounts, meetings, items, cadences, projects, contacts, members, wins, themes, showOnboardingCard, dripQuestion, dripQueueCount, commitmentNudges, pipFacts, profileProse, scheduledMeetings, handlers }) {
  // All callback props arrive grouped in one `handlers` bag (Batch 8 — prop-
  // sprawl reduction). Re-expanded to locals here so the many internal call
  // sites (onOpenAccount ×17, onOpenCadenceHub ×14, …) stay byte-for-byte
  // unchanged; behavior is identical.
  var onOpenAccount          = handlers.onOpenAccount;
  var onOpenAccountTab       = handlers.onOpenAccountTab;
  var onOpenCadenceHub       = handlers.onOpenCadenceHub;
  var onOpenConversation     = handlers.onOpenConversation;
  var onOpenPip              = handlers.onOpenPip;
  var onOpenQuickTask        = handlers.onOpenQuickTask;
  var onStartInterview       = handlers.onStartInterview;
  var onDismissOnboardingCard = handlers.onDismissOnboardingCard;
  var onOpenCatchUp          = handlers.onOpenCatchUp;
  var onApplySuggestion      = handlers.onApplySuggestion;
  var onAnswerDrip           = handlers.onAnswerDrip;
  var onSkipDrip             = handlers.onSkipDrip;
  var onDismissDrip          = handlers.onDismissDrip;
  var onSnoozeNudge          = handlers.onSnoozeNudge;
  var onMarkNudgeDone        = handlers.onMarkNudgeDone;
  var onCloseItem            = handlers.onCloseItem;
  var onUpdateItem           = handlers.onUpdateItem;
  var onDeleteItem           = handlers.onDeleteItem;
  var onUpdateProject        = handlers.onUpdateProject;
  var onAddWin               = handlers.onAddWin;
  var onOpenDigest           = handlers.onOpenDigest;
  var onOpenScheduled        = handlers.onOpenScheduled;
  var onOpenCommitments      = handlers.onOpenCommitments;
  var onOpenPersonHub        = handlers.onOpenPersonHub;

  commitmentNudges = commitmentNudges || [];

  // Monday 1:1 pack — the weekly prep sheet leads Home on Monday (the approved
  // Home design). Pick the Monday person cadence; show the card in the Monday
  // window (Mon, or the Sunday-evening heads-up). (Phase 2 #1 "SHINE".)
  var mondayCadence = useMemo(function () {
    return pickMondayCadence(cadences || [], new Date());
  }, [cadences]);
  var showMondayPack = !!(onOpenPersonHub && mondayCadence && mondayCadence.contact_id &&
    shouldShowMondayCard(mondayCadence, new Date()));
  var mondayPersonName = useMemo(function () {
    if (!mondayCadence || !mondayCadence.contact_id) return null;
    var ct = (contacts || []).find(function (c) { return c.id === mondayCadence.contact_id; });
    return ct ? ct.name : null;
  }, [mondayCadence, contacts]);

  var [editingNudgeTask, setEditingNudgeTask] = useState(null);
  var isDesktop = useBreakpoint();
  var isMobile  = !isDesktop;
  var [mounted, setMounted] = useState(false);
  var [dailyBrief, setDailyBrief] = useState("");
  var [captureMenuOpen, setCaptureMenuOpen] = useState(false);
  var [briefCallouts, setBriefCallouts] = useState([]);
  var [briefLoading, setBriefLoading] = useState(false);
  var [briefNonce, setBriefNonce] = useState(0);
  var briefFiredRef = useRef(false);
  var briefKokoro = useKokoroTTS();
  var [activeCard, setActiveCard]  = useState(0);
  var [scriptOpen, setScriptOpen]  = useState(false);
  var [briefPhase, setBriefPhase]  = useState("idle"); // "idle"|"playing"|"done"
  var [waitingForAnswer, setWaitingForAnswer] = useState(false);
  var [currentCheckIn, setCurrentCheckIn]     = useState(null);
  var card0Ref         = useRef(null);
  var card1Ref         = useRef(null);
  var card2Ref         = useRef(null);
  var card3Ref         = useRef(null);
  var card4Ref         = useRef(null);
  var card5Ref         = useRef(null);
  var stageRef         = useRef(null);
  var transitioningRef = useRef(false);
  var activeCardRef    = useRef(0);
  var briefPhaseRef    = useRef("idle");
  var seqIdxRef        = useRef(0);
  var prevSpeakingRef  = useRef(false);
  var waitingAnswerRef = useRef(false);
  var playSeqRef       = useRef([]);
  var cardScriptRef    = useRef([]);

  function handleReadBrief() {
    if (briefKokoro.speaking) {
      briefKokoro.cancel();
      return;
    }
    var text = (dailyBrief || "")
      .replace(/[*#`_~\[\]]/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\n+/g, ". ")
      .trim();
    if (briefCallouts && briefCallouts.length > 0) {
      text += ". " + briefCallouts.map(function (c) {
        return [c.account_name, c.action, c.reason].filter(Boolean).join(", ");
      }).join(". ");
    }
    // Cap text so mobile TTS doesn't read the whole brief (~60 words is plenty)
    if (text.length > 400) text = text.slice(0, 400).replace(/\s+\S+$/, "") + "…";
    if (!text) return;
    briefKokoro.activate();
    briefKokoro.speak(text);
  }

  // Manual "refresh brief" — clears today's cached brief and re-fires the
  // generation effect (bumping briefNonce). Lets the user rebuild a brief that
  // looks off without waiting for tomorrow.
  function refreshBrief() {
    if (briefLoading) return;
    var todayStr = new Date().toISOString().slice(0, 10);
    try { localStorage.removeItem("folio_daily_brief_v11_" + userId + "_" + todayStr); } catch (_) { /* ignore */ }
    briefFiredRef.current = false;
    setDailyBrief("");
    setBriefCallouts([]);
    setBriefNonce(function (n) { return n + 1; });
  }
  var [dripAnswer, setDripAnswer]     = useState("");
  var [dripSaving, setDripSaving]     = useState(false);
  var [dripApplyOff, setDripApplyOff] = useState(false); // unchecked "also save"

  // Reset textarea when the active question changes.
  useEffect(function () { setDripAnswer(""); setDripApplyOff(false); }, [dripQuestion && dripQuestion.id]);

  var { snapshots, snapshotHistory } = useAccountSnapshots(userId);

  // Operator report — the materialized output of the nightly Pip loop. When a
  // report exists for today it becomes the head of Home and the live daily
  // brief is suppressed (so Pip isn't paid for twice). A null report (first
  // day, or a skipped idle weekend) falls back to the on-open daily brief.
  var { report: operatorReport, drafts: operatorDrafts, loaded: operatorLoaded, refetch: refetchOperator } = useOperatorReport(userId);
  // True when the operator produced something worth showing — drives the Home
  // dashboard (Pip read card + section cards) and suppresses the legacy summary.
  var operatorActive = !!(operatorReport && (operatorReport.report_prose || (Array.isArray(operatorReport.plan_items) && operatorReport.plan_items.length > 0)));

  useEffect(function () {
    var t = setTimeout(function () { setMounted(true); }, 60);
    return function () { clearTimeout(t); };
  }, []);

  // Clear any rendered brief when the logged-in user changes, so a brief shown
  // under one account can't carry into another on an in-session account switch.
  // Reset the fired-guard too, so the new user's brief regenerates.
  useEffect(function () {
    setDailyBrief("");
    setBriefCallouts([]);
    briefFiredRef.current = false;
  }, [userId]);

  // Daily brief — generated once per calendar day, cached in localStorage.
  // Only fires when snapshots are ready and the brief hasn't been generated today.
  useEffect(function () {
    if (!userId) return;
    // Wait for the operator-report check to resolve, then suppress the live
    // brief entirely when the nightly loop already produced today's report.
    if (!operatorLoaded) return;
    if (operatorActive) return;
    var todayStr = new Date().toISOString().slice(0, 10);
    // v9: flushes any brief cached before account data finished loading (the
    // "Unknown accounts" short brief from opening two tabs at once). v8 added
    // structured markdown; v7 flushed raw-JSON briefs.
    // Also scope the key to userId — a date-only key bled one user's brief into
    // another account on a shared device (every other cache is userId-scoped).
    var cacheKey = "folio_daily_brief_v11_" + userId + "_" + todayStr;

    // Check localStorage cache first — if we have a brief for today, use it.
    try {
      var cached = localStorage.getItem(cacheKey);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed && parsed.brief) {
          setDailyBrief(parsed.brief);
          setBriefCallouts(parsed.callouts || []);
          return;
        }
      }
    } catch (_) { /* ignore localStorage parse errors */ }

    // Not cached — generate via Pip API. Guard against double-fire with a ref
    // (was a side-effect inside a setState updater, which StrictMode double-
    // invokes). Wait for snapshots so the brief isn't built from empty data.
    if (briefFiredRef.current) return;
    if (!snapshots || snapshots.length === 0) return;
    // Don't build (and cache) a brief before the account list has loaded —
    // otherwise a race (e.g. two tabs opened at once) caches a sparse
    // "Unknown accounts" brief for the rest of the day.
    if (!accounts || accounts.length === 0) return;
    briefFiredRef.current = true;
    setBriefLoading(true);
    (async function () {
      var sevenDaysOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

      // Recent account changes (catalog/pricing/integration/etc) — context for
      // why an account might be moving. This runs only inside the once-per-day,
      // cached brief generation (not on cold open), so the extra query is cheap.
      var recentUpdates = [];
      try {
        var thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        var updRes = await supabase
          .from("folio_account_updates")
          .select("account_id,update_type,title,description,update_date")
          .eq("user_id", userId)
          .gte("update_date", thirtyDaysAgo)
          .order("update_date", { ascending: false })
          .limit(12);
        recentUpdates = (updRes.data || []).map(function (u) {
          var acc = (accounts || []).find(function (a) { return a.id === u.account_id; });
          return {
            account_name: acc ? acc.name : null,
            update_type: u.update_type || null,
            title: u.title || null,
            description: u.description || null,
            update_date: u.update_date || null,
          };
        });
      } catch (_) { /* updates are supporting context — never block the brief */ }

      // Build overdue item text per account so Pip can name them specifically
      var overdueByAccount = {};
      var overdueTasks = [];
      (items || []).forEach(function (item) {
        if (!item.done && item.due_date && item.due_date < todayStr) {
          if (!overdueByAccount[item.account_id]) overdueByAccount[item.account_id] = [];
          var label = item.text || item.title || item.description || "Unnamed item";
          overdueByAccount[item.account_id].push(label);
          overdueTasks.push(label);
        }
      });

      // Commitments due in the next 7 days
      var commitmentsDue = (items || []).filter(function (item) {
        return item.is_commitment && !item.done && item.due_date && item.due_date >= todayStr && item.due_date <= sevenDaysOut;
      }).map(function (item) {
        return { text: item.text || item.title || "Unnamed commitment", due_date: item.due_date };
      });

      // Overdue commitments
      var commitmentsOverdue = (items || []).filter(function (item) {
        return item.is_commitment && !item.done && item.due_date && item.due_date < todayStr;
      }).map(function (item) {
        return { text: item.text || item.title || "Unnamed commitment", due_date: item.due_date };
      });

      // Today's cadences — richer objects so Pip can mention times + labels
      var todayCadences = (cadences || []).filter(function (c) {
        if (!c.next_date) return false;
        return c.next_date.slice(0, 10) === todayStr;
      }).map(function (c) {
        var acc = (accounts || []).find(function (a) { return a.id === c.account_id; });
        return {
          account_name: acc ? acc.name : "Unknown",
          meeting_time: c.meeting_time || null,
          label: c.label || c.frequency || null,
        };
      });

      var snapshotsWithDetails = (snapshots || []).map(function (s) {
        var acc = (accounts || []).find(function (a) { return a.id === s.account_id; });
        var isFlagged = s.health_status === "at_risk" || s.health_status === "watching";
        // Ownership: a "not mine" account (owner is someone else) should never
        // drive outreach/cold/at-risk urgency in the brief — only project work.
        var notMine = !!acc && notMyRelationship(acc, userId);
        return Object.assign({}, s, {
          account_name: acc ? acc.name : "Unknown",
          overdue_items: (overdueByAccount[s.account_id] || []).slice(0, 3),
          tier: acc ? acc.tier : null,
          objective: (acc && isFlagged) ? (acc.objective || null) : null,
          not_mine: notMine,
        });
      });

      var sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      var activeProjects = (projects || []).filter(function (p) {
        return p.status === "in_progress";
      }).map(function (p) {
        var stages = p.tasks || [];
        var hasRecent = stages.some(function (s) { return s.completed_at && s.completed_at > sevenDaysAgo; });
        var acc = (accounts || []).find(function (a) { return a.id === p.account_id; });
        return Object.assign({}, p, {
          is_stuck: !hasRecent,
          title: p.title,
          account_name: acc ? acc.name : null,
        });
      });

      var recentWins = (projects || []).filter(function (p) {
        return p.status === "complete" && p.updated_at && p.updated_at > sevenDaysAgo;
      }).map(function (p) { return Object.assign({}, p, { completed_recently: true }); });

      // Cold accounts — healthy/watching accounts with no contact in 30+ days (cap 5).
      // Item 38: exclude accounts owned by someone else (relationship-owner distinction).
      var coldAccounts = (accounts || []).filter(function (a) {
        if (a.is_inactive) return false;
        if (notMyRelationship(a, userId)) return false; // not my relationship
        var snap = (snapshots || []).find(function (s) { return s.account_id === a.id; });
        if (!snap) return false;
        return snap.days_since_contact !== null && snap.days_since_contact >= 30 &&
          snap.health_status !== "at_risk";
      }).map(function (a) {
        var snap = (snapshots || []).find(function (s) { return s.account_id === a.id; });
        return {
          name: a.name,
          tier: a.tier,
          days_since_contact: snap ? snap.days_since_contact : null,
        };
      }).slice(0, 5);

      // Loose ends — meetings with notes but no pip_summary, older than 3 days (cap 3)
      var threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
      var looseEndsForPip = (meetings || []).filter(function (m) {
        return !m.pip_summary && m.notes && m.notes.trim().length > 20 &&
          m.created_at && m.created_at.slice(0, 10) < threeDaysAgo;
      }).map(function (m) {
        var acc = (accounts || []).find(function (a) { return a.id === m.account_id; });
        return {
          account_name: acc ? acc.name : "Unknown",
          title: m.title || "Untitled meeting",
          days_ago: Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000),
        };
      }).slice(0, 3);

      // Health momentum: compare today's status vs earliest status in the 8-day window
      var healthDeltas = [];
      (snapshots || []).forEach(function (todaySnap) {
        var history = (snapshotHistory || []).filter(function (s) {
          return s.account_id === todaySnap.account_id && s.snapshot_date !== todayStr;
        });
        if (history.length === 0) return;
        var oldest = history[history.length - 1]; // already ordered desc, so last = oldest
        var prev = oldest.health_status;
        var curr = todaySnap.health_status;
        if (prev === curr) return;
        var wasWorse = (prev === "at_risk" && (curr === "watching" || curr === "healthy")) ||
                       (prev === "watching" && curr === "healthy");
        var isWorse  = (prev === "healthy" && (curr === "watching" || curr === "at_risk")) ||
                       (prev === "watching" && curr === "at_risk");
        if (!wasWorse && !isWorse) return;
        var acc = (accounts || []).find(function (a) { return a.id === todaySnap.account_id; });
        healthDeltas.push({
          account_name: acc ? acc.name : "Unknown",
          tier: acc ? acc.tier : null,
          direction: wasWorse ? "recovering" : "slipping",
          from: prev,
          to: curr,
        });
      });

      // Champions and blockers per account (from contacts with relationship_role set)
      var relationshipSignals = [];
      (snapshots || []).forEach(function (snap) {
        var acctContacts = (contacts || []).filter(function (c) {
          return c.account_id === snap.account_id;
        });
        var champions = acctContacts.filter(function (c) { return c.relationship_role === "champion"; });
        var blockers  = acctContacts.filter(function (c) { return c.relationship_role === "blocker"; });
        if (champions.length === 0 && blockers.length === 0) return;
        var acc = (accounts || []).find(function (a) { return a.id === snap.account_id; });
        relationshipSignals.push({
          account_name: acc ? acc.name : "Unknown",
          tier: acc ? acc.tier : null,
          champions: champions.map(function (c) { return c.name; }),
          blockers: blockers.map(function (c) { return c.name; }),
        });
      });

      // Tone trend per account: look at pip_tone across the last 8 days of snapshots
      // "cooling" = last 3 days mixed/negative; "warming" = last 3 days positive
      var toneSignals = [];
      (snapshots || []).forEach(function (todaySnap) {
        var history = (snapshotHistory || []).filter(function (s) {
          return s.account_id === todaySnap.account_id;
        }).slice(0, 5); // last 5 days including today
        if (history.length < 3) return;
        var recent = history.slice(0, 3).map(function (s) { return s.pip_tone; }).filter(Boolean);
        if (recent.length < 2) return;
        var negCount = recent.filter(function (t) { return t === "negative" || t === "mixed"; }).length;
        var posCount = recent.filter(function (t) { return t === "positive"; }).length;
        if (negCount >= 2) {
          var acc = (accounts || []).find(function (a) { return a.id === todaySnap.account_id; });
          toneSignals.push({ account_name: acc ? acc.name : "Unknown", tier: acc ? acc.tier : null, trend: "cooling" });
        } else if (posCount >= 2) {
          var acc2 = (accounts || []).find(function (a) { return a.id === todaySnap.account_id; });
          toneSignals.push({ account_name: acc2 ? acc2.name : "Unknown", tier: acc2 ? acc2.tier : null, trend: "warming" });
        }
      });

      // Cross-account theme signals: themes appearing on 3+ accounts
      var portfolioThemes = (themes || []).filter(function (t) {
        return t.count >= 3;
      }).slice(0, 3).map(function (t) {
        return {
          theme: t.theme,
          count: t.count,
          accounts: (t.accounts || []).slice(0, 3),
        };
      });

      // Cadence anomaly vs the account's OWN baseline — flag accounts whose gap
      // since last contact is well beyond their typical meeting interval. Pure
      // JS, personal baseline (median gap from history), not an industry norm.
      var todayMs = startOfToday().getTime();
      var anomalySignals = [];
      (accounts || []).forEach(function (a) {
        if (a.is_inactive) return;
        // Item 38: skip off-cadence nudges for accounts owned by someone else.
        if (notMyRelationship(a, userId)) return;
        var dates = (meetings || [])
          .filter(function (m) { return m.account_id === a.id && m.meeting_date && m.status !== "scheduled"; })
          .map(function (m) { return m.meeting_date; })
          .sort();
        if (dates.length < 4) return; // need real history for a baseline
        var gaps = [];
        for (var gi = 1; gi < dates.length; gi++) {
          var d = (new Date(dates[gi]) - new Date(dates[gi - 1])) / 86400000;
          if (d > 0) gaps.push(d);
        }
        if (gaps.length < 3) return;
        gaps.sort(function (x, y) { return x - y; });
        var median = gaps[Math.floor(gaps.length / 2)];
        if (!median || median < 3) return;
        var daysSince = Math.round((todayMs - new Date(dates[dates.length - 1]).getTime()) / 86400000);
        // Off-cadence: well past 2x the usual rhythm (and a meaningful absolute gap).
        if (daysSince >= median * 2 && daysSince >= median + 10) {
          var snapA = (snapshots || []).find(function (s) { return s.account_id === a.id; });
          anomalySignals.push({
            account_name: a.name,
            tier: a.tier || null,
            typical_days: Math.round(median),
            days_since: daysSince,
            health: snapA ? snapA.health_status : null,
          });
        }
      });
      anomalySignals.sort(function (p, q) { return q.days_since - p.days_since; });
      anomalySignals = anomalySignals.slice(0, 5);

      callPortfolioBriefPip({
        snapshots: snapshotsWithDetails,
        projects: activeProjects.concat(recentWins),
        overdueTasks: overdueTasks,
        commitmentsDue: commitmentsDue,
        commitmentsOverdue: commitmentsOverdue,
        todayCadences: todayCadences,
        coldAccounts: coldAccounts,
        looseEnds: looseEndsForPip,
        healthDeltas: healthDeltas,
        relationshipSignals: relationshipSignals,
        toneSignals: toneSignals,
        anomalySignals: anomalySignals,
        portfolioThemes: portfolioThemes,
        recentUpdates: recentUpdates,
        facts: pipFacts || [],
        profileProse: profileProse || null,
      }).then(function (result) {
        setBriefLoading(false);
        if (result && result.brief) {
          setDailyBrief(result.brief);
          setBriefCallouts(result.callouts || []);
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ brief: result.brief, callouts: result.callouts || [], date: todayStr }));
          } catch (_) { /* ignore */ }
        }
      }).catch(function (err) {
        setBriefLoading(false);
        console.warn("[HomeView] daily brief failed:", err && err.message);
      });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshots.length, (items || []).length, briefNonce, userId, operatorLoaded, operatorReport]);

  var accountById = useMemo(function () {
    var m = {};
    (accounts || []).forEach(function (a) { if (!a.is_inactive) m[a.id] = a; });
    return m;
  }, [accounts]);

  var todayISO = startOfToday().toISOString().slice(0, 10);

  // ── They owe you — waiting-on layer (Phase 1.4) ──────────────────────
  // Projects + tasks blocked on a named person, oldest hold first. Pure
  // in-memory derivation from data Home already loads — zero extra queries.
  var waitingOnRows = useMemo(function () {
    var rows = [];
    (projects || []).forEach(function (p) {
      if (!p.waiting_on || p.status === "complete") return;
      rows.push({
        kind: "project", id: p.id, who: p.waiting_on,
        what: p.title || "Untitled project",
        since: p.waiting_on_since || null,
        accountId: p.account_id || null,
      });
    });
    (items || []).forEach(function (it) {
      if (!it.waiting_on || it.done || it.status === "complete") return;
      rows.push({
        kind: "task", id: it.id, who: it.waiting_on,
        what: it.text || it.title || "Task",
        since: it.waiting_on_since || null,
        accountId: it.account_id || null,
      });
    });
    rows.forEach(function (r) {
      r.days = r.since
        ? Math.max(0, Math.floor((Date.now() - new Date(r.since + "T00:00:00").getTime()) / 86400000))
        : null;
    });
    rows.sort(function (a, b) { return (b.days || 0) - (a.days || 0); });
    return rows.slice(0, 6);
  }, [projects, items]);

  // ── Morning check-in (Phase 1.2) — Pip asks before he declares ────────
  var checkInKey = "folio_checkin_" + userId + "_" + todayISO;
  // Persistent "don't ask again" set — keyed by question id, NOT per-day, so a
  // dismissed draft never re-surfaces tomorrow. (The per-day key below only
  // remembers what was answered *today* and resets at midnight.)
  var checkInDismissKey = "folio_checkin_dismissed_" + userId;
  var [checkInAnswered, setCheckInAnswered] = useState(function () {
    try { return JSON.parse(localStorage.getItem(checkInKey) || "{}"); } catch (e) { return {}; }
  });
  var [checkInDismissed, setCheckInDismissed] = useState(function () {
    try { return JSON.parse(localStorage.getItem(checkInDismissKey) || "{}"); } catch (e) { return {}; }
  });
  var [checkInReceipts, setCheckInReceipts] = useState([]);
  // Re-read today's answered-state when the day key flips (midnight rollover
  // without a reload). Receipts clear with the new day too.
  useEffect(function () {
    try { setCheckInAnswered(JSON.parse(localStorage.getItem(checkInKey) || "{}")); }
    catch (e) { setCheckInAnswered({}); }
    setCheckInReceipts([]);
  }, [checkInKey]);
  var checkInQuestions = useMemo(function () {
    // Merge per-day answered + persistent dismissed so both suppress questions.
    var suppressed = Object.assign({}, checkInDismissed, checkInAnswered);
    return generateCheckInQuestions({
      items: items || [], projects: projects || [], meetings: meetings || [],
      accounts: accounts || [], todayISO: todayISO, answered: suppressed,
    });
  }, [items, projects, meetings, accounts, todayISO, checkInAnswered, checkInDismissed]);

  // ── Triple-echo suppression — CHECK-IN WINS (item 47 locked verdict) ──
  // Any item/project that has a LIVE check-in question this morning is
  // suppressed from the "Your word" card, so a given commitment/waiting-on
  // appears in exactly ONE place at a time. The check-in is the conversation
  // that matters first; once it's answered the question clears and the item
  // reappears in "Your word" naturally. Keys are namespaced by kind so a task
  // id can't collide with a project id. (checkIn targetKind "item" === the
  // waiting-on row kind "task" / a commitment nudge's taskId.)
  var checkInTargetKeys = useMemo(function () {
    var s = {};
    (checkInQuestions || []).forEach(function (q) {
      if (!q.targetId) return;
      if (q.targetKind === "item")    s["item:" + q.targetId] = true;
      if (q.targetKind === "project") s["project:" + q.targetId] = true;
    });
    return s;
  }, [checkInQuestions]);
  function suppressedByCheckIn(kind, id) {
    // map the waiting-on "task" kind onto the check-in "item" namespace
    var k = kind === "task" ? "item" : kind;
    return !!checkInTargetKeys[k + ":" + id];
  }

  // "Your word" lists with check-in winners removed (item 1 suppression).
  var wordCommitments = useMemo(function () {
    return (commitmentNudges || []).filter(function (n) { return !suppressedByCheckIn("item", n.taskId); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitmentNudges, checkInTargetKeys]);
  var wordWaitingOn = useMemo(function () {
    return (waitingOnRows || []).filter(function (r) { return !suppressedByCheckIn(r.kind, r.id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingOnRows, checkInTargetKeys]);

  // Team Sheet sync nudge — Phase 2 #2. Surfaces Mon afternoon / Tue (before the
  // team meeting) when tracked projects have changed since their last export.
  // One tap copies exactly the unsynced rows for pasting into the Excel sheet.
  var teamSheetDirty = useMemo(function () {
    if (!isTrackerReminderWindow()) return [];
    return trackerProjects(projects).filter(isTrackerDirty);
  }, [projects]);

  function copyTeamSheetDirty() {
    if (!teamSheetDirty.length) return;
    var tsv = buildTrackerTSV(teamSheetDirty, { accounts: accounts, members: members });
    var stamp = function () {
      var at = new Date().toISOString();
      teamSheetDirty.forEach(function (p) { if (onUpdateProject) onUpdateProject(p.id, { tracker_exported_at: at }); });
      showToast("Copied " + teamSheetDirty.length + " row" + (teamSheetDirty.length === 1 ? "" : "s") + " — paste into the team sheet");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).then(stamp).catch(function () { showToast("Couldn't copy to clipboard", "error"); });
    } else {
      showToast("Clipboard unavailable", "error");
    }
  }

  // Friday Pip Wrap (#4) — the week-in-review. Deterministic by default; the
  // "✦ Pip's take" paragraph is an on-demand Pip call. Only computes on Fridays.
  var isFriday = isFridayWrapWindow();
  var wrap = useMemo(function () {
    if (!isFriday) return null;
    var isMine = function (a) { return !a.owner_user_id || a.owner_user_id === userId; };
    return weeklyMovement({
      now: new Date(), accounts: accounts, meetings: meetings,
      projects: projects, tasks: items, wins: wins, isMine: isMine,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFriday, accounts, meetings, projects, items, wins, userId]);
  var wrapCandidates = useMemo(function () {
    if (!isFriday) return [];
    var logged = {};
    (wins || []).forEach(function (w) { if (w.source_ref) logged[w.source_ref] = true; });
    return candidateWins({ now: new Date(), accounts: accounts, projects: projects, tasks: items })
      .filter(function (c) { return !logged[c.ref]; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFriday, accounts, projects, items, wins]);
  var [wrapTake, setWrapTake] = useState(null);
  var [wrapTakeLoading, setWrapTakeLoading] = useState(false);

  function askWrapTake() {
    if (wrapTakeLoading || !wrap) return;
    setWrapTakeLoading(true);
    callWeekWrapPip({
      firstName: userName || "",
      summary: {
        commitmentsKept: wrap.commitmentsKept, commitmentsSlipped: wrap.commitmentsSlipped,
        touched: wrap.touched.map(function (t) { return t.name; }),
        neglected: wrap.neglected.map(function (n) { return n.name; }),
        moved: wrap.moved.map(function (m) { return m.title; }),
        wins: (wrap.wins || []).map(function (w) { return w.title; }),
      },
    }).then(function (r) {
      setWrapTakeLoading(false);
      if (r && r.wrap) setWrapTake(r.wrap);
      else showToast("Pip had nothing to add", "error");
    }).catch(function () {
      setWrapTakeLoading(false);
      showToast("Pip's take is unavailable right now", "error");
    });
  }

  function logCandidateWin(c) {
    if (!onAddWin) return;
    onAddWin({ title: c.title, account_id: c.accountId || null, kind: c.kind, source_ref: c.ref });
    showToast("Win logged ✦");
  }

  function handleCheckInAnswer(q, optId) {
    var next = Object.assign({}, checkInAnswered);
    next[q.id] = optId;
    setCheckInAnswered(next);
    try { localStorage.setItem(checkInKey, JSON.stringify(next)); } catch (e) { /* quota */ }

    var receipt = null;
    if (q.kind === "deadline_passed" && optId === "done") {
      if (q.targetKind === "item" && onCloseItem) {
        onCloseItem(q.targetId);
        receipt = "Marked it done — Pip won't flag it again.";
      } else if (q.targetKind === "project" && onUpdateProject) {
        onUpdateProject(q.targetId, { status: "complete" });
        receipt = "Project marked complete — Pip's read is up to date now.";
      }
    } else if (q.kind === "deadline_passed" && optId === "still_open") {
      receipt = "Noted — it stays on your list.";
    } else if (q.kind === "stalled_hold" && optId === "it_moved") {
      if (onUpdateProject) onUpdateProject(q.targetId, { waiting_on: null, waiting_on_since: null });
      receipt = "Cleared the hold" + (q.who ? " on " + q.who : "") + " — good news.";
    } else if (q.kind === "stalled_hold" && optId === "still_stuck") {
      var proj = (projects || []).find(function (p) { return p.id === q.targetId; });
      var msg = "Hi " + (q.who || "").split(" ")[0] + " — checking in on \"" +
        ((proj && proj.title) || "the project") + "\". Where do things stand? Anything you need from me to move it? Thanks!";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(msg).catch(function () { /* clipboard blocked — receipt still shows */ });
      }
      receipt = "Chase note for " + q.who + " copied — paste into email or Teams.";
    } else if (q.kind === "stale_draft" && optId === "open_it") {
      if (q.accountId && onOpenAccountTab) {
        onOpenAccountTab(q.accountId, "meetings");
        receipt = "Taking you to the draft.";
      } else {
        // Account-less draft (a global ad-hoc) — nowhere to deep-link.
        receipt = "Open it from the meeting list when you're ready.";
      }
    } else if (q.kind === "stale_draft" && optId === "ignore") {
      // Persist this dismissal so the draft never re-asks tomorrow.
      var nextDismiss = Object.assign({}, checkInDismissed);
      nextDismiss[q.id] = true;
      setCheckInDismissed(nextDismiss);
      try { localStorage.setItem(checkInDismissKey, JSON.stringify(nextDismiss)); } catch (e) { /* quota */ }
      receipt = "Letting that one go — I won't ask again.";
    }
    if (receipt) {
      setCheckInReceipts(function (prev) { return prev.concat([receipt]); });
      showToast(receipt);
    }
  }

  // ── Today's Calls ────────────────────────────────────────────────────
  var todaysCalls = useMemo(function () {
    var today = startOfToday();
    return (cadences || [])
      .filter(function (c) { return c.type !== "task"; })
      .map(function (c) {
        var next = getNextOccurrence(c, today);
        if (!next || !isToday(next)) return null;
        var account = accountById[c.account_id];
        if (!account) return null;
        return { cadence: c, account: account, when: next };
      })
      .filter(Boolean)
      .sort(function (a, b) {
        var ta = (a.cadence.meeting_time || "23:59");
        var tb = (b.cadence.meeting_time || "23:59");
        return ta.localeCompare(tb);
      });
  }, [cadences, accountById]);

  // ── Today's Scheduled Meetings (one-off) ────────────────────────────
  var todaysScheduled = useMemo(function () {
    var todayStr = startOfToday().toISOString().slice(0, 10);
    return (scheduledMeetings || [])
      .filter(function (m) { return m.meeting_date === todayStr; })
      .sort(function (a, b) {
        var ta = a.meeting_time || "23:59";
        var tb = b.meeting_time || "23:59";
        return ta.localeCompare(tb);
      });
  }, [scheduledMeetings]);

  // Draft-ahead — meetings Pip summarized 2+ days ago with a follow-up email
  // already drafted (pip_email) but no later meeting logged on that account
  // since (proxy for "no follow-up sent"). Pip proactively surfaces the draft
  // it already wrote so you can send it before it goes stale. Zero extra cost —
  // reuses the email generated at summarize time.
  var draftAhead = useMemo(function () {
    var now = Date.now();
    var TWO_DAYS = 2 * 86400000;
    // Latest meeting date per account (any meeting) to detect later contact.
    var latestByAcct = {};
    (meetings || []).forEach(function (m) {
      if (!m.meeting_date || m.status === "scheduled") return;
      if (!latestByAcct[m.account_id] || m.meeting_date > latestByAcct[m.account_id]) {
        latestByAcct[m.account_id] = m.meeting_date;
      }
    });
    return (meetings || [])
      .filter(function (m) {
        if (m.status === "scheduled") return false;
        if (!m.pip_email || !m.pip_email.trim()) return false;
        if (!m.meeting_date) return false;
        var ageMs = now - new Date(m.meeting_date + "T00:00:00").getTime();
        if (ageMs < TWO_DAYS) return false;          // give it 48h first
        if (ageMs > 21 * 86400000) return false;      // stop nagging after 3 weeks
        // No later meeting on this account since (would imply follow-up happened).
        return latestByAcct[m.account_id] === m.meeting_date;
      })
      .sort(function (a, b) { return (b.meeting_date || "").localeCompare(a.meeting_date || ""); })
      .slice(0, 3);
  }, [meetings]);

  // ── Burning ──────────────────────────────────────────────────────────
  // Overdue items + blocked/overdue projects + cold accounts (>45d).
  // Sorted: longest overdue first, oldest cold next. Top 6.
  var burningRows = useMemo(function () {
    var rows = [];

    (items || []).forEach(function (i) {
      if (i.done || !i.due_date || i.due_date >= todayISO) return;
      var acct = accountById[i.account_id];
      if (!acct) return;
      var daysOver = Math.floor((Date.now() - new Date(i.due_date + "T00:00:00").getTime()) / 86400000);
      rows.push({
        key: "item:" + i.id,
        kind: "item",
        accountId: i.account_id,
        sortKey: -daysOver * 100 - 50,
        left: i.text,
        sub: acct.name,
        right: daysOver === 0 ? "today" : daysOver + "d over",
      });
    });

    (projects || []).forEach(function (p) {
      var acct = accountById[p.account_id];
      if (!acct) return;
      // Treat all-tasks-done projects as complete even if the status field
      // never flipped — otherwise a finished project burns forever.
      if (isProjectComplete(p)) return;
      var isBlocked = p.status === "blocked";
      var isOverdue = p.due_date && p.due_date < todayISO;
      if (!isBlocked && !isOverdue) return;
      var daysOver = isOverdue ? Math.floor((Date.now() - new Date(p.due_date + "T00:00:00").getTime()) / 86400000) : 0;
      rows.push({
        key: "project:" + p.id,
        kind: "project",
        accountId: p.account_id,
        sortKey: isBlocked ? -800 : -daysOver * 100 - 200,
        left: p.title,
        sub: acct.name,
        right: isBlocked ? "blocked" : (daysOver + "d over"),
      });
    });

    (accounts || []).forEach(function (a) {
      if (a.is_inactive) return;
      // Only surface cold nudges for accounts I own — not-mine accounts are
      // someone else's relationship to manage (item 38 ownership distinction).
      if (notMyRelationship(a, userId)) return;
      var last = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : 0;
      if (!last) return;
      var daysCold = Math.floor((Date.now() - last) / 86400000);
      if (daysCold < 45) return;
      rows.push({
        key: "cold:" + a.id,
        kind: "cold",
        accountId: a.id,
        sortKey: -daysCold,
        left: a.name + " — gone cold",
        sub: "no contact in " + daysCold + " days",
        right: daysCold + "d",
      });
    });

    rows.sort(function (x, y) { return x.sortKey - y.sortKey; });
    return rows.slice(0, 6);
  }, [items, projects, accounts, accountById, todayISO]);

  // ── Loose Ends ───────────────────────────────────────────────────────
  // Draft meetings that haven't been summarized yet, sorted by stale-ness.
  var looseEnds = useMemo(function () {
    return (meetings || [])
      .filter(function (m) { return m.status === "draft"; })
      .map(function (m) {
        var acct = accountById[m.account_id];
        if (!acct) return null;
        var updated = m.updated_at || m.created_at;
        var days = updated ? Math.floor((Date.now() - new Date(updated).getTime()) / 86400000) : 0;
        return {
          key: "draft:" + m.id,
          accountId: m.account_id,
          cadenceId: m.cadence_id,
          left: m.title || (acct.name + " — untitled draft"),
          sub: acct.name,
          right: days === 0 ? "today" : days + "d ago",
          days: days,
        };
      })
      .filter(Boolean)
      .sort(function (a, b) { return b.days - a.days; })
      .slice(0, 5);
  }, [meetings, accountById]);

  // ── Ahead ────────────────────────────────────────────────────────────
  // Upcoming cadences (next 7 days, excluding today) that don't yet have
  // a draft, plus warm Growth accounts not touched in 14-21 days.
  var aheadRows = useMemo(function () {
    var rows = [];
    var today = startOfToday();
    var weekOut = new Date(today.getTime() + 7 * 86400000);

    (cadences || []).forEach(function (c) {
      if (c.type === "task") return;
      var next = getNextOccurrence(c, new Date(today.getTime() + 86400000));
      if (!next || next > weekOut) return;
      var acct = accountById[c.account_id];
      if (!acct) return;
      // Has a draft for this cadence?
      var hasDraft = (meetings || []).some(function (m) {
        return m.cadence_id === c.id && m.status === "draft";
      });
      if (hasDraft) return;
      var daysOut = Math.floor((next.getTime() - today.getTime()) / 86400000);
      rows.push({
        key: "ahead-cadence:" + c.id,
        accountId: c.account_id,
        cadenceId: c.id,
        sortKey: daysOut * 10,
        left: acct.name + " — start prepping",
        sub: "cadence in " + daysOut + "d",
        right: daysOut + "d",
      });
    });

    (accounts || []).forEach(function (a) {
      if (a.is_inactive || a.tier !== "Growth") return;
      // Don't nudge me to "stay warm" on an account that isn't my relationship
      // (item 38) — that's outreach urgency, suppressed for not-mine accounts.
      if (notMyRelationship(a, userId)) return;
      var last = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : 0;
      if (!last) return;
      var daysCold = Math.floor((Date.now() - last) / 86400000);
      if (daysCold < 14 || daysCold > 21) return;
      rows.push({
        key: "warm:" + a.id,
        accountId: a.id,
        sortKey: 1000 + (21 - daysCold),
        left: a.name + " — stay warm",
        sub: "no contact in " + daysCold + "d, growth tier",
        right: daysCold + "d",
      });
    });

    rows.sort(function (x, y) { return x.sortKey - y.sortKey; });
    return rows.slice(0, 5);
  }, [cadences, meetings, accounts, accountById, userId]);

  // Hero line stays SHORT and accurate — Pip's at-a-glance read. The detailed,
  // Pip-voiced headline lives in the operator report card below, so we don't
  // repeat it up here.
  var heroLine = pickHeroLine({
    calls: todaysCalls.length + todaysScheduled.length,
    overdue: burningRows.filter(function (r) { return r.kind === "item"; }).length,
    cold: burningRows.filter(function (r) { return r.kind === "cold"; }).length,
    commitments: wordCommitments.length,
  });

  // ── Panels ──────────────────────────────────────────────────────────
  // ── Brief writers — Pip's narrative per panel ────────────────────────

  function todaysCallsBrief() {
    if (todaysCalls.length === 0) return <span>Nothing on the calendar today. Free day — use it.</span>;
    var first = todaysCalls[0];
    var firstT = first.cadence.meeting_time ? formatTime(first.cadence.meeting_time) : "no time set";
    if (todaysCalls.length === 1) {
      return (
        <span>
          One call today —{" "}
          <Glow onClick={function () { onOpenCadenceHub(first.account.id, first.cadence.id); }}>
            {first.account.name}
          </Glow>{" "}
          at <strong style={{ color: C.text, fontWeight: 600 }}>{firstT}</strong>.{" "}
          <Glow onClick={function () { onOpenCadenceHub(first.account.id, first.cadence.id); }}>
            I'll prep you.
          </Glow>
        </span>
      );
    }
    var second = todaysCalls[1];
    var secondT = second.cadence.meeting_time ? formatTime(second.cadence.meeting_time) : "no time set";
    if (todaysCalls.length === 2) {
      return (
        <span>
          Two calls today —{" "}
          <Glow onClick={function () { onOpenCadenceHub(first.account.id, first.cadence.id); }}>
            {first.account.name}
          </Glow>{" "}
          at {firstT}, then{" "}
          <Glow onClick={function () { onOpenCadenceHub(second.account.id, second.cadence.id); }}>
            {second.account.name}
          </Glow>{" "}
          at {secondT}.{" "}
          <Glow onClick={function () { onOpenCadenceHub(first.account.id, first.cadence.id); }}>
            I'll prep both.
          </Glow>
        </span>
      );
    }
    return (
      <span>
        {todaysCalls.length} calls today. First up:{" "}
        <Glow onClick={function () { onOpenCadenceHub(first.account.id, first.cadence.id); }}>
          {first.account.name}
        </Glow>{" "}
        at {firstT}.{" "}
        {todaysCalls.length - 1} more after.
      </span>
    );
  }

  function kindTab(kind) {
    if (kind === "item")    return "tasks";
    if (kind === "project") return "projects";
    return "overview";
  }

  function burningBrief() {
    if (burningRows.length === 0) return <span>Nothing on fire. Clean board.</span>;
    var r1 = burningRows[0];
    var r1Name = acctName(accountById, r1.accountId);
    if (burningRows.length === 1) {
      return (
        <span>
          One thing needs eyes —{" "}
          <Glow onClick={function () { onOpenAccountTab(r1.accountId, kindTab(r1.kind)); }}>
            {r1.left}
          </Glow>{" "}
          on {r1Name}, {r1.right}.
        </span>
      );
    }
    var r2 = burningRows[1];
    var r2Name = acctName(accountById, r2.accountId);
    if (burningRows.length === 2) {
      return (
        <span>
          Two things to handle —{" "}
          <Glow onClick={function () { onOpenAccountTab(r1.accountId, kindTab(r1.kind)); }}>
            {r1.left}
          </Glow>{" "}
          ({r1Name}, {r1.right}) and{" "}
          <Glow onClick={function () { onOpenAccountTab(r2.accountId, kindTab(r2.kind)); }}>
            {r2.left}
          </Glow>{" "}
          ({r2Name}).
        </span>
      );
    }
    return (
      <span>
        {burningRows.length} things piling up. Worst is{" "}
        <Glow onClick={function () { onOpenAccountTab(r1.accountId, kindTab(r1.kind)); }}>
          {r1.left}
        </Glow>{" "}
        on {r1Name} — {r1.right}. {burningRows.length - 1} more behind it.
      </span>
    );
  }

  function looseEndsBrief() {
    if (looseEnds.length === 0) return <span>No drafts hanging around. Clean.</span>;
    var d1 = looseEnds[0];
    var d1Name = acctName(accountById, d1.accountId);
    if (looseEnds.length === 1) {
      return (
        <span>
          A{" "}
          <Glow onClick={function () {
            if (d1.cadenceId) onOpenCadenceHub(d1.accountId, d1.cadenceId);
            else onOpenAccount(d1.accountId);
          }}>
            {d1Name} draft
          </Glow>{" "}
          from {d1.right} is sitting unsummarized. Want me to clean it up?
        </span>
      );
    }
    return (
      <span>
        {looseEnds.length} drafts sitting. Oldest is{" "}
        <Glow onClick={function () {
          if (d1.cadenceId) onOpenCadenceHub(d1.accountId, d1.cadenceId);
          else onOpenAccount(d1.accountId);
        }}>
          {d1Name}
        </Glow>{" "}
        from {d1.right}.
      </span>
    );
  }

  function aheadBrief() {
    if (aheadRows.length === 0) return <span>Quiet week ahead. Nothing to flag.</span>;
    var a1 = aheadRows[0];
    var a1Name = acctName(accountById, a1.accountId);
    if (aheadRows.length === 1) {
      return (
        <span>
          <Glow onClick={function () {
            if (a1.cadenceId) onOpenCadenceHub(a1.accountId, a1.cadenceId);
            else onOpenAccount(a1.accountId);
          }}>
            {a1Name}
          </Glow>{" "}
          is up in {a1.right} — want a draft started so context piles up?
        </span>
      );
    }
    var a2 = aheadRows[1];
    var a2Name = acctName(accountById, a2.accountId);
    if (aheadRows.length === 2) {
      return (
        <span>
          <Glow onClick={function () {
            if (a1.cadenceId) onOpenCadenceHub(a1.accountId, a1.cadenceId);
            else onOpenAccount(a1.accountId);
          }}>
            {a1Name}
          </Glow>{" "}
          in {a1.right}, then{" "}
          <Glow onClick={function () {
            if (a2.cadenceId) onOpenCadenceHub(a2.accountId, a2.cadenceId);
            else onOpenAccount(a2.accountId);
          }}>
            {a2Name}
          </Glow>{" "}
          in {a2.right}. I can start drafts so context piles up.
        </span>
      );
    }
    return (
      <span>
        {aheadRows.length} cadences coming. Closest is{" "}
        <Glow onClick={function () {
          if (a1.cadenceId) onOpenCadenceHub(a1.accountId, a1.cadenceId);
          else onOpenAccount(a1.accountId);
        }}>
          {a1Name}
        </Glow>{" "}
        in {a1.right}.
      </span>
    );
  }

  // ── Hub carousel data ─────────────────────────────────────────────────────
  var sevenDaysAgoISO = useMemo(function () {
    return new Date(Date.now() - 7 * 86400000).toISOString();
  }, []);

  var hubActiveProjects = useMemo(function () {
    return (projects || []).filter(function (p) {
      return p.status === "in_progress" && !isProjectComplete(p);
    }).map(function (p) {
      var stages = p.tasks || [];
      var hasRecent = stages.some(function (s) { return s.completed_at && s.completed_at > sevenDaysAgoISO; });
      return Object.assign({}, p, { is_stuck: !hasRecent });
    });
  }, [projects, sevenDaysAgoISO]);

  var hubRecentWins = useMemo(function () {
    return (projects || []).filter(function (p) {
      return isProjectComplete(p) && p.updated_at && p.updated_at > sevenDaysAgoISO;
    }).map(function (p) {
      var acc = accountById[p.account_id];
      return { left: p.title || "Project", sub: acc ? acc.name : null };
    });
  }, [projects, accountById, sevenDaysAgoISO]);

  var hubTodayItems = useMemo(function () {
    var calls = todaysCalls.map(function (c) {
      return { label: c.account.name, time: c.cadence.meeting_time || null };
    });
    var sched = todaysScheduled.map(function (m) {
      var acct = accountById[m.account_id];
      return { label: acct ? acct.name : "Meeting", time: m.meeting_time || null };
    });
    return calls.concat(sched);
  }, [todaysCalls, todaysScheduled, accountById]);

  var hubUpcomingCadences = useMemo(function () {
    var today = startOfToday();
    var weekOut = new Date(today.getTime() + 7 * 86400000);
    var tomorrow = new Date(today.getTime() + 86400000);
    return (cadences || []).filter(function (c) {
      if (c.type === "task") return false;
      var next = getNextOccurrence(c, tomorrow);
      if (!next || next > weekOut) return false;
      return true;
    }).map(function (c) {
      var acct = accountById[c.account_id];
      var next = getNextOccurrence(c, tomorrow);
      var daysOut = Math.ceil((next.getTime() - today.getTime()) / 86400000);
      return { label: acct ? acct.name : "Meeting", daysOut: daysOut };
    }).sort(function (a, b) { return a.daysOut - b.daysOut; }).slice(0, 5);
  }, [cadences, accountById]);

  var cardScript = useMemo(function () {
    return buildCardScript({
      wordCommitments:  wordCommitments,
      wordWaitingOn:    wordWaitingOn,
      todayItems:       hubTodayItems,
      fireItems:        burningRows,
      activeProjects:   hubActiveProjects,
      winItems:         hubRecentWins,
      upcomingCadences: hubUpcomingCadences,
    });
  }, [wordCommitments, wordWaitingOn, hubTodayItems, burningRows, hubActiveProjects, hubRecentWins, hubUpcomingCadences]);

  var cardRefsArr = [card0Ref, card1Ref, card2Ref, card3Ref, card4Ref, card5Ref];

  function goToCard(next) {
    if (transitioningRef.current) return;
    var prev = activeCardRef.current;
    if (next === prev) return;
    transitioningRef.current = true;
    activeCardRef.current = next;
    setActiveCard(next);
    var prevEl = cardRefsArr[prev] ? cardRefsArr[prev].current : null;
    var nextEl = cardRefsArr[next] ? cardRefsArr[next].current : null;
    if (!prevEl || !nextEl) { transitioningRef.current = false; return; }
    var dir = next > prev ? 1 : -1;
    nextEl.style.transition = "none";
    nextEl.style.transform = "translateX(" + (dir * 105) + "%)";
    nextEl.style.opacity = "0";
    nextEl.getBoundingClientRect(); // force reflow
    nextEl.style.transition = "transform 0.52s cubic-bezier(0.22,1,0.36,1), opacity 0.52s ease";
    prevEl.style.transition = "transform 0.52s cubic-bezier(0.22,1,0.36,1), opacity 0.52s ease";
    nextEl.style.transform = "translateX(0)";
    nextEl.style.opacity = "1";
    prevEl.style.transform = "translateX(" + (-dir * 105) + "%)";
    prevEl.style.opacity = "0";
    setTimeout(function () { transitioningRef.current = false; }, 520);
  }
  function stepCard(dir) {
    goToCard(((activeCardRef.current + dir) + 6) % 6);
  }

  // Card anatomy style constants — defined here so they pick up live C.* tokens
  var CARD_SURFACE = {
    position: "absolute", inset: 0,
    background: C.surface, border: "1px solid " + C.rule,
    borderRadius: 16, overflow: "hidden",
  };
  var CARD_BODY  = { position: "relative", padding: "18px 18px 44px", height: "100%", boxSizing: "border-box", overflowY: "auto" };
  var CARD_HDR   = { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 };
  var CARD_LBL   = { fontFamily: MONO, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.accent };
  var BADGE      = { fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.accent, border: "1px solid " + C.accent, borderRadius: 999, padding: "1px 7px", minWidth: 20, textAlign: "center" };
  var HUB_ROW    = { display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid " + C.ruleSoft, flexWrap: "wrap" };
  var EMPTY_MSG  = { fontFamily: INTER, fontSize: 13, color: C.textMuted, lineHeight: 1.55 };
  var DONE_BTN   = { background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 6, padding: "3px 9px", fontFamily: MONO, fontSize: 10, color: C.accent, cursor: "pointer" };
  var CHASE_BTN  = { background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 6, padding: "3px 9px", fontFamily: MONO, fontSize: 10, color: C.accent, cursor: "pointer", whiteSpace: "nowrap" };

  // Card init: position all cards at mount
  useEffect(function () {
    cardRefsArr.forEach(function (ref, i) {
      if (!ref.current) return;
      ref.current.style.transition = "none";
      ref.current.style.transform = i === 0 ? "translateX(0)" : "translateX(105%)";
      ref.current.style.opacity   = i === 0 ? "1" : "0";
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation (skip inside inputs/textareas)
  useEffect(function () {
    function handleKey(e) {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft")  stepCard(-1);
      else if (e.key === "ArrowRight") stepCard(1);
    }
    window.addEventListener("keydown", handleKey);
    return function () { window.removeEventListener("keydown", handleKey); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3f: playSequence — interleaves card items + check-in questions ──
  var playSequence = useMemo(function () {
    var seq = [];
    for (var ci = 0; ci < 6; ci++) {
      seq.push({ type: "card", idx: ci });
      // After card 1 (Today), weave in any unanswered check-in questions
      if (ci === 1) {
        (checkInQuestions || []).forEach(function (q) {
          seq.push({ type: "checkin", q: q });
        });
      }
    }
    return seq;
  }, [checkInQuestions]);

  // Keep refs in sync so the rAF/interval closures see fresh values
  useEffect(function () { playSeqRef.current = playSequence; }, [playSequence]);
  useEffect(function () { cardScriptRef.current = cardScript; }, [cardScript]);

  // ── 3g: voice functions + auto-advance effect ──
  function advanceSeq(idx) {
    var seq = playSeqRef.current;
    if (idx >= seq.length) {
      setBriefPhase("done");
      briefPhaseRef.current = "done";
      return;
    }
    seqIdxRef.current = idx;
    var item = seq[idx];
    if (item.type === "card") {
      goToCard(item.idx);
      var txt = (cardScriptRef.current[item.idx] || {}).text || "";
      briefKokoro.speak(txt);
    } else {
      waitingAnswerRef.current = true;
      setWaitingForAnswer(true);
      setCurrentCheckIn(item.q);
      briefKokoro.speak(item.q.text);
    }
  }

  function startBrief() {
    briefKokoro.activate();
    setBriefPhase("playing");
    briefPhaseRef.current = "playing";
    seqIdxRef.current = 0;
    prevSpeakingRef.current = false;
    waitingAnswerRef.current = false;
    setWaitingForAnswer(false);
    setCurrentCheckIn(null);
    // slight delay so the orb activates before speech
    setTimeout(function () { advanceSeq(0); }, 200);
  }

  function replayBrief() {
    briefKokoro.activate();
    setBriefPhase("playing");
    briefPhaseRef.current = "playing";
    seqIdxRef.current = 0;
    prevSpeakingRef.current = false;
    waitingAnswerRef.current = false;
    setWaitingForAnswer(false);
    setCurrentCheckIn(null);
    goToCard(0);
    setTimeout(function () { advanceSeq(0); }, 200);
  }

  function handleVoiceCheckInAnswer(q, optId) {
    waitingAnswerRef.current = false;
    setWaitingForAnswer(false);
    setCurrentCheckIn(null);
    handleCheckInAnswer(q, optId);
    // advance to next sequence item
    advanceSeq(seqIdxRef.current + 1);
  }

  // Auto-advance: when TTS finishes a non-checkin item, move to the next
  useEffect(function () {
    var speaking = briefKokoro.speaking;
    if (briefPhaseRef.current !== "playing") {
      prevSpeakingRef.current = speaking;
      return;
    }
    if (waitingAnswerRef.current) {
      prevSpeakingRef.current = speaking;
      return;
    }
    // Detect trailing edge: was speaking, now stopped
    if (prevSpeakingRef.current && !speaking) {
      prevSpeakingRef.current = false;
      // Small delay so user can hear the last word before the card slides
      setTimeout(function () {
        if (briefPhaseRef.current === "playing" && !waitingAnswerRef.current) {
          advanceSeq(seqIdxRef.current + 1);
        }
      }, 320);
    } else {
      prevSpeakingRef.current = speaking;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefKokoro.speaking]);

  // Touch swipe on the stage
  useEffect(function () {
    var el = stageRef.current;
    if (!el) return;
    var startX = null;
    function onTouchStart(e) { startX = e.touches[0].clientX; }
    function onTouchEnd(e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      startX = null;
      if (Math.abs(dx) < 40) return;
      stepCard(dx < 0 ? 1 : -1);
    }
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend",   onTouchEnd,   { passive: true });
    return function () {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend",   onTouchEnd);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: "relative", minHeight: "100%", paddingBottom: isMobile ? 150 : 32 }}>
      <div style={{ padding: isMobile ? "16px 16px 0" : "28px 32px 0", textAlign: "center" }}>
        <div style={{
          fontFamily: SERIF, fontSize: isMobile ? 26 : 34,
          color: C.text, letterSpacing: "-0.02em", lineHeight: 1.1,
        }}>
          {timeOfDayGreeting(userName)}
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 10.5, color: C.textMuted,
          textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 6,
        }}>
          {dateLabel()}
        </div>
      </div>

      {showOnboardingCard && (
        <div style={{
          maxWidth: 600,
          margin: isMobile ? "12px 16px 0" : "16px auto 0",
          padding: "14px 16px",
          background: C.surface,
          border: "1px solid " + C.rule,
          borderLeft: "3px solid " + C.accent,
          borderRadius: 10,
        }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Pip · Just for you
          </div>
          <div style={{ fontFamily: INTER, fontSize: 14, color: C.text, lineHeight: 1.55, marginBottom: 12 }}>
            Pip would love to learn a bit about you and your world — it makes every brief, summary, and suggestion sharper.
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={onStartInterview}
              style={{
                background: C.accentDeep,
                border: "1px solid " + C.accent,
                borderRadius: 7,
                padding: "7px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: C.bg,
                fontFamily: INTER,
                cursor: "pointer",
              }}
            >
              {"Let's go →"}
            </button>
            <button
              type="button"
              onClick={onDismissOnboardingCard}
              style={{
                background: "none",
                border: "none",
                color: C.textMuted,
                fontSize: 12,
                fontFamily: INTER,
                cursor: "pointer",
                padding: "4px 0",
              }}
            >
              Maybe later
            </button>
          </div>
        </div>
      )}

      {showMondayPack && (
        <div style={{ marginTop: 16 }}>
          <MondayPackCard
            userId={userId}
            cadence={mondayCadence}
            accounts={accounts}
            profileProse={profileProse}
            facts={pipFacts}
            personName={mondayPersonName}
            isMobile={isMobile}
            onOpen={function () { onOpenPersonHub(mondayCadence); }}
          />
        </div>
      )}

      <div style={{
        position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: isMobile ? 14 : 20,
        padding: isMobile ? (operatorActive ? "16px 16px 18px" : "22px 16px 26px") : "32px 32px 36px",
      }}>
        <HexField />
        <PipOrb
          size="xxl"
          heartbeat
          state={briefPhase === "playing" ? "speaking" : undefined}
          onClick={onOpenPip}
          style={onOpenPip ? { cursor: "pointer" } : undefined}
        />
        <div style={{
          fontFamily: MONO, fontSize: 10, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.12em",
          color: C.accent,
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.4s ease 0.2s",
        }}>
          {briefPhase === "playing"
            ? (waitingForAnswer ? "✦ Pip · Check-in" : "✦ Pip · " + (cardScript[activeCard] || {}).label)
            : briefPhase === "done"
            ? "✦ Pip · Done"
            : "✦ Pip · " + (cardScript[activeCard] || {}).label}
        </div>

        {/* Start / Stop brief buttons */}
        <div style={{
          display: "flex", gap: 8, alignItems: "center", justifyContent: "center",
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.4s ease 0.25s",
        }}>
          {briefPhase === "idle" && (
            <button
              onClick={startBrief}
              style={{
                background: C.accentDeep, border: "1px solid " + C.accent,
                borderRadius: 20, padding: "7px 20px",
                fontFamily: MONO, fontSize: 11, fontWeight: 700,
                color: C.bg, cursor: "pointer",
                letterSpacing: "0.05em", textTransform: "uppercase",
              }}
            >▶ Start my day</button>
          )}
          {briefPhase === "playing" && (
            <button
              onClick={function () { briefKokoro.cancel(); setBriefPhase("idle"); briefPhaseRef.current = "idle"; waitingAnswerRef.current = false; setWaitingForAnswer(false); setCurrentCheckIn(null); }}
              style={{
                background: "none", border: "1px solid " + C.rule,
                borderRadius: 20, padding: "7px 20px",
                fontFamily: MONO, fontSize: 11, fontWeight: 700,
                color: C.textMuted, cursor: "pointer",
                letterSpacing: "0.05em", textTransform: "uppercase",
              }}
            >■ Stop</button>
          )}
        </div>

        <div style={{
          display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center",
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.4s ease 0.35s",
        }}>
          {todaysCalls.length > 0 && briefPhase === "idle" && (
          <LitPill onClick={function () {
            onOpenCadenceHub(todaysCalls[0].account.id, todaysCalls[0].cadence.id);
          }}>
            Open brief →
          </LitPill>
          )}
          <div style={{ position: "relative" }}>
            <LitPill onClick={function () { setCaptureMenuOpen(function (prev) { return !prev; }); }}>
              Quick capture +
            </LitPill>
            {captureMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  background: C.surface,
                  border: "1px solid " + C.rule,
                  borderRadius: 8,
                  boxShadow: "var(--c-overlay-shadow, 0 4px 16px rgba(0,0,0,0.3))",
                  zIndex: 120,
                  minWidth: 160,
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={function () { setCaptureMenuOpen(false); if (onOpenConversation) onOpenConversation(); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "10px 14px", fontSize: 13,
                    fontFamily: "'Inter', system-ui, sans-serif",
                    color: C.text, background: "transparent",
                    border: "none", cursor: "pointer",
                    borderBottom: "1px solid " + C.rule,
                  }}
                >
                  Log conversation
                </button>
                <button
                  onClick={function () { setCaptureMenuOpen(false); if (onOpenQuickTask) onOpenQuickTask(); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "10px 14px", fontSize: 13,
                    fontFamily: "'Inter', system-ui, sans-serif",
                    color: C.text, background: "transparent",
                    border: "none", cursor: "pointer",
                  }}
                >
                  Quick task
                </button>
                <button
                  onClick={function () { setCaptureMenuOpen(false); if (onOpenDigest) onOpenDigest(); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "10px 14px", fontSize: 13,
                    fontFamily: "'Inter', system-ui, sans-serif",
                    color: C.text, background: "transparent",
                    border: "none", cursor: "pointer",
                  }}
                >
                  Paste work digest ✦
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Hub carousel — 6 cards in a sliding stage (hidden when done) ── */}
      {briefPhase !== "done" && (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: isMobile ? "0 16px 0" : "0 0 0" }}>
        {/* Check-in overlay during voice brief */}
        {briefPhase === "playing" && waitingForAnswer && currentCheckIn && (
          <div style={{
            position: "relative", zIndex: 10,
            maxWidth: 600, margin: "0 auto 12px",
            padding: "16px",
            background: C.surface,
            border: "2px solid " + C.accent,
            borderRadius: 14,
          }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              ✦ Pip · Check-in
            </div>
            <div style={{ fontFamily: INTER, fontSize: 14, color: C.text, lineHeight: 1.55, marginBottom: 14 }}>
              {currentCheckIn.text}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(currentCheckIn.options || []).map(function (opt) {
                return (
                  <button
                    key={opt.id}
                    onClick={function () { handleVoiceCheckInAnswer(currentCheckIn, opt.id); }}
                    style={{
                      background: C.accentFaint, border: "1px solid " + C.accentLine,
                      borderRadius: 20, padding: "8px 16px",
                      fontFamily: INTER, fontSize: 13, color: C.text, cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div
          ref={stageRef}
          style={{ position: "relative", height: isMobile ? 280 : 310, overflow: "visible" }}
        >
          {/* Card 0: Your Word */}
          <div ref={card0Ref} style={{ position: "absolute", inset: 0 }}>
            <HexRingCanvas active={activeCard === 0} />
            <div className={activeCard === 0 ? "home-hub-card-active" : undefined} style={CARD_SURFACE}>
              <div style={CARD_BODY}>
                <div style={CARD_HDR}>
                  <span style={CARD_LBL}>Your Word</span>
                  {(wordCommitments.length + wordWaitingOn.length) > 0 && (
                    <span style={BADGE}>{wordCommitments.length + wordWaitingOn.length}</span>
                  )}
                </div>
                {wordCommitments.length === 0 && wordWaitingOn.length === 0 && (
                  <div style={EMPTY_MSG}>Nothing hanging — clear desk today.</div>
                )}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {wordCommitments.slice(0, 2).map(function (n) {
                    var dueLabel = n.isOverdue
                      ? Math.abs(n.daysUntilDue) + "d overdue"
                      : n.daysUntilDue === 0 ? "today" : n.daysUntilDue + "d";
                    return (
                      <div key={n.taskId} style={HUB_ROW}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</div>
                          {n.accountName && <div style={{ fontSize: 11, color: C.textMuted }}>{n.accountName}</div>}
                        </div>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: n.isOverdue ? C.red : C.yellow, flexShrink: 0 }}>{dueLabel}</span>
                        <button onClick={function () { if (onMarkNudgeDone) onMarkNudgeDone(n.taskId); }} style={DONE_BTN}>Done ✓</button>
                      </div>
                    );
                  })}
                  {wordWaitingOn.slice(0, 2).map(function (r) {
                    return (
                      <div key={r.kind + r.id} style={HUB_ROW}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>⏳ {r.who}</span>
                          <span style={{ fontSize: 12, color: C.textMuted }}> · {r.what}</span>
                        </div>
                        {r.days !== null && (
                          <span style={{ fontFamily: MONO, fontSize: 10, color: r.days > 10 ? C.red : C.yellow, flexShrink: 0 }}>{r.days}d held</span>
                        )}
                        <button
                          onClick={function () {
                            var msg = "Hi " + r.who.split(" ")[0] + " — checking in on \"" + r.what + "\"" +
                              (r.days ? " (" + r.days + " days now)" : "") + ". Where do things stand?";
                            navigator.clipboard && navigator.clipboard.writeText(msg);
                            showToast("Chase note copied");
                          }}
                          style={CHASE_BTN}
                        >Chase</button>
                      </div>
                    );
                  })}
                  {(wordCommitments.length > 2 || wordWaitingOn.length > 2) && (
                    <div style={{ fontSize: 11, color: C.textMuted, paddingTop: 6 }}>
                      {"+" + (Math.max(0, wordCommitments.length - 2) + Math.max(0, wordWaitingOn.length - 2)) + " more"}
                    </div>
                  )}
                </div>
              </div>
              <HexSignature cells={3} peak={0.13} />
            </div>
          </div>

          {/* Card 1: Today */}
          <div ref={card1Ref} style={{ position: "absolute", inset: 0 }}>
            <HexRingCanvas active={activeCard === 1} />
            <div className={activeCard === 1 ? "home-hub-card-active" : undefined} style={CARD_SURFACE}>
              <div style={CARD_BODY}>
                <div style={CARD_HDR}>
                  <span style={CARD_LBL}>Today</span>
                  {hubTodayItems.length > 0 && <span style={BADGE}>{hubTodayItems.length}</span>}
                </div>
                {hubTodayItems.length === 0 ? (
                  <div style={EMPTY_MSG}>No calls scheduled — good day to reach out.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {hubTodayItems.slice(0, 5).map(function (item, i) {
                      return (
                        <div key={i} style={HUB_ROW}>
                          <div style={{ flex: 1, fontWeight: 600, fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                          {item.time && <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, flexShrink: 0 }}>{formatTime(item.time)}</span>}
                        </div>
                      );
                    })}
                    {hubTodayItems.length > 5 && (
                      <div style={{ fontSize: 11, color: C.textMuted, paddingTop: 6 }}>{"+" + (hubTodayItems.length - 5) + " more"}</div>
                    )}
                  </div>
                )}
              </div>
              <HexSignature cells={3} peak={0.13} />
            </div>
          </div>

          {/* Card 2: Fires */}
          <div ref={card2Ref} style={{ position: "absolute", inset: 0 }}>
            <HexRingCanvas active={activeCard === 2} />
            <div className={activeCard === 2 ? "home-hub-card-active" : undefined} style={CARD_SURFACE}>
              <div style={CARD_BODY}>
                <div style={CARD_HDR}>
                  <span style={CARD_LBL}>Fires</span>
                  {burningRows.length > 0 && (
                    <span style={Object.assign({}, BADGE, { color: C.red, borderColor: C.red })}>{burningRows.length}</span>
                  )}
                </div>
                {burningRows.length === 0 ? (
                  <div style={EMPTY_MSG}>Nothing on fire — solid position.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {burningRows.slice(0, 5).map(function (row, i) {
                      return (
                        <div
                          key={row.key || i}
                          role={row.accountId ? "button" : undefined}
                          tabIndex={row.accountId ? 0 : undefined}
                          onClick={row.accountId ? function () { onOpenAccount(row.accountId); } : undefined}
                          onKeyDown={row.accountId ? function (e) { if (e.key === "Enter") onOpenAccount(row.accountId); } : undefined}
                          style={Object.assign({}, HUB_ROW, row.accountId ? { cursor: "pointer" } : {})}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.left}</div>
                            {row.sub && <div style={{ fontSize: 11, color: C.textMuted }}>{row.sub}</div>}
                          </div>
                          {row.right && (
                            <span style={{ fontFamily: MONO, fontSize: 10, color: C.red, flexShrink: 0 }}>{row.right}</span>
                          )}
                        </div>
                      );
                    })}
                    {burningRows.length > 5 && (
                      <div style={{ fontSize: 11, color: C.textMuted, paddingTop: 6 }}>{"+" + (burningRows.length - 5) + " more"}</div>
                    )}
                  </div>
                )}
              </div>
              <HexSignature cells={3} peak={0.13} />
            </div>
          </div>

          {/* Card 3: In Flight */}
          <div ref={card3Ref} style={{ position: "absolute", inset: 0 }}>
            <HexRingCanvas active={activeCard === 3} />
            <div className={activeCard === 3 ? "home-hub-card-active" : undefined} style={CARD_SURFACE}>
              <div style={CARD_BODY}>
                <div style={CARD_HDR}>
                  <span style={CARD_LBL}>In Flight</span>
                  {hubActiveProjects.length > 0 && <span style={BADGE}>{hubActiveProjects.length}</span>}
                </div>
                {hubActiveProjects.length === 0 ? (
                  <div style={EMPTY_MSG}>No active projects — start something in Gauge.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {hubActiveProjects.slice(0, 5).map(function (p, i) {
                      var acc = accountById[p.account_id];
                      return (
                        <div key={p.id || i} style={HUB_ROW}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                            {acc && <div style={{ fontSize: 11, color: C.textMuted }}>{acc.name}</div>}
                          </div>
                          {p.is_stuck && (
                            <span style={{ fontFamily: MONO, fontSize: 9, color: C.yellow, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>Stalled</span>
                          )}
                        </div>
                      );
                    })}
                    {hubActiveProjects.length > 5 && (
                      <div style={{ fontSize: 11, color: C.textMuted, paddingTop: 6 }}>{"+" + (hubActiveProjects.length - 5) + " more"}</div>
                    )}
                  </div>
                )}
              </div>
              <HexSignature cells={3} peak={0.13} />
            </div>
          </div>

          {/* Card 4: Good News */}
          <div ref={card4Ref} style={{ position: "absolute", inset: 0 }}>
            <HexRingCanvas active={activeCard === 4} />
            <div className={activeCard === 4 ? "home-hub-card-active" : undefined} style={CARD_SURFACE}>
              <div style={CARD_BODY}>
                <div style={CARD_HDR}>
                  <span style={CARD_LBL}>Good News</span>
                  {hubRecentWins.length > 0 && (
                    <span style={BADGE}>{hubRecentWins.length}</span>
                  )}
                </div>
                {hubRecentWins.length === 0 ? (
                  <div style={EMPTY_MSG}>Close something this week — it'll show here.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {hubRecentWins.slice(0, 5).map(function (w, i) {
                      return (
                        <div key={i} style={HUB_ROW}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.left}</div>
                            {w.sub && <div style={{ fontSize: 11, color: C.textMuted }}>{w.sub}</div>}
                          </div>
                          <span style={{ fontSize: 14, color: C.accent }}>✓</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <HexSignature cells={3} peak={0.13} />
            </div>
          </div>

          {/* Card 5: This Week */}
          <div ref={card5Ref} style={{ position: "absolute", inset: 0 }}>
            <HexRingCanvas active={activeCard === 5} />
            <div className={activeCard === 5 ? "home-hub-card-active" : undefined} style={CARD_SURFACE}>
              <div style={CARD_BODY}>
                <div style={CARD_HDR}>
                  <span style={CARD_LBL}>This Week</span>
                  {hubUpcomingCadences.length > 0 && <span style={BADGE}>{hubUpcomingCadences.length}</span>}
                </div>
                {hubUpcomingCadences.length === 0 ? (
                  <div style={EMPTY_MSG}>Nothing on the cadence calendar. Good time to reach out.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {hubUpcomingCadences.slice(0, 5).map(function (item, i) {
                      return (
                        <div key={i} style={HUB_ROW}>
                          <div style={{ flex: 1, fontWeight: 600, fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, flexShrink: 0 }}>
                            {item.daysOut === 1 ? "tomorrow" : item.daysOut + "d"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <HexSignature cells={3} peak={0.13} />
            </div>
          </div>
        </div>

        {/* Navigation: ‹ dots › */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18 }}>
          <button
            onClick={function () { stepCard(-1); }}
            aria-label="Previous card"
            style={{ background: "none", border: "1px solid " + C.rule, borderRadius: "50%", width: 32, height: 32, cursor: "pointer", color: C.textMuted, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >‹</button>
          {[0, 1, 2, 3, 4, 5].map(function (i) {
            return (
              <button
                key={i}
                onClick={function () { goToCard(i); }}
                aria-label={"Go to " + cardScript[i].label}
                style={{ background: "none", border: "none", padding: "4px 3px", cursor: "pointer", color: activeCard === i ? C.accent : C.rule, fontSize: 11, lineHeight: 1 }}
              >●</button>
            );
          })}
          <button
            onClick={function () { stepCard(1); }}
            aria-label="Next card"
            style={{ background: "none", border: "1px solid " + C.rule, borderRadius: "50%", width: 32, height: 32, cursor: "pointer", color: C.textMuted, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >›</button>
        </div>

        {/* What Pip said toggle */}
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button
            onClick={function () { setScriptOpen(function (p) { return !p; }); }}
            style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 10, color: C.textMuted, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 8px" }}
          >
            {scriptOpen ? "Hide Pip's read ▴" : "What Pip said ▾"}
          </button>
        </div>

        {scriptOpen && (
          <div style={{ marginTop: 8, background: C.surface, border: "1px solid " + C.rule, borderRadius: 12, overflow: "hidden" }}>
            {cardScript.map(function (card, i) {
              var isActive = i === activeCard;
              return (
                <div
                  key={i}
                  onClick={function () { goToCard(i); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={function (e) { if (e.key === "Enter") goToCard(i); }}
                  style={{
                    padding: "12px 16px",
                    borderTop: i === 0 ? "none" : "1px solid " + C.ruleSoft,
                    borderLeft: isActive ? "3px solid " + C.accent : "3px solid transparent",
                    opacity: isActive ? 1 : 0.55,
                    cursor: "pointer",
                    background: isActive ? C.accentFaint : "transparent",
                  }}
                >
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                    {card.label}
                  </div>
                  <div style={{ fontFamily: INTER, fontSize: 13, color: C.textSoft, lineHeight: 1.55 }}>
                    {card.text}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* ── 3k: Done-phase 2×3 mini-card grid ── */}
      {briefPhase === "done" && (
        <div style={{ maxWidth: 600, margin: "0 auto", padding: isMobile ? "0 16px" : "0" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
            marginBottom: 16,
          }}>
            {cardScript.map(function (card, i) {
              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={function () { setBriefPhase("idle"); briefPhaseRef.current = "idle"; goToCard(i); }}
                  onKeyDown={function (e) { if (e.key === "Enter") { setBriefPhase("idle"); briefPhaseRef.current = "idle"; goToCard(i); } }}
                  style={{
                    background: C.surface,
                    border: "1px solid " + C.rule,
                    borderRadius: 12,
                    padding: "12px 10px",
                    cursor: "pointer",
                    animation: "card-shoot 0.38s cubic-bezier(0.22,1,0.36,1) both",
                    animationDelay: (i * 0.07) + "s",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.accent, marginBottom: 6 }}>
                    {card.label}
                  </div>
                  <div style={{ fontFamily: INTER, fontSize: 11, color: C.textMuted, lineHeight: 1.45, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                    {card.text}
                  </div>
                  <HexSignature cells={3} peak={0.13} />
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: "center", paddingBottom: 8 }}>
            <button
              onClick={replayBrief}
              style={{
                background: "none", border: "1px solid " + C.rule,
                borderRadius: 20, padding: "7px 20px",
                fontFamily: MONO, fontSize: 11, fontWeight: 700,
                color: C.textMuted, cursor: "pointer",
                letterSpacing: "0.05em", textTransform: "uppercase",
              }}
            >↺ Replay</button>
          </div>
        </div>
      )}

      {teamSheetDirty.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, flexWrap: "wrap",
          padding: isMobile ? "12px 14px" : "14px 16px",
          marginBottom: 12,
          background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 12,
        }}>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, flex: 1, minWidth: 0 }}>
            <b>{teamSheetDirty.length}</b> update{teamSheetDirty.length === 1 ? " isn't" : "s aren't"} on the team sheet yet — copy {teamSheetDirty.length === 1 ? "it" : "them"} before the meeting?
          </div>
          <button
            onClick={copyTeamSheetDirty}
            style={{
              background: C.accent, color: "#fff", border: "none", borderRadius: 8,
              padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              fontFamily: "'Inter', system-ui, sans-serif", flexShrink: 0,
            }}
          >Copy rows</button>
        </div>
      )}

      {wrap && (
        <div style={{ marginBottom: 12 }}>
          <InfoCard label="✦ Pip Wrap · this week" accent={C.accent}>
            {wrap.isQuiet ? (
              <div style={{ fontSize: 13.5, color: C.textSub, lineHeight: 1.5 }}>
                Quiet week — nothing major moved. Sometimes that's the read.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>
                <div>
                  <b>{wrap.commitmentsKept}</b> promise{wrap.commitmentsKept === 1 ? "" : "s"} kept
                  {wrap.commitmentsSlipped > 0 && <span style={{ color: C.yellow }}> · {wrap.commitmentsSlipped} slipped</span>}
                  {" · "}<b>{wrap.touched.length}</b> account{wrap.touched.length === 1 ? "" : "s"} met
                  {" · "}<b>{wrap.moved.length}</b> project{wrap.moved.length === 1 ? "" : "s"} moved
                </div>
                {wrap.touched.length > 0 && (
                  <div style={{ fontSize: 12.5, color: C.textSub }}>
                    <span style={{ color: C.textMuted }}>Met with:</span> {wrap.touched.map(function (t) { return t.name; }).join(", ")}
                  </div>
                )}
                {wrap.moved.length > 0 && (
                  <div style={{ fontSize: 12.5, color: C.textSub }}>
                    <span style={{ color: C.textMuted }}>Moved:</span> {wrap.moved.map(function (m) { return m.title; }).join(", ")}
                  </div>
                )}
                {wrap.neglected.length > 0 && (
                  <div style={{ fontSize: 12.5, color: C.textSub }}>
                    <span style={{ color: C.textMuted }}>Went quiet:</span> {wrap.neglected.map(function (n) { return n.name + (n.days ? " (" + n.days + "d)" : ""); }).join(", ")}
                  </div>
                )}
              </div>
            )}

            {wrapCandidates.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em" }}>WINS TO LOG</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {wrapCandidates.slice(0, 6).map(function (c) {
                    return (
                      <button
                        key={c.ref}
                        onClick={function () { logCandidateWin(c); }}
                        style={{
                          background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 14,
                          padding: "5px 11px", fontSize: 12, color: C.text, cursor: "pointer",
                          fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 280,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                      >✦ {c.title}</button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              {wrapTake ? (
                <div style={{
                  fontSize: 13.5, color: C.text, lineHeight: 1.6, fontStyle: "italic",
                  borderLeft: "2px solid " + C.accentLine, paddingLeft: 12,
                }}>{wrapTake}</div>
              ) : (
                <button
                  onClick={askWrapTake}
                  disabled={wrapTakeLoading || (wrap && wrap.isQuiet)}
                  style={{
                    background: "transparent", border: "1px solid " + C.accentLine, borderRadius: 8,
                    padding: "7px 14px", fontSize: 12.5, fontWeight: 600,
                    color: wrap && wrap.isQuiet ? C.textMuted : C.accent,
                    cursor: wrapTakeLoading || (wrap && wrap.isQuiet) ? "default" : "pointer",
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}
                >{wrapTakeLoading ? "Pip's thinking…" : "✦ Pip's take on the week"}</button>
              )}
            </div>
          </InfoCard>
        </div>
      )}

      {operatorLoaded && !operatorActive && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, flexWrap: "wrap",
          padding: isMobile ? "12px 14px" : "14px 16px",
          marginBottom: 12,
          background: C.surface, border: "1px solid " + C.rule, borderRadius: 12,
        }}>
          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.4, flex: 1, minWidth: 0 }}>
            Pip hasn't worked your book today. Run his pass for a prioritized morning read.
          </div>
          <OperatorRunButton onDone={refetchOperator} hasReport={false} />
        </div>
      )}

      {operatorActive && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <OperatorRunButton onDone={refetchOperator} hasReport={true} />
        </div>
      )}

      {operatorActive && (
        <OperatorHub
          report={operatorReport}
          drafts={operatorDrafts}
          accounts={accounts}
          isMobile={isMobile}
          mounted={mounted}
          onOpenAccount={onOpenAccount}
          linkify={makeAccountLinkify(accounts, onOpenAccount)}
        />
      )}

      {/* Teach Pip — persistent entry to the Catch Up session even when no
          question is queued (the session can generate fresh ones on demand). */}
      {!dripQuestion && onOpenCatchUp && (
        <div style={{ maxWidth: 600, margin: isMobile ? "0 16px 12px" : "0 auto 12px" }}>
          <button
            onClick={onOpenCatchUp}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              background: C.surface, border: "1px solid " + C.rule,
              borderLeft: "2px solid " + C.accent, borderRadius: 12,
              padding: "12px 16px", cursor: "pointer", textAlign: "left",
            }}
          >
            <span style={{ flexShrink: 0, display: "inline-flex" }}><PipOrb size="sm" isStatic /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 600, color: C.text }}>
                Teach Pip about your world
              </div>
              <div style={{ fontFamily: INTER, fontSize: 12, color: C.textMuted, marginTop: 1 }}>
                Answer a few questions to sharpen every brief — Pip can keep going as long as you like.
              </div>
            </div>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
              Start →
            </span>
          </button>
        </div>
      )}

      {/* Drip question card — suppressed when the operator report runs the
          morning (the check-in is the conversation that matters then). */}
      {!operatorActive && dripQuestion && (
        <div style={{
          maxWidth: 600,
          margin: isMobile ? "0 16px 12px" : "0 auto 12px",
          padding: "16px",
          background: C.surface,
          border: "1px solid " + C.rule,
          borderLeft: "3px solid " + C.accent,
          borderRadius: 12,
        }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            {"Pip's Curious"}
          </div>
          <div style={{ fontFamily: INTER, fontSize: 14, color: C.text, lineHeight: 1.55, marginBottom: 12 }}>
            {dripQuestion.question_text}
          </div>
          {dripQuestion.suggestion && dripQuestion.suggestion.guess && !dripAnswer.trim() && (
            <button
              type="button"
              disabled={dripSaving}
              onClick={function () {
                if (dripSaving) return;
                setDripSaving(true);
                var text = dripQuestion.suggestion.guess;
                var willApply = !dripApplyOff && onApplySuggestion;
                var p = onAnswerDrip ? onAnswerDrip(dripQuestion.id, text) : Promise.resolve();
                (p || Promise.resolve()).then(function () {
                  if (willApply) onApplySuggestion(dripQuestion.suggestion, text);
                  setDripSaving(false);
                  setDripApplyOff(false);
                  showToast("Locked in ✦ Pip reads it that way everywhere now");
                }).catch(function () { setDripSaving(false); });
              }}
              style={{
                display: "block", marginBottom: 10,
                background: C.accentFaint, border: "1px solid " + C.accentLine,
                borderRadius: 8, padding: "8px 14px",
                fontSize: 13, fontWeight: 700, color: C.accent,
                fontFamily: INTER, cursor: "pointer", textAlign: "left",
              }}
            >
              ✓ Right — lock it in
            </button>
          )}
          <textarea
            value={dripAnswer}
            onChange={function (e) { setDripAnswer(e.target.value); }}
            placeholder="Your answer…"
            rows={2}
            style={{
              width: "100%",
              fontSize: 16,
              fontFamily: INTER,
              color: C.text,
              background: C.bg,
              border: "1px solid " + C.rule,
              borderRadius: 7,
              padding: "9px 12px",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
              lineHeight: 1.5,
              marginBottom: 10,
            }}
          />
          {dripQuestion.suggestion && suggestionLabel(dripQuestion.suggestion) && onApplySuggestion && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={!dripApplyOff}
                onChange={function (e) { setDripApplyOff(!e.target.checked); }}
                style={{ accentColor: C.accent, width: 15, height: 15 }}
              />
              <span style={{ fontFamily: INTER, fontSize: 12, color: C.accent }}>
                {suggestionLabel(dripQuestion.suggestion)}
              </span>
            </label>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              disabled={!dripAnswer.trim() || dripSaving}
              onClick={function () {
                if (!dripAnswer.trim() || dripSaving) return;
                setDripSaving(true);
                var text = dripAnswer.trim();
                var willApply = dripQuestion.suggestion && !dripApplyOff && onApplySuggestion;
                var p = onAnswerDrip ? onAnswerDrip(dripQuestion.id, text) : Promise.resolve();
                (p || Promise.resolve()).then(function () {
                  if (willApply) onApplySuggestion(dripQuestion.suggestion, text);
                  setDripSaving(false);
                  setDripAnswer("");
                  setDripApplyOff(false);
                }).catch(function () { setDripSaving(false); });
              }}
              style={{
                background: C.accentDeep,
                border: "1px solid " + C.accent,
                borderRadius: 7,
                padding: "7px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: C.bg,
                fontFamily: INTER,
                cursor: dripAnswer.trim() && !dripSaving ? "pointer" : "not-allowed",
                opacity: dripAnswer.trim() && !dripSaving ? 1 : 0.5,
              }}
            >
              {dripSaving ? "Saving…" : "Answer"}
            </button>
            <button
              type="button"
              onClick={function () { setDripAnswer(""); setDripSaving(false); if (onSkipDrip) onSkipDrip(dripQuestion.id); }}
              style={{
                background: "none", border: "none",
                color: C.textMuted, fontSize: 12,
                fontFamily: INTER, cursor: "pointer", padding: "4px 0",
              }}
            >
              Skip
            </button>
            <button
              type="button"
              onClick={function () { setDripAnswer(""); setDripSaving(false); if (onDismissDrip) onDismissDrip(dripQuestion.id); }}
              style={{
                background: "none", border: "none",
                color: C.textMuted, fontSize: 12,
                fontFamily: INTER, cursor: "pointer", padding: "4px 0",
              }}
            >
              Not now
            </button>
            {dripQueueCount > 1 && onOpenCatchUp && (
              <button
                type="button"
                onClick={onOpenCatchUp}
                style={{
                  marginLeft: "auto", background: "none", border: "none",
                  color: C.accent, fontSize: 12, fontWeight: 600,
                  fontFamily: INTER, cursor: "pointer", padding: "4px 0",
                }}
              >
                {"+" + (dripQueueCount - 1) + " more · Catch up →"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Throttled-but-queued: daily drip is quiet, but let the user power
          through the rest whenever they want. Suppressed when the operator
          report runs the morning (the check-in is the conversation then). */}
      {!operatorActive && !dripQuestion && dripQueueCount > 0 && onOpenCatchUp && (
        <div style={{
          maxWidth: 600,
          margin: isMobile ? "0 16px 12px" : "0 auto 12px",
          padding: "11px 14px",
          background: C.surface,
          border: "1px solid " + C.rule,
          borderLeft: "3px solid " + C.accent,
          borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          <div style={{ fontFamily: INTER, fontSize: 13, color: C.textSub }}>
            Pip's got {dripQueueCount} thing{dripQueueCount !== 1 ? "s" : ""} he's curious about.
          </div>
          <button
            type="button"
            onClick={onOpenCatchUp}
            style={{
              background: "none", border: "none", color: C.accent,
              fontSize: 12, fontWeight: 600, fontFamily: INTER,
              cursor: "pointer", padding: "4px 0", whiteSpace: "nowrap",
            }}
          >
            Catch up →
          </button>
        </div>
      )}


      {/* Draft-ahead — duplicate of OperatorHub's draft rows when the report
          is active, so it only renders on fallback mornings. */}
      {!operatorActive && draftAhead.length > 0 && (
        <div style={{
          maxWidth: 600,
          margin: isMobile ? "0 16px 12px" : "0 auto 12px",
        }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Pip drafted these follow-ups
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {draftAhead.map(function (m) {
              var acct = accountById[m.account_id];
              return (
                <div
                  key={m.id}
                  style={{
                    background: C.surface,
                    border: "1px solid " + C.rule,
                    borderLeft: "3px solid " + C.accent,
                    borderRadius: 10,
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {acct ? acct.name : "Account"}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginTop: 2, letterSpacing: "0.04em" }}>
                      Follow-up ready · last met {m.meeting_date ? fmtShort(m.meeting_date) : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={function () {
                        try {
                          navigator.clipboard.writeText(m.pip_email || "");
                          showToast("Follow-up copied", "success");
                        } catch (_) { /* ignore */ }
                      }}
                      style={{
                        background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 7,
                        padding: "5px 11px", color: C.accent, fontFamily: INTER, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Copy
                    </button>
                    <a
                      href={"mailto:?body=" + encodeURIComponent(m.pip_email || "")}
                      style={{
                        background: "transparent", border: "1px solid " + C.rule, borderRadius: 7,
                        padding: "5px 11px", color: C.textMuted, fontFamily: INTER, fontSize: 12, fontWeight: 600,
                        cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center",
                      }}
                    >
                      Mail
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editingNudgeTask && (
        <Suspense fallback={null}>
          <AddItemModal
            existing={editingNudgeTask}
            userId={userId}
            userEmail={userEmail}
            accountId={editingNudgeTask.account_id || null}
            members={[]}
            accounts={accounts}
            onSave={function (id, fields) {
              return onUpdateItem ? onUpdateItem(id, fields) : Promise.resolve();
            }}
            onDelete={function (id) {
              if (onDeleteItem) onDeleteItem(id);
              setEditingNudgeTask(null);
            }}
            onClose={function () { setEditingNudgeTask(null); }}
          />
        </Suspense>
      )}

      {isMobile && (
        <div style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 78px)",
          padding: "10px 12px 12px",
          background: C.bg,
          borderTop: "1px solid " + C.rule,
          boxShadow: "0 -8px 18px -10px rgba(0,0,0,0.5)",
          display: "flex", gap: 8, zIndex: 49,
        }}>
          <button
            onClick={function () { if (onOpenConversation) onOpenConversation(); }}
            style={{
              flex: 1, background: C.surface,
              border: "1px solid " + C.rule, borderRadius: 8,
              padding: "11px 12px", color: C.textSoft,
              fontFamily: INTER, fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Touchpoint
          </button>
          <button
            onClick={function () { if (onOpenQuickTask) onOpenQuickTask(); }}
            style={{
              flex: 1, background: C.surface,
              border: "1px solid " + C.rule, borderRadius: 8,
              padding: "11px 12px", color: C.textSoft,
              fontFamily: INTER, fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Task
          </button>
        </div>
      )}
    </div>
  );
}
