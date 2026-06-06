-- Leadership tasks — action items born from a person/internal cadence (a 1:1
-- or leadership meeting) that don't belong to any customer account. They're
-- your own work. Identified by: cadence_id set AND account_id IS NULL.
--
-- The summarize apply path (pipPlanApply) tags account-less items from a person
-- cadence with that cadence's id; the person cadence's hub surfaces them.
--
-- Already applied to production. Additive + idempotent.

alter table folio_tasks
  add column if not exists cadence_id uuid references folio_cadences(id) on delete set null;

create index if not exists folio_tasks_cadence_idx
  on folio_tasks (cadence_id) where cadence_id is not null;
