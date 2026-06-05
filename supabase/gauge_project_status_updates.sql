-- Gauge project "Latest update" pulse log (Item 31).
-- A timestamped, append-only running heartbeat, distinct from the durable
-- `notes` scratchpad. Each save PREPENDS a new entry; the array IS the history.
--
-- Shape: status_updates jsonb = [{ body text, at ISO-timestamp, by user-email }],
-- newest-first. Rides the existing updateProject path — no new table, no join.
--
-- Already applied to production. Additive + idempotent.

alter table gauge_projects
  add column if not exists status_updates jsonb default '[]'::jsonb;
