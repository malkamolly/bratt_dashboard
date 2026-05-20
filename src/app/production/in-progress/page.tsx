// ============================================================================
// In-progress jobs editor
// ============================================================================
// One row per crew with a single dollar input. Whoever can already enter
// production numbers can update these (matches production_entries RLS).
// Reached from the "In-Progress Jobs" button on the production pace page.
// ============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import type { Crew } from '@/types';
import { InProgressForm } from './InProgressForm';

export const dynamic = 'force-dynamic';

type Search = Promise<{ saved?: string }>;

export default async function InProgressPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const justSaved = sp.saved === '1';

  const supabase = await serverClient();
  const [crewsRes, wipRes] = await Promise.all([
    supabase
      .from('crews')
      .select('id, name, kind, display_order, is_active')
      .eq('is_active', true)
      .order('display_order'),
    supabase.from('crew_in_progress').select('crew_id, amount, updated_at, updated_by'),
  ]);

  const crews: Crew[] = (crewsRes.data ?? []) as Crew[];
  const wipByCrew: Record<
    string,
    { amount: number; updated_at: string | null; updated_by: string | null }
  > = {};
  for (const row of wipRes.data ?? []) {
    wipByCrew[row.crew_id as string] = {
      amount: Number(row.amount),
      updated_at: (row.updated_at as string) ?? null,
      updated_by: (row.updated_by as string) ?? null,
    };
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/production" className="hover:underline">
          Production PACE
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        In-Progress Jobs
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink">
        In-Progress Jobs
      </h1>
      <p className="mt-3 max-w-2xl text-fg-2">
        Dollar value of work that's underway but hasn't been booked yet (the
        job hasn't closed). Booked revenue plus the number you enter here is
        what counts toward each crew's pace status on the dashboard. When a
        job actually closes, enter it as a normal daily entry and bring this
        number back down.
      </p>

      <div className="mt-8">
        <InProgressForm
          crews={crews}
          initial={Object.fromEntries(
            Object.entries(wipByCrew).map(([k, v]) => [k, v.amount]),
          )}
          meta={wipByCrew}
          justSaved={justSaved}
        />
      </div>
    </main>
  );
}
