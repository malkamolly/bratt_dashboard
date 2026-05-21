// ============================================================================
// Edit employee profile — /admin/crew/employees/[slug]
// ============================================================================
// Form for admins and field managers to update the four things the trainer
// most often needs to change: active flag, hire date, position, foreman
// toggle. Notes are also editable here since they're free-form.
//
// Saves go through the updateEmployeeProfile server action which records
// significant changes to the activity feed.
// ============================================================================

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getAllowedUser, canEditCrew } from '@/lib/auth';
import { getCatalogs, getEmployee } from '@/lib/crew-data';
import { updateEmployeeProfile } from '@/app/crew/actions';

export const dynamic = 'force-dynamic';

type Search = Promise<{ error?: string }>;

export default async function EditEmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Search;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canEditCrew(user.role)) redirect('/access-denied');

  const { slug } = await params;
  const sp = await searchParams;
  const [employee, { positions, specialties }] = await Promise.all([
    getEmployee(slug),
    getCatalogs(),
  ]);
  if (!employee) notFound();

  const employeeSpecialties = new Set(employee.specialties);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href={`/crew/employees/${employee.slug}`} className="hover:underline">
          {employee.name}
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Edit
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        Edit {employee.name}
      </h1>
      <p className="mt-3 text-fg-2">
        Update position, foreman status, hire date, or active state. Changes
        log a one-line entry on {employee.name}&apos;s activity feed.
      </p>

      {sp.error && (
        <p className="mt-5 rounded-2 bg-orange/10 px-3 py-2 text-sm text-orange-press">
          Could not save: {decodeURIComponent(sp.error)}
        </p>
      )}

      <form action={updateEmployeeProfile} className="mt-6 space-y-5 bt-card">
        <input type="hidden" name="slug" value={employee.slug} />

        {/* ----- Position ----- */}
        <label className="block">
          <span className="block font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Position
          </span>
          <select
            name="position_key"
            defaultValue={employee.position_key ?? 'unassigned'}
            className="mt-1 block w-full rounded-2 border border-paper-edge bg-cream px-3 py-2 text-sm focus:border-orange focus:outline-none"
          >
            {positions.map((p) => (
              <option key={p.key} value={p.key}>
                {p.display_name}
              </option>
            ))}
          </select>
        </label>

        {/* ----- Hire date ----- */}
        <label className="block">
          <span className="block font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Hire date
          </span>
          <input
            type="date"
            name="hire_date"
            defaultValue={employee.hire_date ?? ''}
            className="mt-1 block rounded-2 border border-paper-edge bg-cream px-3 py-2 text-sm focus:border-orange focus:outline-none"
          />
          <span className="mt-1 block text-xs text-fg-3">
            Leave blank if not yet known.
          </span>
        </label>

        {/* ----- Toggles ----- */}
        <div className="space-y-3 rounded-2 border border-paper-edge bg-paper p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="leads_crew"
              defaultChecked={employee.leads_crew}
              className="mt-0.5 h-4 w-4 accent-orange"
            />
            <span>
              <span className="block font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
                Foreman
              </span>
              <span className="block text-xs text-fg-2">
                Leads their crew. Shows a Foreman pill on the roster + profile.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="active"
              defaultChecked={employee.active}
              className="mt-0.5 h-4 w-4 accent-orange"
            />
            <span>
              <span className="block font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
                Active
              </span>
              <span className="block text-xs text-fg-2">
                Uncheck to hide them from the roster and per-training lists.
                Their history stays intact.
              </span>
            </span>
          </label>
        </div>

        {/* ----- Specialties ----- */}
        <div className="rounded-2 border border-paper-edge bg-paper p-4">
          <p className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
            Specialties
          </p>
          <p className="mt-1 text-xs text-fg-2">
            Equipment-operator specialties show as pills next to the name on
            the roster and profile. Pick any that apply (usually one or two).
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {specialties.map((s) => (
              <label
                key={s.key}
                className="flex items-center gap-2 rounded-2 border border-paper-edge bg-cream px-3 py-2"
              >
                <input
                  type="checkbox"
                  name="specialties"
                  value={s.key}
                  defaultChecked={employeeSpecialties.has(s.key)}
                  className="h-4 w-4 accent-orange"
                />
                <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep">
                  {s.display_name}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* ----- Notes ----- */}
        <label className="block">
          <span className="block font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Notes
          </span>
          <textarea
            name="notes"
            defaultValue={employee.notes ?? ''}
            rows={4}
            placeholder="Anything worth remembering about this crew member…"
            className="mt-1 block w-full rounded-2 border border-paper-edge bg-cream px-3 py-2 text-sm focus:border-orange focus:outline-none"
          />
        </label>

        {/* ----- Actions ----- */}
        <div className="flex flex-wrap gap-3 pt-1">
          <button type="submit" className="bt-btn bt-btn-primary">
            Save changes
          </button>
          <Link
            href={`/crew/employees/${employee.slug}`}
            className="bt-btn bt-btn-ghost"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
