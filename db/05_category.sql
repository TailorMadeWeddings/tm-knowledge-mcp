-- 05_category.sql — TAI-218: a TOPIC category, separate from visibility.
-- Run manually in the Big Brain Supabase SQL editor (project ebujpuesxhhmpxivqkml).
--
-- WHY a new column and not a new `visibility` value: `visibility` (team/private)
-- is an ACCESS axis and is the filter kb.match_entries uses — so a topic bucket
-- placed there would vanish from ALL MCP search/synthesize. `category` is a
-- separate TOPIC axis: the Big Brain MAP shows category='business' only, while
-- every dev note stays team-visible and fully searchable via MCP (search_knowledge
-- and synthesize are unchanged — they never look at category).

-- 1. Column. Everything is 'business' until flipped; dev entries flipped in step 4.
alter table kb.entries
  add column if not exists category text not null default 'business';

-- 2. Auto-categorise NEW entries by tag/title on insert — so there's no Worker
--    change to maintain. BEFORE INSERT only, so a later manual UPDATE overriding
--    a specific entry's category sticks (updates aren't re-forced).
create or replace function kb.set_category_from_tags()
returns trigger language plpgsql as $$
begin
  if new.tags && array['rostra','rostra-read-mcp','kb-build-followup','fasti','claude-code','dev-workflow']
     or new.title ilike 'rostra:%' or new.title ilike 'fasti:%' then
    new.category := 'development';
  end if;
  return new;
end;
$$;

drop trigger if exists set_category_from_tags on kb.entries;
create trigger set_category_from_tags
  before insert on kb.entries
  for each row execute function kb.set_category_from_tags();

-- 3. PREVIEW before committing the backfill — run this SELECT first and eyeball the
--    split. Uncomment the sample query to read the titles that will flip.
select count(*) filter (where dev)     as will_be_development,
       count(*) filter (where not dev) as will_stay_business
from (
  select (tags && array['rostra','rostra-read-mcp','kb-build-followup','fasti','claude-code','dev-workflow']
          or title ilike 'rostra:%' or title ilike 'fasti:%') as dev
  from kb.entries
  where coalesce(is_deleted, false) = false
) t;

-- select title, tags from kb.entries
-- where (tags && array['rostra','rostra-read-mcp','kb-build-followup','fasti','claude-code','dev-workflow']
--        or title ilike 'rostra:%' or title ilike 'fasti:%')
--   and coalesce(is_deleted, false) = false
-- order by title;

-- 4. Backfill existing rows once the preview looks right.
update kb.entries
set category = 'development'
where (tags && array['rostra','rostra-read-mcp','kb-build-followup','fasti','claude-code','dev-workflow']
       or title ilike 'rostra:%' or title ilike 'fasti:%')
  and category <> 'development';

-- Hand-fix any straggler afterwards, e.g.:
--   update kb.entries set category='development' where id='<uuid>';   -- force dev
--   update kb.entries set category='business'    where id='<uuid>';   -- keep on map
