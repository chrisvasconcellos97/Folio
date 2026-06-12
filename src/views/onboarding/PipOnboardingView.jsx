import { useState, useEffect } from "react";
import { C } from "../../lib/colors.js";
import { PipOrb } from "../../components/PipMark.jsx";
import { showToast } from "../../components/Toast.jsx";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

export function PipOnboardingView({ userId, profileApi, accessToken, onDone, onSkip }) {
  var [questions, setQuestions]       = useState([]);
  var [currentIdx, setCurrentIdx]     = useState(0);
  var [answer, setAnswer]             = useState("");
  var [answers, setAnswers]           = useState({}); // { questionId: text }
  var [synthesizing, setSynthesizing] = useState(false);
  var [loadingQs, setLoadingQs]       = useState(true);

  useEffect(function () {
    if (!userId) return;
    // Load existing bank questions or seed them fresh
    profileApi.loadBankQuestions().then(function (qs) {
      if (qs.length === 0) {
        return profileApi.seedBankQuestions();
      }
      return qs;
    }).then(function (qs) {
      setQuestions(qs);
      // Find the first unanswered question index
      var firstUnanswered = qs.findIndex(function (q) { return q.status !== "answered"; });
      setCurrentIdx(firstUnanswered >= 0 ? firstUnanswered : 0);
      // Pre-fill any already-answered questions
      var pre = {};
      qs.forEach(function (q) { if (q.status === "answered" && q.answer_text) pre[q.id] = q.answer_text; });
      setAnswers(pre);
      setLoadingQs(false);
    }).catch(function () { setLoadingQs(false); });

    // Mark in_progress — but never downgrade a profile that already finished.
    // Without this guard, a stray mount (e.g. a load-time flash) would overwrite
    // a "done" status with "in_progress", which routing treats as pending and
    // would re-trap a completed user in the interview permanently.
    var existingStatus = profileApi.profile && profileApi.profile.onboarding_status;
    if (existingStatus !== "done" && existingStatus !== "skipped") {
      profileApi.upsertProfile({ onboarding_status: "in_progress" }).catch(function () { /* guard-ok: onboarding status mark, UI not blocked */ });
    }
  }, [userId]);

  var current = questions[currentIdx] || null;
  var totalAnswered = Object.keys(answers).length;

  function handleNext() {
    if (!current || !(answer || "").trim()) return;
    var trimmed = answer.trim();
    profileApi.saveAnswer(current.id, trimmed).catch(function () { /* guard-ok: answer save, state tracks locally */ });
    var nextAnswers = Object.assign({}, answers, { [current.id]: trimmed });
    setAnswers(nextAnswers);
    setAnswer("");

    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      // All answered — synthesize
      handleSynthesize(nextAnswers);
    }
  }

  function handleSkipQuestion() {
    if (!current) return;
    profileApi.saveAnswer(current.id, "").catch(function () { /* guard-ok: skip-answer save, flow proceeds locally */ });
    setAnswer("");
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      profileApi.upsertProfile({ onboarding_status: "skipped" }).catch(function () { /* guard-ok: onboarding skip mark */ });
      if (onSkip) onSkip();
    }
  }

  function handleSynthesize(finalAnswers) {
    setSynthesizing(true);
    var pairs = questions.map(function (q) {
      return { question: q.question_text, answer: finalAnswers[q.id] || "" };
    }).filter(function (p) { return p.answer.trim(); });

    fetch("/api/profile-synthesis", {
      method: "POST",
      headers: Object.assign(
        { "Content-Type": "application/json" },
        accessToken ? { Authorization: "Bearer " + accessToken } : {}
      ),
      body: JSON.stringify({ pairs: pairs }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        setSynthesizing(false);
        if (data.error) {
          showToast("Couldn't synthesize profile — your answers are saved.", "warn");
          profileApi.upsertProfile({ onboarding_status: "done" }).catch(function () { /* guard-ok: onboarding done mark on synthesis error */ });
        } else {
          profileApi.upsertProfile({
            onboarding_status: "done",
            profile_prose:     data.profile_prose || null,
            prose_generated_at: new Date().toISOString(),
            completeness:      data.completeness || 80,
            role_title:        data.role_title        || null,
            company_name:      data.company_name      || null,
            industry:          data.industry          || null,
            portfolio_shape:   data.portfolio_shape   || null,
            primary_goal:      data.primary_goal      || null,
            working_style:     data.working_style     || null,
          }).catch(function () { /* guard-ok: profile save after synthesis; prose already in data */ });
        }
        if (onDone) onDone();
      })
      .catch(function () {
        setSynthesizing(false);
        profileApi.upsertProfile({ onboarding_status: "done" }).catch(function () { /* guard-ok: onboarding done fallback mark */ });
        if (onDone) onDone();
      });
  }

  function handleFinishLater() {
    profileApi.upsertProfile({ onboarding_status: "skipped" }).catch(function () { /* guard-ok: onboarding finish-later mark */ });
    if (onSkip) onSkip();
  }

  if (loadingQs) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <PipOrb size="sm" />
      </div>
    );
  }

  if (synthesizing) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
        <PipOrb size="lg" sonar />
        <div style={{ fontSize: 18, fontWeight: 600, color: C.text, fontFamily: INTER, textAlign: "center" }}>
          Pip is putting it together…
        </div>
        <div style={{ fontSize: 14, color: C.textMuted, fontFamily: INTER, textAlign: "center", maxWidth: 320 }}>
          Building your profile. Takes a few seconds.
        </div>
      </div>
    );
  }

  var progress = questions.length > 0 ? Math.round(((currentIdx + 1) / questions.length) * 100) : 0;
  var answerIsFilled = (answer || "").trim().length > 0;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
      <div style={{ width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <PipOrb size="sm" />
          <div>
            <div style={{ fontSize: 11, color: C.accent, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              Pip · Getting to know you
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, fontFamily: INTER, marginTop: 2 }}>
              Question {Math.min(currentIdx + 1, questions.length)} of {questions.length}
            </div>
          </div>
          <button
            type="button"
            onClick={handleFinishLater}
            style={{ marginLeft: "auto", background: "none", border: "none", color: C.textMuted, fontSize: 12, fontFamily: INTER, cursor: "pointer", padding: "4px 8px" }}
          >
            Finish later
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: C.rule, borderRadius: 2 }}>
          <div style={{ height: "100%", width: progress + "%", background: C.accent, borderRadius: 2, transition: "width 0.3s ease" }} />
        </div>

        {/* Question card */}
        {current && (
          <div style={{ background: C.surface, border: "1px solid " + C.rule, borderRadius: 12, padding: "20px 20px 16px" }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: C.text, fontFamily: INTER, lineHeight: 1.5, marginBottom: 14 }}>
              {current.question_text}
            </div>
            <textarea
              value={answer}
              onChange={function (e) { setAnswer(e.target.value); }}
              onKeyDown={function (e) {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && answerIsFilled) handleNext();
              }}
              placeholder="Type your answer here…"
              rows={4}
              autoFocus
              style={{
                width: "100%",
                background: C.bgDark,
                border: "1px solid " + C.border,
                borderRadius: 8,
                padding: "10px 12px",
                color: C.text,
                fontSize: 16,
                fontFamily: INTER,
                lineHeight: 1.5,
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
              <button
                type="button"
                onClick={handleSkipQuestion}
                style={{ background: "none", border: "none", color: C.textMuted, fontSize: 12, fontFamily: INTER, cursor: "pointer", padding: "4px 0" }}
              >
                Skip this one
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!answerIsFilled}
                style={{
                  background: answerIsFilled ? C.accentDeep : C.surface,
                  border: "1px solid " + (answerIsFilled ? C.accent : C.rule),
                  borderRadius: 8,
                  padding: "8px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: answerIsFilled ? C.bg : C.textMuted,
                  fontFamily: INTER,
                  cursor: answerIsFilled ? "pointer" : "default",
                }}
              >
                {currentIdx === questions.length - 1 ? "Done ✦" : "Next →"}
              </button>
            </div>
          </div>
        )}

        {/* Previously answered summary */}
        {totalAnswered > 0 && (
          <div style={{ fontSize: 11, color: C.textMuted, fontFamily: INTER, textAlign: "center" }}>
            {totalAnswered} of {questions.length} answered
          </div>
        )}
      </div>
    </div>
  );
}
