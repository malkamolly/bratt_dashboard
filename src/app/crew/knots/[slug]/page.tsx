// ============================================================================
// Knot detail — /crew/knots/[slug]
// ============================================================================
// One knot: what it's for, what to watch out for, a link to the animated
// tutorial (the best way to actually learn it), and the tying steps as a quick
// text reference.
// ============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireHubAccess } from '@/lib/auth';
import { getKnot, KNOTS } from '@/lib/knots';
import { KnotVideoModal } from '@/components/crew/knots/KnotVideoModal';

export const dynamic = 'force-dynamic';

export default async function KnotDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireHubAccess('crew');
  const { slug } = await params;
  const knot = getKnot(slug);
  if (!knot) notFound();

  const others = KNOTS.filter((k) => k.slug !== knot.slug);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/crew/knots" className="hover:underline">
          Knot library
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        {knot.name}
      </p>

      <header className="mt-3">
        <h1 className="font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
          {knot.name}
        </h1>
        {knot.alsoCalled && knot.alsoCalled.length > 0 && (
          <p className="mt-2 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            a.k.a. {knot.alsoCalled.join(' · ')}
          </p>
        )}
        <p className="mt-3 max-w-2xl text-fg-2">{knot.summary}</p>
      </header>

      {/* ---------- Watch it tied (the real way to learn it) ---------- */}
      <section className="mt-8 bt-card-orange flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="bt-eyebrow">Learn it</p>
          <h2 className="mt-1 font-headline text-lg font-black uppercase text-bark-deep">
            Watch it tied, step by step
          </h2>
          <p className="mt-1 max-w-xl text-sm text-fg-2">
            The clearest way to learn a knot is to watch it tied and follow along
            with a real rope. Opens right here on the page — no leaving the
            dashboard. Full video is also at the bottom.
          </p>
        </div>
        <KnotVideoModal
          videoId={knot.videoId}
          title={knot.name}
          credit={knot.videoCredit}
        />
      </section>

      {/* ---------- Used for / Watch out ---------- */}
      <section className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="bt-card">
          <p className="bt-eyebrow">Used for</p>
          <ul className="mt-3 space-y-2 text-sm text-fg-2">
            {knot.usedFor.map((u) => (
              <li key={u} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-green-dark" />
                <span>{u}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bt-card">
          <p className="bt-eyebrow">Watch out</p>
          <ul className="mt-3 space-y-2 text-sm text-fg-2">
            {knot.watchOut.map((w) => (
              <li key={w} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- Steps (quick text reference) ---------- */}
      <section className="mt-8 bt-card">
        <p className="bt-eyebrow">Quick reference</p>
        <h2 className="mt-1 font-headline text-lg font-black uppercase text-bark-deep">
          The steps, in words
        </h2>
        <ol className="mt-4 space-y-3">
          {knot.steps.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bark font-headline text-xs font-extrabold text-cream">
                {i + 1}
              </span>
              <p className="text-sm text-fg-2">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- Get signed off ---------- */}
      <section className="mt-8 bt-card flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-headline text-lg font-black uppercase text-bark-deep">
            Ready to get signed off?
          </h2>
          <p className="mt-1 text-sm text-fg-2">
            The Knot Tying module covers these knots and issues a certificate
            when you pass.
          </p>
        </div>
        <Link href="/crew/modules/knot_tying" className="bt-btn bt-btn-dark">
          Take the module →
        </Link>
      </section>

      {/* ---------- Video tutorial (inline) ---------- */}
      <section className="mt-10">
        <p className="bt-eyebrow">Video tutorial</p>
        <h2 className="mt-1 font-display text-3xl uppercase tracking-wider text-ink">
          Watch it tied
        </h2>
        <div className="mt-5 overflow-hidden rounded-card border-[3px] border-bark-deep bg-black">
          <div className="aspect-video w-full">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${knot.videoId}?rel=0&modestbranding=1`}
              title={`${knot.name} tutorial video`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-fg-3">
          Video: {knot.videoCredit} (YouTube). Prefer the classic step-by-step
          animation?{' '}
          <a
            href={knot.animationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-headline font-extrabold uppercase tracking-ribbon text-orange hover:underline"
          >
            Open it on AnimatedKnots ↗
          </a>
        </p>
      </section>

      {/* ---------- Other knots ---------- */}
      <section className="mt-12">
        <p className="bt-eyebrow">Keep learning</p>
        <h2 className="mt-1 font-display text-3xl uppercase tracking-wider text-ink">
          Other knots
        </h2>
        <nav className="mt-5 flex flex-wrap gap-3">
          {others.map((k) => (
            <Link key={k.slug} href={`/crew/knots/${k.slug}`} className="bt-btn bt-btn-dark">
              {k.name}
            </Link>
          ))}
          <Link href="/crew/knots" className="bt-btn bt-btn-ghost">
            All knots
          </Link>
        </nav>
      </section>
    </main>
  );
}
