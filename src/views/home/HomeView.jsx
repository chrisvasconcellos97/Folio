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
import { CheckInCard } from "./CheckInCard";
import { generateCheckInQuestions } from "../../lib/checkIn";
import { callPortfolioBriefPip } from "../../lib/pip";
import { isProjectComplete } from "../../lib/gaugeStatus";
import { suggestionLabel } from "../pip/PipCatchUp";
import { showToast } from "../../components/Toast";
import { HexField } from "../../lib/hexMotif";
import { fmtShort } from "../../lib/dateUtils";
import { InfoCard } from "../../components/InfoCard";
import { usePipTTS } from "../../lib/usePipTTS";

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

export function HomeView({ userName, userId, userEmail, accounts, meetings, items, cadences, projects, contacts, themes, showOnboardingCard, dripQuestion, dripQueueCount, commitmentNudges, pipFacts, profileProse, scheduledMeetings, handlers }) {
  // All callback props arrive grouped in one `handlers` bag (Batch 8 — prop-
  // sprawl reduction). Re-expanded to locals here so the many internal call
  // sites (onOpenAccount ×17, onOpenCadenceHub ×14, …) stay byte-for-byte
  // unchanged; behavior is identical.
  var onOpenAccount          = handlers.onOpenAccount;
  var onOpenAccountTab       = handlers.onOpenAccountTab;
  var onOpenCadenceHub       = handlers.onOpenCadenceHub;
  var onOpenConversation     = handlers.onOpenConversation;
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
  var onOpenDigest           = handlers.onOpenDigest;
  var onOpenScheduled        = handlers.onOpenScheduled;
  var onOpenCommitments      = handlers.onOpenCommitments;

  commitmentNudges = commitmentNudges || [];
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
  var briefTTS = usePipTTS();

  function handleReadBrief() {
    if (!briefTTS.supported) return;
    if (briefTTS.speaking) {
      briefTTS.cancel();
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
    briefTTS.speak(text);
  }

  // Manual "refresh brief" — clears today's cached brief and re-fires the
  // generation effect (bumping briefNonce). Lets the user rebuild a brief that
  // looks off without waiting for tomorrow.
  function refreshBrief() {
    if (briefLoading) return;
    var todayStr = new Date().toISOString().slice(0, 10);
    try { localStorage.removeItem("folio_daily_brief_v10_" + userId + "_" + todayStr); } catch (_) { /* ignore */ }
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
  var { report: operatorReport, drafts: operatorDrafts, loaded: operatorLoaded } = useOperatorReport(userId);
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
    var cacheKey = "folio_daily_brief_v10_" + userId + "_" + todayStr;

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
        return Object.assign({}, s, {
          account_name: acc ? acc.name : "Unknown",
          overdue_items: (overdueByAccount[s.account_id] || []).slice(0, 3),
          tier: acc ? acc.tier : null,
          objective: (acc && isFlagged) ? (acc.objective || null) : null,
        });
      });

      var sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      var activeProjects = (projects || []).filter(function (p) {
        return p.status === "in_progress";
      }).map(function (p) {
        var stages = p.stages || [];
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

      // Cold accounts — healthy/watching accounts with no contact in 30+ days (cap 5)
      var coldAccounts = (accounts || []).filter(function (a) {
        if (a.is_inactive) return false;
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
  }, [cadences, meetings, accounts, accountById]);

  // Hero line stays SHORT and accurate — Pip's at-a-glance read. The detailed,
  // Pip-voiced headline lives in the operator report card below, so we don't
  // repeat it up here.
  var heroLine = pickHeroLine({
    calls: todaysCalls.length + todaysScheduled.length,
    overdue: burningRows.filter(function (r) { return r.kind === "item"; }).length,
    cold: burningRows.filter(function (r) { return r.kind === "cold"; }).length,
    commitments: commitmentNudges.length,
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
          at <strong style={{ color: C.text, fontWeight: 600 }}>{firstT}</strong>. I'll prep you.
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
          at {secondT}. I'll prep both.
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

  var callsPanel   = <Panel title="Today's Calls" accent={C.accent}>{todaysCallsBrief()}</Panel>;
  var burningPanel = <Panel title="Burning"       accent={C.red}>{burningBrief()}</Panel>;
  var loosePanel   = <Panel title="Loose Ends"    accent={C.yellow}>{looseEndsBrief()}</Panel>;
  var aheadPanel   = <Panel title="Ahead"         accent={C.accent}>{aheadBrief()}</Panel>;

  var mobileOrder  = [burningPanel, callsPanel, loosePanel, aheadPanel];
  var desktopOrder = [callsPanel, burningPanel, loosePanel, aheadPanel];

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

      <div style={{
        position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: isMobile ? 14 : 20,
        padding: isMobile ? (operatorActive ? "16px 16px 18px" : "22px 16px 26px") : "32px 32px 36px",
      }}>
        <HexField />
        <PipOrb size="xxl" heartbeat />
        {!operatorActive && (
        <div style={{
          fontFamily: SERIF, fontSize: isMobile ? 18 : 22,
          color: C.text, lineHeight: 1.45, letterSpacing: "-0.01em",
          textAlign: "center", maxWidth: 580,
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.4s ease 0.2s",
        }}>
          {heroLine}
        </div>
        )}
        <div style={{
          display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center",
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.4s ease 0.35s",
        }}>
          {todaysCalls.length > 0 && (
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

      <CheckInCard
        questions={checkInQuestions}
        receipts={checkInReceipts}
        onAnswer={handleCheckInAnswer}
        isMobile={isMobile}
      />

      {/* Scheduled Today — concrete one-off meetings on the calendar. Moved up
          to lead the day's commitments (above the drip queue). Always relevant,
          so NO operator guard — a scheduled meeting matters regardless. */}
      {todaysScheduled.length > 0 && (
        <InfoCard
          label="Scheduled Today"
          count={todaysScheduled.length}
          sig={false}
          style={{ maxWidth: 600, margin: isMobile ? "0 16px 12px" : "0 auto 12px" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {todaysScheduled.map(function (m) {
              var acct = accountById[m.account_id];
              var time = m.meeting_time ? formatTime(m.meeting_time) : null;
              var methodLabel = { phone: "Phone", in_person: "In Person", video: "Video", email: "Email" }[m.method] || (m.method || "Meeting");
              return (
                <div
                  key={m.id}
                  onClick={function () { if (onOpenScheduled) onOpenScheduled(m); }}
                  role={onOpenScheduled ? "button" : undefined}
                  tabIndex={onOpenScheduled ? 0 : undefined}
                  onKeyDown={function (e) {
                    if ((e.key === "Enter" || e.key === " ") && onOpenScheduled) { e.preventDefault(); onOpenScheduled(m); }
                  }}
                  style={{
                    background: C.bg,
                    border: "1px solid " + C.rule,
                    borderLeft: "3px solid " + C.accent,
                    borderRadius: 10,
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    cursor: onOpenScheduled ? "pointer" : "default",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {acct ? acct.name : "Meeting"}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginTop: 2, letterSpacing: "0.04em" }}>
                      {methodLabel}{time ? " · " + time : ""}
                    </div>
                    {m.agenda && (
                      <div style={{ fontFamily: INTER, fontSize: 11, color: C.textMuted, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.agenda}
                      </div>
                    )}
                  </div>
                  {onOpenScheduled && (
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
                      Open →
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </InfoCard>
      )}

      {/* ── Your word (Phase 1.5) — what you owe people + what they owe you.
          The keeper-of-his-word surface; commitments lost their nav slot to
          Pip (item 43) and live here instead. Items with a live check-in
          question this morning are suppressed here (check-in wins, item 47). ── */}
      {(wordCommitments.length > 0 || wordWaitingOn.length > 0) && (
        <InfoCard
          label="✦ Your word"
          accent={C.yellow}
          sig={false}
          style={{ maxWidth: 600, margin: isMobile ? "0 16px 12px" : "0 auto 12px", borderLeftWidth: 3 }}
        >
          {wordCommitments.length > 0 && (
            <div style={{ marginBottom: wordWaitingOn.length ? 12 : 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 7 }}>
                You owe ({wordCommitments.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {wordCommitments.slice(0, 3).map(function (n) {
                  var dueLabel = n.isOverdue
                    ? Math.abs(n.daysUntilDue) + "d overdue"
                    : n.daysUntilDue === 0 ? "due today"
                    : n.daysUntilDue === 1 ? "due tomorrow"
                    : "due in " + n.daysUntilDue + "d";
                  return (
                    <div key={n.taskId} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 180, fontSize: 13, color: C.text }}>
                        {n.title}
                        {n.accountName ? <span style={{ color: C.textMuted, fontSize: 12 }}>{" · " + n.accountName}</span> : null}
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: n.isOverdue ? C.red : C.yellow, whiteSpace: "nowrap", fontFeatureSettings: '"tnum"' }}>
                        {dueLabel}
                      </span>
                      <button
                        onClick={function () { if (onMarkNudgeDone) onMarkNudgeDone(n.taskId); }}
                        style={{ background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 6, padding: "3px 10px", fontFamily: MONO, fontSize: 10.5, color: C.accent, cursor: "pointer" }}
                      >
                        Done ✓
                      </button>
                      <button
                        onClick={function () { if (onSnoozeNudge) onSnoozeNudge(n.taskId); }}
                        style={{ background: "none", border: "1px solid " + C.rule, borderRadius: 6, padding: "3px 10px", fontFamily: MONO, fontSize: 10.5, color: C.textMuted, cursor: "pointer" }}
                      >
                        Snooze
                      </button>
                      <button
                        onClick={function () {
                          var task = (items || []).find(function (i) { return i.id === n.taskId; });
                          if (task) setEditingNudgeTask(task);
                        }}
                        style={{ background: "none", border: "1px solid " + C.rule, borderRadius: 6, padding: "3px 10px", fontFamily: MONO, fontSize: 10.5, color: C.textMuted, cursor: "pointer" }}
                      >
                        Edit
                      </button>
                    </div>
                  );
                })}
                {wordCommitments.length > 3 && (
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted }}>
                    {"+" + (wordCommitments.length - 3) + " more"}
                  </span>
                )}
              </div>
            </div>
          )}

          {wordWaitingOn.length > 0 && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 7 }}>
                ⏳ They owe you ({wordWaitingOn.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {wordWaitingOn.map(function (r) {
                  var acct = r.accountId ? accountById[r.accountId] : null;
                  return (
                    <div key={r.kind + r.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{r.who}</span>
                        <span style={{ fontSize: 12.5, color: C.textSoft }}> · {r.what}</span>
                        {acct && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={function () { onOpenAccount(acct.id); }}
                            onKeyDown={function (e) { if (e.key === "Enter") onOpenAccount(acct.id); }}
                            style={{ fontSize: 11.5, color: C.accent, cursor: "pointer", marginLeft: 6 }}
                          >
                            {acct.name}
                          </span>
                        )}
                      </div>
                      {r.days !== null && (
                        <span style={{
                          fontFamily: MONO, fontSize: 10, fontFeatureSettings: '"tnum"',
                          color: r.days > 10 ? C.red : C.yellow, whiteSpace: "nowrap",
                        }}>
                          {r.days}d held
                        </span>
                      )}
                      <button
                        onClick={function () {
                          var msg = "Hi " + r.who.split(" ")[0] + " — checking in on \"" + r.what + "\"" +
                            (r.days ? " (with you for " + r.days + " days now)" : "") +
                            ". Where do things stand? Anything you need from me to move it? Thanks!";
                          navigator.clipboard && navigator.clipboard.writeText(msg);
                          showToast("Chase note copied — paste into email or Teams");
                        }}
                        style={{
                          background: C.accentFaint, border: "1px solid " + C.accentLine,
                          borderRadius: 6, padding: "3px 10px",
                          fontSize: 10.5, color: C.accent, fontFamily: MONO,
                          cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        Copy chase
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* See all → CommitmentsView (the full list is otherwise unreachable
              on mobile — item 3). */}
          {onOpenCommitments && (
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button
                type="button"
                onClick={onOpenCommitments}
                style={{
                  background: "none", border: "none", color: C.yellow,
                  fontFamily: MONO, fontSize: 10, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  cursor: "pointer", padding: 0,
                }}
              >
                See all →
              </button>
            </div>
          )}
        </InfoCard>
      )}

      {/* Calls today — real scheduling (with times) the operator report doesn't
          carry. Shown inside the hub since the four narrative panels below are
          suppressed when the operator report is active. */}
      {operatorActive && todaysCalls.length > 0 && (
        <div style={{
          maxWidth: 980, margin: "0 auto",
          padding: isMobile ? "0 12px 14px" : "0 32px 14px",
          opacity: mounted ? 1 : 0, transition: "opacity 0.4s ease 0.45s",
        }}>
          <div style={{
            background: C.surface, border: "1px solid " + C.rule, borderRadius: 14, overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
              background: C.accentFaint, borderBottom: "1px solid " + C.rule,
            }}>
              <span style={{ color: C.accent, fontSize: 11, lineHeight: 1 }}>◷</span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: C.accent }}>
                On the Calendar
              </span>
              <span style={{
                marginLeft: "auto", fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.accent,
                minWidth: 18, textAlign: "center", border: "1px solid " + C.accent, borderRadius: 999, padding: "1px 7px",
              }}>
                {todaysCalls.length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {todaysCalls.map(function (call, i) {
                var t = call.cadence.meeting_time ? formatTime(call.cadence.meeting_time) : "—";
                return (
                  <div
                    key={call.cadence.id}
                    onClick={function () { onOpenCadenceHub(call.account.id, call.cadence.id); }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenCadenceHub(call.account.id, call.cadence.id); } }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "11px 14px", cursor: "pointer",
                      borderTop: i === 0 ? "none" : "1px solid " + C.ruleSoft,
                    }}
                  >
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", flexShrink: 0, minWidth: 52 }}>{t}</span>
                    <span style={{ fontFamily: INTER, fontSize: 14, fontWeight: 600, color: C.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{call.account.name}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>Prep →</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!operatorActive && (dailyBrief || briefLoading) && (
        <div style={{
          padding: isMobile ? "0 12px 12px" : "0 32px 12px",
          maxWidth: 980, margin: "0 auto",
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.4s ease 0.4s",
        }}>
          <div style={{
            background: C.surface,
            border: "1px solid " + C.rule,
            borderLeft: "2px solid " + C.accent,
            borderRadius: 12,
            padding: "14px 16px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{
                fontFamily: MONO, fontSize: 10, color: C.accent,
                fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
              }}>
                Pip · Daily Brief
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {/* Read aloud */}
                {!briefLoading && dailyBrief && (
                  <button
                    onClick={handleReadBrief}
                    title={briefTTS.speaking ? "Stop reading" : "Read aloud"}
                    aria-label={briefTTS.speaking ? "Stop reading brief" : "Read brief aloud"}
                    style={{
                      background: "none", border: "none", padding: 4, margin: -4,
                      cursor: "pointer",
                      color: briefTTS.speaking ? C.accent : C.textMuted,
                      opacity: 0.85,
                      display: "inline-flex", alignItems: "center",
                    }}
                  >
                    {briefTTS.speaking ? (
                      /* stop square */
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <rect x="4" y="4" width="16" height="16" rx="2"/>
                      </svg>
                    ) : (
                      /* speaker / play icon */
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                      </svg>
                    )}
                  </button>
                )}
                {/* Refresh */}
                <button
                  onClick={function () { briefTTS.cancel(); refreshBrief(); }}
                  disabled={briefLoading}
                  title="Refresh brief"
                  aria-label="Refresh brief"
                  style={{
                    background: "none", border: "none", padding: 4, margin: -4,
                    cursor: briefLoading ? "default" : "pointer",
                    color: C.textMuted, opacity: briefLoading ? 0.45 : 0.8,
                    display: "inline-flex", alignItems: "center",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                       style={briefLoading ? { animation: "fol-spin 0.9s linear infinite" } : undefined}>
                    <path d="M13.5 8a5.5 5.5 0 1 1-1.7-3.97" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M13.7 3v2.6h-2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
            {briefLoading
              ? <div style={{ fontFamily: INTER, fontSize: 14, color: C.textMuted, lineHeight: 1.6 }}>Pip is thinking…</div>
              : (
                <div>
                  <MarkdownText
                    text={dailyBrief}
                    linkify={makeAccountLinkify(accounts, onOpenAccount)}
                    style={{ fontFamily: INTER, fontSize: 14, color: C.textSoft, lineHeight: 1.7 }}
                  />
                  {briefCallouts && briefCallouts.length > 0 && (
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
                      {briefCallouts.map(function (c, i) {
                        var acc = (accounts || []).find(function (a) { return a.name === c.account_name; });
                        // Priority dot color
                        var dotColor = c.priority === "now" ? C.red
                          : c.priority === "this_week" ? C.yellow
                          : C.textMuted;
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                            {/* Priority dot */}
                            <span style={{ color: dotColor, fontSize: 14, lineHeight: 1, flexShrink: 0 }}>•</span>
                            {/* Major tier badge */}
                            {c.tier === "major" && (
                              <span style={{ fontFamily: MONO, fontSize: 9, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>[M]</span>
                            )}
                            {/* Account name — clickable if we can find it */}
                            {c.account_name && (acc
                              ? <Glow onClick={function () { onOpenAccount(acc.id); }}>{c.account_name}</Glow>
                              : <span style={{ fontFamily: INTER, fontSize: 13, color: C.accent }}>{c.account_name}</span>
                            )}
                            {/* Action verb — bold */}
                            {c.action && (
                              <span style={{ fontFamily: INTER, fontSize: 13, color: C.text, fontWeight: 600 }}>→ {c.action}</span>
                            )}
                            {/* Reason */}
                            {c.reason && (
                              <span style={{ fontFamily: INTER, fontSize: 13, color: C.textMuted }}>— {c.reason}</span>
                            )}
                            {/* Specific item */}
                            {c.item && (
                              <span style={{ fontFamily: INTER, fontSize: 13, color: C.textMuted, fontStyle: "italic" }}>· "{c.item}"</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )
            }
          </div>
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

      {/* Narrative panels — the fallback hub when the nightly operator report
          hasn't run. When the operator report IS active, its structured section
          cards cover this ground, so we suppress the panels to avoid a long,
          duplicative scroll. */}
      {!operatorActive && (
        <div style={{
          padding: isMobile ? "0 12px 16px" : "0 32px 24px",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 10 : 14,
          maxWidth: 980, margin: "0 auto",
        }}>
          {(isMobile ? mobileOrder : desktopOrder).map(function (panel, i) {
            return (
              <div
                key={i}
                style={{
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? "translateY(0)" : "translateY(6px)",
                  transition: "opacity 0.32s ease " + (0.45 + i * 0.08) + "s, transform 0.32s ease " + (0.45 + i * 0.08) + "s",
                }}
              >
                {panel}
              </div>
            );
          })}
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
