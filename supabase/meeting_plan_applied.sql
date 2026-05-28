-- Pip plan applied marker on meetings
-- Safe to run multiple times.
--
-- Set once when the user clicks Apply in PipSummarizePreview after a
-- summarize. Drives a "Tasks added" pill on the meeting in CadenceHub's
-- history so Chris knows a meeting's action items have already been
-- promoted to folio_items / Gauge tasks and doesn't re-summarize blindly.

alter table folio_meetings add column if not exists plan_applied_at timestamptz;
