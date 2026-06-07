-- folio_email_threads: thread identity spine
create table if not exists folio_email_threads (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  org_id             uuid,
  account_id         uuid references folio_accounts(id) on delete set null,
  subject_raw        text not null,
  subject_norm       text not null,
  contact_id         uuid references folio_contacts(id) on delete set null,
  contact_name_raw   text,
  status             text not null default 'open'
                     check (status in ('open','waiting','closed','snoozed')),
  last_action        text,
  last_summary       text,
  waiting_since      date,
  last_seen_date     date,
  first_seen_date    date,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists folio_email_threads_user_norm_idx
  on folio_email_threads (user_id, subject_norm);
create index if not exists folio_email_threads_account_idx
  on folio_email_threads (account_id) where account_id is not null;
create index if not exists folio_email_threads_waiting_idx
  on folio_email_threads (user_id, status) where status = 'waiting';

alter table folio_email_threads enable row level security;
create policy "threads_owner_all" on folio_email_threads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists folio_email_threads_updated_at on folio_email_threads;
create trigger folio_email_threads_updated_at
  before update on folio_email_threads
  for each row execute function update_updated_at();

-- folio_thread_events: timeline per thread
create table if not exists folio_thread_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  thread_id       uuid not null references folio_email_threads(id) on delete cascade,
  event_date      date not null,
  action_type     text not null,
  summary         text,
  spawned_task_id uuid references folio_tasks(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists folio_thread_events_thread_idx
  on folio_thread_events (thread_id, event_date desc);
alter table folio_thread_events enable row level security;
create policy "thread_events_owner_all" on folio_thread_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- folio_tasks additions
alter table folio_tasks add column if not exists source_thread_id uuid
  references folio_email_threads(id) on delete set null;
alter table folio_tasks add column if not exists source text;
create index if not exists folio_tasks_source_thread_idx
  on folio_tasks (source_thread_id) where source_thread_id is not null;
