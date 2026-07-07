-- ============================================================================
-- 055_phc_service_phones.sql
-- ============================================================================
-- Capture phone numbers from the renewals export so the arborist hand-off
-- includes a number to call. Optional columns — older uploads simply leave them
-- blank; a fresh upload with the new spreadsheet columns fills them in.
-- ============================================================================

alter table phc_renewal_services
  add column if not exists customer_phone text,
  add column if not exists location_phone text;
