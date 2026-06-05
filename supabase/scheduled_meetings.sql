-- Scheduled (future, one-off) meetings on the calendar.
-- A scheduled meeting is a folio_meetings row with status='scheduled', a future
-- meeting_date (+ optional meeting_time), and an optional agenda. When the user
-- opens it, the app flips status 'scheduled' -> 'draft' and it enters the normal
-- meeting-notes / summarize flow (cadence_id stays null — it's a one-off).
--
-- Already applied to production. Additive + idempotent.

-- status already allows 'draft' | 'summarized'; add 'scheduled'.
alter table folio_meetings drop constraint if exists folio_meetings_status_check;
alter table folio_meetings
  add constraint folio_meetings_status_check
  check (status in ('draft', 'summarized', 'scheduled'));

-- time-of-day for the scheduled meeting (HH:MM, matches folio_cadences.meeting_time)
alter table folio_meetings add column if not exists meeting_time text;

-- optional agenda note captured when scheduling, shown in the prep view
alter table folio_meetings add column if not exists agenda text;
