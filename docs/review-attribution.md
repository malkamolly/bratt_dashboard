# Proposal-review attribution — who's reviewing the sales team's proposals?

Answers: **of all the proposals sent for review, what share did Brent review vs.
Nic?** Exact counts, not an estimate.

## The short version

```bash
npm run review-stats
```

That's it. It prints the split for the last three months and writes a CSV with
every single review request and a clickable Slack link, so anyone can spot-check
it.

## How it works (and why a script)

Each sales arborist has their own Slack channel (`#clayton_sales`,
`#dave_sales`, …). When a proposal is ready they post a short message
@-mentioning the review group. A supervisor drops a ❤️ on it to mark it
reviewed.

Slack's UI will show you that a message got one heart — but **not who left it**
unless you open that specific message. Over three months that's roughly 2,500
messages, so counting by hand (or by chat assistant) means sampling, and a
sample can only ever give you a range.

The Slack API doesn't have that limitation. `conversations.history` returns each
message *with* its full reaction list, including the member ID of everyone who
reacted:

```json
"reactions": [ { "name": "heart", "count": 1, "users": ["U065DMEA72P"] } ]
```

One call covers 200 messages, reactions included. The whole three months is a
couple hundred calls and finishes in a few minutes. That's the entire reason
this script exists.

## What it counts

| Term | Definition used |
| --- | --- |
| **Review request** | Any message mentioning the review @-group (`S0911Q0HTDF`). This is more reliable than matching words, since people write "ready", "review please", just an address, or nothing at all. |
| **Reviewed** | That message carries a ❤️. |
| **Reviewer** | Whoever left the ❤️. Verified against the thread replies — when Nic writes the verdict ("Good to go"), Nic is also the one who hearted it. |

It reports the overall split, a **week-by-week** breakdown, and a **per-channel**
breakdown. The weekly view is the important one: coverage runs in multi-day
blocks (one supervisor picks up the load while the other is out), so the split
swings a lot week to week and a single overall percentage hides that.

## Setup

You need a Slack token that can read the private sales channels. Two options:

**Option A — reuse the token you already have (no new setup).** If you've ever
clicked "Connect Slack" on the `/tags` board, your token is already stored. The
script borrows it automatically. It just needs these in `.env.local`, which you
already have if the dashboard runs locally:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SLACK_TOKEN_ENC_KEY`

**Option B — paste a token directly.** Put `SLACK_USER_TOKEN=xoxp-…` in
`.env.local`. This wins over Option A when both are present.

The token acts **as a person**, so whoever it belongs to must be a member of
every sales channel. If they're not, that channel is skipped and the script says
so rather than silently dropping it. Use `--owner someone@bratttree.com` to
borrow a different person's stored token.

## Options

```bash
npm run review-stats                                   # last 3 months
npm run review-stats -- --months 1                     # last month
npm run review-stats -- --since 2026-05-11 --until 2026-08-10
npm run review-stats -- --include-threads               # exhaustive (see below)
npm run review-stats -- --emoji white_check_mark        # if the team changes emoji
npm run review-stats -- --csv ~/Desktop/reviews.csv     # where to write the CSV
npm run review-stats -- --owner nic@bratttree.com       # use someone else's token
npm run review-stats -- --help
```

### `--include-threads`

By default the script reads top-level channel messages. Occasionally someone
posts a review request as a *reply inside* an existing thread, where top-level
history can't see it. `--include-threads` sweeps every thread too. It's
exhaustive but costs one extra API call per thread, so it takes far longer
(tens of minutes rather than a few). The default run prints a note reminding you
it skipped these.

## Reading the output

- **`Review requests found`** — the denominator. Includes ones nobody reviewed.
- **`reviewed (has the emoji)` / `no review emoji`** — your review-coverage rate.
  A high "no review emoji" number is worth investigating on its own: it's either
  proposals going out unreviewed, or reviewers not marking them.
- **`Share of the N completed reviews`** — the answer to the original question.
- **`Notes / limits of this run`** — read this. It surfaces anything that could
  make the numbers wrong: channels it couldn't read, reactions Slack truncated,
  and whether unreviewed requests are carrying some *other* emoji (which would
  mean the convention changed and the `--emoji` flag needs updating).

## Maintenance

Three things go stale. All are at the top of `scripts/review-attribution.mjs`
under `CONFIG`:

- **`SALES_CHANNELS`** — add a channel when a new sales arborist starts. In
  Slack: open the channel → *View channel details* → copy the Channel ID from
  the bottom of the panel.
- **`REVIEW_SUBTEAM_ID`** — the @-group the arborists mention. Only changes if
  the group is recreated.
- **`REVIEW_EMOJI`** — the ❤️. If the team switches, the run notes will tell you,
  because unreviewed requests will suddenly all be carrying the new emoji.

## Known limits

- Top-level messages only unless you pass `--include-threads`.
- Attribution is by reaction. If a supervisor reviews a proposal and forgets the
  ❤️, it counts as unreviewed — the same as it looks in Slack today.
- A message hearted by *both* supervisors counts once for each, so reviewer
  totals can slightly exceed the reviewed-message count. Percentages are taken
  over total attributions, which is why they always add to 100%.
