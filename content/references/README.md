# Reference PDFs (video-analyzer knowledge)

Drop arborist reference PDFs in this folder to teach the **Video Notes analyzer**
without adding anything to the Sales Arborist Library.

## How it works

1. Add one or more `.pdf` files to this folder and commit them.
2. Deploy (push to `main` — Vercel ships automatically).
3. On the Video Notes page (`/admin/video-notes`), owner-only, click
   **"Import / refresh Reference PDFs"**.

That button reads every PDF here, asks Claude to distill each into a short set
of visually-checkable playbook entries, and saves them with `source = 'reference'`.

## What this does and doesn't touch

- These entries **feed the video analyzer** (same as Training Library entries).
- They **never appear in the Sales Arborist Library** (`/hub/library`), which is
  built only from our own topic decks and meeting notes.
- The **"Import / refresh Library"** button and this button are independent —
  re-running one never wipes the other's entries.
- Authority: reference knowledge sits **below** any Coach-Mode correction and
  **below Connor** — the same tier as the Training Library.

## Limits (per PDF)

- Max ~24 MB per file and ~600 pages (Claude's document limit). Oversized files
  are skipped and reported; split a very large PDF if you need all of it.
- Re-running the import replaces the previous reference batch, so it's safe to
  run again whenever you add or remove PDFs here.
