-- ============================================================================
-- 078_scheduled_revenue_office_write.sql
-- Let the office import the Revenue Calendar by hand.
--
-- 077 shipped this table with the same write policy as the collections list —
-- admin + sales_manager — because it was built inside the Sales Arborist Hub.
-- It has since moved to /production/revenue-calendar, which is a scheduling
-- tool: the people who would ever need to re-import it by hand are dispatch.
-- So `user` (Office) joins the write policy.
--
-- This only affects the MANUAL upload. The twice-daily refresh posts to
-- /api/scheduled-revenue/import with a bearer token and the service-role
-- client, which bypasses RLS entirely and is unaffected either way.
--
-- Read access is unchanged and stays open to everyone the table already
-- allowed; the page itself is gated to the production/office audience by
-- requireHubAccess('pace').
--
-- Keep in sync with canUploadScheduledRevenue() in src/lib/auth.ts.
-- ============================================================================

drop policy if exists scheduled_revenue_uploads_write on scheduled_revenue_uploads;
create policy scheduled_revenue_uploads_write on scheduled_revenue_uploads
  for all
  using (
    exists (
      select 1 from allowed_emails
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role in ('admin', 'user', 'sales_manager')
    )
  )
  with check (
    exists (
      select 1 from allowed_emails
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role in ('admin', 'user', 'sales_manager')
    )
  );
