-- ============================================================================
-- 042_roster_in_database.sql
-- ============================================================================
-- Moves the Sales Arborist Hub "Team Roster" off the markdown files in
-- src/content/arborists/ and into the salespeople table, so that adding a
-- salesperson in Admin automatically puts them on the roster.
--
-- Adds the profile fields the markdown files used to hold (title, ISA
-- certification, ISA number, manager flag) plus:
--   * last_initial — so the roster can show "Alex P" while sales attribution
--     keeps matching on the first name ("Alex").
--   * on_roster    — so the non-human attribution buckets ("Other", "Add-Ons")
--     stay OFF the roster even though they live in this table.
-- ============================================================================

-- 1. New columns ------------------------------------------------------------
alter table salespeople
  add column if not exists last_initial text,
  add column if not exists title        text    not null default 'Sales Arborist',
  add column if not exists certified    boolean not null default false,
  add column if not exists isa_number   text,
  add column if not exists is_manager   boolean not null default false,
  add column if not exists on_roster    boolean not null default true;

-- 2. The attribution buckets are not people — keep them off the roster ------
update salespeople set on_roster = false where name in ('Other', 'Add-Ons');

-- 3. Backfill the existing roster from what the markdown files held ----------
--    (First name is already stored in `name`; we add the rest here.)
update salespeople set last_initial = 'B', title = 'Sales Manager', is_manager = true, certified = false                          where name = 'Brent';
update salespeople set last_initial = 'O', certified = true,  isa_number = 'MN-4494A'   where name = 'Caleb';
update salespeople set last_initial = 'T', certified = true,  isa_number = 'MN-327414A' where name = 'Clayton';
update salespeople set last_initial = 'A', certified = true,  isa_number = 'MN-4444A'   where name = 'Dave';
update salespeople set last_initial = 'R', certified = true,  isa_number = 'MN-4928A'   where name = 'Hayden';
update salespeople set last_initial = 'F', certified = true,  isa_number = 'MN-4666A'   where name = 'Ian';
update salespeople set last_initial = 'S', certified = true,  isa_number = 'MN-383403A' where name = 'Jacob';
update salespeople set last_initial = 'T', certified = false                            where name = 'Jake';
update salespeople set last_initial = 'W', certified = true,  isa_number = 'MN-4481AU'  where name = 'Patrick';
update salespeople set last_initial = 'C', certified = false                            where name = 'TJ';
update salespeople set last_initial = 'P', certified = false                            where name = 'Alex';
update salespeople set last_initial = 'A', certified = false                            where name = 'Sean';

-- 4. Carry over the default profile photos that used to live in the markdown
--    files (static assets under /public/brand/arborists/). Only fill these in
--    where an admin hasn't already uploaded a photo, so uploads always win.
update salespeople set photo_url = '/brand/arborists/clayton-t.png' where name = 'Clayton' and photo_url is null;
update salespeople set photo_url = '/brand/arborists/hayden-r.png'  where name = 'Hayden'  and photo_url is null;
update salespeople set photo_url = '/brand/arborists/ian-f.png'     where name = 'Ian'     and photo_url is null;
update salespeople set photo_url = '/brand/arborists/patrick-w.png' where name = 'Patrick' and photo_url is null;
update salespeople set photo_url = '/brand/arborists/tj-c.png'      where name = 'TJ'      and photo_url is null;
