-- ============================================================================
-- 065_off_season_arborist_read.sql
-- ============================================================================
-- Let Sales Arborists VIEW the off-season dashboard (read-only). Previously
-- read + write were both limited to admin / office / sales_manager via
-- off_season_can_access(). Sales arborists need to see the report from their
-- hub, but must not edit totals or goals.
--
-- Fix: widen only the SELECT policies to a new off_season_can_view() that also
-- includes 'sales_arborist'. The write policies (for all) are unchanged, so
-- inserts/updates/deletes stay office-only.
-- ============================================================================

create or replace function off_season_can_view() returns boolean
  language sql stable security definer
  set search_path = public
as $$
  select exists (
    select 1 from allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role in ('admin', 'user', 'sales_manager', 'sales_arborist')
  );
$$;

drop policy if exists off_season_seasons_read on off_season_seasons;
create policy off_season_seasons_read on off_season_seasons
  for select using (off_season_can_view());

drop policy if exists off_season_targets_read on off_season_targets;
create policy off_season_targets_read on off_season_targets
  for select using (off_season_can_view());

drop policy if exists off_season_entries_read on off_season_entries;
create policy off_season_entries_read on off_season_entries
  for select using (off_season_can_view());
