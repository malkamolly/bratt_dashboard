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
import {
  saveTrainingModuleSettings,
  saveTrainingModuleSource,
} from '@/app/crew/actions';
import {
  VALID_THEMES,
  isValidTheme,
  resolveModuleSource,
  countSlides,
} from '@/lib/training-deck';

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
  const sourceText = (await resolveModuleSource(mod)) ?? '';
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
            Update the module&apos;s title and theme, and edit the slides
            themselves below.
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

      <form action={saveTrainingModuleSource} className="mt-8 space-y-4 bt-card">
        <input type="hidden" name="module_slug" value={mod.slug} />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
              Slide content
            </h2>
            <p className="mt-1 text-sm text-fg-2">
              This module currently has <strong>{slideCount} slides</strong>.
              Edit the script below, save, then use{' '}
              <strong>Preview deck</strong> (top right) to see the result.
            </p>
          </div>
        </div>

        <textarea
          id="source_text"
          name="source_text"
          defaultValue={sourceText}
          rows={26}
          spellCheck={false}
          className="block w-full rounded-2 border-2 border-paper-edge bg-cream px-3 py-2 font-mono text-xs leading-relaxed text-bark-deep focus:border-orange focus:outline-none"
        />

        <details className="rounded-2 border border-paper-edge bg-bone px-3 py-2">
          <summary className="cursor-pointer font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Slide-script cheat sheet
          </summary>
          <div className="mt-3 space-y-2 text-xs text-fg-2">
            <p>
              The deck is written in plain text. A few rules cover almost
              everything:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <code className="rounded bg-cream px-1">@cover</code>,{' '}
                <code className="rounded bg-cream px-1">@agenda</code>,{' '}
                <code className="rounded bg-cream px-1">@table</code>, etc. —
                each <code className="rounded bg-cream px-1">@name</code> on its
                own line <strong>starts a new slide</strong>.
              </li>
              <li>
                <code className="rounded bg-cream px-1">key: value</code> sets a
                field on the current slide (e.g.{' '}
                <code className="rounded bg-cream px-1">title: Welcome</code>).
              </li>
              <li>
                <code className="rounded bg-cream px-1">key: a | b | c</code>{' '}
                splits a value into parts with the{' '}
                <code className="rounded bg-cream px-1">|</code> character.
              </li>
              <li>
                A line starting with{' '}
                <code className="rounded bg-cream px-1">-</code> is a list item.
              </li>
              <li>
                Use <code className="rounded bg-cream px-1">**bold**</code> and{' '}
                <code className="rounded bg-cream px-1">*italic*</code> inside
                text. Lines starting with{' '}
                <code className="rounded bg-cream px-1">#</code> or{' '}
                <code className="rounded bg-cream px-1">//</code> are comments.
              </li>
            </ul>
            <p>
              Tip: copy an existing slide block as a starting point rather than
              writing a new layout from scratch.
            </p>
          </div>
        </details>

        <div className="flex items-center gap-3">
          <button type="submit" className="bt-btn bt-btn-primary">
            Save slides
          </button>
          <Link
            href={`/crew/modules/${mod.slug}/present`}
            target="_blank"
            rel="noopener"
            className="bt-btn bt-btn-ghost"
          >
            Preview deck ↗
          </Link>
        </div>
      </form>
    </main>
  );
}
