-- Phase 2 — Per-entry visibility scope
-- Run manually in Supabase SQL editor after 01_schema.sql.

-- 1. Add visibility column with CHECK constraint; backfill existing rows to 'team'
alter table kb.entries
  add column visibility text not null default 'team'
  check (visibility in ('team', 'private'));

-- 2. Partial index so private-entry lookups are fast
create index entries_visibility_idx on kb.entries (entered_by)
  where visibility = 'private' and is_deleted = false;

-- 3. Replace semantic search function to respect visibility
create or replace function kb.match_entries(
  query_embedding vector(1536),
  match_count     int    default 8,
  filter_kinds    text[] default null,
  caller_email    text   default null
)
returns table (
  id uuid, title text, body text, kind text, tags text[],
  source text, entered_by text, originated_by text[], visibility text,
  similarity float
)
language sql stable as $$
  select e.id, e.title, e.body, e.kind, e.tags, e.source,
         e.entered_by, e.originated_by, e.visibility,
         1 - (e.embedding <=> query_embedding) as similarity
  from kb.entries e
  where e.is_deleted = false
    and (filter_kinds is null or e.kind = any(filter_kinds))
    and (
      e.visibility = 'team'
      or (e.visibility = 'private' and e.entered_by = caller_email)
    )
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
