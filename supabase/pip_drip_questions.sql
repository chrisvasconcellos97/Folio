-- Pip drip questions (Phase 2): global pause toggle on the user profile.
-- Run in production Supabase.
alter table folio_user_profile
  add column if not exists pip_questions_paused boolean not null default false;
