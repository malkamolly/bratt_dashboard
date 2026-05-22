-- ============================================================================
-- 030_sales_addon_attributions.sql
-- ============================================================================
-- Lets us attribute "Add-Ons" sales to individual field crew members.
--
-- The "Add-Ons" salesperson row already exists (see 002_seed_data.sql) and
-- represents non-roster technicians who book add-on work. Until now we just
-- entered one lump-sum amount per day. This table breaks that lump sum into
-- one row per (date, crew member, amount) entry. Multiple rows are allowed
-- per day per crew member -- if Taylor sells two add-ons on a day, that's
-- two rows.
--
-- The daily-entry server action computes the per-day SUM of these rows and
-- writes that sum into sales_entries (for the Add-Ons salesperson_id) so the
-- existing dashboards (pace math, week-by-week, YTD, etc.) keep working
-- without changes. This table is the source of truth for the per-member
-- breakdown shown on the Add-Ons detail page.
-- ============================================================================

create table sales_addon_attributions (
  id              uuid primary key default gen_random_uuid(),
  entry_date      date not null,
  crew_member_id  uuid not null references crew_members(id) on delete restrict,
  amount          numeric(12,2) not null default 0,
  note            text,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index sales_addon_attributions_date_idx
  on sales_addon_attributions(entry_date);
create index sales_addon_attributions_member_idx
  on sales_addon_attributions(crew_member_id);

create trigger sales_addon_attributions_updated
  before update on sales_addon_attributions
  for each row execute function set_updated_at();

alter table sales_addon_attributions enable row level security;

create policy sales_addon_attributions_read on sales_addon_attributions
  for select using (is_allowed_user());

create policy sales_addon_attributions_write on sales_addon_attributions
  for all using (is_allowed_user()) with check (is_allowed_user());
