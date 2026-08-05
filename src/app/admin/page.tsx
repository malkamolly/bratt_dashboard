import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser, canUseVideoNotes } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLandingPage() {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  const isAdmin = user.role === 'admin';
  const videoAccess = canUseVideoNotes(user.email);
  if (!isAdmin && !videoAccess) redirect('/access-denied');

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="bt-eyebrow">Admin</p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Admin
      </h1>
      <p className="mt-3 max-w-xl text-fg-2">
        {isAdmin
          ? 'Video Notes plus dashboard settings — access, the salesperson and crew rosters, goals, and PHC timing.'
          : 'Your admin tools.'}
      </p>

      <section className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        {videoAccess && (
          <Link href="/admin/video-notes" className="bt-card group transition-colors hover:!border-orange">
            <p className="bt-eyebrow">Video</p>
            <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
              Video Notes
            </h2>
            <p className="mt-3 text-sm text-fg-2">
              Analyze arborist walkthrough videos, coach the analysis, and manage
              the Sales Arborist Playbook.
            </p>
            <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
              Open &rarr;
            </p>
          </Link>
        )}

        {isAdmin && (
          <>
        <Link href="/admin/sales" className="bt-card group transition-colors hover:!border-orange">
          <p className="bt-eyebrow">Admin 1</p>
          <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
            Sales Admin
          </h2>
          <p className="mt-3 text-sm text-fg-2">
            Annual goal, monthly company + per-salesperson goals, historical
            month totals, and the salesperson roster.
          </p>
          <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            Open &rarr;
          </p>
        </Link>

        <Link href="/admin/production" className="bt-card group transition-colors hover:!border-orange">
          <p className="bt-eyebrow">Admin 2</p>
          <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
            Production Admin
          </h2>
          <p className="mt-3 text-sm text-fg-2">
            Crew member roster: names, home crew, foreman flag, display order.
            Crew budgets and historicals coming soon.
          </p>
          <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            Open &rarr;
          </p>
        </Link>

        <Link href="/admin/phc-timing" className="bt-card group transition-colors hover:!border-orange">
          <p className="bt-eyebrow">Admin 4</p>
          <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
            PHC Treatment Timing
          </h2>
          <p className="mt-3 text-sm text-fg-2">
            Season windows, visit counts, and the &ldquo;must go first&rdquo;
            rules for every Plant Health Care treatment. Drives renewal
            scheduling.
          </p>
          <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            Open &rarr;
          </p>
        </Link>

        <Link href="/admin/access" className="bt-card group transition-colors hover:!border-orange">
          <p className="bt-eyebrow">Admin 3</p>
          <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
            Access
          </h2>
          <p className="mt-3 text-sm text-fg-2">
            Add or remove the people who can sign in to the dashboard, and set
            whether each one is a User (view + daily entry) or an Admin (full
            edit access).
          </p>
          <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            Open &rarr;
          </p>
        </Link>
          </>
        )}
      </section>
    </main>
  );
}
