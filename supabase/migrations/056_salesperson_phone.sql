-- ============================================================================
-- 056_salesperson_phone.sql
-- ============================================================================
-- Adds a phone number to each salesperson so the Sales Arborist Team Roster
-- (and each arborist's profile page) can show a tap-to-call number.
-- Optional — the column starts blank and an admin fills it in from
-- Admin → Sales → Roster.
-- ============================================================================

alter table salespeople
  add column if not exists phone text;
