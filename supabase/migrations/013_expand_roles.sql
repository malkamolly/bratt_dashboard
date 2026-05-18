-- ============================================================================
-- 013_expand_roles.sql
-- ============================================================================
-- Expand the allowed_emails.role check constraint from ('user', 'admin') to
-- the 4-role model needed for the multi-hub setup:
--
--   admin           - full edit access to every hub
--   user            - office staff; view + daily entry on Pace, view on Hubs
--   sales_arborist  - view-only on the Sales Arborist Hub
--   field_crew      - view-only on the Field Crew Hub (phase 3, future)
--
-- Existing rows already use 'user' or 'admin', so no data backfill is needed.
-- ============================================================================

alter table allowed_emails
  drop constraint if exists allowed_emails_role_check;

alter table allowed_emails
  add constraint allowed_emails_role_check
  check (role in ('admin', 'user', 'sales_arborist', 'field_crew'));
