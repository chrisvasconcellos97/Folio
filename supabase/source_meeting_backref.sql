alter table folio_items
  add column if not exists source_meeting_id uuid references folio_meetings on delete set null;

create index if not exists folio_items_source_meeting_idx on folio_items(source_meeting_id);
