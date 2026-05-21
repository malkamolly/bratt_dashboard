// ============================================================================
// Training module quick settings — /crew/modules/[slug]/edit
// ============================================================================
// Manager-only. Edits the module *title* and *visual theme*. Slide content
// itself is authored in /content/training-modules/<slug>.txt — those files
// are edited by Claude when you hand over source material.
// ============================================================================

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import { getTrainingModule } from '@/lib/crew-data';
import { saveTrainingModuleSettings } from '@/app/crew/actions';
import { VALID_THEMES, isValidTheme, loadSourceText, countSlides } from '@/lib/training-deck';

export const dynamic = 'force-dynamic';

const THEME_LABELS: Record<string, string> = {
  'bark-cream': 'Bark on Cream — default. Cream background, warm woody palette.',
  'bark-heavy': 'Bark Heavy — dark wood-bark dominant. Maximum visual weight.',
  'field-manual': 'Field Manual — utilitarian print feel. Best for handouts.',
};

export default async function ModuleEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireHubAccess('crew');
  if (!canEditCrew(user.role)) redirect('/access-denied');
  const { slug } = await params;
  const sp = await searchParams;

  const mod = await getTrainingModule(slug);
  if (!mod) notFound();

  const currentTheme = isValidTheme(mod.theme) ? mod.theme : 'bark-cream';
  const sourceText = await loadSourceText(slug);
  const slideCount = countSlides(sourceText);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/crew/modules" className="hover:underline">
          Training modules
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href={`/crew/modules/${mod.slug}`} className="hover:underline">
          {mod.name}
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Edit settings
      </p>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl uppercase tracking-wider text-ink">
            Edit settings
          </h1>
          <p className="mt-2 max-w-2xl text-fg-2">
            Update the module&apos;s display title and visual theme.
          </p>
        </div>
        <Link
          href={`/crew/modules/${mod.slug}/present`}
          target="_blank"
          rel="noopener"
          className="bt-btn bt-btn-dark"
        >
          Preview deck ↗
        </Link>
      </header>

      {sp.saved && (
        <p className="mt-5 rounded-2 bg-green/10 px-3 py-2 text-sm text-green-dark">
          Saved.
        </p>
      )}
      {sp.error && (
        <p className="mt-5 rounded-2 bg-orange/10 px-3 py-2 text-sm text-orange-press">
          {decodeURIComponent(sp.error)}
        </p>
      )}

      <form action={saveTrainingModuleSettings} className="mt-8 space-y-6 bt-card">
        <input type="hidden" name="module_slug" value={mod.slug} />

        <div>
          <label
            htmlFor="name"
            className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3"
          >
            Module title
          </label>
          <input
            id="name"
            name="name"
            type="text"
            defaultValue={mod.name}
            required
            maxLength={120}
            className="mt-2 block w-full rounded-2 border-2 border-paper-edge bg-cream px-3 py-2 font-headline text-base font-extrabold text-bark-deep focus:border-orange focus:outline-none"
          />
          <p className="mt-2 text-xs text-fg-3">
            Shown in the module list, slide headers, and footers.
          </p>
        </div>

        <div>
          <label
            htmlFor="theme"
            className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3"
          >
            Visual theme
          </label>
          <select
            id="theme"
            name="theme"
            defaultValue={currentTheme}
            className="mt-2 block w-full rounded-2 border-2 border-paper-edge bg-cream px-3 py-2 font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep"
          >
            {VALID_THEMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-fg-3">{THEME_LABELS[currentTheme]}</p>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="bt-btn bt-btn-primary">
            Save settings
          </button>
          <Link href={`/crew/modules/${mod.slug}`} className="bt-btn bt-btn-ghost">
            Cancel
          </Link>
        </div>
      </form>

      <section className="mt-8 rounded-card border border-paper-edge bg-paper p-4">
        <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
          Slide content
        </h2>
        <p className="mt-2 text-sm text-fg-2">
          This module currently has <strong>{slideCount} slides</strong>.
        </p>
        <p className="mt-2 text-sm text-fg-2">
          Slide content is authored in a text file in the repository
          (<code className="rounded bg-cream px-1">content/training-modules/{slug}.txt</code>).
          To add, remove, or reword slides, hand the source material to Claude
          and ask for the edits — changes go live as soon as the deploy
          finishes (about a minute).
        </p>
      </section>
    </main>
  );
}
