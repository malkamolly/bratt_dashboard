# Bratt Tree receivables API — integration brief

For the Cowork automation that reads the daily AR email and posts to `#sales_team`.

The dashboard is the source of truth for every figure below. Post what it returns;
don't recompute money from the spreadsheet.

---

## Credentials

```
Base URL   https://bratt-dashboard.vercel.app
Header     Authorization: Bearer <RECEIVABLES_IMPORT_TOKEN>
```

Token-only. A session cookie is **not** accepted on these endpoints. The token
lives in a Vercel environment variable, so it can be rotated without a code
change. Ask Molly for the value.

## Endpoints

| | |
|---|---|
| `POST /api/receivables/import` | Import a day's report. Two content-types — see below. |
| `GET /api/receivables/summary` | Read the current state without importing. |

Both return **the same response body**, so a post can be composed from either.
Use `GET /summary` to verify an import landed, or to post a status on a day when
no email arrived.

---

## Importing: JSON (use this)

`Content-Type: application/json`

This path exists specifically because the mail connector exposes attachment
*contents* but not bytes. Send the extracted rows directly — do not rebuild an
`.xlsx` to satisfy a file upload.

```json
{
  "sourceDate": "2026-08-25",
  "reportDateRange": { "from": "2025-08-25", "to": "2026-08-25" },
  "checksum": {
    "rowCount": 260,
    "totalSum": 405809.67,
    "balanceSum": 383564.42
  },
  "rows": [
    {
      "invoiceNumber": "202819659",
      "customerName": "Synergy Outdoor Solutions",
      "total": 1817.45,
      "balance": 1677,
      "completionDate": "2025-08-25",
      "customerPhone": "(952) 292-3224",
      "customerEmail": "a@example.com, b@example.com",
      "customerType": "Commercial",
      "soldBy": "Brent Blanske"
    }
  ]
}
```

### Field rules

| Field | Rule |
|---|---|
| `sourceDate` | **Required.** `YYYY-MM-DD`. The day the report is *for*, which decides which snapshot this becomes and what tomorrow compares against. |
| `rows` | Required, non-empty. **All rows** from the report, including zero-balance ones — the checksum is validated before paid rows are filtered out. |
| `invoiceNumber` | Send as a **string**. A JSON number would silently drop a leading zero. |
| `customerName` | Required, non-empty. |
| `total` / `balance` | Numbers. `"1,817.45"` is rejected. |
| `completionDate` | Strict `YYYY-MM-DD`, or `null`/omitted if genuinely absent. Excel serials, `MM/DD/YYYY`, and `2026-08-25T00:00:00Z` are **all rejected** — see below. |
| `customerPhone` / `customerEmail` | Verbatim. May hold several comma-separated values in one string. **Do not split them.** |
| `customerType` | `"Residential"` or `"Commercial"`. Anything else is treated as unknown. |
| `soldBy` | Verbatim, including sentinels like `1_Unassigned Sales`. Do not map to a rep — the dashboard does that. |
| `reportDateRange` | Accepted and ignored. The real window is derived from the rows. |

### The checksum is mandatory

All three fields are required and all three are enforced before anything is
persisted. Compare in cents; one cent of tolerance is allowed for float
summation.

- `rowCount` vs `rows.length`
- `totalSum` vs the summed `total` values
- `balanceSum` vs the summed `balance` values

Any mismatch → **422**, nothing persisted, and the message names the failing
check with both expected and computed values.

Take these from the report's own grand-total row and reconcile before sending.
This is the whole reason the JSON path is safer than uploading a file: a
half-read spreadsheet has nothing to fail against, whereas a half-read
extraction fails this check and is refused.

### Why dates are strict

An Excel serial (`45890`) or `08/25/2026` handed to `new Date()` produces a
confidently wrong year rather than an error — and a wrong year silently reshapes
every aging bucket. Convert to ISO before sending; malformed dates are rejected
rather than guessed at.

## Importing: multipart (still works)

`Content-Type: multipart/form-data`, field `file` (`.xlsx`/`.xlsm`/`.csv`),
optional field `sourceDate`. Used by the browser uploader. Unchanged.

Anything other than these two content-types → **415**.

Both intakes converge on one implementation of aging, comparison, and rep
attribution, so they cannot report different numbers from the same data. This is
verified by a test asserting the two responses are identical apart from
`importedAt`.

---

## Response

Identical from both endpoints and both intakes. Real values:

