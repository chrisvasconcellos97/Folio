-- F6 — pgvector semantic recall over the user's own notes + summaries.
-- Lets Pip pull relevant past context by MEANING, not just recency.
-- See docs/pip-architecture-f6-plan.md.
--
-- folio_embeddings — one row per embedded chunk of a source (meeting notes,
--   meeting summary, project note, account update). content_fingerprint = a
--   time-stable fnv1a hash of the whole source row's content; api/embed-sync.js
--   skips re-embedding any source whose stored fingerprint is unchanged.
-- match_folio_embeddings — top-k cosine recall RPC, SECURITY INVOKER (so RLS
--   applies) plus an explicit user_id = auth.uid() predicate (defense in depth —
--   a mis-scoped vector query is a silent cross-user leak). Always called with
--   the user-JWT client so auth.uid() resolves.
--
-- Additive + idempotent — safe to re-run.

create extension if not exists vector;

create table if not exists folio_embeddings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  source_type         text not null,        -- meeting_notes | meeting_summary | project_note | account_update
  source_id           text not null,        -- meeting id, meetingId:projectId, or update id
  account_id          uuid references folio_accounts(id) on delete cascade,
  chunk_index         int  not null default 0,
  content             text not null,
  content_fingerprint text not null,
  embedding           vector(1536) not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, source_type, source_id, chunk_index)
);

alter table folio_embeddings enable row level security;

drop policy if exists "embeddings_owner_select" on folio_embeddings;
create policy "embeddings_owner_select" on folio_embeddings
  for select using ((select auth.uid()) = user_id);

drop policy if exists "embeddings_owner_write" on folio_embeddings;
create policy "embeddings_owner_write" on folio_embeddings
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists folio_embeddings_user_account on folio_embeddings(user_id, account_id);
create index if not exists folio_embeddings_source       on folio_embeddings(user_id, source_type, source_id);
create index if not exists folio_embeddings_hnsw
  on folio_embeddings using hnsw (embedding vector_cosine_ops);

create or replace function match_folio_embeddings(
  query_embedding vector(1536),
  match_account   uuid default null,
  match_count     int  default 5
) returns table (
  source_type text, source_id text, account_id uuid, content text, similarity float
)
language sql stable security invoker set search_path = public as $$
  select e.source_type, e.source_id, e.account_id, e.content,
         1 - (e.embedding <=> query_embedding) as similarity
  from folio_embeddings e
  where e.user_id = (select auth.uid())
    and (match_account is null or e.account_id = match_account)
  order by e.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

grant execute on function match_folio_embeddings(vector, uuid, int) to authenticated;
