# Partner logos

Drop the partner's logo here and the Plant Health Program hub (`/partner`) picks
it up automatically — no code change, no redeploy step beyond the commit itself.

**Upload straight into this folder:**
https://github.com/malkamolly/bratt_dashboard/upload/main/public/brand/partners

Any of these filenames works (tried in this order):

1. `landscapes-unlimited.svg` ← best: crisp at any size, tiny file
2. `landscapes-unlimited.png` ← good: 600px wide or more, transparent background
3. `landscapes-unlimited.jpg` / `.jpeg` / `.webp`
4. `logo.svg` / `logo.png` ← catch-alls if the file lands under a generic name

Until one of them exists, `src/components/partner/PartnerLogo.tsx` draws a styled
wordmark instead, so the hub never shows a broken image. The filename list and
the partner's brand colors both live in `src/lib/partner-config.ts`.
