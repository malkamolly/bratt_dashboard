-- ============================================================================
-- 056_sop_library.sql
-- ============================================================================
-- Stands up the office SOP / documentation library: one table for the
-- documents plus a private storage bucket that keeps the original uploaded
-- file (usually a Word .docx) so people can download the "real" version.
--
-- How content gets in: an office user uploads a Word doc on /sops. A server
-- action extracts the text (via the `mammoth` library) into `body_text`
-- (used for search + the future "ask the docs" feature) and `body_html`
-- (formatted for on-screen reading), and stores the original file in the
-- `sop-files` bucket.
--
-- Access: this is an office/dispatch tool, so read + write are open to the
-- same roles that can use the Pace hub and PHC scheduling — admin, office
-- (user), and the sales manager. Sales arborists and field crew do NOT see
-- it. These checks mirror canUseSops() in src/lib/auth.ts; RLS here is the
-- backstop so the data is safe even if an app-level check is ever missed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Who can read / write the SOP library?
-- ---------------------------------------------------------------------------
create or replace function sop_can_access() returns boolean
  language sql stable security definer
  set search_path = public
as $$
  select exists (
    select 1 from allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role in ('admin', 'user', 'sales_manager')
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. The documents table
-- ---------------------------------------------------------------------------
create table sop_documents (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  -- Free-text grouping shown as a filter chip on the library (e.g.
  -- "Dispatch", "Billing", "HR"). Optional — uncategorized docs just
  -- show under "Uncategorized".
  category        text,
  -- Plain text extracted from the document. Used for the search box and,
  -- later, as the material handed to Claude for the "ask the docs" feature.
  body_text       text not null default '',
  -- Formatted HTML (headings, lists, bold) from the same extraction, used
  -- to render a nice reading view. Produced by mammoth, which emits a small
  -- safe subset of tags (no scripts/styles).
  body_html       text not null default '',
  -- The original uploaded filename, shown on the card and used for download.
  source_filename text,
  -- Path of the original file inside the `sop-files` storage bucket. Null if
  -- a doc was created without keeping an original.
  storage_path    text,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Soft delete so we can hide a doc without losing it. The UI only ever
  -- shows is_active = true.
  is_active       boolean not null default true
);

create index sop_documents_active_idx on sop_documents(is_active);

create trigger sop_documents_updated
  before update on sop_documents
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
alter table sop_documents enable row level security;

create policy sop_documents_read on sop_documents
  for select using (sop_can_access());

create policy sop_documents_write on sop_documents
  for all using (sop_can_access()) with check (sop_can_access());

-- ---------------------------------------------------------------------------
-- 4. Storage bucket for the original files (private)
-- ---------------------------------------------------------------------------
-- Private (public = false) because these are internal office documents. The
-- app serves downloads through short-lived signed URLs generated server-side,
-- never a public link.
insert into storage.buckets (id, name, public)
values ('sop-files', 'sop-files', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Office can read sop files" on storage.objects;
drop policy if exists "Office can upload sop files" on storage.objects;
drop policy if exists "Office can delete sop files" on storage.objects;

create policy "Office can read sop files"
on storage.objects for select
to authenticated
using (bucket_id = 'sop-files' and sop_can_access());

create policy "Office can upload sop files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'sop-files' and sop_can_access());

create policy "Office can delete sop files"
on storage.objects for delete
to authenticated
using (bucket_id = 'sop-files' and sop_can_access());
