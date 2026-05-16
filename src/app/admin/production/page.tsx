import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { SectionCard, FlashBanner } from '@/components/admin-shared';
import { addCrewMember, updateCrewMember } from '../actions';
import type { Crew, CrewMember } from '@/types';

export const dynamic = 'force-dynamic';

type Search = Promise<{ saved?: string; error?: string }>;

export default async function ProductionAdminPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/access-denied');

  const sp = await searchParams;
  const supabase = await serverClient();
  const [crewsRes, crewMembersRes] = await Promise.all([
    supabase
      .from('crews')
      .select('id, name, kind, display_order, is_active')
      .eq('is_active', true)
      .order('display_order'),
    supabase
      .from('crew_members')
      .select('id, name, home_crew_id, is_foreman, display_order, is_active')
      .order('display_order'),
  ]);

  const crews = (crewsRes.data ?? []) as Crew[];
  const crewMembers = (crewMembersRes.data ?? []) as CrewMember[];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Production
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink">
        Production Admin
      </h1>
      <p className="mt-3 text-fg-2">
        Crew roster today. Annual goal, monthly crew budgets, and historicals
        editors are coming soon.
      </p>

      <FlashBanner saved={sp.saved} error={sp.error} />

      <div className="mt-10 space-y-12">
        <CrewMembersSection crewMembers={crewMembers} crews={crews} />
      </div>
    </main>
  );
}

function CrewMembersSection({
  crewMembers,
  crews,
}: {
  crewMembers: CrewMember[];
  crews: Crew[];
}) {
  return (
    <SectionCard
      eyebrow="Crew Roster"
      title="Crew Members"
      description="Production team members and their home crew. The home crew is where they appear by default on the daily entry form; they can be moved to another crew for an individual day from the form. Foremen get a small badge so dispatchers can spot them."
    >
      <div className="space-y-2">
        {crewMembers.map((mb) => (
          <form
            key={mb.id}
            action={updateCrewMember}
            className="flex flex-col gap-2 rounded-2 border-2 border-paper-edge bg-white px-3 py-2 sm:flex-row sm:items-center"
          >
            <input type="hidden" name="id" value={mb.id} />
            <label className="flex flex-1 items-center gap-2">
              <span className="bt-eyebrow w-16">Name</span>
              <input
                type="text"
                name="name"
                defaultValue={mb.name}
                className="flex-1 rounded-1 border border-paper-edge bg-bone px-2 py-1 font-headline focus:border-orange focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="bt-eyebrow">Home Crew</span>
              <select
                name="home_crew_id"
                defaultValue={mb.home_crew_id ?? ''}
                className="rounded-1 border border-paper-edge bg-bone px-2 py-1 font-headline focus:border-orange focus:outline-none"
              >
                <option value="">— Unassigned —</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="bt-eyebrow">Order</span>
              <input
                type="number"
                name="display_order"
                defaultValue={mb.display_order}
                className="w-20 rounded-1 border border-paper-edge bg-bone px-2 py-1 font-headline text-right focus:border-orange focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="is_foreman"
                defaultChecked={mb.is_foreman}
                className="h-4 w-4"
              />
              <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Foreman
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={mb.is_active}
                className="h-4 w-4"
              />
              <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Active
              </span>
            </label>
            <button type="submit" className="bt-btn bt-btn-ghost !px-4 !py-1.5 text-xs">
              Save
            </button>
          </form>
        ))}
      </div>

      <div className="mt-6 rounded-2 border-2 border-dashed border-paper-edge p-3">
        <p className="bt-eyebrow">Add Crew Member</p>
        <form
          action={addCrewMember}
          className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <label className="flex-1">
            <span className="text-xs text-fg-2">Name</span>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Alex Rivera"
              className="mt-1 w-full rounded-1 border-2 border-paper-edge bg-white px-2 py-1.5 font-headline focus:border-orange focus:outline-none"
            />
          </label>
          <label>
            <span className="text-xs text-fg-2">Home Crew</span>
            <select
              name="home_crew_id"
              className="mt-1 rounded-1 border-2 border-paper-edge bg-white px-2 py-1.5 font-headline focus:border-orange focus:outline-none"
            >
              <option value="">— Unassigned —</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs text-fg-2">Order</span>
            <input
              type="number"
              name="display_order"
              defaultValue={
                (crewMembers[crewMembers.length - 1]?.display_order ?? 100) + 10
              }
              className="mt-1 w-24 rounded-1 border-2 border-paper-edge bg-white px-2 py-1.5 font-headline text-right focus:border-orange focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 sm:pb-1.5">
            <input type="checkbox" name="is_foreman" className="h-4 w-4" />
            <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
              Foreman
            </span>
          </label>
          <button type="submit" className="bt-btn bt-btn-primary">
            Add
          </button>
        </form>
      </div>
    </SectionCard>
  );
}
