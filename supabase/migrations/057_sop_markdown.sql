-- ============================================================================
-- 057_sop_markdown.sql
-- ============================================================================
-- Lets editors change SOP content in the app (not just re-upload a Word file).
--
-- We add `body_markdown` as the editable source of truth. Markdown is a simple
-- plain-text way to write formatting (## headings, - bullets, **bold**) — the
-- same format the meetings use — and it's much friendlier to edit than raw
-- HTML while still converting cleanly into the reading view's section cards.
--
-- On save, the app regenerates body_html (for reading) and body_text (for
-- search / the future ask-the-docs feature) from this markdown. Existing rows
-- start empty here; the edit screen fills it in from the current HTML the
-- first time a doc is opened for editing.
-- ============================================================================

alter table sop_documents
  add column if not exists body_markdown text not null default '';
