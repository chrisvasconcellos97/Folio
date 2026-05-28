-- ──────────────────────────────────────────────────────────────────────
-- Revenue-impact Update Calendar
-- ──────────────────────────────────────────────────────────────────────
-- Log of "things that could affect revenue" on an account: catalog
-- updates, pricing changes, integrations, product launches, training,
-- promos, observed external events. Surfaced on AccountDetail as a
-- dedicated "Updates" tab and as a "Recent updates" block on Overview,
-- with vertical ticks on the revenue sparkline at each update_date so
-- a MoM dip can be cross-referenced against what happened.
--
-- v1 is manual entry only. The schema leaves room for a later auto-
-- linkage from completed Gauge projects via gauge_project_id.

create table if not exists folio_account_updates (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users not null,
  org_id            uuid,
  account_id        uuid references folio_accounts on delete cascade not null,
  update_date       date not null,
  update_type       text not null check (update_type in (
                      'catalog', 'pricing', 'integration', 'product_launch',
                      'training', 'promo', 'external_event', 'other'
                    )),
  title             text not null,
  description       text,
  owner             text,
  observed_impact   text check (observed_impact is null or observed_impact in (
                      'positive', 'negative', 'mixed', 'unknown'
                    )),
  gauge_project_id  uuid references gauge_projects on delete set null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table folio_account_updates enable row level security;

drop policy if exists "Users manage own updates" on folio_account_updates;
create policy "Users manage own updates"
  on folio_account_updates for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists folio_account_updates_account_idx
  on folio_account_updates(account_id, update_date desc);
create index if not exists folio_account_updates_user_idx
  on folio_account_updates(user_id, update_date desc);

drop trigger if exists folio_account_updates_updated_at on folio_account_updates;
create trigger folio_account_updates_updated_at
  before update on folio_account_updates
  for each row execute function update_updated_at();
