-- ============================================================================
-- 073_partner_proposal_revisions_to_spec.sql
-- Brings the Plant Health Program tables in line with what the hub actually
-- needs. Three changes, all in response to review of the first build.
--
-- 1. SALESPERSON IS JUST A NAME.
--    071 modelled their reps as a managed roster (partner_salespeople) so a
--    proposal had an auditable owner. That was over-built: the spec asked for a
--    salesperson NAME, and maintaining a roster for someone else's staff is
--    upkeep with no payoff. Now a plain text field on the proposal, and the
--    roster table is dropped.
--
-- 2. THE ADDRESS IS GEOCODED.
--    The typed address is checked against Google's Geocoding API when the
--    proposal is saved, and the result is stored: the canonical formatted
--    address plus coordinates. That gives us a real validation step (a typo'd
--    street simply won't resolve) and lets the proposal show a map of the site.
--    Coordinates are stored rather than re-geocoded on every page view, so a
--    proposal costs one Google call for its lifetime instead of one per open.
--
-- 3. SITE CONTACT IS GONE.
--    customer_name / customer_phone / access_notes are dropped — not wanted in
--    the flow. If the crew ever starts hitting locked gates, re-adding three
--    nullable text columns is a one-line migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Salesperson as a plain name
-- ---------------------------------------------------------------------------
alter table partner_proposals
  add column if not exists salesperson_name text;

-- Carry over anything already captured, so this is safe to run on live data.
-- Guarded on the roster still existing: without the check, a SECOND run of this
-- migration would reference the table the first run dropped and fail.
do $$
begin
  if to_regclass('partner_salespeople') is not null then
    update partner_proposals p
       set salesperson_name = s.name
      from partner_salespeople s
     where p.salesperson_id = s.id
       and p.salesperson_name is null;
  end if;
end $$;

alter table partner_proposals drop column if exists salesperson_id;
drop table if exists partner_salespeople;

-- ---------------------------------------------------------------------------
-- 2. Geocoded address
-- ---------------------------------------------------------------------------
-- site_address stays exactly as the rep typed it (never silently rewritten —
-- they may have local knowledge Google lacks). formatted_address is Google's
-- canonical version, and what the work order prints when it exists.
alter table partner_proposals
  add column if not exists formatted_address text,
  add column if not exists latitude  numeric(9, 6),
  add column if not exists longitude numeric(9, 6);

-- ---------------------------------------------------------------------------
-- 3. Drop the site-contact fields
-- ---------------------------------------------------------------------------
alter table partner_proposals
  drop column if exists customer_name,
  drop column if exists customer_phone,
  drop column if exists access_notes;
