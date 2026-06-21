-- Win log (#3) — the brag file. User-confirmed good outcomes (a project landed,
-- a promise kept, a fire put out), persisted for review season + the Friday
-- Pip Wrap. Auto-detected candidates carry a source_ref so they can't be
-- double-logged; manual wins have none.
--
-- DATA LINE: a win is about Chris's own work, in his own words. No revenue /
-- volume / shop-count figures belong in `title` — same notebook rule as notes.

create table if not exists folio_wins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  title       text not null,
  account_id  uuid references folio_accounts on delete set null,
  kind        text default 'manual',   -- manual | project | commitment | operator
  source_ref  text,                    -- e.g. "project:<id>" / "task:<id>" — dedupe key
  occurred_on date default (now() at time zone 'utc')::date,
  created_at  timestamptz default now()
);

create index if not exists folio_wins_user_idx on folio_wins (user_id, occurred_on desc);
-- One log per auto-detected source; manual wins (null source_ref) are unaffected.
create unique index if not exists folio_wins_source_uq
  on folio_wins (user_id, source_ref) where source_ref is not null;

alter table folio_wins enable row level security;
drop policy if exists "Wins owner access" on folio_wins;
create policy "Wins owner access" on folio_wins
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
