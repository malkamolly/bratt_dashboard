import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLandingPage() {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/access-denied');

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="bt-eyebrow">Admin</p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Settings
      </h1>
      <p className="mt-3 max-w-xl text-fg-2">
        Pick a side to edit. Sales handles the salesperson roster, annual and
        monthly goals, and historical totals. Production handles the crew
        roster.
      </p>

      <section className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
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
      </section>
    </main>
  );
}
