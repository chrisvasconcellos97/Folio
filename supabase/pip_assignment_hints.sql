-- ──────────────────────────────────────────────────────────────────────
-- Pip assignment hints
--
-- Captures user overrides of Pip's suggested assignee in the summarize
-- preview. When the user changes a suggested assignee on a row, we save
-- (account_id, normalized task pattern, assignee_email). On the next
-- summarize, Pip is fed these hints so it can default to the historically
-- correct person for similar tasks on this account.
-- ──────────────────────────────────────────────────────────────────────

create table if not exists pip_assignment_hints (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  account_id      uuid references folio_accounts on delete cascade,
  task_pattern    text not null,
  assignee_email  text not null,
  created_at      timestamptz default now()
);

create index if not exists pip_assignment_hints_user_account_idx
  on pip_assignment_hints(user_id, account_id);

alter table pip_assignment_hints enable row level security;

drop policy if exists "Users manage own hints" on pip_assignment_hints;
create policy "Users manage own hints"
  on pip_assignment_hints for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
