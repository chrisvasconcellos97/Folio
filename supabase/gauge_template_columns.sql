-- Gauge templates carry standing-mode + columns + status board
-- Safe to run multiple times.

alter table gauge_templates add column if not exists is_standing         boolean default false;
alter table gauge_templates add column if not exists custom_field_schema jsonb   default '[]';
alter table gauge_templates add column if not exists task_status_columns jsonb   default '["intake","in_progress","done"]';
