# Bratt Tree scheduled-revenue API — integration brief

For the Cowork automation that refreshes the Revenue Calendar four times a day —
**6:00am, 11:00am, 3:00pm and 7:00pm Central**.

The dashboard is the source of truth for every figure below. Post what it
returns; don't recompute money from the spreadsheet.

---

## Credentials

```
Base URL   https://bratt-dashboard.vercel.app
Header     Authorization: Bearer <token>
```

The token is `SCHEDULED_REVENUE_TOKEN` if that Vercel environment variable is
set, and otherwise falls back to `RECEIVABLES_IMPORT_TOKEN` — the same token the
collections job already uses. **Nothing new has to be configured to go live.**
Setting a separate `SCHEDULED_REVENUE_TOKEN` later splits the two with no code
change; do that if the two jobs ever stop being run by the same person.

Token-only. A session cookie is **not** accepted on these endpoints.

## Endpoints

| | |
|---|---|
| `POST /api/scheduled-revenue/import` | Import the current board. Two content-types — see below. |
| `GET /api/scheduled-revenue/summary` | Read the current state without importing. |

Both return **the same response body**, so a post can be composed from either.
Use `GET /summary` to verify an import landed, or to report a status on a day
when the export didn't arrive.

---

## The source reports — there are TWO

**ServiceTitan will only schedule a report that looks out 365 days.** So the
board arrives in two pieces, and **both must be sent on every run**:

| | Report | Covers |
|---|---|---|
| 1 | Scheduled Revenue (365 day) | Everything in the next twelve months. |
| 2 | Scheduled Revenue (unscheduled) | Everything sitting on `01/01/2030`, ServiceTitan's placeholder for sold work with no real date. |

Both use the same filters — `Filter by: Jobs with Appt Date`,
`Business Unit: All`, `Include Adjustment Invoices: false` — and differ only in
date range.

Columns used: `Job #`, `Status`, `Job Type`, `Job Campaign`, `Business Unit`,
`Jobs Subtotal`, `Scheduled Date`, `Next Appt Start Date`,
`Total Appointments`, `Assigned Technicians`, `Location Address`,
`Location Zip`, `Sold By`, `Sold On`. `Job #`, `Status`, `Business Unit`,
`Jobs Subtotal` and `Scheduled Date` are required; the rest are optional and
degrade to blank.

Each export ends with its own **grand-total row** — no status, no business unit,
no date, the row count in `Job #`, and the summed subtotal. Don't send it as a
job. Send each report's two numbers as **that report's own checksum**.

**If only the unscheduled report arrives, the import is refused** (422). Every
checksum would still have passed, and a silently emptied calendar is the worst
possible failure here, so it's caught explicitly.

### What to call these piles in a post

The dashboard doesn't use ServiceTitan's words, so a post shouldn't either — a
figure that disagrees with the screen sends people hunting for a number that
isn't there.

| ServiceTitan / JSON key | Say this |
|---|---|
| status `Hold` / `onHold` | **Waiting on approval** |
| `parked` / `01/01/2030` | **Unscheduled** |

The response carries both spellings: prefer `waitingApproval` and `unscheduled`;
`onHold` and `parked` are the same objects, kept for anything already reading
them.

---

## Importing: JSON (use this)

`Content-Type: application/json`

This path exists specifically because a mail or drive connector exposes a
spreadsheet's *contents* but not its bytes. Send the extracted rows directly —
don't rebuild an `.xlsx` to satisfy a file upload.

Send both reports as `parts`, **each with its own checksum**:

```json
{
  "sourceDate": "2026-09-01",
  "parts": [
    {
      "label": "scheduled-365",
      "checksum": { "rowCount": 777, "subtotalSum": 1366070.23 },
      "jobs": [
        {
          "jobNumber": "214337629",
          "status": "In Progress",
          "jobType": "Tree Work",
          "campaign": "1_Unknown",
          "businessUnit": "Tree Work - Commercial",
          "subtotal": 8155,
          "scheduledDate": "2026-02-26",
          "nextApptDate": "2026-11-16",
          "appointments": 2,
          "technicians": "Nathan Runtsch, Jackson Seeger, Sage Sand",
          "address": "6200 Interlachen Boulevard, Edina, MN 55436 USA",
          "zip": "55436",
          "soldBy": "Brent Blanske",
          "soldOn": "2026-07-14"
        }
      ]
    },
    {
      "label": "unscheduled",
      "checksum": { "rowCount": 99, "subtotalSum": 157757.20 },
      "jobs": [ "…same shape…" ]
    }
  ]
}
```

`label` is free text and shows on the dashboard's "built from" line, so name the
reports something you'd recognise there.

A job appearing in both reports lands once — the **later part wins**, so put the
unscheduled report second.

**One report only?** The flat shape still works and is equivalent to a single
part:

