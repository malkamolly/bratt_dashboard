-- ============================================================================
-- 075_receivables_import_log.sql
-- Call log for POST /api/receivables/import and GET /api/receivables/summary.
--
-- Two jobs, one table:
--
--   1. AUDIT. Every call is recorded — including rejected ones — so a daily job
--      that quietly starts posting empty files, or a token being probed, is
--      visible after the fact. Vercel's own logs roll off; this doesn't.
--
--   2. RATE LIMITING. Serverless functions don't share memory, so an in-process
--      counter would reset unpredictably and limit nothing. Counting recent
--      rows here is the simplest thing that actually holds across instances.
--
-- Rows are written BEFORE the token is checked (outcome 'unauthorized'), which
-- is deliberate: a failed attempt is exactly what's worth seeing, and it means
-- the rate limit applies to attackers rather than only to legitimate callers.
--
-- ACCESS
--   The API routes use the service-role client, which bypasses RLS. RLS is
--   still enabled with a read policy for the hub, so the log can be surfaced in
--   the UI later, and so nothing is readable by an ordinary session by default.
-- ============================================================================

create table if not exists receivables_import_log (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  -- 'import' or 'summary'.
  endpoint     text not null,
  -- Which day's report the caller said this was; null when it never got that
  -- far (rejected before the body was read).
  source_date  date,
  source_filename text,
  -- Rows read from the file, before paid rows were dropped. Null on failure.
  rows_read    integer,
  invoice_count integer,
  total_balance numeric(12,2),
  -- 'ok' | 'unauthorized' | 'rate_limited' | 'bad_request' | 'unsupported'
  -- | 'too_large' | 'unprocessable' | 'error'
  outcome      text not null,
  status_code  integer not null,
  -- Human-readable failure reason; null when outcome is 'ok'.
  reason       text,
  -- Coarse caller identity. There is no session here, so this is whatever the
  -- edge reported plus a label — enough to tell one job from a stranger.
  client_ip    text,
  actor        text
);

-- The rate-limit query: recent rows for one caller.
create index if not exists receivables_import_log_recent_idx
  on receivables_import_log (client_ip, created_at desc);

-- The audit query: what happened lately, newest first.
create index if not exists receivables_import_log_created_idx
  on receivables_import_log (created_at desc);

alter table receivables_import_log enable row level security;

drop policy if exists receivables_import_log_read on receivables_import_log;
create policy receivables_import_log_read
  on receivables_import_log
  for select
  to authenticated
  using (true);

-- No insert/update/delete policy on purpose: only the service-role client
-- writes here, and it bypasses RLS. A browser session can read the log and
-- nothing else.
