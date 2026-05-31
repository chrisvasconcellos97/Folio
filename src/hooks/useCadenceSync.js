import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { getOccurrencesInRange } from "../lib/cadenceUtils";
import { showToast } from "../components/Toast";

export function useCadenceSync(userId, cadences, cadencesLoading) {
  var ran = useRef(false);

  useEffect(function () {
    if (!userId || cadencesLoading || ran.current) return;
    ran.current = true;

    var taskCadences = (cadences || []).filter(function (c) { return c.type === "task"; });
    if (taskCadences.length === 0) return;

    var storageKey = "folio_cadence_check_" + userId;
    var lastCheckStr = localStorage.getItem(storageKey);

    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var start;
    if (lastCheckStr) {
      start = new Date(lastCheckStr + "T00:00:00");
      start.setDate(start.getDate() + 1);
    } else {
      start = new Date(today);
    }

    if (start > today) return;

    var itemsToCreate = [];
    taskCadences.forEach(function (cadence) {
      if (!cadence.account_id) return;
      var occurrences = getOccurrencesInRange(cadence, start, today);
      occurrences.forEach(function () {
        itemsToCreate.push({
          account_id: cadence.account_id,
          user_id:    userId,
          title:      cadence.task_title || "Recurring task",
          done:       false,
        });
      });
    });

    localStorage.setItem(storageKey, today.toISOString().slice(0, 10));

    if (itemsToCreate.length === 0) return;

    supabase
      .from("folio_tasks")
      .insert(itemsToCreate)
      .then(function (result) {
        if (result.error) return;
        showToast(
          itemsToCreate.length === 1
            ? "1 recurring task added to your queue"
            : itemsToCreate.length + " recurring tasks added to your queue"
        );
      });
  }, [userId, cadences, cadencesLoading]);
}
