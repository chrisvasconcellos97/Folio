-- Route Builder: folio_routes table
create table if not exists folio_routes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  date        date,
  stops       jsonb not null default '[]',
  created_at  timestamptz not null default now()
);

alter table folio_routes enable row level security;

create policy "Users manage their own routes"
  on folio_routes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists folio_routes_user_id_idx on folio_routes(user_id);
