-- ============================================================================
-- 014_meetings_and_sales_manager_role.sql
-- ============================================================================
-- Adds the 'sales_manager' role and the meetings table that powers the
-- /hub/meetings, /hub/library, and /hub/meetings/<slug>/present routes.
-- Seeds the two existing meetings (previously stored as markdown files) so
-- nothing disappears when the markdown is deleted.
-- ============================================================================

-- 1. Expand allowed_emails role enum to include 'sales_manager' --------------
alter table allowed_emails
  drop constraint if exists allowed_emails_role_check;

alter table allowed_emails
  add constraint allowed_emails_role_check
  check (role in ('admin', 'user', 'sales_arborist', 'field_crew', 'sales_manager'));

-- 2. Meetings table -----------------------------------------------------------
create table meetings (
  id                   uuid primary key default gen_random_uuid(),
  date                 date not null,
  title                text not null,
  slug                 text not null unique,
  educational_title    text,
  educational_tags     text[] not null default '{}',
  educational_body     text,
  operational_body     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           text
);

create index meetings_date_idx on meetings (date desc);
create index meetings_tags_idx on meetings using gin (educational_tags);

alter table meetings enable row level security;

-- Anyone on the allowlist can read meetings.
create policy meetings_select on meetings
  for select
  using (
    exists (
      select 1 from allowed_emails
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- Only admins and sales managers can write.
create policy meetings_insert on meetings
  for insert
  with check (
    exists (
      select 1 from allowed_emails
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role in ('admin', 'sales_manager')
    )
  );

create policy meetings_update on meetings
  for update
  using (
    exists (
      select 1 from allowed_emails
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role in ('admin', 'sales_manager')
    )
  );

create policy meetings_delete on meetings
  for delete
  using (
    exists (
      select 1 from allowed_emails
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role in ('admin', 'sales_manager')
    )
  );

-- 3. Seed the two existing meetings -----------------------------------------
-- Bodies use a single # for slide boundaries. The original markdown used ##
-- inside one big body; converting those into # makes each subsection a slide
-- (the existing meeting content is well-suited to one slide per subsection).

insert into meetings (date, title, slug, educational_title, educational_tags, educational_body, operational_body)
values
  (
    '2026-05-12',
    'Weekly Sales Meeting — May 12, 2026',
    '2026-05-12-armillaria-root-rot',
    'Armillaria Root Rot',
    array['Tree Disease', 'Diagnostics'],
$body$# What is it?
Armillaria root rot is a fungal disease that causes poor growth, yellow to brown foliage, and eventual death of the tree. The fungus can infect many deciduous and evergreen trees and shrubs. Infected trees have decayed roots and lower trunks — they often break or fall over in storms.

# How to identify it
Trees infected with Armillaria:

- Experience poor growth.
- Have small or yellow leaves on deciduous trees.
- Have browning needles on evergreens.
- Have dead branches in the upper canopy.
- May produce an abundant crop of seeds or cones.
- Eventually die.

Visible signs around the tree:

- Clusters of honey-colored mushrooms at the base of the tree in fall.
- Flat, white sheets of fungal growth between the bark and the wood at the base.
- Thick, black, shoestring-like fungal strands (rhizomorphs) on infected trees and in the soil around the base.
- On pine, spruce, or other evergreens, the base just below the soil surface may be encrusted in resin.
- Infected wood becomes white, soft, and stringy. Decay may extend up to 6 feet into the trunk.

# How it spreads
Armillaria can survive many years in wood debris like old stumps or root systems. New infections occur when healthy roots grow close to diseased roots. Black shoestring-like rhizomorphs can spread up to 10 feet from an infected tree or stump to infect healthy roots.

Once inside, the fungus colonizes the roots and the base of the trunk, causing wood decay. A vigorous tree can often slow the growth of the fungus; stressed trees are usually damaged very quickly.

Trees die of Armillaria root rot when:

- The infection girdles the base of the trunk.
- The trees fall over due to loss of roots.
- The weakened trunks break.

# How to manage it
**Reduce stress on trees**

- Mulch the soil around the base of the tree.
- Water trees during drought.
- Protect trees from wounding — do not injure trees with mowers, weed whips, or large equipment.

**Protect people and property**

- Remove unstable trees to prevent damage if they were to fall.

**Remove infected wood**

- Remove stumps and as many roots as possible from infected trees.

# Sales talking points
- Look for the visual cues above on every diagnostic visit; honey-colored mushrooms in fall are the giveaway.
- This is a structural risk — lead with safety when discussing removal with clients.
- Recommend stress-reduction (mulch, water, wound prevention) as a proactive service for at-risk trees nearby.
$body$,
$ops$# Housekeeping
- Submit timesheets by Friday EOD.
- Reminder: ride-alongs with the manager continue through the end of the month.

# Updates
- New proposal template is live in the CRM — please use it on all new leads.
- Spring promo runs through June 15; talking points are in the shared drive.
$ops$
  ),
  (
    '2026-05-19',
    'Weekly Sales Meeting — May 19, 2026',
    '2026-05-19-oak-wilt',
    'Oak Wilt',
    array['Tree Disease', 'Diagnostics'],
$body$# What is it?
Oak wilt is a vascular disease caused by the fungus Bretziella fagacearum. It blocks water movement in oak trees, often killing them within weeks (red oaks) or over multiple seasons (white oaks).

# How to identify it
- Wilting and browning of leaves, starting at the crown and moving downward.
- Veinal necrosis (browning along the leaf veins) on red oaks.
- Sudden leaf drop in summer, often half-green and half-brown leaves.
- Fungal spore mats under the bark of dying red oaks (cracked bark, pressure pads beneath).

# How it spreads
- **Overland**: sap-feeding beetles (nitidulids) carry spores from fungal mats to fresh wounds on healthy oaks.
- **Below ground**: oak roots graft together; the fungus moves tree-to-tree through interconnected root systems.
- Most overland infections happen April through July, when beetles are most active and fresh pruning wounds are common.

# How to manage it
**Prevent**

- Do not prune oaks April 1 – July 15. If you must, paint cuts immediately with tree wound paint.
- Disrupt root grafts in active pockets with a vibratory plow before removals.
- Inject high-value white oaks with propiconazole for protection or therapeutic treatment.

**Respond**

- Remove infected red oaks promptly; chip, burn, or debark wood that won't be used within the dormant season.
- Never move firewood from infected trees.

# Sales talking points
- Anchor on prevention: pruning timing and wound paint are easy wins to recommend.
- For at-risk neighborhoods, propose propiconazole injections as a 2-year preventive service.
- Pair removals with root-graft disruption to stop the underground spread.
$body$,
$ops$# Housekeeping
- Final week to submit Q2 development goals.
- Office closed Monday May 25 for Memorial Day.

# Updates
- Two new arborists onboarding next month — pair-ups will go out by end of week.
- Plant healthcare crew has open capacity for diagnostic add-ons through June.
$ops$
  )
on conflict (slug) do nothing;
