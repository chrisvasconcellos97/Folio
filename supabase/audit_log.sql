-- Audit log table — run once in Supabase SQL editor
-- Records key account activity for security and history

create table if not exists folio_audit_log (
  id         uuid    default gen_random_uuid() primary key,
  user_id    uuid    references auth.users(id) on delete cascade,
  event_type text    not null,
  table_name text,
  record_id  uuid,
  metadata   jsonb,
  created_at timestamp with time zone default now()
);

alter table folio_audit_log enable row level security;

create policy "Users can read own audit log"
  on folio_audit_log for select
  using (auth.uid() = user_id);

create policy "Users can insert own audit log"
  on folio_audit_log for insert
  with check (auth.uid() = user_id);

create index if not exists folio_audit_log_user_id_idx on folio_audit_log(user_id);
create index if not exists folio_audit_log_created_at_idx on folio_audit_log(created_at desc);
