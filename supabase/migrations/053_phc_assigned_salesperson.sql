-- ============================================================================
-- 053_phc_assigned_salesperson.sql
-- ============================================================================
-- When a renewal is handed off to a sales arborist to confirm, record WHICH
-- arborist. Points at the salespeople roster (the "arborist hub" list) so each
-- arborist can pull their own confirm list. on delete set null: removing a
-- salesperson just clears the assignment, it never deletes the renewal status.
-- ============================================================================

alter table phc_property_status
  add column if not exists assigned_salesperson_id uuid
    references salespeople(id) on delete set null;
