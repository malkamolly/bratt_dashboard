# CLAUDE.md &mdash; how to update the Sales Arborist Hub

This file teaches a future Claude session how to make changes to this Hub.
The repo is **Jekyll + GitHub Pages**, modeled after `bratttreeservice/field_training`.
When the owner or sales manager chats with Claude (web, desktop, or Code),
Claude edits files in this repo and commits. GitHub Pages rebuilds the website
within ~30 seconds.

## Where things live

| What | Where |
| ---- | ----- |
| Site config | `_config.yml` |
| Layouts | `_layouts/default.html`, `_layouts/arborist.html`, `_layouts/meeting.html` |
| Homepage | `index.md` |
| Roster page | `arborists/index.html` |
| One file per arborist | `_arborists/*.md` |
| Meetings list | `meetings/index.html` |
| One file per weekly meeting | `_meetings/*.md` |
| Training library | `library/index.html` (auto-built from meetings) |
| Onboarding | `onboarding/index.md` |
| Design tokens (Bratt Tree brand colors, fonts, spacing) | `assets/css/tokens.css` |
| Component styles | `assets/css/main.css` |
| Brand assets (logo, mascot, watermark) | `assets/img/brand/` |
| Brand font (Rugfish) | `assets/fonts/RugFishRegular.otf` |

## Privacy: First-name + last-initial only

The site is currently public on GitHub Pages. Until the password gate is
added (see TODO below), team members are listed as **first name + last
initial** only (e.g. "Clayton T", "Dave A"). The same applies to file
names &mdash; e.g. `_arborists/clayton-t.md` &mdash; so last names do not
appear in URLs either.

Do NOT add full last names, personal phone numbers, personal emails, or
home addresses to roster files while the site is public.

## Adding a new arborist

Create `_arborists/<firstname>-<lastinitial>.md`:

```yaml
---
name: Jane D                       # first name + last initial
title: Sales Arborist              # or "Sales Manager"
certified: true                    # true if ISA-certified
isa_number: MA-1234A               # required only if certified: true
manager: false                     # true for the sales manager only
started: 2023-06                   # optional, YYYY-MM
photo: /assets/img/arborists/jane-d.jpg  # optional
---

Optional short bio in Markdown.
```

The roster page auto-sorts by name and counts certified arborists. A
person with `manager: true` displays a "Sales Manager" badge instead of
the certification badge.

If two people share the same first name + last initial, append a
suffix (e.g. `jane-d-2.md`, `name: Jane D.`) and confirm with the owner
which person each file refers to.

## Adding a weekly meeting

Create `_meetings/YYYY-MM-DD-slug.md`. Use the date of the meeting in
both the filename and the `date:` field so meetings sort correctly.

```yaml
---
date: 2026-05-19
title: Weekly Sales Meeting &mdash; May 19, 2026
educational:
  title: <Topic title>
  tags:                    # used by the library filter
    - Tree Disease
    - Diagnostics
  body: |
    Optional intro paragraph here (renders as a slide on its own).

    ## First sub-topic

    Markdown content for this slide. Use lists for bullets, **bold** for emphasis.

    ## Second sub-topic

    Each `## ` header starts a new slide automatically.
housekeeping: |
  - Bullet about timesheets, etc.
operations: |
  - Bullet about CRM updates, promos, etc.
---
```

**Tags live on the topic, not the meeting.** Put `tags:` under
`educational:` (not at the top level). The Library page collects every
unique tag across all educational topics and turns each into a clickable
filter chip at the top of `/library/`. Reuse existing tag names where
possible (capitalization and spelling matter &mdash; "Tree Disease" and
"tree disease" become two separate filters). Tags can be added to
`housekeeping` and `operations` later if we ever want to filter them,
but today only `educational.tags` is read.

**Workflow with the sales manager:** he chats with Claude about this
week's topic and updates. Claude writes the meeting file above. The
educational topic automatically appears in the training library
(`/library/`). Older meetings stay archived under `/meetings/`.

**Slideshow behavior.** The meeting page itself stays small: a compact
header (date + title + tags) and one **deck launcher card** per topic.
Clicking a launcher opens that topic's slideshow as a **modal dialog**
over the page (not fullscreen). Each topic is its own deck:

- **Educational** &mdash; one deck.
- **Housekeeping** &mdash; a separate deck.
- **Operational Updates** &mdash; a separate deck.

Inside any deck:

- The first slide is a dark "section intro" with the topic name.
- Each `## ` header inside that section's `body` becomes its own slide.
  Any intro paragraph before the first `## ` becomes its own slide too.
- Keyboard: arrow keys / space / Page Up&middot;Down navigate; Home/End
  jump; Esc closes the dialog. Clicking the dark backdrop closes it.

Keep slide copy short and punchy &mdash; long paragraphs are hard to
read in the modal. Prefer 3-6 bullets per slide. You can omit any of
`educational`, `housekeeping`, or `operations`; only the sections
present in the front matter render a launcher.

## Updating onboarding

`onboarding/index.md` currently contains a placeholder. When the owner
sends the real onboarding PowerPoint, translate the content into
Markdown sections inside that file. Keep the page layout (`page-header`
+ `onboarding-section` blocks) so it stays consistent with the rest of
the Hub.

## Design system

The visual style is the **Bratt Tree Company brand system** by KickCharge
Creative. All design tokens live in `assets/css/tokens.css`. Key rules:

- **Colors:** orange (`--bt-orange` `#EB4C1B`) for CTAs, lime
  (`--bt-lime` `#E9E71D`) for keylines on cards, wood-bark
  (`--bt-bark` `#26190E`) for headers/footers, cream (`--bt-cream`
  `#FFF8EC`) for the page background.
- **Type:** Rugfish (display, ALL CAPS) for big titles; Nunito 900 for
  section heads; Nunito for body. Headlines and buttons are ALL CAPS;
  body is sentence case.
- **Cards:** white&#8594;light-yellow gradient with a 3 px lime keyline and
  18 px corners. No drop shadow.
- **Voice:** warm, plain-spoken, proud of the craft. No emoji. No
  gradients beyond the card paper-warmth. No glassy/neumorphic effects.

When in doubt, defer to the live Bratt Tree marketing site at
`www.bratttree.com` and the brand book in the design-system kit.

## Publishing workflow

After committing and pushing any change, always create a pull request (if one does not already exist) and merge it to `main` immediately so the site goes live on GitHub Pages. Do not leave changes sitting on a feature branch.

## Commit conventions

- Use clear, action-oriented commit messages: "Add meeting 2026-05-19:
  Oak Wilt", "Mark Clayton T as ISA certified", etc.
- One logical change per commit when practical.
- Develop on the branch the user is currently on; do not push to `main`
  unless explicitly asked.

## TODO &mdash; password gate

The team wants the same password-protected access pattern that the
`field_training` repo uses. Implement before the site contains
sensitive content (full names, contact info, internal numbers).

## What NOT to do

- Don't add tracking scripts, third-party analytics, or external embeds
  without asking.
- Don't put private data (full last names, personal phone numbers,
  addresses, SSNs, etc.) in the repo while the site is public.
- Don't add emoji to layouts, meeting bodies, or marketing copy &mdash;
  the brand uses the mascot and illustrations instead.
- Don't restructure collections or rename `_arborists/` or `_meetings/`
  without updating `_config.yml` and the affected layouts/pages.
