-- Pip user memory facts.
-- Stable preferences / context the user wants Pip to remember across sessions.
-- Two sources: 'user_explicit' (typed in Settings) or 'pip_inferred' (Pip used
-- the remember_fact tool). Facts are user-scoped via RLS.

create table if not exists folio_pip_facts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  fact        text not null,
  source      text not null default 'user_explicit',  -- 'user_explicit' | 'pip_inferred'
  active      boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table folio_pip_facts enable row level security;

drop policy if exists "facts_owner_select" on folio_pip_facts;
drop policy if exists "facts_owner_write"  on folio_pip_facts;

create policy "facts_owner_select" on folio_pip_facts
  for select using (auth.uid() = user_id);

create policy "facts_owner_write" on folio_pip_facts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists folio_pip_facts_user_active
  on folio_pip_facts(user_id) where active = true;
