-- Phase 3 — Server-side tag filtering in match_entries
-- Run manually in Supabase SQL editor after 02_visibility.sql.

-- 1. Drop the old 4-param overload so the new 5-param version is unique.
--    Signature from 02_visibility.sql:
--      (vector(1536), int, text[], text)
drop function if exists kb.match_entries(vector(1536), int, text[], text);

-- 2. Recreate with an additional filter_tags parameter.
create or replace function kb.match_entries(
  query_embedding vector(1536),
  match_count     int    default 8,
  filter_kinds    text[] default null,
  caller_email    text   default null,
  filter_tags     text[] default null
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
    and (filter_tags is null or cardinality(filter_tags) = 0 or e.tags && filter_tags)
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
