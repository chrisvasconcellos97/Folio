-- Backfill last_meeting on folio_accounts from the most recent meeting date
-- Run once in Supabase SQL editor
update folio_accounts
set last_meeting = (
  select max(meeting_date)
  from folio_meetings
  where folio_meetings.account_id = folio_accounts.id
)
where exists (
  select 1 from folio_meetings
  where folio_meetings.account_id = folio_accounts.id
);
