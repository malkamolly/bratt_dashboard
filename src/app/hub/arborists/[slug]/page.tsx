import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireHubAccess } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { fmtUsd } from '@/lib/format';
import { HubSubNav } from '@/components/HubSubNav';
import { getArborist } from '@/lib/hub-content';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

async function loadYtdForSalesperson(name: string): Promise<{
  ytdTotal: number;
  annualGoal: number | null;
  matchedName: string;
} | null> {
  const supabase = await serverClient();
  const year = new Date().getFullYear();

  const { data: person } = await supabase
    .from('salespeople')
    .select('id, name')
    .ilike('name', name)
    .maybeSingle();
  if (!person) return null;

  const [historicalsRes, entriesRes, targetRes] = await Promise.all([
    supabase
      .from('sales_monthly_historicals')
      .select('month, amount')
      .eq('year', year)
      .eq('salesperson_id', person.id),
    supabase
      .from('sales_entries')
      .select('entry_date, amount')
      .eq('salesperson_id', person.id)
      .gte('entry_date', `${year}-01-01`)
      .lte('entry_date', `${year}-12-31`),
    supabase
      .from('yearly_targets')
      .select('annual_goal')
      .eq('year', year)
      .maybeSingle(),
  ]);

  const histByMonth = new Map<number, number>();
  for (const h of historicalsRes.data ?? []) {
    const m = h.month as number;
    histByMonth.set(m, (histByMonth.get(m) ?? 0) + Number(h.amount));
  }
  const dailyByMonth = new Map<number, number>();
  for (const e of entriesRes.data ?? []) {
    const m = Number((e.entry_date as string).slice(5, 7));
    dailyByMonth.set(m, (dailyByMonth.get(m) ?? 0) + Number(e.amount));
  }
  const months = new Set<number>([
    ...histByMonth.keys(),
    ...dailyByMonth.keys(),
  ]);
  let ytdTotal = 0;
  for (const m of months) {
    ytdTotal += histByMonth.get(m) ?? dailyByMonth.get(m) ?? 0;
  }

  return {
    ytdTotal,
    annualGoal: targetRes.data?.annual_goal
      ? Number(targetRes.data.annual_goal)
      : null,
    matchedName: person.name,
  };
}

export default async function ArboristDetailPage({
  params,
}: {
  params: Params;
}) {
  await requireHubAccess('hub');
  const { slug } = await params;
  const a = getArborist(slug);
  if (!a) notFound();

  const stats = a.salesperson_name
    ? await loadYtdForSalesperson(a.salesperson_name)
    : null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/hub/arborists" className="hover:underline">
          Roster
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        {a.name}
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub/arborists" />
      </div>

      <section className="flex flex-col gap-6 sm:flex-row sm:items-center">
        {a.photo ? (
          <Image
            src={a.photo}
            alt=""
            width={160}
            height={160}
            className="h-40 w-40 shrink-0 rounded-full object-cover ring-4 ring-paper-edge"
          />
        ) : (
          <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-full bg-bark text-cream font-display text-6xl uppercase ring-4 ring-paper-edge">
            {a.name.slice(0, 1)}
          </div>
        )}
        <div>
          <h1 className="font-display text-5xl uppercase tracking-wider text-ink">
            {a.name}
          </h1>
          <p className="mt-2 text-fg-2">{a.title}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {a.manager ? (
              <span className="rounded-full bg-bark px-3 py-1 font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream">
                Sales Manager
              </span>
            ) : a.certified ? (
              <>
                <span className="rounded-full bg-green/15 px-3 py-1 font-headline text-xs font-extrabold uppercase tracking-ribbon text-green-dark">
                  ISA Certified
                </span>
                {a.isa_number && (
                  <span className="font-headline text-sm font-bold text-fg-3">
                    {a.isa_number}
                  </span>
                )}
              </>
            ) : (
              <span className="rounded-full bg-orange/15 px-3 py-1 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange-press">
                Certification in progress
              </span>
            )}
          </div>
        </div>
      </section>

      {stats && (
        <section className="mt-10 rounded-card bg-bark p-6 text-cream">
          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
            {new Date().getFullYear()} Year-to-Date
          </p>
          <p className="mt-2 font-headline text-4xl font-black">
            {fmtUsd(stats.ytdTotal)}
          </p>
          <p className="mt-1 text-sm text-cream/80">
            Live from the Pace dashboard ({stats.matchedName}).
          </p>
        </section>
      )}

      {a.salesperson_name && !stats && (
        <section className="mt-10 rounded-card border-2 border-dashed border-paper-edge bg-paper p-6 text-center text-sm text-fg-2">
          No salesperson record found for &quot;{a.salesperson_name}&quot; in
          the dashboard.
        </section>
      )}
    </main>
  );
}