```json
{
  "ok": true,
  "sourceDate": "2026-08-25",
  "importedAt": "2026-08-25T18:45:34.118Z",

  "openInvoices": 260,
  "totalOutstanding": 383564.42,

  "pastDue30": { "count": 136, "total": 216778.02 },
  "basis": "days-past-due",
  "terms": "due-on-completion",

  "undated": { "count": 0, "total": 0 },
  "unassignedInSource": { "count": 28, "total": 11580.33, "routedTo": "Brent B" },

  "collectedSinceLast": {
    "count": 4,
    "total": 4151.75,
    "comparedTo": "2026-08-24",
    "paidInFullCount": 4,
    "partialCount": 0
  },

  "byRep": [
    {
      "repId": "brent",
      "repName": "Brent B",
      "collectedCount": 0,
      "collectedTotal": 0,
      "openPastDue30Count": 40,
      "openPastDue30Total": 92567.64
    }
  ],

  "buckets": {
    "d180plus": { "count": 34, "balance": 77239.75, "total": 77239.75 },
    "d91to180": { "count": 40, "balance": 69939.89, "total": 69939.89 },
    "d61to90":  { "count": 30, "balance": 23967.48, "total": 23967.48 },
    "d31to60":  { "count": 32, "balance": 45630.90, "total": 45630.90 },
    "d0to30":   { "count": 124, "balance": 166786.40, "total": 166786.40 }
  },

  "delta": {
    "comparedTo": "2026-08-24",
    "openInvoices": -2,
    "totalOutstanding": -1746.35,
    "collected": 4151.75,
    "paidInFull": 4,
    "partial": 0,
    "newlyBilled": 2,
    "newlyBilledAmount": 2405.40
  }
}
```

### Reading it

**`pastDue30` is the headline.** Bratt Tree's terms are due on completion, so
days since job completion *is* days past due — no adjustment needed. `basis` and
`terms` state this in every response so the figure carries its own definition.

**Bucket keys** are the dashboard's own five brackets. Each carries `balance` and
`total` — the same number under both names, so either works.

**`collectedSinceLast` counts partial payments** in `count` and `total`. Use
`paidInFullCount` / `partialCount` if you need "closed" only.

**`comparedTo`** is the previous snapshot's `sourceDate` — the day it was *for*,
not when it was uploaded.

**Everything reconciles.** `sum(byRep.openPastDue30Total)` equals
`pastDue30.total`; `sum(byRep.collectedTotal)` equals `collectedSinceLast.total`.

**`null`, never zeros.** `collectedSinceLast` and `delta` are `null` when there is
no prior snapshot. Zeros would read as "nothing moved", which is a different and
wrong claim. Handle the null case.

**These totals include balances under $5**, which the dashboard's on-screen call
lists hide as not worth a phone call. That's why the numbers sum cleanly, and why
a rep's own page may show a marginally lower total. It's pennies in practice.

### Four things to be careful about when naming people

1. **`repName` is First name + Last initial** — `"Clayton T"`, never
   `"Clayton Thompson"`. House rule at Bratt Tree: no full surnames anywhere.
   **Use these strings exactly as returned. Do not expand them**, including in
   Slack copy.

2. **`repId` is the dashboard's roster key** (`"clayton"`), not a ServiceTitan
   user ID — the export has no ID column, only a `Sold By` name. Key any Slack
   mention map on `repId`.

3. **There is no `"unassigned"` rep.** Invoices the report leaves without a
   salesperson are routed into Brent's book by design, so the Slack post agrees
   with what Brent sees on his own page. Don't invent a synthetic rep for them.
   `unassignedInSource` tells you how many there are.

4. **`undated`** holds invoices with no completion date. They're excluded from
   `pastDue30` because with no completion date there's no due date either, so
   they can't be aged. Reported separately rather than dropped, so totals
   reconcile.

---

## Snapshots and re-running

Each import writes a whole new snapshot and retires the previous one. Invoices
live inside one JSON payload, never as appended rows, so **re-importing the same
data cannot double-count anything.**

Re-importing the same `sourceDate` replaces that day's snapshot. The comparison
always looks at the most recent snapshot for a **different** day, so running
twice in one day is safe: both runs report the same movement versus the previous
day, and the next day's comparison is unaffected.

Consequence worth knowing: two imports on the same day will **not** show
intra-day movement. Both compare to the previous day. That is deliberate — a
stable day-over-day figure is what the post needs.

## Errors

| Code | Meaning |
|---|---|
| 401 | Bad or missing token. |
| 413 | Body over the cap (2 MB JSON, 4 MB file). A day's report is ~60 KB. |
| 415 | Content-type is neither `application/json` nor `multipart/form-data`. |
| 422 | Schema violation, bad date, checksum mismatch, or a report where nothing is owed. The message names the field or check. |
| 429 | Rate limited. Includes `Retry-After`. |
| 500 | Generic. The detail is in the server-side log, not the response. |
| 503 | `endpoint_not_configured` — the token env var isn't live. Not your bug; tell Molly to redeploy. |

**A rejected import never partially persists.** JSON validation and the checksum
run before any database write is reachable, so a refused body provably leaves the
previous snapshot intact.

## Rate limit

**12 requests/hour per IP, across both endpoints.** A daily job needs one or two.
Don't poll `/summary` on a schedule tighter than that, and don't retry in a tight
loop — a `429` means back off for the period named in `Retry-After`.

## If something looks wrong

Every call is logged server-side, rejections included. Molly can see the last 20
with:

```sql
select created_at, endpoint, outcome, status_code,
       source_date, invoice_count, total_balance, reason
from receivables_import_log
order by created_at desc
limit 20;
```

`outcome = 'unprocessable'` rows carry the exact rejection reason — that's the
fastest way to diagnose a failing import.
