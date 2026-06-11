-- Life module (Work/Life mode) — personal items: appointments, events, honey-do.
-- One table with a `kind` discriminator; RLS scoped to auth.uid().
-- Applied to prod via MCP migration `create_life_items` (June 2026).

create table if not exists life_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('appointment','event','todo')),
  title       text not null,
  notes       text,
  item_date   date,
  item_time   time,
  location    text,
  status      text not null default 'open' check (status in ('open','done','archived')),
  importance  text not null default 'normal' check (importance in ('normal','vip')),
  recurrence  text default 'none' check (recurrence in ('none','annual')),
  complexity  text check (complexity in ('small','medium','big')),
  opened_at   timestamptz default now(),
  done_at     timestamptz,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table life_items enable row level security;

drop policy if exists "life_items_owner_all" on life_items;
create policy "life_items_owner_all" on life_items
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists life_items_user_idx on life_items(user_id);
create index if not exists life_items_user_kind_idx on life_items(user_id, kind);
