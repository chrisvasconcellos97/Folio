create table if not exists folio_user_profile (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users not null unique,
  org_id             uuid,
  role_title         text,
  company_name       text,
  industry           text,
  portfolio_shape    text,
  primary_goal       text,
  reporting_to       text,
  working_style      text,
  kpis               text,
  profile_prose      text,
  prose_generated_at timestamptz,
  completeness       integer default 0,
  onboarding_status  text default 'pending'
                     check (onboarding_status in ('pending','in_progress','done','skipped')),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

alter table folio_user_profile enable row level security;

drop policy if exists "User profile owner access" on folio_user_profile;
create policy "User profile owner access"
  on folio_user_profile for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger folio_user_profile_updated_at
  before update on folio_user_profile
  for each row execute procedure moddatetime(updated_at);

create table if not exists folio_pip_questions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users not null,
  question_text    text not null,
  category         text check (category in ('role','company','portfolio','working_style','goals','gap','terminology')),
  slot             text,
  source           text default 'bank'
                   check (source in ('bank','pip_generated','gap_observed')),
  priority         integer default 5,
  status           text default 'queued'
                   check (status in ('queued','asked','answered','skipped','dismissed')),
  answer_text      text,
  trigger_context  text,
  asked_at         timestamptz,
  answered_at      timestamptz,
  created_at       timestamptz default now()
);

alter table folio_pip_questions enable row level security;

drop policy if exists "Pip questions owner access" on folio_pip_questions;
create policy "Pip questions owner access"
  on folio_pip_questions for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists folio_user_profile_user_id_idx on folio_user_profile(user_id);
create index if not exists folio_pip_questions_user_id_status_idx on folio_pip_questions(user_id, status);
