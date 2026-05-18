# Sales Manager's Guide &mdash; Talking to Claude

This is your one-page cheat sheet for using Claude to build the Sales
Arborist Hub each week. You do **not** need to know any code or open
any files yourself. You just chat with Claude in plain English and
Claude updates the site.

---

## What Claude does for you

- Builds the **weekly meeting page** from your notes.
- Files the educational topic into the **training library** (with tags
  so the team can search later).
- Updates the **roster** when arborists get certified, get promoted,
  or join/leave.
- Updates the **onboarding** page when you send new material.

After Claude saves the changes, the website refreshes itself in about
30 seconds.

---

## How to start a chat

1. Open Claude (web, desktop, or the mobile app &mdash; whichever you
   prefer).
2. Point it at the **`salesarborist_hub`** project.
3. Say what you want. That's it.

You don't have to use any special words. Talk to Claude like you'd talk
to a new assistant who already knows the playbook.

---

## Creating a weekly meeting &mdash; what to tell Claude

For each Tuesday meeting, give Claude these four things. Bullet points
are fine. Full sentences are fine. Voice-to-text is fine.

1. **The date** of the meeting (e.g. "next Tuesday, May 19").
2. **The educational topic** &mdash; the title and the content. The
   content can be your own notes, a copy-paste from an article, or a
   rough outline. Claude will clean it up and split it into slides.
3. **Housekeeping items** &mdash; timesheets, schedules, ride-alongs,
   anything administrative.
4. **Operational updates** &mdash; CRM changes, promos, pricing,
   new services, new talking points.

If you don't have one of those three sections in a given week, just
say "no housekeeping this week" or skip it. Claude will leave it out.

---

## A real example

Here's the kind of message that works well. Copy this shape:

> Hey Claude, please build the meeting page for **Tuesday, May 19, 2026**.
>
> **Educational topic: Oak Wilt.** Tag it Tree Disease and Diagnostics.
> Cover these points:
> - What it is &mdash; a fungal disease that kills oaks, especially red oaks, very fast.
> - How to spot it &mdash; leaves wilt from the top down, brown from the edges in, drop while still partly green. Look for fungal mats under the bark on red oaks in spring.
> - How it spreads &mdash; sap beetles in spring, and root grafts between neighboring oaks.
> - How to manage it &mdash; don't prune oaks April through July, trench between infected and healthy trees, remove and burn infected wood.
> - Sales talking points &mdash; lead with prevention timing (no pruning in spring), and offer trenching as a protective service for neighboring oaks.
>
> **Housekeeping:**
> - Timesheets due Friday EOD.
> - Spring ride-alongs wrap up next week.
>
> **Operational updates:**
> - New oak wilt service line is live in the CRM &mdash; use service code OW-100.
> - Spring promo ends June 15.

Claude will turn that into a meeting page with three clickable decks
(Educational, Housekeeping, Operational), file Oak Wilt into the
library under the Tree Disease and Diagnostics tags, and push it live.

---

## Tips that make the slides look good

- **Short bullets beat long paragraphs.** Slides are read in a meeting,
  not on paper. 3 to 6 bullets per sub-topic is the sweet spot.
- **Sub-topics become slides.** If you say "cover what it is, how to
  spot it, how to manage it," each of those becomes its own slide.
  Group your notes that way.
- **Reuse tag names.** "Tree Disease" and "tree disease" count as two
  different tags in the library. When in doubt, ask Claude "what tags
  already exist?" before inventing a new one.
- **Tell Claude what week to date it.** If you say "this week's
  meeting" on a Monday, that's clear. If you're writing ahead, give
  the actual date.

---

## Other things you can ask Claude to do

- "Mark Clayton T as ISA certified, ISA number MA-1234A."
- "Add a new sales arborist: Jane D, started June 2026, not yet
  certified."
- "Remove Mike S from the roster &mdash; he's no longer with us."
- "Show me last week's meeting page so I can reuse some of the
  housekeeping bullets."
- "What educational topics have we covered in the last three months?"

---

## What NOT to put in the chat (for now)

The website is currently public. Until we add a password gate, please
do **not** ask Claude to publish:

- Full last names (first name + last initial only).
- Personal phone numbers, personal emails, home addresses.
- Customer names, addresses, or pricing.
- Internal financial numbers.

If you're not sure whether something is safe to publish, ask Claude
"is this okay to put on the public site?" before posting it.

---

## When something looks wrong

- **The page didn't update yet.** Give it about 30 seconds, then
  refresh. GitHub Pages takes a moment to rebuild.
- **A slide reads weird, or you want to change wording.** Just tell
  Claude. Example: "On the Oak Wilt page, change the third bullet
  under 'How to manage it' to say&hellip;"
- **You picked the wrong tag.** Say "rename the tag 'tree-disease' to
  'Tree Disease' across the library" and Claude will fix every page
  that used it.
- **You want to undo something.** Tell Claude what to revert and
  roughly when you made the change. Claude can roll the change back.

---

## One sentence to remember

> Tell Claude the date, the topic with your notes, the housekeeping
> bullets, and the operational updates. Claude does the rest.

set up test please ignore
