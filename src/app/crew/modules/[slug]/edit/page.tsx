// ============================================================================
// Training module deck editor — /crew/modules/[slug]/edit
// ============================================================================
// Manager-only. One big textarea for the module source text (DSL with
// `@layout` blocks) + a theme picker + Save and Preview buttons.
// The 20-question test is authored separately and not touched here.
// ============================================================================

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import { getTrainingModule } from '@/lib/crew-data';
import { saveTrainingModuleSource } from '@/app/crew/actions';
import { DEFAULT_SOURCE_TEXT, VALID_THEMES, isValidTheme } from '@/lib/training-deck';

export const dynamic = 'force-dynamic';

const THEME_LABELS: Record<string, string> = {
  'bark-cream': 'Bark on Cream — default. Cream background, warm woody palette.',
  'bark-heavy': 'Bark Heavy — dark wood-bark dominant. Maximum visual weight.',
  'field-manual': 'Field Manual — utilitarian print feel. Best for handouts.',
};

const LAYOUT_REFERENCE = [
  '@cover',
  '@welcome',
  '@agenda',
  '@section-divider',
  '@hero-stats',
  '@table',
  '@two-column',
  '@quick-facts',
  '@ppe-grid',
  '@checklist',
  '@big-stat',
  '@hazard-grid',
  '@three-rules',
  '@steps',
  '@technique',
  '@interval-table',
  '@mistakes',
  '@hand-signals',
  '@test-checklist',
  '@quiz',
  '@quiz-answers',
  '@resources',
  '@closing',
];

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
  const initialText = mod.source_text && mod.source_text.length > 0
    ? mod.source_text
    : DEFAULT_SOURCE_TEXT;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
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
        Edit deck
      </p>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl uppercase tracking-wider text-ink">
            Edit deck
          </h1>
          <p className="mt-2 max-w-2xl text-fg-2">
            Each slide starts with <code className="rounded bg-paper px-1">@layout-name</code>{' '}
            on its own line, followed by{' '}
            <code className="rounded bg-paper px-1">key: value</code> lines.
            Lines starting with <code>-</code> are list items. Lines starting
            with <code>#</code> are comments. Use <code>|</code> to split a
            value into multiple parts (e.g.{' '}
            <code className="rounded bg-paper px-1">stat: 2,094 | lbs | Lift Capacity</code>).
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
          Saved. Click <strong>Preview deck</strong> to see the result.
        </p>
      )}
      {sp.error && (
        <p className="mt-5 rounded-2 bg-orange/10 px-3 py-2 text-sm text-orange-press">
          {decodeURIComponent(sp.error)}
        </p>
      )}

      <form action={saveTrainingModuleSource} className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
        <input type="hidden" name="module_slug" value={mod.slug} />

        <div>
          <label
            htmlFor="source_text"
            className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3"
          >
            Module source (plain text)
          </label>
          <textarea
            id="source_text"
            name="source_text"
            defaultValue={initialText}
            spellCheck={false}
            className="mt-2 block h-[640px] w-full rounded-card border-2 border-paper-edge bg-cream p-3 font-mono text-[13px] leading-snug text-ink focus:border-orange focus:outline-none"
          />
        </div>

        <aside className="space-y-6">
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
            <p className="mt-2 text-xs text-fg-3">
              {THEME_LABELS[currentTheme]}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button type="submit" className="bt-btn bt-btn-primary w-full">
              Save changes
            </button>
            <Link
              href={`/crew/modules/${mod.slug}`}
              className="bt-btn bt-btn-ghost w-full text-center"
            >
              Cancel
            </Link>
          </div>

          <div className="rounded-card border border-paper-edge bg-paper p-3">
            <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
              Available layouts
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-fg-2">
              {LAYOUT_REFERENCE.join(' · ')}
            </p>
          </div>

          <div className="rounded-card border border-paper-edge bg-paper p-3 text-[11px] leading-relaxed text-fg-2">
            <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
              Tips
            </p>
            <ul className="mt-2 space-y-1 list-disc pl-4">
              <li>Repeat a key (like <code>tagline:</code>) to make a list of that field.</li>
              <li>Use <code>**bold**</code> and <code>*italic*</code> in any text.</li>
              <li>Save first, then click Preview to open the deck in a new tab.</li>
              <li>The 20-question test is authored separately from the slides.</li>
            </ul>
          </div>
        </aside>
      </form>
    </main>
  );
}
