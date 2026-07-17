# Bratt Tree — Tree Removal Pricing Calculator (context for tuning)

This is the working context for dialing in the tree-removal price calculator on
the Bratt Tree dashboard. Use it to reason about and propose changes. **Proposing
numbers here does not change anything live** — Molly applies approved changes on
the code side.

## What the calculator does

Given a tree's three core measurements it suggests a removal price:

- **DBH** — trunk diameter at breast height (inches). The main size driver.
- **Height** (feet).
- **Crown / spread** — canopy width (feet).

**Formula:** `price = DBH × rate per inch`, where

`rate = base($/inch for that DBH) + height adjustment + spread adjustment`,
then **capped** to a sensible range (see guardrail).

### Granularity (current)
- **DBH: 100 one-inch bands (1″–100″).** The base rate moves smoothly with each
  inch of DBH.
- **Height & spread: 10 ten-foot bands each** (≤10′, 11–20′, … 91′+).

### Height & spread rule
Each size has a **typical** height and spread (its "no-adjustment" point). For
every 10-ft band **above** that typical, the rate goes **up ~8% of the base**;
every band **below**, **down ~8%**. So a tall/wide tree costs more per inch, a
short/narrow tree less.

### Guardrail
After adjustments, the rate is capped between **0.48× and 1.91× the base** for
that size, so one unusual tree can't swing a quote too far. (These come from the
real spread of jobs — the middle 95%.)

## Current rate card (base $/inch by size)

Sampled every 5″ (the model has all 100 inches in between):

| DBH size | Base $/in | Typical height | Typical spread |
|---|---|---|---|
| 5" | $76/in | 11–20′ | ≤10′ |
| 10" | $71/in | 21–30′ | 11–20′ |
| 15" | $72/in | 31–40′ | 11–20′ |
| 20" | $85/in | 41–50′ | 21–30′ |
| 25" | $90/in | 41–50′ | 31–40′ |
| 30" | $97/in | 41–50′ | 31–40′ |
| 35" | $104/in | 41–50′ | 41–50′ |
| 40" | $115/in | 51–60′ | 51–60′ |
| 45" | $125/in | 61–70′ | 51–60′ |
| 50" | $135/in | 51–60′ | 61–70′ |
| 55" | $125/in | 51–60′ | 61–70′ |
| 60" | $114/in | 51–60′ | 51–60′ |
| 70"–100" | $114/in | 51–60′ | 51–60′ |

## Where the numbers come from

- Built from **524 "clean" jobs**: single tree per invoice, single trunk, fully
  measured (DBH + height + spread), priced at or above a per-size floor.
- **Excluded** from the data on purpose: municipal jobs (bid differently),
  non-tree line items (stump/vine/shrub), multi-trunk clumps, and a handful of
  no-haul / outlier jobs that would skew pricing.
- Base rate for each inch is a **smooth curve** drawn through the reliable
  per-size medians (we don't have enough jobs to trust a separate number for
  every single inch).

## Known soft spots (good candidates for Connor's judgment)

1. **Big trees (49″+) are thin data** — only a handful of jobs above ~59″. The
   base actually dips at the very top ($135/in around 50″ easing to ~$114/in at
   60″+). Real, but shaky. Should the biggest sizes hold flat instead of dipping?
2. **The guardrail (0.48×–1.91×)** — is that the right floor/ceiling, or should
   short/narrow big trees be allowed to go even lower (or not)?
3. **The 8%-per-band height/spread step** — does that feel right for how much a
   tall or wide tree actually adds to the job?
4. **Base rates themselves** — do any specific sizes feel too high/low vs. what
   we'd actually quote today?

## House rules

- People's names are stored as **First name + Last initial** (e.g. "Sean B").
- This calculator intentionally covers only the **three measurements** for now;
  more variables (access, difficulty, proximity to structures, etc.) come later —
  the point right now is to get these three dialed in first.

## Workflow

Connor proposes changes here → Molly reviews → Molly applies them via Claude Code
and they ship to the live dashboard. Connor can test real trees anytime on the
dashboard's `/cost-analysis` calculator.
