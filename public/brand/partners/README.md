# Partner logos

Drop the partner's logo here and the Plant Health Program hub picks it up with no
code change.

Expected filenames (either works — the SVG is tried first):

- `landscapes-unlimited.svg`  ← preferred: crisp at any size, tiny file
- `landscapes-unlimited.png`  ← fallback: at least 600px wide, transparent background

Until one of them exists, `src/components/partner/PartnerLogo.tsx` draws a styled
wordmark instead, so nothing looks broken. Paths are configured in
`src/lib/partner-config.ts`.
