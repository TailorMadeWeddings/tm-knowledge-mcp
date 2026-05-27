-- Phase 1 — Knowledge-base schema (run manually in Supabase SQL editor)
-- All objects live in the `kb` schema.

-- 1. Extension + schema
create extension if not exists vector;
create schema if not exists kb;

-- 2. Entries: atomic ideas, notes, decisions, open questions, and reference-doc chunks
create table kb.entries (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  kind          text not null check (kind in ('idea','note','reference','decision','open_question')),
  tags          text[] not null default '{}',
  source        text,
  source_doc_id uuid,
  entered_by    text not null,
  originated_by text[] not null default '{}',
  embedding     vector(1536),
  is_deleted    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 3. Links: the idea graph
create table kb.links (
  id           uuid primary key default gen_random_uuid(),
  from_id      uuid not null references kb.entries(id) on delete cascade,
  to_id        uuid not null references kb.entries(id) on delete cascade,
  relationship text not null check (relationship in ('builds_on','relates_to','contradicts','refines','example_of')),
  created_by   text not null,
  created_at   timestamptz not null default now(),
  unique (from_id, to_id, relationship)
);

-- 4. Documents: parent record for seeded reference material
create table kb.documents (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  kind       text not null default 'reference',
  source     text,
  added_by   text not null,
  created_at timestamptz not null default now()
);

-- 5. Audit log
create table kb.audit (
  id         bigint generated always as identity primary key,
  entry_id   uuid,
  action     text not null,
  actor      text not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);

-- 6. Indexes
create index entries_embedding_idx on kb.entries using hnsw (embedding vector_cosine_ops);
create index entries_kind_idx      on kb.entries (kind) where is_deleted = false;
create index entries_tags_idx      on kb.entries using gin (tags);
create index links_from_idx        on kb.links (from_id);
create index links_to_idx          on kb.links (to_id);

-- 7. Semantic search function
create or replace function kb.match_entries(
  query_embedding vector(1536),
  match_count int default 8,
  filter_kinds text[] default null
)
returns table (
  id uuid, title text, body text, kind text, tags text[],
  source text, originated_by text[], similarity float
)
language sql stable as $$
  select e.id, e.title, e.body, e.kind, e.tags, e.source, e.originated_by,
         1 - (e.embedding <=> query_embedding) as similarity
  from kb.entries e
  where e.is_deleted = false
    and (filter_kinds is null or e.kind = any(filter_kinds))
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

-- 8. Limited DB role for the Worker
-- create role kb_service login password 'REPLACE_WITH_STRONG_PASSWORD';
-- grant usage on schema kb to kb_service;
-- grant select, insert, update on all tables in schema kb to kb_service;
-- grant usage, select on all sequences in schema kb to kb_service;
-- grant execute on function kb.match_entries to kb_service;
