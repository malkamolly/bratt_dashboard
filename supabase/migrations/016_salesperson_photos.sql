-- ============================================================================
-- 016_salesperson_photos.sql
-- ============================================================================
-- Adds a per-salesperson photo. The URL points at an object in the
-- 'salesperson-photos' Storage bucket created below. Public read; only admins
-- can upload or delete (matches the rest of the roster-editing surface).
-- ============================================================================

-- 1. Column -----------------------------------------------------------------
alter table salespeople
  add column if not exists photo_url text;

-- 2. Storage bucket ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('salesperson-photos', 'salesperson-photos', true)
on conflict (id) do update set public = excluded.public;

-- 3. Policies ---------------------------------------------------------------
drop policy if exists "Public read salesperson photos" on storage.objects;
drop policy if exists "Admins can upload salesperson photos" on storage.objects;
drop policy if exists "Admins can delete salesperson photos" on storage.objects;

create policy "Public read salesperson photos"
on storage.objects for select
using (bucket_id = 'salesperson-photos');

create policy "Admins can upload salesperson photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'salesperson-photos'
  and exists (
    select 1 from allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role = 'admin'
  )
);

create policy "Admins can delete salesperson photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'salesperson-photos'
  and exists (
    select 1 from allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role = 'admin'
  )
);
