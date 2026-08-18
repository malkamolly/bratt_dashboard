# Plant Health Program (`/partner`)

A hub for an outside **landscaping partner** (Landscapes Unlimited) whose sales
team quotes our Plant Health Care (PHC) work to their own customers.

> **Complete end to end.** Sign-in → proposal → geocoded address + site map →
> trees with photos → card-based treatment picker → priced work order → accept &
> send, which emails a branded PDF to Bratt and locks the order. Revisions reopen
> a sent order without disturbing what Bratt already received.
>
> The hub is **Bratt-branded** — their reps sell our tree work, so it has to read
> as Bratt. Landscapes Unlimited is an accent (a "prepared for" credit, their
> green on a hairline rule and the handoff chip). Do not neutralize the brand
> classes; an earlier version did and it hid the whole point.
>
> Migrations: `071_partner_php_proposals.sql`,
> `072_partner_proposal_defaults.sql`,
> `073_partner_proposal_revisions_to_spec.sql`.

## Things worth knowing before changing this

- **Photos are downscaled in the browser** (`TreeForm.tsx`), to 1600px on the
  long edge as JPEG. A 12MP phone photo is ~11 MB; Vercel rejects request bodies
  over ~4.5 MB before our code runs. Measured: 10.93 MB in, 0.79 MB out.
- **Uploads go through our server**, not straight to Supabase Storage: a partner
  holds no Supabase session, so the browser has no credential a storage policy
  would accept.
- **The photo bucket is private.** Browsers get short-lived signed URLs minted
  server-side, batched per page so a proposal isn't dozens of round trips.
- **`/partner/photos` and `/partner/map` are exempt from the middleware
  redirect** and return 401 themselves. A 307 on a `fetch()` is followed
  automatically, which would hand the browser the login page with status 200 —
  making a failed photo upload look like a success.
- **The address is geocoded once, on save**, and the coordinates are stored. The
  typed address is never overwritten; Google's version is kept alongside it. A
  failed lookup is not fatal — the proposal saves and the screen says the address
  is unconfirmed.
- **Salesperson is free text.** An earlier version had a managed roster; that was
  upkeep for someone else's staff with no payoff.
- **Treatment prices are SNAPSHOT into the row when chosen**, not computed on
  read. If the price book changes next week, an order already sent must still
  show what the customer was quoted, or the PDF in Bratt's inbox and the record
  in the hub disagree. Editing a tree re-prices its treatments (`repriceTree`),
  because changing DBH must change the quote.
- **The total EXCLUDES "Bratt to quote" lines.** Off-chart trees and sprays over
  25 ft have no chart price; putting a guess in front of a customer that nobody
  at Bratt agreed to would be worse than a partial total that says so.
- **Sending locks BEFORE emailing.** The revision row (with a full JSON snapshot)
  and the lock are written first, so the stored record can never drift from the
  PDF that went out. A mail failure leaves the order sent with
  `email_status='failed'` — retryable, and "did they get it?" has an answer.
- **Email is Gmail SMTP** (`PHP_GMAIL_USER`, `PHP_GMAIL_APP_PASSWORD`), matching
  how magic links already leave this project. A transactional ESP would need DNS
  on brattree.com, which we don't control. Destination is `PHP_ORDER_EMAIL`,
  defaulting to `BRATT.contactEmail`.
- **The PDF embeds tree photos** (pdf-lib, no headless browser). Requiring a photo
  per tree only pays off if Connor can see it without logging in. It lives in this repo and
ships with the same Vercel deploy as the internal dashboard, but it is walled off
from it.

## Why it's in this repo and not its own app

The partner needs the *same* PHC calculator our sales arborists use. If we forked
it into a separate app, the price book would exist in two places and drift — we'd
update prices here and quietly quote stale numbers there. So the partner hub
imports `src/lib/phc-pricing.ts` and `src/components/QuoteBuilder.tsx`
**unchanged**. One price book, two front doors.

The separation that actually matters — the partner sees no Bratt branding, no
internal nav, no internal pages, and uses no internal login — is handled by
routing and a separate password, below.

## How the separation works

| Concern | Internal app | Partner Hub |
|---|---|---|
| Login | Supabase magic link / password, `allowed_emails` allowlist, roles | one shared password in `PARTNER_PASSWORD` |
| Session | Supabase auth cookie | `bt_partner` cookie, `httpOnly`, scoped to `/partner` |
| Where it's enforced | `src/middleware.ts` + `src/lib/auth.ts` | `src/middleware.ts` (`partnerGate`) + `src/lib/partner-auth.ts` |
| Chrome | `BrandHeader` + `TrustRibbon` | its own plain header (`src/app/partner/layout.tsx`) |
| Database | Supabase, RLS per role | none — the calculator is pure client-side math |

`partnerGate()` runs **first** in middleware and returns early, so partner
traffic never creates or reads a Supabase session, never touches
`allowed_emails`, and never has a role. A partner cookie therefore grants exactly
nothing on any internal page — there is no shared code path that could widen by
accident when we add a role later.

Going the other way, `/partner/login` and `/partner/session` are the only two
paths reachable without the cookie.

## Files

| File | What it does |
|---|---|
| `src/lib/partner-auth.ts` | cookie name, token derivation, password check |
| `src/lib/partner-config.ts` | the partner's display name, tagline, and contact — edit this to name them |
| `src/app/partner/layout.tsx` | the neutral shell (no Bratt branding) |
| `src/app/partner/page.tsx` | hub landing |
| `src/app/partner/calculator/page.tsx` | the PHC calculator, reusing `<QuoteBuilder />` |
| `src/app/partner/login/page.tsx` | password form |
| `src/app/partner/session/route.ts` | sign-in / sign-out endpoint |
| `src/app/globals.css` (`.partner-theme` block) | re-skins the shared `.bt-*` classes to neutral slate/emerald |

## Setup

1. Add `PARTNER_PASSWORD` in Vercel → Project → Settings → Environment Variables
   (Production + Preview). Pick something long but typeable — their team will
   type it on phones. Leave it unset and the hub is closed to everyone.
2. Redeploy so the new variable is picked up.
3. Send them `https://<your-domain>/partner` and the password.

To rotate the password, change the env var and redeploy — every existing partner
session is invalidated automatically, because the cookie is derived from the
password.

## Deliberate design notes

- **Same prices as ours.** The partner sees our published retail prices. If that
  ever changes, add a rate layer *on top of* `phc-pricing.ts` (a multiplier or an
  override table) — do not copy the price book.
- **A plain form POST, not a server action.** Server actions carry a hidden
  action id that Next drops when an action redirects back to its own page, which
  silently broke the second sign-in attempt after a typo. The route handler has
  no such state and works with JavaScript off.
- **One shared password is a deliberate choice**, appropriate because there's no
  customer data behind it — only a price list we hand them anyway. If we ever put
  real data in the partner hub, move to per-person logins first.
- **Nothing links to `/partner`** from the internal app, and nothing links back.

## Not linked, not secret

The hub is unlisted but not hidden from search engines by anything other than
obscurity. If you'd rather it not be indexed, add a `robots` meta tag to
`src/app/partner/layout.tsx`.
