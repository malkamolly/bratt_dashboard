# Proposal Reviews (`/review-stats`)

Answers: **of the proposals sent for review, what share did each supervisor
review?** Exact counts, not an estimate.

## Using it

Sign in to the dashboard and click **Proposal Reviews** on the home page, or go
straight to `/review-stats`. Pick a window (30 days / 3 months / 6 months) and
wait 20–60 seconds while it counts.

The only setup is a one-time **Connect Slack** on the `/tags` page. If you've
already done that, this just works — the report borrows the same connection. The
page tells you if you haven't.

Who can see it: admins, the sales manager, and Connor (head arborist). It
compares named supervisors against each other, so it's a leadership view, same
as Cost Analysis. Change that in `canSeeReviewStats()` in `src/lib/auth.ts`.

## What it counts

| Term | Definition used |
| --- | --- |
| **Proposal sent for review** | A message in a sales channel mentioning the review @-group (`S0911Q0HTDF`). More reliable than matching words, since people write "ready", "review please", just an address, or nothing at all. |
| **Reviewed** | That message carries a ❤️. |
| **Reviewer** | Whoever left the ❤️. Verified against thread replies — when Nic writes the verdict ("Good to go"), Nic is also the one who hearted it. |

Read the **week-by-week** table, not just the headline number. Review coverage
runs in multi-day stretches — one supervisor picks up the load while the other is
out — so the split swings hard week to week and one overall percentage hides it.

The page also shows **how many requests never got a ❤️ at all**, which is worth
watching on its own: it's either proposals going out unreviewed, or reviewers not
marking them.

## Why this needed building at all

Slack shows that a message got one heart but **not who left it** — you have to
open each message to see the name. Over three months that's ~2,500 messages, so
counting by hand (or by asking an assistant to read Slack) forces sampling, and a
sample only ever gives you a range.

The Slack API has no such limit. `conversations.history` returns every message
*with* its full reaction list, including the member ID of everyone who reacted:

```json
"reactions": [ { "name": "heart", "count": 1, "users": ["U065DMEA72P"] } ]
```

One call covers up to 999 messages, reactions included — so the whole window is a
few dozen calls. That's the entire reason an exact answer is cheap here.

## Maintenance

Three things go stale. All are at the top of `src/lib/review-attribution.ts`
under `CONFIG`:

- **`SALES_CHANNELS`** — add a channel when a new sales arborist starts. In
  Slack: open the channel → *View channel details* → copy the Channel ID from
  the bottom of the panel.
- **`REVIEW_SUBTEAM_ID`** — the @-group the arborists mention. Only changes if
  the group is recreated.
- **`REVIEW_EMOJI`** — the ❤️. If the team switches, the page's "worth knowing"
  box will tell you, because unreviewed requests will suddenly all be carrying
  some other emoji.

## Known limits

The page prints these itself, in its "worth knowing about these numbers" box, so
they travel with the data rather than living only here:

- **Top-level messages only.** A review request posted as a reply *inside*
  another thread isn't visible to `conversations.history`. Spot-checks put that
  under 1% of requests; catching them would need one extra API call per thread
  (thousands), which no page render can afford.
- **Attribution is by reaction.** If a supervisor reviews a proposal and forgets
  the ❤️, it counts as unreviewed — the same as it looks in Slack today.
- **A proposal hearted by both supervisors counts once for each**, so the
  reviewer columns sum to the total rather than to the message count. They'd
  otherwise overshoot the total and look like an arithmetic error.
- **Channels it can't read are named, not silently dropped.** The token acts as
  the signed-in person, so a channel they're not in gets reported as skipped.
- **Nothing is cached.** Every load is a fresh sweep, so the numbers are always
  current and always cost 20–60 seconds.
