-- ============================================================================
-- 071_partner_php_proposals.sql
-- The Plant Health Program hub (/partner) — proposals our landscaping partner
-- builds for their own customers, which become work orders sent to Bratt.
--
-- Flow: their rep starts a proposal → adds trees (size + photos) → picks a
-- treatment per tree → the tool prices it from src/lib/phc-pricing.ts → the
-- work order is sent to Bratt, which freezes a revision.
--
-- ACCESS — this is the important part, and it is UNLIKE every other table here
--
--   Partner users have NO Supabase session. They sign in with one shared
--   password and hold a plain cookie (see src/lib/partner-auth.ts), so RLS
--   cannot recognize them: there is no auth.uid() and no row in
--   allowed_emails. Writing a policy "for partners" is therefore impossible.
--
--   So every partner read and write goes through server-side code gated by the
--   partner cookie, using adminClient() (service role, which bypasses RLS).
--   The policies below deliberately grant NOTHING to anon or authenticated
--   users except read access for internal Bratt office staff, who need it for
--   the incoming work-order inbox.
--
--   That means: never query these tables from browser code, and never with the
--   anon key. The gate is the cookie check in the route/action, not RLS.
--
--   read   — admin + office (user) + sales_manager, for the Bratt-side inbox.
--   write  — service role only (i.e. our server code).
--
-- WHY PRICES ARE STORED, NOT JUST COMPUTED
--   phc-pricing.ts is the single source of truth for prices and stays that way.
--   But once a work order is sent, the numbers Bratt received must never move
--   because someone edited the price book afterwards. So each treatment line
--   snapshots the price it was quoted at, in integer cents, and each sent
--   revision snapshots the whole work order as JSON.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Their salespeople -------------------------------------------------------
-- ---------------------------------------------------------------------------
-- A picklist rather than a free-text field on each proposal: with one shared
-- login there is no identity behind a submission, so a typed name is both
-- typo-prone and useless as an audit trail.
--
-- Names follow the house convention — First Name + Last Initial ('Taylor M'),
-- never a full last name. See CLAUDE.md.
create table if not exists partner_salespeople (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists partner_salespeople_name_idx
  on partner_salespeople (lower(name));

-- ---------------------------------------------------------------------------
-- 2. Proposals ---------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Two INDEPENDENT statuses, on purpose:
--   job_status     — the partner's own sales pipeline (are they selling it?)
--   handoff_status — where it stands with Bratt (have we got it? is it booked?)
-- Collapsing them would lose the answer to "what have they sent us that we
-- haven't scheduled yet?", which is the question the inbox exists to answer.
create table if not exists partner_proposals (
  id              uuid primary key default gen_random_uuid(),
  -- Human-friendly id for phone calls and PDFs, e.g. 'PHP-0007'.
  reference       text not null unique,

  salesperson_id  uuid references partner_salespeople (id) on delete set null,
  job_name        text not null,
  site_address    text not null,

  -- Who Bratt's crew calls to get on the property. Optional, but a work order
  -- without it means showing up to a locked gate. Names use First Name + Last
  -- Initial like every other person record.
  customer_name   text,
  customer_phone  text,
  access_notes    text,

  job_status      text not null default 'proposing'
                  check (job_status in ('proposing', 'sold', 'dismissed')),

  handoff_status  text not null default 'draft'
                  check (handoff_status in ('draft', 'sent', 'received', 'scheduled')),

  -- Bumped each time a sent work order is edited and re-sent. Revision N's
  -- frozen contents live in partner_proposal_revisions.
  revision        integer not null default 1,

  -- Set when the current revision has been sent. An unsent edit clears it.
  sent_at         timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The inbox lists what Bratt has received, newest first.
create index if not exists partner_proposals_handoff_idx
  on partner_proposals (handoff_status, sent_at desc);

-- The partner's own list, newest first.
create index if not exists partner_proposals_created_idx
  on partner_proposals (created_at desc);

-- Reference numbers: a sequence so two reps starting a proposal at the same
-- moment can't collide. Formatted in the app as 'PHP-0007'.
create sequence if not exists partner_proposal_ref_seq start 1;

-- ---------------------------------------------------------------------------
-- 3. Trees -------------------------------------------------------------------
-- ---------------------------------------------------------------------------
create table if not exists partner_proposal_trees (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references partner_proposals (id) on delete cascade,

  -- How the crew finds this specific tree on arrival: 'Front maple, NE corner'.
  -- With eight trees at one address, "tree 3" is not directions.
  label       text not null,

  -- Many treatments are species-specific (Apple Scab, Pine Sawfly,
  -- Rhizosphaera). Species is what lets the picker show only relevant
  -- treatments and lets Connor sanity-check the choice.
  species     text,

  -- Diameter at breast height, inches. The ONLY input current pricing uses.
  dbh         numeric(6, 2) not null,

  -- Height matters for pricing indirectly: single-spray chart prices are void
  -- over 25 ft, which flips the line to "Bratt to quote".
  height_ft   numeric(6, 2),

  -- Recorded for the file and for Connor's review; no current price depends
  -- on it.
  crown_spread_ft numeric(6, 2),

  notes       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists partner_proposal_trees_proposal_idx
  on partner_proposal_trees (proposal_id, sort_order);

-- ---------------------------------------------------------------------------
-- 4. Tree photos -------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- At least one photo per tree is required, enforced in the app (a DB-level
-- check can't express "at least one child row" without a trigger, and the
-- friendly error belongs next to the upload UI anyway).
create table if not exists partner_tree_photos (
  id           uuid primary key default gen_random_uuid(),
  tree_id      uuid not null references partner_proposal_trees (id) on delete cascade,
  -- Path inside the private 'partner-photos' bucket. Served to browsers as a
  -- short-lived signed URL, never a public link — these are photographs of
  -- someone's home.
  storage_path text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists partner_tree_photos_tree_idx
  on partner_tree_photos (tree_id, sort_order);

-- ---------------------------------------------------------------------------
-- 5. Chosen treatments -------------------------------------------------------
-- ---------------------------------------------------------------------------
-- One row per treatment per tree. Deliberately many-per-tree: real PHC work
-- often stacks two or three treatments on the same tree.
create table if not exists partner_tree_treatments (
  id         uuid primary key default gen_random_uuid(),
  tree_id    uuid not null references partner_proposal_trees (id) on delete cascade,

  -- Matches a Service.id in src/lib/phc-pricing.ts. Text, not a foreign key:
  -- the price book is code, not a table, and keeping it that way is what makes
  -- our arborists and the partner quote from one list.
  service_id text not null,

  -- The price at the moment it was quoted, in integer cents (no float money).
  -- Null when the tree is off the chart — see needs_quote.
  unit_price_cents integer,

  -- True when phc-pricing.ts returns 'consult the PHC manager' — a tree bigger
  -- than the chart, or a single spray on a tree over 25 ft. The work order
  -- still sends; this line reads "Bratt to quote" and is excluded from the
  -- total instead of silently pricing wrong.
  needs_quote boolean not null default false,
  quote_note  text,

  created_at timestamptz not null default now()
);

create index if not exists partner_tree_treatments_tree_idx
  on partner_tree_treatments (tree_id);

create unique index if not exists partner_tree_treatments_unique_idx
  on partner_tree_treatments (tree_id, service_id);

-- ---------------------------------------------------------------------------
-- 6. Sent revisions ----------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Sending freezes the work order. `snapshot` is the whole thing as it was sent
-- — trees, treatments, prices, totals — so the PDF in Bratt's inbox always has
-- a matching stored record, even after the partner edits and re-sends.
create table if not exists partner_proposal_revisions (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references partner_proposals (id) on delete cascade,
  revision    integer not null,
  snapshot    jsonb not null,
  -- The generated PDF, in the private 'partner-photos' bucket under work-orders/.
  pdf_path    text,
  sent_to     text,
  sent_at     timestamptz not null default now(),
  -- Which email actually went out, for when someone asks "did they get it?".
  email_status text not null default 'pending'
               check (email_status in ('pending', 'sent', 'failed')),
  email_error text
);

create unique index if not exists partner_proposal_revisions_unique_idx
  on partner_proposal_revisions (proposal_id, revision);

create index if not exists partner_proposal_revisions_sent_idx
  on partner_proposal_revisions (sent_at desc);

-- ---------------------------------------------------------------------------
-- 7. RLS ---------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Read-only for internal office roles (the Bratt inbox). No insert/update/
-- delete policies at all, so nothing but the service role can write. Partner
-- traffic never reaches these tables except through our server code.
alter table partner_salespeople        enable row level security;
alter table partner_proposals          enable row level security;
alter table partner_proposal_trees     enable row level security;
alter table partner_tree_photos        enable row level security;
alter table partner_tree_treatments    enable row level security;
alter table partner_proposal_revisions enable row level security;

-- Mirrors canUsePhcScheduling() in src/lib/auth.ts — the office/dispatch set
-- who already handle PHC work.
create or replace function php_can_read() returns boolean
  language sql stable security definer
  set search_path = public
as $$
  select exists (
    select 1 from allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role in ('admin', 'user', 'sales_manager')
  );
$$;

drop policy if exists partner_salespeople_office_read on partner_salespeople;
create policy partner_salespeople_office_read on partner_salespeople
  for select using (php_can_read());

drop policy if exists partner_proposals_office_read on partner_proposals;
create policy partner_proposals_office_read on partner_proposals
  for select using (php_can_read());

drop policy if exists partner_proposal_trees_office_read on partner_proposal_trees;
create policy partner_proposal_trees_office_read on partner_proposal_trees
  for select using (php_can_read());

drop policy if exists partner_tree_photos_office_read on partner_tree_photos;
create policy partner_tree_photos_office_read on partner_tree_photos
  for select using (php_can_read());

drop policy if exists partner_tree_treatments_office_read on partner_tree_treatments;
create policy partner_tree_treatments_office_read on partner_tree_treatments
  for select using (php_can_read());

drop policy if exists partner_proposal_revisions_office_read on partner_proposal_revisions;
create policy partner_proposal_revisions_office_read on partner_proposal_revisions
  for select using (php_can_read());

-- ---------------------------------------------------------------------------
-- 8. Photo + PDF storage -----------------------------------------------------
-- ---------------------------------------------------------------------------
-- PRIVATE, unlike the public 'meeting-images' bucket: these are photographs of
-- customers' homes and signed work orders. Browsers get short-lived signed URLs
-- minted server-side after the partner cookie check.
insert into storage.buckets (id, name, public)
values ('partner-photos', 'partner-photos', false)
on conflict (id) do nothing;

-- No storage policies for anon/authenticated: uploads and reads both go through
-- our server code with the service role, which bypasses them. Office staff read
-- photos through the same signed-URL path, so they need no direct grant either.
