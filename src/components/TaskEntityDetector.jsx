import { useState } from "react";
import { useEntityDetection } from "../hooks/useEntityDetection";
import { EntitySuggestionChip } from "./EntitySuggestionChip";

// Runs entity detection on a saved task title and renders the suggestion
// chip inline on the card. Only surfaces when the task has no assignee
// (contact match) or no linked account (dept/account match) yet.
// Wraps click with stopPropagation so accepting/dismissing doesn't
// also trigger the card's own onClick (open-edit handler).
export function TaskEntityDetector({ task, contacts, accounts, aliases, onAccept }) {
  var [dismissed, setDismissed] = useState(false);
  var suggestion = useEntityDetection(task.title || "", contacts || [], aliases || [], accounts || []);

  var show = !dismissed && suggestion && (
    (suggestion.type === "account" && !task.account_id) ||
    (suggestion.type !== "account" && !task.assignee_email)
  );

  if (!show) return null;

  return (
    <div onClick={function (e) { e.stopPropagation(); }}>
      <EntitySuggestionChip
        suggestion={suggestion}
        onAcceptAssignee={function () { onAccept(suggestion); setDismissed(true); }}
        onAcceptRecipient={function () { onAccept(suggestion); setDismissed(true); }}
        onDismiss={function () { setDismissed(true); }}
      />
    </div>
  );
}
