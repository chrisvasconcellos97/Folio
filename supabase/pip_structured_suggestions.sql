-- Pip structured suggestions ("Pip proposes, you approve").
-- Learned answers can be turned into approved structured writes without a
-- per-answer LLM call: the structured intent is attached to the question when
-- it's created, and applied (if the user approves) when they answer.

-- Systems/tools an account uses (e.g. "Fuse5" IMS / DMS). Array of
-- { name, note, at }. Populated only via an approved Pip suggestion.
alter table folio_accounts add column if not exists systems jsonb not null default '[]'::jsonb;

-- Structured intent on a drip question: { type, account_id?, contact_id?,
-- account_name?, contact_name?, term? } where type is one of
-- 'account_system' | 'contact_role' | 'account_objective'.
alter table folio_pip_questions add column if not exists suggestion jsonb;
