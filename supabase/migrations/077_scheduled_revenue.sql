-- ============================================================================
-- 077_scheduled_revenue.sql
-- Scheduled Revenue Calendar: what production revenue is on the board, by day
-- (/hub/revenue-calendar).
--
-- ServiceTitan shows you WHAT is scheduled but not WHAT IT IS WORTH per day.
-- This holds the "(Claude) Scheduled Revenue" export — one row per job with its
-- subtotal and scheduled date — aggregated into a per-day calendar so we can
-- look forward and see the money, not just the appointments.
--
-- SNAPSHOTS, same pattern as receivables (074) and followup_uploads (070).
-- Each import REPLACES the report: the newest row is is_active, the previous
-- one is retired. Old rows are kept — they cost nothing and make a bad import
-- recoverable by flipping is_active back — but the page only ever reads the one
-- active row. Jobs live inside `payload` as a single JSON blob (the shape of
-- ScheduledRevenueData in src/lib/scheduled-revenue.ts), never as appended
-- rows, so re-running an import cannot double-count anything.
--
-- source_date is the day the report is FOR. Exactly one snapshot is active per
-- day, and the day-over-day comparison looks for the most recent snapshot with
-- a DIFFERENT source_date — which is what makes running twice a day (6:30am and
-- 7:30pm) safe: the evening run replaces the morning one and both compare
-- against yesterday. See migration 076 for the bug that taught us this.
--
-- ACCESS
--   read   — everyone with Sales Arborist Hub access. Office/dispatch and the
--            sales team both need to see what's on the board; the hub is
--            already behind a login and shows the team each other's numbers.
--   write  — admin + sales_manager only, matching canUploadScheduledRevenue().
--            An import replaces the report for everyone, so it stays with the
--            people who run the schedule.
-- ============================================================================

create table if not exists scheduled_revenue_uploads (
  id              uuid primary key default gen_random_uuid(),
  uploaded_at     timestamptz not null default now(),
  uploaded_by     text,
  source_filename text,
  is_active       boolean not null default true,
  -- The day the report is FOR. Decides which snapshot is replaced and what the
  -- comparison runs against.
  source_date     date,
  -- Denormalized from payload so an admin list reads without parsing JSON.
  -- "firm" = Scheduled + In Progress. Jobs on Hold are deliberately NOT in it
  -- (see src/lib/scheduled-revenue.ts) and are counted separately.
  job_count       integer not null default 0,
  firm_revenue    numeric(12,2) not null default 0,
  hold_revenue    numeric(12,2) not null default 0,
  parked_revenue  numeric(12,2) not null default 0,
  window_start    date,
  window_end      date,
  payload         jsonb not null
);

-- The page's only query: the active row, newest first.
create index if not exists scheduled_revenue_uploads_active_idx
  on scheduled_revenue_uploads (is_active, uploaded_at desc);

-- The comparison query: most recent snapshot for a different day.
create index if not exists scheduled_revenue_uploads_source_date_idx
  on scheduled_revenue_uploads (source_date desc, uploaded_at desc);

alter table scheduled_revenue_uploads enable row level security;

-- ---------------------------------------------------------------------------
-- Read: anyone with hub access. Mirrors HUB_ACCESS.hub in src/lib/auth.ts.
-- ---------------------------------------------------------------------------
drop policy if exists scheduled_revenue_uploads_read on scheduled_revenue_uploads;
create policy scheduled_revenue_uploads_read on scheduled_revenue_uploads
  for select using (
    exists (
      select 1 from allowed_emails
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role in ('admin', 'user', 'sales_manager', 'sales_arborist')
    )
  );

-- ---------------------------------------------------------------------------
-- Write: admin + sales_manager. Keep in sync with canUploadScheduledRevenue().
-- ---------------------------------------------------------------------------
drop policy if exists scheduled_revenue_uploads_write on scheduled_revenue_uploads;
create policy scheduled_revenue_uploads_write on scheduled_revenue_uploads
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

-- ============================================================================
-- Call log for POST /api/scheduled-revenue/import and
-- GET /api/scheduled-revenue/summary. Same two jobs as
-- receivables_import_log (075):
--
--   1. AUDIT. Every call is recorded, rejections included, so a twice-daily job
--      that quietly starts sending empty files is visible after the fact.
--      Vercel's own logs roll off; this doesn't.
--
--   2. RATE LIMITING. Serverless functions don't share memory, so an in-process
--      counter resets unpredictably and limits nothing. Counting recent rows
--      here is the simplest thing that holds across instances.
--
-- Rows are written BEFORE the token is checked (outcome 'unauthorized') on
-- purpose: a failed attempt is exactly what's worth seeing.
-- ============================================================================

create table if not exists scheduled_revenue_import_log (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  -- 'import' or 'summary'.
  endpoint        text not null,
  -- Which day's report the caller said this was; null when the request was
  -- rejected before the body was read.
  source_date     date,
  source_filename text,
  -- Rows read from the file, before the grand-total row was dropped.
  rows_read       integer,
  job_count       integer,
  firm_revenue    numeric(12,2),
  -- 'ok' | 'unauthorized' | 'rate_limited' | 'bad_request' | 'unsupported'
  -- | 'too_large' | 'unprocessable' | 'error'
  outcome         text not null,
  status_code     integer not null,
  reason          text,
  client_ip       text,
  actor           text
);

-- The rate-limit query: recent rows for one caller.
create index if not exists scheduled_revenue_import_log_recent_idx
  on scheduled_revenue_import_log (client_ip, created_at desc);

-- The audit query: what happened lately, newest first.
create index if not exists scheduled_revenue_import_log_created_idx
  on scheduled_revenue_import_log (created_at desc);

alter table scheduled_revenue_import_log enable row level security;

drop policy if exists scheduled_revenue_import_log_read on scheduled_revenue_import_log;
create policy scheduled_revenue_import_log_read
  on scheduled_revenue_import_log
  for select
  to authenticated
  using (true);

-- No insert/update/delete policy on purpose: only the service-role client
-- writes here, and it bypasses RLS. A browser session can read the log and
-- nothing else.
