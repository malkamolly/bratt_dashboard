-- ============================================================================
-- 054_phc_status_persist_by_location.sql
-- ============================================================================
-- Make a property's call status + arborist assignment STICK across re-uploads.
--
-- Originally phc_property_status was keyed by (batch_id, location_id), so every
-- new spreadsheet upload (a new batch) started every property from scratch and
-- lost assignments. A property's Location ID is stable in ServiceTitan across
-- exports, so we re-key the table on location_id alone and drop the batch link.
-- Now uploading a fresh list only refreshes the treatments/trees — the outreach
-- progress and "assigned to arborist" stay attached to the property.
-- ============================================================================

-- 1. Collapse any duplicate rows per property, keeping the most recent.
delete from phc_property_status a
 using phc_property_status b
 where a.location_id = b.location_id
   and (a.updated_at < b.updated_at
        or (a.updated_at = b.updated_at and a.id < b.id));

-- 2. Drop the batch link entirely (this also removes the old composite unique
--    constraint and the on-delete-cascade FK that could wipe statuses).
alter table phc_property_status drop constraint if exists phc_property_status_batch_id_location_id_key;
alter table phc_property_status drop column if exists batch_id;

-- 3. One status row per property.
alter table phc_property_status add constraint phc_property_status_location_id_key unique (location_id);
