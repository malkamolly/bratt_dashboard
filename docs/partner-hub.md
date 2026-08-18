# Plant Health Program (`/partner`)

A hub for an outside **landscaping partner** (Landscapes Unlimited) whose sales
team quotes our Plant Health Care (PHC) work to their own customers.

> **In progress.** The hub started as a bare calculator. It is becoming a
> proposal builder: their rep enters a job, adds trees with photos, picks
> treatments, and the tool produces a priced work order that gets sent to Bratt.
> The calculator now runs behind the scenes rather than being the interface.
> Data model: `supabase/migrations/071_partner_php_proposals.sql`. It lives in this repo and
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
