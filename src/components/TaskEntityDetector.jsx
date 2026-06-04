import { useState, useEffect } from "react";
import { useEntityDetection } from "../hooks/useEntityDetection";
import { EntitySuggestionChip } from "./EntitySuggestionChip";

// Runs entity detection on a saved task title and renders the suggestion
// chip inline on the card. Only surfaces when the task has no assignee
// (contact match) or no linked account (dept/account match) yet.
// Wraps click with stopPropagation so accepting/dismissing doesn't
// also trigger the card's own onClick (open-edit handler).
export function TaskEntityDetector({ task, contacts, accounts, aliases, onAccept, onDismiss }) {
  var [dismissed, setDismissed] = useState(false);
  // Reset dismissal when the row is reused for a different task (list re-key),
  // otherwise a prior dismissal suppresses the new task's suggestion.
  useEffect(function () { setDismissed(false); }, [task.id]);
  var suggestion = useEntityDetection(task.title || "", contacts || [], aliases || [], accounts || []);

  var show = !dismissed && suggestion && (
    (suggestion.type === "account" && !task.account_id) ||
    (suggestion.type !== "account" && !task.assignee_email)
  );

  if (!show) return null;

  function handleDismiss() {
    setDismissed(true);
    if (onDismiss) onDismiss();
  }

  return (
    <div onClick={function (e) { e.stopPropagation(); }}>
      <EntitySuggestionChip
        suggestion={suggestion}
        onAcceptAssignee={function () { onAccept(suggestion); setDismissed(true); }}
        onAcceptRecipient={function () { onAccept(suggestion); setDismissed(true); }}
        onDismiss={handleDismiss}
      />
    </div>
  );
}