```json
{ "sourceDate": "…", "checksum": { … }, "jobs": [ … ] }
```

Sending both `parts` and `jobs` is rejected.

### Field rules

| Field | Rule |
|---|---|
| `sourceDate` | **Required.** `YYYY-MM-DD`, the day the report is *for*. Decides which snapshot this replaces and what tomorrow compares against. Use today in **Central**, not UTC — a UTC "today" is already tomorrow by the time the 7pm run fires. |
| `jobs` | Required, non-empty, on every part. **Every row** from that report except its grand-total row, including $0 jobs — the checksum is validated before anything is filtered. |
| `label` | Optional name for the part, e.g. `"scheduled-365"` / `"unscheduled"`. Shows on the dashboard. |
| `jobNumber` | Send as a **string**. A JSON number would silently drop a leading zero. |
| `status` | Required, verbatim (`"Scheduled"`, `"Hold"`, `"In Progress"`). Don't map it — the dashboard does that. |
| `businessUnit` | Required, verbatim (`"Tree Work - Residential"`, `"Plant Health Care"`, …). |
| `subtotal` | A number. `"1,600.00"` is rejected. |
| `scheduledDate` | Strict `YYYY-MM-DD`, or `null`/omitted if genuinely absent. Excel serials, `MM/DD/YYYY`, and `2026-09-03T00:00:00Z` are **all rejected** — see below. |
| `nextApptDate` | Same format rules. **Send it whenever the column has a value** — it decides which day the job lands on. See below. |
| `technicians` | Verbatim, comma-separated in one string. **Do not split them, and do not shorten the names** — the dashboard applies the First-Name-Last-Initial rule itself. |
| `soldBy` | Verbatim, a full name. Same rule: don't shorten it, the dashboard does. Optional. |
| `soldOn` | Strict `YYYY-MM-DD` or `null`. Same date rules as the others. Optional. |
| `jobType` | Verbatim. **Send it** — it's what separates stump grinding from tree work in every figure. |
| `campaign` / `address` / `zip` | Verbatim. Optional. |
| `appointments` | A whole number from `Total Appointments`. **Send it** — it divides the job across crew days (see below). Missing reads as 1. |

### The checksum is mandatory, and it is PER REPORT

Both fields are required on **every part** and all of them are enforced before
anything is persisted.

- `rowCount` vs that part's `jobs.length`
- `subtotalSum` vs that part's summed `subtotal` values (compared in cents, one
  cent of tolerance for float summation)

Any mismatch → **422**, nothing persisted, and the message names the failing
part and check with both expected and computed values —
`parts[1] (unscheduled) checksum.rowCount says 99 but 98 rows were sent.`

**Take each part's numbers from that report's own grand-total row.** Per-part
checksums matter more here, not less: one combined total would still pass if a
whole report never arrived and you totalled only what you had.

### `nextApptDate` decides the square

A job sits on the calendar at its **next appointment**, falling back to its
scheduled date when there isn't one:

```
calendar day = nextApptDate ?? scheduledDate
```

On a single-visit job the two columns are identical and this changes nothing —
that's almost every row. On a multi-visit job already underway they are not:
ServiceTitan's `Scheduled Date` is the job's **first** appointment, so a removal
that started in February with its next crew day in November would otherwise land
on a February square. Wrong day, and a day that has already passed.

So `nextApptDate` is optional in the schema but not in practice: **drop it and
those jobs go to the wrong day.** Send whatever the `Next Appt Start Date`
column holds, including when it equals `Scheduled Date`.

One knock-on worth knowing: a job whose next appointment is the `01/01/2030`
placeholder counts as **unscheduled**, even if its first appointment had a real
date. That's the honest reading — its next real touch hasn't been booked.

### `appointments` splits the money across crew days

A job's `subtotal` is what the whole job is worth, however many days it takes.
The calendar divides it:

```
what lands on the square = subtotal ÷ appointments
```

This calendar exists to answer *can we take on more work that week*, so a $60k
two-day removal is $30k of any one day's capacity, not $60k. On a single-visit
job — most of them — `appointments` is 1 and nothing changes.

**Send `Total Appointments` whenever the column has a value.** Missing reads as
1, which lands the whole job on one square.

ServiceTitan gives us one date per job, so only one crew day of a multi-day job
can be placed. The rest shows up in `otherCrewDays` — about 8% of the board in
the file this was sized on, so it's named rather than dropped.

### Why dates are strict

An Excel serial (`45890`) or `09/03/2026` handed to `new Date()` produces a
confidently wrong day rather than an error — and a wrong day puts a job on the
wrong square, which is the one failure this tool exists to prevent. Convert to
ISO before sending; malformed dates are rejected rather than guessed at.

## Importing: multipart (also works)

