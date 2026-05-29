-- Account health override fields (manual pin, Pip computes the default).
alter table folio_accounts add column if not exists status_override text
  check (status_override is null or status_override in ('green','yellow','red'));
alter table folio_accounts add column if not exists status_override_reason text;
alter table folio_accounts add column if not exists status_override_at timestamptz;
alter table folio_accounts add column if not exists status_override_until date;

-- Wipe existing manual status — Pip computes from now on. Existing values
-- are discarded per Chris's call.
update folio_accounts set status = null;

-- Sentiment tag Pip writes alongside every summarize. Invisible to user,
-- feeds V2 brain pattern detection.
alter table folio_meetings add column if not exists pip_tone text
  check (pip_tone is null or pip_tone in ('positive','neutral','mixed','negative'));

-- Promise completion ledger. Written when an item closes; V2 brain reads
-- this to spot "you usually close in 4 days, this one sat 21 — anomaly."
create table if not exists pip_promise_log (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users not null,
  account_id        uuid references folio_accounts on delete cascade,
  item_id           uuid references folio_items   on delete set null,
  item_text         text not null,
  due_date          date,
  days_to_complete  integer,
  closed_at         timestamptz default now(),
  created_at        timestamptz default now()
);

alter table pip_promise_log enable row level security;
create policy "Users manage own promise log"
  on pip_promise_log for all
  using (auth.uid() = user_id);

create index if not exists pip_promise_log_user_account_idx
  on pip_promise_log(user_id, account_id);
