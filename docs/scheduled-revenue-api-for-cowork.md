# Bratt Tree scheduled-revenue API — integration brief

For the Cowork automation that refreshes the Revenue Calendar twice a day —
**6:30am and 7:30pm Central**.

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
| 2 | Scheduled Revenue (parked) | Everything sitting on `01/01/2030`, ServiceTitan's placeholder for sold work with no real date. |

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

**If only the parked report arrives, the import is refused** (422). Every
checksum would still have passed, and a silently emptied calendar is the worst
possible failure here, so it's caught explicitly.

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
      "label": "parked",
      "checksum": { "rowCount": 99, "subtotalSum": 157757.20 },
      "jobs": [ "…same shape…" ]
    }
  ]
}
```

`label` is free text and shows on the dashboard's "built from" line, so name the
reports something you'd recognise there.

A job appearing in both reports lands once — the **later part wins**, so put the
parked report second.

**One report only?** The flat shape still works and is equivalent to a single
part:

```json
{ "sourceDate": "…", "checksum": { … }, "jobs": [ … ] }
```

Sending both `parts` and `jobs` is rejected.

### Field rules

| Field | Rule |
|---|---|
| `sourceDate` | **Required.** `YYYY-MM-DD`, the day the report is *for*. Decides which snapshot this replaces and what tomorrow compares against. Use today in **Central**, not UTC — a UTC "today" is already tomorrow by the time the 7:30pm run fires. |
| `jobs` | Required, non-empty, on every part. **Every row** from that report except its grand-total row, including $0 jobs — the checksum is validated before anything is filtered. |
| `label` | Optional name for the part, e.g. `"scheduled-365"` / `"parked"`. Shows on the dashboard. |
| `jobNumber` | Send as a **string**. A JSON number would silently drop a leading zero. |
| `status` | Required, verbatim (`"Scheduled"`, `"Hold"`, `"In Progress"`). Don't map it — the dashboard does that. |
| `businessUnit` | Required, verbatim (`"Tree Work - Residential"`, `"Plant Health Care"`, …). |
| `subtotal` | A number. `"1,600.00"` is rejected. |
| `scheduledDate` / `nextApptDate` | Strict `YYYY-MM-DD`, or `null`/omitted if genuinely absent. Excel serials, `MM/DD/YYYY`, and `2026-09-03T00:00:00Z` are **all rejected** — see below. |
| `technicians` | Verbatim, comma-separated in one string. **Do not split them, and do not shorten the names** — the dashboard applies the First-Name-Last-Initial rule itself. |
| `soldBy` | Verbatim, a full name. Same rule: don't shorten it, the dashboard does. Optional. |
| `soldOn` | Strict `YYYY-MM-DD` or `null`. Same date rules as the others. Optional. |
| `jobType` / `campaign` / `address` / `zip` | Verbatim. Optional. |
| `appointments` | A whole number. Defaults to 1. |

### The checksum is mandatory, and it is PER REPORT

Both fields are required on **every part** and all of them are enforced before
anything is persisted.

- `rowCount` vs that part's `jobs.length`
- `subtotalSum` vs that part's summed `subtotal` values (compared in cents, one
  cent of tolerance for float summation)

Any mismatch → **422**, nothing persisted, and the message names the failing
part and check with both expected and computed values —
`parts[1] (parked) checksum.rowCount says 99 but 98 rows were sent.`

**Take each part's numbers from that report's own grand-total row.** Per-part
checksums matter more here, not less: one combined total would still pass if a
whole report never arrived and you totalled only what you had.

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

  "onTheBoard": { "revenue": 1332782.31, "jobs": 749, "tree": 1247579.09, "phc": 85203.22 },
  "next7":      { "revenue": 133594.62,  "jobs": 120, "tree": 103812.19,  "phc": 29782.43 },
  "next30":     { "revenue": 377113.81,  "jobs": 309, "tree": 299608.59,  "phc": 77505.22 },
  "next90":     { "revenue": 975320.88,  "jobs": 678, "tree": 862947.11,  "phc": 112373.77 },
  "pastDated":  { "revenue": 48109.10,   "jobs": 17 },

  "onHold": { "revenue": 33287.92, "jobs": 28 },
  "parked": { "revenue": 157757.20, "jobs": 99, "parkedFrom": "2030-01-01" },

  "byUnit": [
    { "unit": "residential", "label": "Residential",       "revenue": 1019505.08, "jobs": 564 },
    { "unit": "commercial",  "label": "Commercial",        "revenue": 95143.01,   "jobs": 25 },
    { "unit": "municipal",   "label": "Municipal",         "revenue": 132931.00,  "jobs": 14 },
    { "unit": "phc",         "label": "Plant Health Care", "revenue": 85203.22,   "jobs": 146 }
  ],

  "byMonth": [
    { "month": "2026-09", "revenue": 377113.81, "jobs": 309,
      "tree": 299608.59, "phc": 77505.22, "holdRevenue": 7317 }
  ],

  "nextWeeks": [
    { "weekOf": "2026-08-31", "revenue": 167349.35, "jobs": 123, "tree": 124174.45, "phc": 43174.90 },
    { "weekOf": "2026-09-07", "revenue": 70974.57,  "jobs": 72,  "tree": 55120.11,  "phc": 15854.46 }
  ],

  "sources": [
    { "label": "scheduled-365", "rowCount": 777, "subtotal": 1366070.23 },
    { "label": "parked",        "rowCount": 99,  "subtotal": 157757.20 }
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

**Three piles, and they never mix.** Every dollar in the export lands in exactly
one of them, and the three sum to the export's grand total:

| Pile | What it is | Where it shows up |
|---|---|---|
| **Firm** | Everything not on hold — `Scheduled`, `In Progress`, and any status ServiceTitan adds later. | `onTheBoard`, all horizons, `byUnit`, `byMonth`, `nextWeeks`, and the calendar. |
| **Hold** | Status `Hold`. On the board, not committed. | `onHold` only. **Never** in a revenue figure. |
| **Parked** | Dated `2030-01-01` or later — ServiceTitan's placeholder for sold work with no real date. | `parked` only. |

`counts: "firm-only"` and `firmStatuses` state this in every response, so the
figure carries its own definition into whatever channel it gets posted in.

**`onTheBoard` is everything, forever.** It includes past-dated work and runs to
the end of the export's window. For a "what's coming" post, `next30` is usually
the number you want.

**`pastDated` is a to-do list, not a forecast.** Firm work still sitting on days
that have already gone by — scheduled and never closed out. Rising is bad.

**`asOf`** is today in Central, read at request time — *not* the snapshot's
date. So a stale snapshot still reports honest horizons; it just reports fewer
of them. If `sourceDate` and `asOf` differ, the import didn't run today.

**Tree work and PHC are split on every window.** `tree` is everything that isn't
Plant Health Care, and `tree + phc === revenue` on `onTheBoard`, every horizon,
every `byMonth` row and every `nextWeeks` row. Worth using: PHC runs on its own
techs and its own trucks, so a $30k tree day and a $30k PHC day are completely
different days to whoever is staffing them.

**`nextWeeks`** is eight weeks starting from the Monday of the current week.
Weeks start Monday because the crews do.

**`sources` tells you whether the whole board arrived.** Two entries is normal —
the 365-day report and the parked one. **One entry where you expected two means
half the board is missing**, and every checksum would still have passed. Worth
checking before posting a number anywhere.

**`sinceLast` is `null`, never zeros**, when there's no prior snapshot. Zeros
would read as "nothing moved", which is a different and wrong claim. Handle it.

**Names.** No name in this response is a full surname — the house rule applies
everywhere. The API returns no person names at all today; the crew names on the
dashboard are shortened at import time. If you ever surface a technician, use
what the dashboard shows, not what you sent.

**Everything reconciles.** `sum(byUnit.revenue)` equals `onTheBoard.revenue`;
`onTheBoard + onHold + parked` equals the export's grand total.

---

## Running twice a day

Each import writes a whole new snapshot and retires the previous one. Jobs live
inside one JSON payload, never as appended rows, so **re-importing the same data
cannot double-count anything.**

Exactly one snapshot is active per `sourceDate`, and the comparison always looks
at the most recent snapshot for a **different** day. So:

- The **7:30pm** run replaces the **6:30am** run for that day.
- **Both** report `sinceLast` against **yesterday**.
- You do **not** get an intra-day delta. That's deliberate — a stable
  day-over-day figure is the more useful of the two, and it's the one that
  doesn't break the following morning's baseline.

Send the same `sourceDate` (today in Central) on both runs, and **both reports
on every run** — a run that sends only the 365-day half wipes the parked pile
until the next good run.

## Errors

| Code | Meaning |
|---|---|
| 401 | Bad or missing token. |
| 404 | `GET /summary` only — nothing has been imported yet. Not an error, a state. |
| 413 | Body over the cap (2 MB JSON, 4 MB per file). Both reports together are ~325 KB as JSON. |
| 415 | Content-type is neither `application/json` nor `multipart/form-data`. |
| 422 | Schema violation, bad date, checksum mismatch, an export with no jobs in it, or **only the parked report** (the 365-day half is missing). The message names the failing part and check. |
| 429 | Rate limited. Includes `Retry-After`. |
| 500 | Generic. The detail is in the server-side log, not the response. |
| 503 | `endpoint_not_configured` — neither token env var is live. Not your bug; tell Molly to redeploy. |

**A rejected import never partially persists.** JSON validation and the checksum
run before any database write is reachable, so a refused body provably leaves
the previous snapshot intact.

## Rate limit

**12 requests/hour per IP, across both endpoints.** The scheduled job needs two a
day. Don't poll `/summary` on a tighter schedule than that, and don't retry in a
loop — a `429` means back off for the period named in `Retry-After`.

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
