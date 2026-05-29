alter table folio_pip_account_state add column if not exists lessons_learned text;
alter table folio_pip_account_state add column if not exists last_compression_at timestamptz;

create table if not exists pip_correction_log_archive (
  like pip_correction_log including all
);
alter table pip_correction_log_archive enable row level security;
drop policy if exists "Users manage own archived corrections" on pip_correction_log_archive;
create policy "Users manage own archived corrections"
  on pip_correction_log_archive for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
