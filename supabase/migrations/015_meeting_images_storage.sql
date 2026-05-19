-- ============================================================================
-- 015_meeting_images_storage.sql
-- ============================================================================
-- Creates the Supabase Storage bucket for meeting slide images and the RLS
-- policies that govern access. Anyone signed in (or even anonymous, since the
-- bucket is public) can view images; only admin + sales_manager can upload
-- or delete.
-- ============================================================================

-- 1. The bucket -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('meeting-images', 'meeting-images', true)
on conflict (id) do update set public = excluded.public;

-- 2. Policies ---------------------------------------------------------------
-- Drop first in case this migration is being re-run.
drop policy if exists "Public read meeting images" on storage.objects;
drop policy if exists "Editors can upload meeting images" on storage.objects;
drop policy if exists "Editors can delete meeting images" on storage.objects;

-- Anyone can read images (public bucket).
create policy "Public read meeting images"
on storage.objects for select
using (bucket_id = 'meeting-images');

-- Admin and sales_manager can upload.
create policy "Editors can upload meeting images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'meeting-images'
  and exists (
    select 1 from allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role in ('admin', 'sales_manager')
  )
);

-- Same roles can delete (in case the manager replaces an image).
create policy "Editors can delete meeting images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'meeting-images'
  and exists (
    select 1 from allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role in ('admin', 'sales_manager')
  )
);
