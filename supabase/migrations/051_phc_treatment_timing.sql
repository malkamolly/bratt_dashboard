-- ============================================================================
-- 051_phc_treatment_timing.sql
-- ============================================================================
-- Backs the new Plant Health Care (PHC) scheduling work. This is the "timing
-- layer" the app was missing: the price book (src/lib/phc-pricing.ts) knows
-- WHAT each treatment is and how much it costs, but nothing in the app knew
-- WHEN each treatment can happen during the season. That seasonal timing is the
-- expert knowledge that makes scheduling possible — when a treatment's window
-- opens/closes, how many visits it needs, and which ones must go first.
--
-- One row per renewable treatment. Seeded from the PHC CSR's master treatment
-- list with best-guess windows so the tool works on day one; an admin then
-- refines the windows in-app (Admin -> PHC Treatment Timing) as the tree-care
-- experts confirm them. Rows flagged needs_pricing are treatments we renew that
-- are NOT yet in the price book / calculator.
--
-- The "window" is stored as month numbers (1=Jan .. 12=Dec). Most treatments
-- have one window; the ones the CSR noted as "May/Sept" can run in EITHER of two
-- windows (spring or fall), so there are two optional window slots. `anytime`
-- means any time in the season (windows ignored). `is_first_of_season` is the
-- hard "this must be the property's first treatment of the year" rule.
-- ============================================================================

