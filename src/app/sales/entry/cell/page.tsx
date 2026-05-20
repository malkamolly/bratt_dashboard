// ============================================================================
// Single-cell sales entry — edit ONE (date, salesperson) at a time.
// ============================================================================
// Reached by clicking a day row on an arborist's detail page. Gated to roles
// that already have edit access on Pace (admin, office, sales manager). The
// `returnTo` query param sends the user back to the source arborist page
// after save/delete so they don't lose their place in the month.
// ============================================================================

import { redirect } from 'next/navigation';
import { getAllowedUser, canAccessHub } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { fromIsoDate } from '@/lib/dates';
import { CellForm } from './CellForm';

export const dynamic = 'force-dynamic';

type Search = Promise<{
  date?: string;
  salespersonId?: string;
  returnTo?: string;
  saved?: string;
}>;

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

// Only same-origin paths are allowed. Anything else falls back to /sales so
// we can't be used as an open redirect.
function safeReturnTo(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  return raw;
}

export default async function CellEntryPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canAccessHub(user.role, 'pace')) redirect('/access-denied');

  const sp = await searchParams;
  if (!sp.date || !isValidIsoDate(sp.date)) redirect('/sales');
  if (!sp.salespersonId) redirect('/sales');

  const supabase = await serverClient();
  const [personRes, entryRes] = await Promise.all([
    supabase
      .from('salespeople')
      .select('id, name')
      .eq('id', sp.salespersonId)
      .maybeSingle(),
    supabase
      .from('sales_entries')
      .select('amount')
      .eq('salesperson_id', sp.salespersonId)
      .eq('entry_date', sp.date)
      .maybeSingle(),
  ]);

  if (!personRes.data) redirect('/sales');

  const returnTo = safeReturnTo(sp.returnTo, '/sales');
  const dayLabel = fromIsoDate(sp.date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const existingAmount = entryRes.data ? Number(entryRes.data.amount) : null;

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <p className="bt-eyebrow">
        <a href={returnTo} className="hover:underline">
          ← Back
        </a>
        <span className="mx-2 text-fg-3">/</span>
        Edit Day
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink">
        {personRes.data.name}
      </h1>
      <p className="mt-2 text-fg-2">{dayLabel}</p>

      <div className="mt-8">
        <CellForm
          date={sp.date}
          salespersonId={sp.salespersonId}
          salespersonName={personRes.data.name}
          initialAmount={existingAmount}
          returnTo={returnTo}
        />
      </div>
    </main>
  );
}
