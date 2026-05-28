-- Gauge — per-project notes scratchpad
-- Safe to run multiple times.
--
-- `description` is the project's one-time scope blurb. `notes` is a
-- running scratchpad — observations, decisions, what came up in the
-- last cadence call. Edited inline on the expanded project card in
-- both GaugeView and the Cadence Hub.

alter table gauge_projects add column if not exists notes text;
