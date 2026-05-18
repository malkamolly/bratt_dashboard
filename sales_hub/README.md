# Sales Arborist Hub

The internal hub for the Bratt Tree Company Sales Arborist team: team
roster, weekly meetings, training library, and onboarding.

**Read the website:** _link will go here once GitHub Pages is enabled_

The website is the easiest place to view content. This repo is where the
data is stored and edited.

## What's in here

| What | Where |
| ---- | ----- |
| Site config & layouts | `_config.yml`, `_layouts/` |
| Homepage | `index.md` |
| Team roster | `arborists/index.html` + one file per person in `_arborists/` |
| Weekly meetings | `meetings/index.html` + one file per meeting in `_meetings/` |
| Training library (auto-built) | `library/index.html` |
| Onboarding | `onboarding/index.md` |
| Design tokens | `assets/css/tokens.css` |
| Brand assets (logo, mascot) | `assets/img/brand/` |
| How Claude updates this repo | `CLAUDE.md` |

## How updates happen

1. The owner or sales manager **chats with Claude** (Claude Desktop,
   claude.ai, or Claude Code) in natural language &mdash; e.g.
   _"Mark Clayton T as ISA certified, number MA-1234A"_
   or _"This week's meeting topic is Oak Wilt; here are my talking points..."_
2. Claude reads `CLAUDE.md` for the conventions.
3. Claude writes the right file(s) and commits.
4. GitHub Pages rebuilds the website within ~30 seconds.
5. The team refreshes the website and sees the latest state.

## Running locally (optional)

```bash
bundle install
bundle exec jekyll serve
```

Then visit `http://localhost:4000/salesarborist_hub/`.

## Status

- Bratt Tree brand design system is plugged in.
- Team roster has 9 people (8 sales arborists + 1 sales manager), listed
  by first name + last initial only.
- Sample weekly meeting (Armillaria Root Rot) shows the meeting layout.

## TODO

- **Password gate** &mdash; mirror the protection pattern used by the
  `field_training` repo before the site holds sensitive content.
- **Onboarding content** &mdash; replace the placeholder in
  `onboarding/index.md` once the current PowerPoint is shared.
- **Certification status** &mdash; mark each arborist with their real
  ISA certification status and number.