`Content-Type: multipart/form-data`, **one `file` field per report**
(`.xlsx`/`.xlsm`/`.csv`) plus an optional `sourceDate`. Any File in the body is
picked up whatever the field is named, so `file` twice or `file1`/`file2` both
work. This is what the browser uploader uses.

Each file is validated against its own grand-total row before the two are
merged, so it gets the same protection the JSON checksums give.

Anything other than these two content-types → **415**.

Both intakes converge on one implementation of the day/month maths, so they
cannot report different numbers from the same data.

---

## Response

Identical from both endpoints and both intakes. Real values from the 2026-09-01
board:

```json
{
  "ok": true,
  "sourceDate": "2026-09-01",
  "importedAt": "2026-09-01T12:31:04.118Z",
  "asOf": "2026-09-01",

  "counts": "firm-only",
  "firmStatuses": ["Scheduled", "In Progress"],

  "onTheBoard": { "revenue": 1224753.42, "jobs": 749, "tree": 1076378.92, "phc": 81977.22, "stump": 66397.28 },
  "next7":      { "revenue": 126369.62,  "jobs": 120, "tree": 96587.19,   "phc": 24782.43, "stump": 5000.00 },
  "next30":     { "revenue": 356113.81,  "jobs": 309, "tree": 278608.59,  "phc": 62505.22, "stump": 15000.00 },
  "next90":     { "revenue": 920320.88,  "jobs": 678, "tree": 812947.11,  "phc": 72373.77, "stump": 35000.00 },
  "pastDated":  { "revenue": 48109.10,   "jobs": 17 },

  "waitingApproval": { "revenue": 33287.92, "jobs": 28 },
  "unscheduled":     { "revenue": 157757.20, "jobs": 99, "parkedFrom": "2030-01-01" },
  "onHold": "…same as waitingApproval…",
  "parked": "…same as unscheduled…",

  "byUnit": [
    { "unit": "residential", "label": "Residential",       "revenue": 1019505.08, "jobs": 564 },
    { "unit": "commercial",  "label": "Commercial",        "revenue": 95143.01,   "jobs": 25 },
    { "unit": "municipal",   "label": "Municipal",         "revenue": 132931.00,  "jobs": 14 },
    { "unit": "phc",         "label": "Plant Health Care", "revenue": 85203.22,   "jobs": 146 }
  ],

  "byMonth": [
    { "month": "2026-09", "revenue": 356113.81, "jobs": 309,
      "tree": 278608.59, "phc": 62505.22, "stump": 15000.00, "holdRevenue": 7317 }
  ],

  "nextWeeks": [
    { "weekOf": "2026-08-31", "revenue": 160124.35, "jobs": 123, "tree": 112174.45, "phc": 38174.90, "stump": 9775.00 },
    { "weekOf": "2026-09-07", "revenue": 66974.57,  "jobs": 72,  "tree": 49120.11,  "phc": 13854.46, "stump": 4000.00 }
  ],

  "sources": [
    { "label": "scheduled-365", "rowCount": 777, "subtotal": 1366070.23 },
    { "label": "unscheduled",   "rowCount": 99,  "subtotal": 157757.20 }
  ],

  "sinceLast": {
    "comparedTo": "2026-08-31",
    "firmRevenueChange": 42310.55,
    "holdRevenueChange": -1200,
    "addedJobs": 14,
    "addedRevenue": 48900.25,
    "removedJobs": 6,
    "removedRevenue": 6589.70
  }
}
```

### Reading it

**Four piles, and they never mix.** Every dollar in the export lands in exactly
one of them, and the four sum to the export's grand total:

| Pile | What it is | Where it shows up |
|---|---|---|
| **Scheduled** | Everything not at status Hold — `Scheduled`, `In Progress`, and any status ServiceTitan adds later. One crew day placed on its next appointment (see above). | `onTheBoard`, all horizons, `byUnit`, `byMonth`, `nextWeeks`, and the calendar. |
| **Other crew days** | The remaining days of multi-day jobs. The export dates one appointment, so the rest can't be placed. | `otherCrewDays` only. |
| **Waiting on approval** | Status `Hold`. On the board, not committed. | `waitingApproval` only. **Never** in a revenue figure. |
| **Unscheduled** | Dated `2030-01-01` or later — ServiceTitan's placeholder for sold work with no real date. | `unscheduled` only. |

`counts: "firm-only"` and `firmStatuses` state this in every response, so the
figure carries its own definition into whatever channel it gets posted in.

**Every revenue figure is CAPACITY, not billing.** `onTheBoard`, the horizons,
`byMonth` and `nextWeeks` all count one crew day per multi-day job. They answer
"how much work is on that week", not "how much will we invoice". For the
billing number, add `otherCrewDays`.

**`onTheBoard` is everything, forever.** It includes past-dated work and runs to
the end of the export's window. For a "what's coming" post, `next30` is usually
the number you want.

