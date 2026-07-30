-- ============================================================================
-- 066_removal_entries.sql
-- Leadership-entered tree-removal jobs for the Cost Analysis calculator.
--
-- This is a HOLDING PEN. Every job leadership adds lands as 'pending' and is
-- invisible to the analysis. Only rows flipped to 'included' feed the figures
-- on /cost-analysis (see src/lib/cost-analysis.ts -> loadRemovals()). 'excluded'
-- rows are kept for the record but never counted. Nothing here touches the
-- hand-tuned pricing calculator (src/data/pricing-matrix.json) — that stays a
-- deliberate, reviewed artifact.
--
-- Invoice numbers are UNIQUE, so the same job can never be entered (and counted)
-- twice. The app also checks new invoices against the static historical export
-- before inserting, so an invoice already in that baseline is rejected too.
-- ============================================================================

create table if not exists removal_entries (
  id           uuid primary key default gen_random_uuid(),
  -- Invoice number — required, and unique so a job can't be double-counted.
  inv          text not null unique,
  -- true = removal WITH hauling; false = "no hauling". Mirrors the R-TR / R-TRNH
  -- distinction in the historical data.
  haul         boolean not null default true,
  price        numeric,
  dbh          numeric,
  -- Trunk count. >1 means a multi-stem/clump, which the analysis treats as
  -- not-comparable (same rule as the historical data).
  stems        integer not null default 1,
  height       numeric,
  crown        numeric,
  species      text,
  -- Salesperson, First + Last-initial per the house naming rule.
  seller       text,
  date         date,
  -- Municipal job — excluded from pricing like the office's own muni tag.
  muni         boolean not null default false,
  kind         text not null default 'tree' check (kind in ('tree', 'stump', 'vine', 'shrub')),
  -- The review state. 'pending' until leadership decides; only 'included'
  -- rows reach the analysis.
  status       text not null default 'pending' check (status in ('pending', 'included', 'excluded')),
  note         text,
  -- Audit trail: who added it, who last reviewed it.
  added_by     text,
  created_at   timestamptz not null default now(),
  reviewed_by  text,
  reviewed_at  timestamptz
);

create index if not exists removal_entries_status_idx on removal_entries (status);

alter table removal_entries enable row level security;

-- Read: any allowed user. (The page itself is gated to leadership in app code;
-- this policy is the backstop and keeps reads simple.)
drop policy if exists removal_entries_read on removal_entries;
create policy removal_entries_read on removal_entries
  for select using (is_allowed_user());

-- Write (insert / update / delete): admins and sales managers only — the same
-- "leadership" set that can see Cost Analysis.
drop policy if exists removal_entries_write on removal_entries;
create policy removal_entries_write on removal_entries
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
