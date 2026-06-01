-- Batch 5: meeting theme tags for cross-account pattern detection
-- Each meeting gets one theme tag extracted by Pip at summarize time.

alter table folio_meetings
  add column if not exists theme text;

-- Index for cross-account theme aggregation queries
create index if not exists folio_meetings_theme_idx
  on folio_meetings(user_id, theme, meeting_date)
  where theme is not null;

comment on column folio_meetings.theme is
  'One-word theme tag extracted by Pip at summarize time. Controlled vocabulary: pricing, integration, staffing, product, escalation, planning, delivery, relationship.';
