-- Pip Tier B — commitment flag on open items.
-- Marks an item as a promised deliverable so Pip tracks it separately.

alter table folio_items
  add column if not exists is_commitment boolean not null default false;

create index if not exists folio_items_commitment
  on folio_items (user_id, is_commitment)
  where is_commitment = true;
