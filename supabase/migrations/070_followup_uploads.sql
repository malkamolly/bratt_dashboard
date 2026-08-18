-- ============================================================================
-- 070_followup_uploads.sql
-- Weekly spreadsheet uploads behind the Follow-Up Scorecard (/hub/followup).
--
-- Each upload REPLACES the report rather than adding to it: the newest row is
-- marked is_active and the previous one is retired. Old rows are kept (they cost
-- nothing and make a bad upload recoverable — flip is_active back), but the page
-- only ever reads the single active row. Same pattern as phc_renewal_batches.
--
-- The computed report lives in `payload` as one JSON blob, in the shape of
-- ScorecardData in src/lib/followup-scorecard.ts. Raw spreadsheet rows are NOT
-- stored: the aggregation happens once at upload time. That keeps this table
-- tiny, and re-uploading the export is the way to pick up a change to the
-- analysis — worth knowing before editing computeScorecard().
--
-- ACCESS
--   read   — everyone with Sales Arborist Hub access, including sales arborists.
--            The timed embargo on this report is enforced in the app
--            (canSeeFollowupScorecard in src/lib/auth.ts), not here: RLS answers
--            "may this person read hub data at all", and after the release time
--            arborists must be able to. Nothing else queries this table.
--   write  — admin + sales_manager only, matching canUploadFollowupData().
-- ============================================================================

create table if not exists followup_uploads (
  id              uuid primary key default gen_random_uuid(),
  uploaded_at     timestamptz not null default now(),
  uploaded_by     text,
  source_filename text,
  is_active       boolean not null default true,
  -- Denormalized from payload so the admin list can be read without parsing it.
  row_count       integer not null default 0,
  window_start    date,
  window_end      date,
  payload         jsonb not null
);

-- The page's only query: the active row, newest first.
create index if not exists followup_uploads_active_idx
  on followup_uploads (is_active, uploaded_at desc);

alter table followup_uploads enable row level security;

-- ---------------------------------------------------------------------------
-- Read: anyone with hub access. Mirrors HUB_ACCESS.hub in src/lib/auth.ts.
-- ---------------------------------------------------------------------------
drop policy if exists followup_uploads_read on followup_uploads;
create policy followup_uploads_read on followup_uploads
  for select using (
    exists (
      select 1 from allowed_emails
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role in ('admin', 'user', 'sales_manager', 'sales_arborist')
    )
  );

-- ---------------------------------------------------------------------------
-- Write: admin + sales_manager. Keep in sync with canUploadFollowupData().
-- ---------------------------------------------------------------------------
drop policy if exists followup_uploads_write on followup_uploads;
create policy followup_uploads_write on followup_uploads
  for all
  using (
    exists (
      select 1 from allowed_emails
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role in ('admin', 'sales_manager')
    )
  )
  with check (
    exists (
      select 1 from allowed_emails
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role in ('admin', 'sales_manager')
    )
  );
