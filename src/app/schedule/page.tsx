import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import ScheduleForm from './ScheduleForm';

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin' && user.role !== 'user') redirect('/access-denied');

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <section className="mb-8">
        <p className="bt-eyebrow">
          <Link href="/" className="hover:underline">
            Bratt Tree
          </Link>
          <span className="mx-2 text-fg-3">/</span>
          <Link href="/pace" className="hover:underline">
            Pace
          </Link>
          <span className="mx-2 text-fg-3">/</span>
          Tomorrow&rsquo;s Schedule
        </p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl tracking-wider text-ink uppercase">
          Tomorrow&rsquo;s Schedule
        </h1>
        <p className="mt-3 max-w-2xl text-fg-2">
          Enter each job that&rsquo;s on the books. The dashboard adds it up, splits multi-day jobs across days,
          and produces a clean summary you can share with leadership.
        </p>
      </section>

      <ScheduleForm />
    </main>
  );
}
