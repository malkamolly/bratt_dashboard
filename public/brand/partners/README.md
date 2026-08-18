# Partner logos

Drop the partner's logo here and the Plant Health Program hub (`/partner`) picks
it up automatically — no code change, no redeploy step beyond the commit itself.

**Upload straight into this folder:**
https://github.com/malkamolly/bratt_dashboard/upload/main/public/brand/partners

**Trim transparent padding before use.** Their original upload
(`Landscape_LogoFC.png`) has so much baked-in transparent margin that the artwork
is only 55% of the image height — rendered at header size, the wordmark came out
about 11px tall and unreadable. `landscapes-unlimited.png` is that file cropped
to the mark, and it's what the app and the PDF actually use. If a new logo
arrives, crop it the same way:

```python
from PIL import Image
src = Image.open('THEIR_FILE.png').convert('RGBA')
tight = src.crop(src.getchannel('A').getbbox())
out = Image.new('RGBA', (tight.width + 12, tight.height + 12), (0, 0, 0, 0))
out.paste(tight, (6, 6))
out.save('landscapes-unlimited.png', optimize=True)
```

Any of these filenames works (tried in this order):

1. `landscapes-unlimited.svg` ← best: crisp at any size, tiny file
2. `landscapes-unlimited.png` ← good: 600px wide or more, transparent background
3. `landscapes-unlimited.jpg` / `.jpeg` / `.webp`
4. `logo.svg` / `logo.png` ← catch-alls if the file lands under a generic name

Until one of them exists, `src/components/partner/PartnerLogo.tsx` draws a styled
wordmark instead, so the hub never shows a broken image. The filename list and
the partner's brand colors both live in `src/lib/partner-config.ts`.
