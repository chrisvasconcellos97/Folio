alter table pip_correction_log
  drop constraint if exists pip_correction_log_correction_type_check;
alter table pip_correction_log
  add constraint pip_correction_log_correction_type_check
  check (correction_type in (
    'summary_edit', 'rejected_row', 'item_text_edit', 'task_text_edit',
    'missed_item', 'routed_account_changed'
  ));

alter table pip_correction_log_archive
  drop constraint if exists pip_correction_log_archive_correction_type_check;
alter table pip_correction_log_archive
  add constraint pip_correction_log_archive_correction_type_check
  check (correction_type in (
    'summary_edit', 'rejected_row', 'item_text_edit', 'task_text_edit',
    'missed_item', 'routed_account_changed'
  ));
