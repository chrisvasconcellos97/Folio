import { useState, useMemo } from "react";
import { useMeetings } from "../../hooks/useMeetings";
import { useItems } from "../../hooks/useItems";
import { useContacts } from "../../hooks/useContacts";
import { useProjects } from "../../hooks/useProjects";
import { usePipAssignmentHints } from "../../hooks/usePipAssignmentHints";
import { usePipCorrections } from "../../hooks/usePipCorrections";
import { useGlossary } from "../../hooks/useGlossary";
import { useUserProfile } from "../../hooks/useUserProfile";
import { usePipFacts } from "../../hooks/usePipFacts";
import { summarizeDraftPip } from "../../lib/pip";
import { applyPipPlan } from "../../lib/pipPlanApply";
import { updateTask, insertTask } from "../../hooks/useTasks";
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
  pipAccountStateRow,
}) {
  var { meetings, addMeeting, updateMeeting } = useMeetings(userId, account.id, orgId);
  var { items, addItem, updateItem, closeItem } = useItems(userId, account.id, orgId);
  var { contacts, addContact } = useContacts(userId, account.id, orgId);
  var childAccountIds = useMemo(function () {
    return (accounts || [])
      .filter(function (a) { return a.parent_account_id === account.id; })
      .map(function (a) { return a.id; });
  }, [accounts, account.id]);
  var { projects, updateProject } = useProjects(userId, account.id, orgId, childAccountIds);
  var hintsApi       = usePipAssignmentHints(userId, account.id);
  var correctionsApi = usePipCorrections(userId, account.id);
  var glossaryApi    = useGlossary(userId, orgId, account.id);
  var userProfileApi = useUserProfile(userId);
  var profileProse   = userProfileApi.profile && userProfileApi.profile.profile_prose ? userProfileApi.profile.profile_prose : null;
  var pipFactsApi    = usePipFacts(userId);

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

  function handleSummarize(draftPayload, discussedProjectIds, discussedItemIds) {
    if (summarizing || !draftPayload) return;
    setSummarizing(true);
    setSummarizeErr(null);
    summarizeDraftPip({
      draft:            draftPayload,
      accountName:      account.name,
      cadenceLabel:     (draftPayload.method && METHOD_LABEL[draftPayload.method]) || "Ad-hoc conversation",
      accountId:        account.id,
      existingItems:    openItems,
      activeProjects:   activeProjects,
      orgMembers:       members,
      assignmentHints:  hintsApi.hints,
      corrections:      correctionsApi.corrections,
      accountObjective: account.objective || "",
      glossary:         glossaryApi.entries,
      accountRoster:    accountRoster,
      accountType:      account.account_type || "standard",
      pipAccountState:  pipAccountStateRow || null,
      contacts:         (contacts || []),
      meetingHistory:   (meetings || []).filter(function(m) { return m.id !== draftPayload.id; }).slice(0, 5),
      ownerUserId:         account.owner_user_id || null,
      userId:              userId,
      isPersonCadence:     false,
      profileProse:        profileProse,
      facts:               pipFactsApi.activeFactStrings || [],
      discussedProjectIds: discussedProjectIds || [],
      discussedItemIds:    discussedItemIds    || [],
    }).then(function (out) {
      var followUp = out.follow_up_date || null;
      return updateMeeting(draftPayload.id, {
        pip_summary:     out.summary || null,
        pip_short_title: out.short_title || null,
        pip_tone:        out.tone || null,
        follow_up_date:  followUp,
        status:          "summarized",
        theme:           out.theme || null,
      }).then(function () { return out; });
    }).then(function (out) {
      setSummarizing(false);
      setPreviewPlan({
        plan:           out.plan || [],
        summary:        out.summary || "",
        draftId:        draftPayload.id,
        skippedByPip:   !!out.skippedByPip,
        suggestedTitle: out.suggested_title || null,
        meetingTitle:   draftPayload.title || null,
        unknownPeople:  out.unknown_people || [],
      });
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
      meetingId:      pDraftId || null,
      activeProjects: activeProjects,
      userId:         userId,
      orgId:          orgId,
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
          onAddContact={addContact || undefined}
          userId={userId}
          onUpdateTask={userId ? function (taskId, fields) {
            return updateTask(userId, taskId, fields);
          } : undefined}
          onAddTask={userId ? function (payload) {
            return insertTask(userId, payload);
          } : undefined}
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
          onLogCorrections={correctionsApi.logCorrections}
          meetingId={previewPlan.draftId}
          accountRoster={accountRoster}
          currentAccountId={account.id}
          skippedByPip={!!previewPlan.skippedByPip}
          suggestedTitle={previewPlan.suggestedTitle || null}
          meetingTitle={previewPlan.meetingTitle || null}
          unknownPeople={previewPlan.unknownPeople || []}
          accountContacts={contacts || []}
        />
      )}
    </>
  );
}
