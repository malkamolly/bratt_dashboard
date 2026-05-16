# Bratt Tree PACE Dashboard

A custom, branded pace-reporting dashboard for Bratt Tree Company. Replaces the
two fragile Excel pace reports (Sales PACE and Company PACE) with a real web
app backed by Postgres.

## Status

**Phase 1 - in progress.** This commit contains the foundation:
project skeleton, database schema, and the calculations module that replaces
every formula in the legacy spreadsheets.

The visual pages (dashboards, entry forms, admin panel) come next.

## Stack

- **Hosting:** Vercel (free tier)
- **Database + Auth:** Supabase (free tier, Postgres + magic-link auth)
- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript
- **Styling:** Tailwind CSS
- **Charts:** Recharts

## Project layout

```
src/
  app/                 Next.js routes (pages and API endpoints)
    page.tsx           Landing page (/)
    sales/             Sales PACE dashboard + entry form
    production/        Production + PHC dashboard + entry form
    admin/             Settings: budgets, names, allowlist, holidays
    api/servicetitan/  Phase-2 integration placeholder
  components/          Reusable visual pieces (cards, charts, header)
  lib/
    calculations.ts    The single source of truth for every dashboard number
    dates.ts           Working-day math (Mon-Fri minus holidays)
    supabase.ts        Browser + server Supabase client factories
  types/               Shared TypeScript types

supabase/
  migrations/
    001_initial_schema.sql   Tables, RLS, helper functions
    002_seed_data.sql        Salespeople, crews, May 2026 budgets, holidays
```

## Working with this repo (beginner walkthrough)

You'll do these steps once, in order, on your laptop.

### 1. Install the basics

- Install **Node.js 20+** from https://nodejs.org/ (LTS version).
- Install **Git** from https://git-scm.com/downloads if you don't have it.
- Install **VS Code** from https://code.visualstudio.com/ as your code editor.

### 2. Get the code

```bash
git clone https://github.com/BrattTreeService/bratt_dashboard.git
cd bratt_dashboard
npm install
```

`npm install` downloads all the libraries listed in `package.json` into a
`node_modules/` folder. It's gitignored, so this is a one-time-per-machine step.

### 3. Create a Supabase project (one-time)

1. Go to https://supabase.com/ and sign up with the company email.
2. Create a new project. Choose a US region. Save the database password to a password manager.
3. In the Supabase dashboard, open **SQL Editor**.
4. Paste the contents of `supabase/migrations/001_initial_schema.sql`, click Run.
5. Paste the contents of `supabase/migrations/002_seed_data.sql`, click Run.
   (Before running, replace `owner@bratttree.com` with the real admin email.)

### 4. Wire the app to Supabase

1. In Supabase, open **Project Settings -> API**.
2. Copy the **Project URL** and the **anon public** key.
3. Locally, copy `.env.example` to `.env.local` and fill in the values:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
   ```

4. Never commit `.env.local`. It's already in `.gitignore`.

### 5. Run it locally

```bash
npm run dev
```

Visit http://localhost:3000.

### 6. Deploy to Vercel

1. Push your branch to GitHub.
2. Go to https://vercel.com/ and sign up with GitHub.
3. Click **Import Project**, choose `bratt_dashboard`.
4. In **Environment Variables**, add the same three keys from `.env.local`.
5. Click Deploy. About 30 seconds later you'll have a live URL.

Future updates are automatic: any push to `main` redeploys.

## Brand system

The KickCharge brand kit is integrated:

- Color tokens in `tailwind.config.ts` (orange, lime, bark/wood, cream, etc.)
- Rugfish display font in `public/fonts/`, loaded via `globals.css`
- Nunito loaded from Google Fonts via `next/font`
- Logo, mascot, and watermark PNGs in `public/brand/`
- Branded components: `BrandHeader`, `TrustRibbon`, `.bt-card`, `.bt-btn-*`, `.bt-status-*`

## Adding people to the allowlist

The dashboard is private by default. Only emails in `allowed_emails` can sign in.

**To add a person** (until the admin panel UI lands), open the Supabase
**SQL Editor** and run:

```sql
insert into allowed_emails (email, role) values
  ('newperson@bratttree.com', 'user')
on conflict (email) do nothing;

-- Make someone an admin (can edit budgets, names, etc.):
update allowed_emails set role = 'admin' where email = 'someone@bratttree.com';
```

**To remove a person:**

```sql
delete from allowed_emails where email = 'someone@bratttree.com';
```

Removed users get bounced to /access-denied on their next request.

## How sign-in works (one-time setup per team member)

1. User visits any page on the dashboard.
2. They get redirected to `/login`.
3. They type their email and hit "Send Sign-In Link."
4. Supabase emails them a one-click sign-in link (good for 1 hour).
5. They click it. The dashboard verifies the link, sets a 30-day session
   cookie, and confirms the email is on the allowlist.
6. They&apos;re in.

Customize the magic-link email template in your Supabase project under
**Authentication -> Email Templates -> Magic Link**.

## What's NOT in this commit yet

- Sales dashboard UI (`/sales`)
- Sales entry form (`/sales/entry`)
- Production dashboard UI (`/production`)
- Production entry form (`/production/entry`)
- Admin panel actual controls (`/admin` is a stub)
- ServiceTitan integration (Phase 2 - not built intentionally)

## Phase 2 hooks

`src/app/api/servicetitan/route.ts` is the entry point for the future
ServiceTitan pull. Nothing else needs to move when we get there.
