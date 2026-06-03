-- Stakeholder / relationship layer
-- Adds relationship_role + relationship_note to folio_contacts.
-- relationship_role: 'champion' | 'blocker' | 'neutral' | 'unknown' (default)
-- relationship_note: free-text one-liner ("owns the budget decision", "IT compliance gate")

alter table folio_contacts
  add column if not exists relationship_role text
    check (relationship_role in ('champion','blocker','neutral','unknown'))
    default 'unknown',
  add column if not exists relationship_note text;
