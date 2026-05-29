-- ──────────────────────────────────────────────────────────────────────
-- Pip glossary — durable, user-taught knowledge that Pip injects into
-- every summarize / brief call. Terms, definitions, aliases. Org-scoped
-- so a whole team shares the same vocabulary. Account-scoped entries
-- (account_id set) act as account-specific knowledge.
-- ──────────────────────────────────────────────────────────────────────

create table if not exists pip_glossary (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  org_id        uuid references folio_orgs,
  account_id    uuid references folio_accounts on delete cascade,
  term          text not null,
  definition    text not null,
  preserve_case boolean default true,
  aliases       text[] default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  deleted_at    timestamptz
);

create index if not exists pip_glossary_user_idx    on pip_glossary(user_id)    where deleted_at is null;
create index if not exists pip_glossary_org_idx     on pip_glossary(org_id)     where deleted_at is null;
create index if not exists pip_glossary_account_idx on pip_glossary(account_id) where deleted_at is null;

alter table pip_glossary enable row level security;
drop policy if exists "Users manage own glossary" on pip_glossary;
create policy "Users manage own glossary"
  on pip_glossary for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists pip_glossary_updated_at on pip_glossary;
create trigger pip_glossary_updated_at
  before update on pip_glossary
  for each row execute function update_updated_at();
