-- ============================================================================
-- 052_phc_renewals.sql
-- ============================================================================
-- Backs the PHC Scheduling Hub. Each spring the CSR uploads the "Location
-- Recurring Service" export (one row per treatment-on-a-tree that's due this
-- year). We store each upload as a BATCH, the parsed service lines, and a
-- per-property call/scheduling STATUS so the spring phone rush has a trackable
-- worklist.
--
-- We deliberately store the service lines close to how they arrive (raw
-- description kept verbatim, tree fields parsed out) and compute the
-- scheduling views (windows, flags, duplicates) at read time by joining to
-- phc_treatment_timing — so when an admin refines a treatment's window, every
-- batch reflects it immediately without re-uploading.
-- ============================================================================

-- 1. One row per upload -------------------------------------------------------
create table if not exists phc_renewal_batches (
  id              uuid primary key default gen_random_uuid(),
  label           text        not null,
  source_filename text,
  uploaded_by     text        not null,
  uploaded_at     timestamptz not null default now(),
  -- Only one batch is the "current" worklist at a time.
  is_active       boolean     not null default true
);

-- 2. One row per parsed service line -----------------------------------------
create table if not exists phc_renewal_services (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references phc_renewal_batches(id) on delete cascade,
  -- Identifiers straight from the export.
  event_id          text,
  customer_id       text,
  customer_name     text,
  location_id       text,
  location_name     text,
  location_address  text,
  -- Treatment name WITHOUT the "Tree Health Care: " prefix, so it joins to
  -- phc_treatment_timing.name.
  treatment_name    text not null,
  -- 'spray' or 'injection', derived from the treatment name.
  treatment_type    text,
  -- Fields parsed out of the free-text Item Description.
  num_trees         text,
  species           text,
  tree_location     text,
  dbh               text,
  -- First line of the description (used to catch "filed as X, described as Y").
  desc_title        text,
  raw_description   text,
  created_at        timestamptz not null default now()
);

create index if not exists phc_renewal_services_batch_idx
  on phc_renewal_services (batch_id, location_id);

-- 3. Per-property scheduling status (the call-tracking worklist) --------------
create table if not exists phc_property_status (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references phc_renewal_batches(id) on delete cascade,
  location_id text not null,
  -- not_started | called | voicemail | scheduled | declined
  status      text not null default 'not_started',
  note        text,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  unique (batch_id, location_id)
);

drop trigger if exists phc_property_status_updated on phc_property_status;
create trigger phc_property_status_updated before update on phc_property_status
  for each row execute function set_updated_at();

-- Row Level Security: any allowed user can read AND write these — the CSR
-- (office role) uploads batches and updates call status as part of daily work,
-- same as the daily sales/production entry tables. (Treatment TIMING stays
-- admin-only; that's a different table.)
alter table phc_renewal_batches  enable row level security;
alter table phc_renewal_services enable row level security;
alter table phc_property_status  enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'phc_renewal_batches','phc_renewal_services','phc_property_status'
  ] loop
    execute format('drop policy if exists %I_rw on %I', t, t);
    execute format('create policy %I_rw on %I for all using (is_allowed_user()) with check (is_allowed_user())', t, t);
  end loop;
end $$;
