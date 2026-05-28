import { useState, useMemo } from "react";
import { useMeetings } from "../../hooks/useMeetings";
import { useItems } from "../../hooks/useItems";
import { useContacts } from "../../hooks/useContacts";
import { useProjects } from "../../hooks/useProjects";
import { usePipAssignmentHints } from "../../hooks/usePipAssignmentHints";
import { summarizeDraftPip } from "../../lib/pip";
import { applyPipPlan } from "../../lib/pipPlanApply";
import { CadenceMeetingMode } from "../cadence/CadenceMeetingMode";
import { PipSummarizePreview } from "../cadence/PipSummarizePreview";

var METHOD_LABEL = {
  phone:     "Phone",
  in_person: "In Person",
  video:     "Video",
  email:     "Email",
};

/**
 * Self-contained ad-hoc conversation runner. Loads account-scoped data the
 * meeting mode needs (items, contacts, projects), then renders the same
 * full-screen experience used for cadence meetings — minus the cadence-tied
 * Pip brief. Drives the summarize-with-preview flow end-to-end.
 *
 * Mount it once a draft meeting exists for the account. The flow closes via
 * `onClose` when the user dismisses the overlay or finishes the preview apply.
 */
export function AdHocConversationFlow({
  draftId,
  account,
  accounts,
  members,
  userId,
  userEmail,
  orgId,
  onClose,
}) {
  var { meetings, addMeeting, updateMeeting } = useMeetings(userId, account.id, orgId);
  var { items, addItem, updateItem, closeItem } = useItems(userId, account.id, orgId);
  var { contacts } = useContacts(userId, account.id, orgId);
  var childAccountIds = useMemo(function () {
    return (accounts || [])
      .filter(function (a) { return a.parent_account_id === account.id; })
      .map(function (a) { return a.id; });
  }, [accounts, account.id]);
  var { projects, updateProject } = useProjects(userId, account.id, orgId, childAccountIds);
  var hintsApi = usePipAssignmentHints(userId, account.id);

  var [summarizing, setSummarizing] = useState(false);
  var [summarizeErr, setSummarizeErr] = useState(null);
  var [previewPlan, setPreviewPlan] = useState(null); // { plan, summary, draftId }

  var draft = useMemo(function () {
    return (meetings || []).find(function (m) { return m.id === draftId; }) || null;
  }, [meetings, draftId]);

  var openItems = useMemo(function () {
    return (items || []).filter(function (i) { return !i.done; });
  }, [items]);

  var activeProjects = useMemo(function () {
    return (projects || []).filter(function (p) { return p.status !== "complete"; });
  }, [projects]);

  var lastMeetingAt = useMemo(function () {
    var done = (meetings || []).filter(function (m) {
      return m.status !== "draft" && m.id !== draftId;
    }).sort(function (a, b) {
      return (b.meeting_date || "") > (a.meeting_date || "") ? 1 : -1;
    });
    return done.length ? done[0].meeting_date : null;
  }, [meetings, draftId]);

  function handleSummarize(draftPayload) {
    if (summarizing || !draftPayload) return;
    setSummarizing(true);
    setSummarizeErr(null);
    summarizeDraftPip({
      draft:           draftPayload,
      accountName:     account.name,
      cadenceLabel:    (draftPayload.method && METHOD_LABEL[draftPayload.method]) || "Ad-hoc conversation",
      accountId:       account.id,
      existingItems:   openItems,
      activeProjects:  activeProjects,
      orgMembers:      members,
      assignmentHints: hintsApi.hints,
    }).then(function (out) {
      var followUp = out.follow_up_date || null;
      return updateMeeting(draftPayload.id, {
        pip_summary:    out.summary || null,
        follow_up_date: followUp,
        status:         "summarized",
      }).then(function () { return out; });
    }).then(function (out) {
      setSummarizing(false);
      setPreviewPlan({ plan: out.plan || [], summary: out.summary || "", draftId: draftPayload.id });
    }).catch(function (err) {
      setSummarizing(false);
      setSummarizeErr((err && err.message) || "Pip couldn't summarize.");
    });
  }

  function handleApplyPlan(selected) {
    var pDraftId = previewPlan && previewPlan.draftId;
    return applyPipPlan(selected, {
      addItem:        function (data) { return addItem(Object.assign({ account_id: account.id }, data)); },
      updateItem:     function (id, fields) { return updateItem(id, fields); },
      closeItem:      closeItem,
      updateProject:  updateProject,
      addHint:        hintsApi.addHint,
      accountId:      account.id,
      activeProjects: activeProjects,
    }).then(function (result) {
      if (pDraftId) {
        updateMeeting(pDraftId, { plan_applied_at: new Date().toISOString() })
          .catch(function () { /* best-effort badge */ });
      }
      setPreviewPlan(null);
      if (onClose) onClose();
      return result;
    });
  }

  function handleCancelPlan() {
    setPreviewPlan(null);
    if (onClose) onClose();
  }

  function handleClose() {
    if (onClose) onClose();
  }

  if (!draft) return null;

  return (
    <>
      {!previewPlan && (
        <CadenceMeetingMode
          draft={draft}
          account={account}
          cadenceLabel={null}
          brief={null}
          briefAt={null}
          projects={activeProjects}
          openItems={openItems}
          contacts={contacts || []}
          accounts={accounts}
          members={members}
          userEmail={userEmail}
          lastMeetingAt={lastMeetingAt}
          onUpdate={updateMeeting}
          onAddItem={function (data) { return addItem(Object.assign({ account_id: account.id }, data)); }}
          onCloseItem={closeItem}
          onUpdateProject={updateProject}
          onClose={handleClose}
          onSummarizeRequest={handleSummarize}
          summarizing={summarizing}
          summarizeErr={summarizeErr}
        />
      )}
      {previewPlan && (
        <PipSummarizePreview
          plan={previewPlan.plan}
          existingItems={openItems}
          activeProjects={activeProjects}
          orgMembers={members}
          onApply={handleApplyPlan}
          onCancel={handleCancelPlan}
        />
      )}
    </>
  );
}
