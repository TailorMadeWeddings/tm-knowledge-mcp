-- 04_bigbrain_readonly_rls.sql
-- Run manually in the Big Brain Supabase SQL editor (project ebujpuesxhhmpxivqkml).
--
-- RLS is enabled on kb.entries and kb.links. The Worker reads via a service role
-- that bypasses RLS; the Rostra map's read credential (role `bigbrain_readonly`,
-- created for TAI-218) is a plain role and therefore sees ZERO rows until it has
-- an explicit SELECT policy — which is why the graph came back empty.
--
-- These policies are deliberately DEFENSE-IN-DEPTH: the role can only ever read
-- LIVE TEAM rows, and only links whose BOTH endpoints are live team entries. So
-- the credential is physically unable to return a private or soft-deleted entry
-- (or an edge touching one) even if the edge function's own query were wrong.
-- Policies are permissive and OR-ed with any existing ones, so this only ADDS
-- access for bigbrain_readonly and does not affect the Worker's service role.

create policy bigbrain_readonly_entries on kb.entries
  for select to bigbrain_readonly
  using (visibility = 'team' and coalesce(is_deleted, false) = false);

create policy bigbrain_readonly_links on kb.links
  for select to bigbrain_readonly
  using (
    exists (
      select 1 from kb.entries a
      where a.id = from_id
        and a.visibility = 'team' and coalesce(a.is_deleted, false) = false
    )
    and exists (
      select 1 from kb.entries b
      where b.id = to_id
        and b.visibility = 'team' and coalesce(b.is_deleted, false) = false
    )
  );
