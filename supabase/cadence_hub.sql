-- Cadence Hub migration
-- Adds per-cadence conversation tracking + drafts + Pip brief cache
-- Safe to re-run (IF NOT EXISTS throughout)

-- ── folio_meetings: cadence_id, method, status, updated_at ──────────────────
alter table folio_meetings
  add column if not exists cadence_id    uuid references folio_cadences(id) on delete set null;

alter table folio_meetings
  add column if not exists method        text;

alter table folio_meetings
  add column if not exists status        text default 'summarized';

alter table folio_meetings
  add column if not exists updated_at    timestamptz default now();

-- Backfill any existing rows missing status so they're treated as locked history
update folio_meetings set status = 'summarized' where status is null;

-- Constraint guards for method + status (drop-then-add so re-runs work)
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'folio_meetings_method_check') then
    alter table folio_meetings drop constraint folio_meetings_method_check;
  end if;
  alter table folio_meetings
    add constraint folio_meetings_method_check
    check (method is null or method in ('phone', 'email', 'video', 'in_person'));

  if exists (select 1 from pg_constraint where conname = 'folio_meetings_status_check') then
    alter table folio_meetings drop constraint folio_meetings_status_check;
  end if;
  alter table folio_meetings
    add constraint folio_meetings_status_check
    check (status in ('draft', 'summarized'));
end $$;

-- Index for fast hub queries by cadence
create index if not exists folio_meetings_cadence_id_idx on folio_meetings(cadence_id);
create index if not exists folio_meetings_status_idx     on folio_meetings(status);

-- Auto-update trigger for folio_meetings.updated_at
drop trigger if exists folio_meetings_updated_at on folio_meetings;
create trigger folio_meetings_updated_at
  before update on folio_meetings
  for each row execute function update_updated_at();

-- ── folio_cadences: pip_brief cache ─────────────────────────────────────────
alter table folio_cadences
  add column if not exists pip_brief        text;

alter table folio_cadences
  add column if not exists pip_brief_at     timestamptz;
