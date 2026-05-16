-- ============================================================================
-- Bratt Tree Dashboard - Sales monthly historicals
-- ============================================================================
-- Holds a single rolled-up dollar amount per (year, month, salesperson) for
-- months we don't have day-by-day detail for. Used to keep YTD totals
-- accurate without having to backfill fabricated daily numbers.
--
-- The live current-month dashboard still uses `sales_entries` (one row per
-- day per person). When a month has both, the historicals value WINS for
-- aggregate calculations - the intended migration path is:
--   1. Live month uses sales_entries.
--   2. After month-end the admin can lock the total by inserting a
--      historicals row.
-- ============================================================================

create table sales_monthly_historicals (
  year           int not null,
  month          int not null check (month between 1 and 12),
  salesperson_id uuid not null references salespeople(id) on delete restrict,
  amount         numeric(12,2) not null default 0,
  source_note    text,                                -- e.g. "ServiceTitan export, April 2026"
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (year, month, salesperson_id)
);
create index sales_monthly_historicals_year_idx on sales_monthly_historicals(year);

create trigger sales_monthly_historicals_updated before update on sales_monthly_historicals
  for each row execute function set_updated_at();

alter table sales_monthly_historicals enable row level security;

create policy sales_monthly_historicals_read on sales_monthly_historicals
  for select using (is_allowed_user());

create policy sales_monthly_historicals_admin_write on sales_monthly_historicals
  for all using (is_admin_user()) with check (is_admin_user());