**`pastDated` is a to-do list, not a forecast.** Jobs whose **next** appointment
has already gone by — nothing further booked, and nobody closed them out. A job
part-way through a multi-day run sits on its next crew day instead, so anything
counted here is genuinely stranded. It should normally be zero; rising is bad.

**`asOf`** is today in Central, read at request time — *not* the snapshot's
date. So a stale snapshot still reports honest horizons; it just reports fewer
of them. If `sourceDate` and `asOf` differ, the import didn't run today.

**Every window splits three ways: `tree`, `phc`, `stump`.** They sum to
`revenue` on `onTheBoard`, every horizon, every `byMonth` row and every
`nextWeeks` row. Worth using: tree crews, PHC techs and stump grinders are three
different sets of people and equipment, so a $30k day of each is nothing alike
to whoever is staffing them.

> **`tree` no longer includes stump grinding.** It used to. Anything comparing
> `tree` across time needs to add `stump` back to match older figures.

The split comes from the **job type**, not the business unit — stump grinding
sits inside all three tree-work business units and never inside Plant Health
Care, so it can't be read off `businessUnit`. Send `Job Type` verbatim and the
dashboard sorts it out.

**`nextWeeks`** is eight weeks starting from the Monday of the current week.
Weeks start Monday because the crews do.

**`sources` tells you whether the whole board arrived.** Two entries is normal —
the 365-day report and the unscheduled one. **One entry where you expected two means
half the board is missing**, and every checksum would still have passed. Worth
checking before posting a number anywhere.

**`sinceLast` is `null`, never zeros**, when there's no prior snapshot. Zeros
would read as "nothing moved", which is a different and wrong claim. Handle it.

**Names.** No name in this response is a full surname — the house rule applies
everywhere. The API returns no person names at all today; the crew names on the
dashboard are shortened at import time. If you ever surface a technician, use
what the dashboard shows, not what you sent.

**Everything reconciles.** `sum(byUnit.revenue)` equals `onTheBoard.revenue`;
`onTheBoard + otherCrewDays + waitingApproval + unscheduled` equals the export's
grand total.

---

## Running four times a day

Each import writes a whole new snapshot and retires the previous one. Jobs live
inside one JSON payload, never as appended rows, so **re-importing the same data
cannot double-count anything.**

Exactly one snapshot is active per `sourceDate`, and the comparison always looks
at the most recent snapshot for a **different** day. So:

- The **11am** run replaces the **6am** one, 3pm replaces 11am, 7pm replaces 3pm.
- **All four** report `sinceLast` against **yesterday**.
- You do **not** get an intra-day delta. That's deliberate — a stable
  day-over-day figure is the more useful of the two, and it's the one that
  doesn't break the following morning's baseline.
- Adding or removing a run needs no change here. Nothing downstream counts them.

Send the same `sourceDate` (today in Central) on every run, and **both reports
on every run** — a run that sends only the 365-day half wipes the unscheduled
pile until the next good run.

**A missed run is not an incident.** The calendar keeps showing the last good
snapshot, and the page says when it was taken. Four runs a day means three
chances to recover before anyone notices. Don't retry a rejected import by
loosening the checksum — report it and let the next run try with fresh data.

## Errors

| Code | Meaning |
|---|---|
| 401 | Bad or missing token. |
| 404 | `GET /summary` only — nothing has been imported yet. Not an error, a state. |
| 413 | Body over the cap (2 MB JSON, 4 MB per file). Both reports together are ~325 KB as JSON. |
| 415 | Content-type is neither `application/json` nor `multipart/form-data`. |
| 422 | Schema violation, bad date, checksum mismatch, an export with no jobs in it, or **only the unscheduled report** (the 365-day half is missing). The message names the failing part and check. |
| 429 | Rate limited. Includes `Retry-After`. |
| 500 | Generic. The detail is in the server-side log, not the response. |
| 503 | `endpoint_not_configured` — neither token env var is live. Not your bug; tell Molly to redeploy. |

**A rejected import never partially persists.** JSON validation and the checksum
run before any database write is reachable, so a refused body provably leaves
the previous snapshot intact.

## Rate limit

**12 requests/hour per IP, across both endpoints.** Four runs a day is four
requests, or eight if each verifies with `/summary` — nowhere near the ceiling,
because the limit is per HOUR and the runs are five hours apart. Don't poll
`/summary` on a schedule of its own, and don't retry in a loop — a `429` means
back off for the period named in `Retry-After`.

## If something looks wrong

Every call is logged server-side, rejections included. Molly can see the last 20
with:

```sql
select created_at, endpoint, outcome, status_code,
       source_date, source_filename, job_count, firm_revenue, reason
from scheduled_revenue_import_log
order by created_at desc
limit 20;
```

`outcome = 'unprocessable'` rows carry the exact rejection reason — the fastest
way to diagnose a failing import.