create table if not exists phc_treatment_timing (
  id                  uuid primary key default gen_random_uuid(),
  -- Full treatment name as the CSR/sales team know it.
  name                text    not null unique,
  -- Links to a Service `id` in src/lib/phc-pricing.ts so price + timing line up.
  -- NULL = this treatment is renewed but not yet in the price book / calculator.
  price_book_id       text,
  -- 'spray' or 'injection'. This mirrors WHICH CREW/EQUIPMENT goes out: basal
  -- drenches are applied like sprays, so they're 'spray'; soil + trunk
  -- injections are 'injection'. NULL only if genuinely unknown.
  treatment_type      text,
  -- How many visits this treatment needs (e.g. a 3-spray program = 3).
  visits              integer not null default 1,
  -- Days between visits when visits > 1 (the CSR's rule: always 2 weeks).
  visit_interval_days integer not null default 14,
  -- Renewal cadence in months (12 = yearly, 24 = every other year, 36 = every 3).
  frequency_months    integer not null default 12,
  -- True = can be done any time during the season; window months are ignored.
  anytime             boolean not null default false,
  -- True = must be the property's FIRST treatment of the season.
  is_first_of_season  boolean not null default false,
  -- Primary window (month numbers 1-12). NULL when anytime is true.
  window_start_month  integer,
  window_end_month    integer,
  -- Optional second window for treatments doable in spring OR fall ("May/Sept").
  window2_start_month integer,
  window2_end_month   integer,
  -- Free-text note: preserves the original timing note and flags estimates the
  -- experts still need to confirm.
  timing_note         text,
  -- True = renewed but not yet priced in the calculator (a known gap to fill).
  needs_pricing       boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Reuse the shared updated_at trigger function defined in migration 001.
drop trigger if exists phc_treatment_timing_updated on phc_treatment_timing;
create trigger phc_treatment_timing_updated before update on phc_treatment_timing
  for each row execute function set_updated_at();

-- Row Level Security: any allowed user may READ the timing (the scheduler and
-- CSR need it), but only an admin may CHANGE it — per the requirement that only
-- admins adjust timing. Mirrors the helper functions from migration 001.
alter table phc_treatment_timing enable row level security;

drop policy if exists phc_treatment_timing_read on phc_treatment_timing;
create policy phc_treatment_timing_read on phc_treatment_timing
  for select using (is_allowed_user());

drop policy if exists phc_treatment_timing_admin_write on phc_treatment_timing;
create policy phc_treatment_timing_admin_write on phc_treatment_timing
  for all using (is_admin_user()) with check (is_admin_user());

-- ----------------------------------------------------------------------------
-- Seed data. Windows marked "(estimated)" in the note are best guesses for the
-- treatments whose timing cell was blank — confirm with the experts in-app.
-- Re-runnable: on conflict (name) do nothing.
-- ----------------------------------------------------------------------------
insert into phc_treatment_timing
  (name, price_book_id, treatment_type, visits, frequency_months, anytime,
   is_first_of_season, window_start_month, window_end_month,
   window2_start_month, window2_end_month, timing_note, needs_pricing)
values
  ('Anthracnose Treatment (Spray)', 'anthracnose', 'spray', 2, 12, false, false, 4, 6, null, null, 'Estimated: spring foliar spray after leaf-out — confirm with expert.', false),
  ('Antibiotic Fire Blight Treatment', null, 'injection', 1, 12, true, false, null, null, null, null, 'Anytime. NOT YET IN PRICE BOOK — add pricing.', true),
  ('Aphids Treatment (Spray)', 'aphid', 'spray', 1, 12, false, false, 5, 5, 9, 9, 'Spring or fall (was "May/Sept").', false),
  ('Bronze Birch Borer Treatment (Basal Drench)', 'bbb-basal-drench', 'spray', 1, 12, true, false, null, null, null, null, 'Anytime.', false),
  ('Bronze Birch Borer Treatment (Injected)', 'bbb-trunk-injection', 'injection', 1, 24, true, false, null, null, null, null, 'Anytime. Every other year.', false),
  ('Bur Oak Blight Treatment (Injection)', 'bur-oak-blight', 'injection', 1, 24, false, false, 5, 5, 9, 9, 'Spring or fall (was "May/Sept"). Every other year.', false),
  ('Canker Disease Trunk Injection', 'canker-disease-trunk-injection', 'injection', 1, 12, false, false, 5, 5, 9, 9, 'Spring or fall (was "May/Sept").', false),
  ('Cedar Apple Rust Treatment (Spray)', 'cedar-apple-rust', 'spray', 2, 12, false, false, 4, 6, null, null, 'Estimated: spring foliar spray after leaf-out — confirm with expert.', false),
  ('Chlorosis Treatment (Fall) - Deciduous Trees', 'chlorosis-fall', 'injection', 1, 24, false, false, 10, 10, null, null, 'Fixed: October. Every other year.', false),
  ('Chlorosis Treatment (Summer) - Birch, Oak or White Pine', 'chlorosis-summer', 'injection', 1, 12, false, false, 5, 5, 9, 9, 'Spring or fall (was "May/Sept").', false),
  ('Crab Apple Protection from Apple Scab - Anytime-of-Year Treatment (Injection)', 'apple-scab-inject-anytime', 'injection', 1, 24, false, false, 5, 5, 9, 9, 'Spring or fall (was "May/Sept"). Every other year.', false),
  ('Crab Apple Protection from Apple Scab - Pre-Season Treatment (Injection)', 'apple-scab-inject-budding', 'injection', 1, 24, false, false, 3, 4, null, null, 'Estimated: pre-season / before bud break — confirm with expert. (Calculator calls this "Budding Season".)', false),
  ('Crab Apple Protection from Apple Scab Treatment (Spray)', 'apple-scab-spray', 'spray', 2, 12, false, true, 4, 5, null, null, 'MUST be the first treatment of the season, always.', false),
  ('Diplodia Tip Blight Treatment (Injection)', 'diplodia-trunk-injection', 'injection', 1, 24, false, false, 5, 5, 9, 9, 'Estimated: spring or fall like other conifer injections — confirm with expert. Every other year.', false),
  ('Diplodia Tip Blight Treatment (Spray)', 'diplodia-tip-blight', 'spray', 3, 12, false, false, 5, 7, null, null, 'Estimated: 3-spray program on new growth — confirm with expert.', false),
  ('Dothistroma Needle Blight Treatment (Injection)', 'dothistroma-trunk-injection', 'injection', 1, 24, false, false, 5, 5, 9, 9, 'Spring or fall (was "May/Sept"). Every other year.', false),
  ('Dothistroma Needle Blight Treatment (Spray)', 'dothistroma-needle-blight', 'spray', 3, 12, false, false, 5, 7, null, null, 'Estimated: 3-spray program on new growth — confirm with expert.', false),
  ('Drought Stress Protection (Soil Injection)', 'drought-stress', 'injection', 1, 12, true, false, null, null, null, null, 'Anytime.', false),
  ('Dutch Elm Disease Treatment (Injection)', 'dutch-elm-disease', 'injection', 1, 24, false, false, 5, 5, 9, 9, 'Estimated: spring or fall — confirm with expert. Visit count was blank (assumed 1). Every other year.', false),
  ('Emerald Ash Borer Treatment (Basal Drench)', 'eab-basal-drench', 'spray', 1, 12, true, false, null, null, null, null, 'Anytime.', false),
  ('Emerald Ash Borer Treatment (Injected)', 'eab-trunk-injection', 'injection', 1, 24, true, false, null, null, null, null, 'Anytime. Every other year.', false),
  ('European Pine Sawfly Treatment (Spray)', 'european-pine-sawfly', 'spray', 1, 12, false, false, 4, 5, null, null, 'Estimated: early spring when larvae emerge — confirm with expert.', false),
  ('GrowSmart Treatment (Growth Regulator)', 'growsmart', 'injection', 1, 36, true, false, null, null, null, null, 'Anytime. Every 3 years. Type assumed soil injection (was blank).', false),
  ('Insecticide Treatment (Basal Drench)', 'insecticide-basal-drench', 'spray', 1, 12, true, false, null, null, null, null, 'Anytime.', false),
  ('Insecticide Treatment (Trunk Injection)', 'insecticide-trunk-injection', 'injection', 1, 24, true, false, null, null, null, null, 'Anytime. Every other year.', false),
  ('Japanese Beetle Treatment (Spray)', 'japanese-beetle', 'spray', 1, 12, false, false, 7, 8, null, null, 'Estimated: mid-summer adult emergence — confirm with expert.', false),
  ('Leafminers Treatment (Spray)', 'leaf-miner', 'spray', 1, 12, false, false, 5, 6, null, null, 'Estimated: late spring as leaves emerge — confirm with expert.', false),
  ('Magnolia Scale Suppression Treatment (Basal Drench)', null, 'spray', 1, 12, false, false, 4, 4, null, null, 'Fixed: April. NOT YET IN PRICE BOOK — add pricing.', true),
  ('Marssonina Leaf Spot Treatment (Spray)', 'marssonina-leaf-spot', 'spray', 2, 12, false, false, 4, 6, null, null, 'Estimated: spring foliar spray after leaf-out — confirm with expert.', false),
  ('Oak Wilt Protection (Injected)', 'oak-wilt-protection', 'injection', 1, 24, false, false, 5, 5, 9, 9, 'Spring or fall (was "May/Sept"). Every other year.', false),
  ('Rhizosphaera Needle Cast Treatment (Spray)', 'rhizosphaera-needle-cast', 'spray', 3, 12, false, false, 5, 7, null, null, 'Estimated: 3-spray program on new growth — confirm with expert.', false),
  ('Root Developer Treatment (Soil Injected)', 'root-developer', 'injection', 1, 12, true, false, null, null, null, null, 'Anytime.', false),
  ('Soil Fertility Treatment (Fall) - Soil Injection', 'soil-fertility-fall', 'injection', 1, 12, false, false, 10, 10, null, null, 'Fixed: October.', false),
  ('Soil Fertility Treatment (Spring) - Soil Injection', 'soil-fertility-spring', 'injection', 1, 12, false, false, 5, 5, null, null, 'Fixed: May.', false),
  ('Soil Fertility Treatment (Summer) - Soil Injection', 'soil-fertility-summer', 'injection', 1, 12, false, false, 7, 7, null, null, 'Fixed: July.', false),
  ('Spider Mite Treatment - FALL (Spray)', 'spider-mite-fall', 'spray', 1, 12, false, false, 9, 9, null, null, 'Fixed: September.', false),
  ('Spider Mite Treatment - SPRING (Spray)', 'spider-mite-spring', 'spray', 1, 12, false, false, 5, 5, null, null, 'Fixed: May.', false),
  ('Two-Lined Chestnut Borer Protection (Basal Drench)', 'tlcb-protection', 'spray', 1, 12, true, false, null, null, null, null, 'Anytime.', false),
  ('Two-Lined Chestnut Borer Protection (Injected)', 'tlcb-treatment', 'injection', 1, 24, true, false, null, null, null, null, 'Anytime. Every other year.', false),
  ('Verticillium Wilt Treatment (Injection)', 'verticillium-wilt', 'injection', 1, 12, false, false, 5, 5, 9, 9, 'Spring or fall (was "May/Sept").', false)
on conflict (name) do nothing;
