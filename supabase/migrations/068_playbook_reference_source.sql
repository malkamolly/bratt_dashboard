-- ============================================================================
-- 068_playbook_reference_source.sql
-- ============================================================================
-- Adds a third playbook source: 'reference'.
--
-- Until now the arborist_playbook.source column allowed only:
--   'library' : distilled from the Sales Arborist Training Library (topic decks
--               + meeting content) by the "Import / refresh Library" button.
--   'coach'   : lessons captured in Coach Mode.
--
-- 'reference' entries are distilled from outside PDF documents dropped into
-- content/references/ (see /api/video-notes/ingest-references). They feed the
-- video analyzer exactly like 'library' entries — same authority tier (below
-- any team correction, below Connor) — but they are NOT part of the Sales
-- Arborist Library UI, and the "Import / refresh Library" button does NOT touch
-- them (it only deletes/rebuilds source='library' rows). That separation is the
-- whole point of giving them their own source value: a library re-import can
-- never wipe the reference PDFs, and vice-versa.
-- ============================================================================

alter table arborist_playbook
  drop constraint if exists arborist_playbook_source_check;

alter table arborist_playbook
  add constraint arborist_playbook_source_check
  check (source in ('library', 'coach', 'reference'));
