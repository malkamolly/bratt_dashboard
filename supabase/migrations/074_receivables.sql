-- ============================================================================
-- 074_receivables.sql
-- Collections list: open balances per sales arborist (/hub/receivables and the
-- "Money Still Out There" panel on each arborist's roster page).
--
-- Two things here:
--   1. receivables_uploads — the parsed Job Completed Detail export.
--   2. salespeople.work_email — so a signed-in arborist can be matched to their
--      own roster row, which is what makes "you only see your own list" work.
--
-- Each upload REPLACES the report rather than adding to it: the newest row is
-- marked is_active and the previous one is retired. Old rows are kept (they
-- cost nothing and make a bad upload recoverable — flip is_active back), but
-- the pages only ever read the single active row. Same pattern as
-- followup_uploads (070) and phc_renewal_batches.
--
-- The computed report lives in `payload` as one JSON blob, in the shape of
-- ReceivablesData in src/lib/receivables.ts. Raw spreadsheet rows are NOT
-- stored separately: the aggregation happens once at upload time, and
-- re-uploading the export is the way to pick up a change to the analysis.
--
-- ACCESS
--   read   — everyone with Sales Arborist Hub access. An arborist must be able
--            to read the active row to see their own slice of it; WHICH rows
--            they are shown is decided in the app (an arborist gets only their
--            own invoices — see canSeeAllReceivables in src/lib/auth.ts), not
--            here. RLS answers "may this person read hub data at all".
--   write  — admin + sales_manager only, matching canUploadReceivables().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Work email on the roster row.
--    Needed to answer "which arborist is the person looking at this page?".
--    Nullable on purpose: until an email is filled in, that arborist simply
--    doesn't see a personal list (a safe default — we'd rather show nothing
--    than show them someone else's collections). The Receivables page flags
--    anyone still unmapped so it's obvious what's missing.
-- ---------------------------------------------------------------------------
alter table salespeople
  add column if not exists work_email text;

-- One arborist per address. Case-insensitive, because sign-in emails arrive in
-- whatever case the person typed and we compare them lowercased.
create unique index if not exists salespeople_work_email_key
  on salespeople (lower(work_email))
  where work_email is not null;

-- ---------------------------------------------------------------------------
-- 2. The uploaded report.
-- ---------------------------------------------------------------------------
create table if not exists receivables_uploads (
  id              uuid primary key default gen_random_uuid(),
  uploaded_at     timestamptz not null default now(),
  uploaded_by     text,
  source_filename text,
  is_active       boolean not null default true,
  -- Denormalized from payload so an admin list can be read without parsing it.
  invoice_count   integer not null default 0,
  total_balance   numeric(12,2) not null default 0,
  window_start    date,
  window_end      date,
  payload         jsonb not null
);

-- The pages' only query: the active row, newest first.
create index if not exists receivables_uploads_active_idx
  on receivables_uploads (is_active, uploaded_at desc);

alter table receivables_uploads enable row level security;

-- ---------------------------------------------------------------------------
-- Read: anyone with hub access. Mirrors HUB_ACCESS.hub in src/lib/auth.ts.
-- ---------------------------------------------------------------------------
drop policy if exists receivables_uploads_read on receivables_uploads;
create policy receivables_uploads_read on receivables_uploads
  for select using (
    exists (
      select 1 from allowed_emails
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role in ('admin', 'user', 'sales_manager', 'sales_arborist')
    )
  );

-- ---------------------------------------------------------------------------
-- Write: admin + sales_manager. Keep in sync with canUploadReceivables().
-- ---------------------------------------------------------------------------
drop policy if exists receivables_uploads_write on receivables_uploads;
create policy receivables_uploads_write on receivables_uploads
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
