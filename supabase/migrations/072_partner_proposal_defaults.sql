-- ============================================================================
-- 072_partner_proposal_defaults.sql
-- Two small additions to the Plant Health Program tables from migration 071.
--
-- Kept as a separate migration rather than editing 071, because 071 may already
-- have been applied.
--
-- 1. The DATABASE generates the proposal reference ('PHP-0007'), not the app.
--    A reference built in application code has to read-then-write, so two reps
--    starting a proposal in the same second can collide. A column default
--    backed by a sequence cannot.
--
-- 2. An updated_at trigger, so "last touched" on a proposal is true without
--    every caller remembering to set it. Uses set_updated_at() from 001.
-- ============================================================================

alter table partner_proposals
  alter column reference
  set default 'PHP-' || lpad(nextval('partner_proposal_ref_seq')::text, 4, '0');

drop trigger if exists partner_proposals_updated on partner_proposals;
create trigger partner_proposals_updated
  before update on partner_proposals
  for each row execute function set_updated_at();
