-- ──────────────────────────────────────────────────────────────────────
-- pip_correction_log — extend correction_type to include 'missed_item'.
--
-- 'missed_item' = the user added a row to Pip's plan in the preview modal
-- that Pip didn't propose. High-signal correction — it means Pip missed
-- a concept entirely (often a scope cue like "all of these accounts" got
-- collapsed into the single named example).
-- ──────────────────────────────────────────────────────────────────────

alter table pip_correction_log
  drop constraint if exists pip_correction_log_correction_type_check;
alter table pip_correction_log
  add constraint pip_correction_log_correction_type_check
  check (correction_type in (
    'summary_edit', 'rejected_row', 'item_text_edit', 'task_text_edit', 'missed_item'
  ));

alter table pip_correction_log_archive
  drop constraint if exists pip_correction_log_archive_correction_type_check;
alter table pip_correction_log_archive
  add constraint pip_correction_log_archive_correction_type_check
  check (correction_type in (
    'summary_edit', 'rejected_row', 'item_text_edit', 'task_text_edit', 'missed_item'
  ));
