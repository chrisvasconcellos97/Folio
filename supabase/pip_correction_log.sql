-- ──────────────────────────────────────────────────────────────────────
-- Pip correction log (V2 brain foundation)
--
-- Captures every time the user *disagrees* with what Pip produced —
-- rejected plan rows, edits to Pip's proposed item/task text, edits to
-- Pip's meeting summary. On the next summarize, Pip is fed the recent
-- correction log so he can avoid repeating misreads.
--
-- correction_type values:
--   'summary_edit'    — user changed pip_summary on a meeting
--   'rejected_row'    — user unchecked a plan row at Apply time
--   'item_text_edit'  — user changed the title/text of a plan row before
--                       Apply (the row was kept, but Pip's wording was wrong)
--   'task_text_edit'  — same, for Gauge task rows
--
-- original_value / corrected_value are JSON so each correction_type can
-- carry its own shape ({ text } for items, { title } for tasks, etc).
-- ──────────────────────────────────────────────────────────────────────

create table if not exists pip_correction_log (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users not null,
  account_id        uuid references folio_accounts on delete cascade,
  meeting_id        uuid references folio_meetings on delete set null,
  correction_type   text not null check (correction_type in (
    'summary_edit', 'rejected_row', 'item_text_edit', 'task_text_edit'
  )),
  original_value    jsonb,
  corrected_value   jsonb,
  reason            text,
  created_at        timestamptz default now()
);

create index if not exists pip_correction_log_user_account_idx
  on pip_correction_log(user_id, account_id, created_at desc);

create index if not exists pip_correction_log_meeting_idx
  on pip_correction_log(meeting_id);

alter table pip_correction_log enable row level security;

drop policy if exists "Users manage own corrections" on pip_correction_log;
create policy "Users manage own corrections"
  on pip_correction_log for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
