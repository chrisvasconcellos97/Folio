-- Unify folio_items into folio_tasks.
-- folio_items stays in the DB as a read-only backup but the app no longer reads/writes it.

-- Step 1: add is_commitment to folio_tasks
alter table folio_tasks
  add column if not exists is_commitment boolean not null default false;

create index if not exists folio_tasks_commitment_idx
  on folio_tasks (user_id, is_commitment)
  where is_commitment = true;

-- Step 2: migrate folio_items rows that weren't already dual-written.
-- Match on account_id + lower(text) = lower(title) + same source_meeting_id
-- to avoid creating duplicates from the Phase 1 dual-write.
insert into folio_tasks (
  user_id, account_id, title, due_date, assignee_email,
  done, closed_at, is_commitment, created_at, pip_created_at, source_meeting_id
)
select
  fi.user_id,
  fi.account_id,
  fi.text,
  fi.due_date,
  fi.owner,
  fi.done,
  fi.closed_at,
  fi.is_commitment,
  fi.created_at,
  fi.pip_created_at,
  fi.source_meeting_id
from folio_items fi
where not exists (
  select 1 from folio_tasks ft
  where ft.user_id = fi.user_id
    and ft.account_id = fi.account_id
    and lower(ft.title) = lower(fi.text)
    and (
      (fi.source_meeting_id is not null and ft.source_meeting_id = fi.source_meeting_id)
      or (fi.source_meeting_id is null and ft.source_meeting_id is null
          and ft.created_at::date = fi.created_at::date)
    )
);
