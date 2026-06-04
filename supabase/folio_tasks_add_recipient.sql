-- Recipient on loose tasks / action items.
-- Distinct from assignee_email (who does the work): the recipient is who the
-- task is for / who you'll send the output to. Set from the Pip summarize
-- plan's per-row Assignee/Recipient recognition. Gauge project tasks already
-- carry `recipient` inside the stages jsonb; this brings folio_tasks to parity.
alter table folio_tasks add column if not exists recipient text;
