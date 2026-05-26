// ============================================================================
// Field Crew Hub — homepage roster
// ============================================================================
// Replaces the legacy Jekyll index.md. Shows:
//   - hero with daily activity feed,
//   - roster grouped by position (Climbers, Bucket Crews, ...), with each
//     position's discipline-relevant skill columns,
//   - team coverage bars (Proficient+ and Expert percentages per skill),
//   - quick links to the catalogs and reports.
// ============================================================================

import Link from 'next/link';
import { CrewQuickLinks } from '@/components/crew/CrewQuickLinks';
import { format } from 'date-fns';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import {
  getCatalogs,
  listEmployees,
  listActivity,
  buildCoverage,
  summarizeSkills,
  type Employee,
  type Position,
} from '@/lib/crew-data';
import { SkillBadge } from '@/components/crew/SkillBadge';
import { ForemanPill, SpecialtyPill } from '@/components/crew/CrewPills';
import { serverClient } from '@/lib/supabase';

type LicenseStatus = 'passed' | 'in_progress' | 'failed' | null;

async function loadApplicatorsLicenseStatuses(
  slugs: string[],
): Promise<Map<string, LicenseStatus>> {
  const out = new Map<string, LicenseStatus>(slugs.map((s) => [s, null]));
  if (slugs.length === 0) return out;
  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_employee_trainings')
    .select('employee_slug, completed, status')
    .eq('training_key', 'applicators_license')
    .in('employee_slug', slugs);
  for (const r of (data ?? []) as {
    employee_slug: string;
    completed: string | null;
    status: string | null;
  }[]) {
    if (r.completed) out.set(r.employee_slug, 'passed');
    else if (r.status === 'failed') out.set(r.employee_slug, 'failed');
    else if (r.status) out.set(r.employee_slug, 'in_progress');
  }
  return out;
}

export const dynamic = 'force-dynamic';

export default async function FieldCrewHubPage() {
  const user = await requireHubAccess('crew');
  const editable = canEditCrew(user.role);

  const [{ positions, skills, specialties, positionSkills }, employees, activity] =
    await Promise.all([getCatalogs(), listEmployees({ activeOnly: true }), listActivity({ limit: 6 })]);

  const specialtyByKey = new Map(specialties.map((s) => [s.key, s.display_name]));
  const skillsByPosition = new Map<string, { key: string; label: string }[]>();
  for (const ps of positionSkills) {
    const arr = skillsByPosition.get(ps.position_key) ?? [];
    arr.push({ key: ps.skill_key, label: ps.short_label ?? ps.skill_key });
    skillsByPosition.set(ps.position_key, arr);
  }

  const employeesByPosition = new Map<string, Employee[]>();
  for (const e of employees) {
    const key = e.position_key ?? 'unassigned';
    const arr = employeesByPosition.get(key) ?? [];
    arr.push(e);
    employeesByPosition.set(key, arr);
  }
  // Foremen first, then everyone else, alphabetical within each.
  for (const arr of employeesByPosition.values()) {
    arr.sort((a, b) => {
      if (a.leads_crew !== b.leads_crew) return a.leads_crew ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  const unassigned = employeesByPosition.get('unassigned') ?? [];
  const otherPositions = positions.filter((p) => p.key !== 'unassigned');
  const coverage = buildCoverage(employees, skills);

  // Applicator's License records for the PHC card (one per active PHC tech).
  // PHC techs don't get rated on the standard 12 skills — they just need
  // to pass this credential.
  const phcEmployees = employeesByPosition.get('phc_technician') ?? [];
  const phcLicenseByEmployee = await loadApplicatorsLicenseStatuses(
    phcEmployees.map((e) => e.slug),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {/* ---------- Breadcrumb + page header ---------- */}
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Field Crew Hub
      </p>

      {/* ---------- Hero ----------
          Hand-rolled (not bt-card) so the dark gradient actually wins over
          bt-card's cream gradient. */}
      <section className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div
          className="relative overflow-hidden rounded-card border-[3px] border-bark-deep p-8 text-cream"
          style={{
            background:
              'linear-gradient(135deg, #1A0E05 0%, #26190E 55%, #3D2B14 100%)',
          }}
        >
          <p className="font-headline font-extrabold uppercase tracking-ribbon text-xs text-lime">
            Field training
          </p>
          <h1 className="mt-3 font-display text-5xl leading-[0.95] uppercase tracking-wider sm:text-6xl">
            Sharper crew.
            <br />
            <span className="text-orange">Stronger trees.</span>
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-cream/85">
            Skills, trainings, and development plans for the Bratt Tree field
            team. Updated by the head trainer; readable by any leader with
            access.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#roster" className="bt-btn bt-btn-primary">
              View the crew
            </a>
            <Link
              href="/crew/plans"
              className="bt-btn bg-transparent text-cream ring-2 ring-inset ring-cream/70 hover:bg-cream hover:text-ink hover:ring-0"
            >
              Active plans &rarr;
            </Link>
          </div>

          <div className="mt-8">
            <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-cream/60">
              Dig deeper
            </p>
            <div className="mt-2">
              <CrewQuickLinks variant="dark" />
            </div>
          </div>
        </div>

        {/* Daily activity feed */}
        <aside className="bt-card">
          <div className="flex items-baseline justify-between">
            <p className="bt-eyebrow">Daily feed</p>
            <span className="font-headline text-xs font-bold text-fg-3">
              {format(new Date(), 'EEE MMM d')}
            </span>
          </div>
          {activity.length === 0 ? (
            <div className="mt-4 text-sm text-fg-2">
              <p>Nothing logged yet.</p>
              <p className="mt-1 text-xs text-fg-3">
                Skill changes, trainings, and plan updates appear here as the
                head trainer logs them.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3 text-sm">
              {activity.map((a) => (
                <li key={a.id}>
                  <div className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    {format(new Date(a.occurred_on), 'MMM d')}
                  </div>
                  <div className="mt-0.5 text-ink">
                    <Link
                      href={`/crew/employees/${a.employee_slug}`}
                      className="font-headline font-extrabold uppercase tracking-ribbon text-xs text-bark-deep hover:underline"
                    >
                      {a.employee_name}
                    </Link>{' '}
                    <span className="text-fg-2">— {a.description}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/crew/reports/feed"
            className="mt-5 inline-block font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange hover:underline"
          >
            Open full feed &rarr;
          </Link>
        </aside>
      </section>

      {/* ---------- Stats row ---------- */}
      <section className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-sm text-fg-2">
        <span>
          <strong className="font-headline text-base text-bark-deep">
            {employees.length}
          </strong>{' '}
          crew on file
        </span>
        <span>
          <strong className="font-headline text-base text-bark-deep">
            {skills.length}
          </strong>{' '}
          tracked skills
        </span>
        <span>
          <strong className="font-headline text-base text-bark-deep">12</strong>{' '}
          trainings
        </span>
        {editable && (
          <Link
            href="/admin/production#crew-members"
            className="ml-auto font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange hover:underline"
          >
            Manage crew &rarr;
          </Link>
        )}
      </section>

      {/* ---------- Roster ----------
          Two-column grid:
            row 1 → Climbers       | Equipment Operators
            row 2 → Bucket Crew    | Nifty Crew
            row 3 → PHC Technicians| Needs Primary Position (if any) */}
      <section id="roster" className="mt-10">
        <div>
          <p className="bt-eyebrow">The crew</p>
          <h2 className="mt-1 font-display text-4xl uppercase tracking-wider text-ink">
            At a glance
          </h2>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          {gridOrderedPositions(otherPositions).map((p) => {
            const list = employeesByPosition.get(p.key) ?? [];
            if (list.length === 0) return null;
            if (p.key === 'phc_technician') {
              return (
                <PhcSection
                  key={p.key}
                  title={pluralizePosition(p.display_name)}
                  employees={list}
                  licenseByEmployee={phcLicenseByEmployee}
                  specialtyByKey={specialtyByKey}
                />
              );
            }
            const cols = skillsByPosition.get(p.key) ?? [];
            return (
              <PositionSection
                key={p.key}
                title={pluralizePosition(p.display_name)}
                employees={list}
                columns={cols}
                allSkillKeys={skills.map((s) => s.key)}
                specialtyByKey={specialtyByKey}
              />
            );
          })}
          {unassigned.length > 0 && (
            <PositionSection
              title="Needs Primary Position"
              tone="warn"
              note="Crew members below haven't been assigned to a primary discipline yet. Open the profile and set their position."
              employees={unassigned}
              columns={[]}
              allSkillKeys={skills.map((s) => s.key)}
              specialtyByKey={specialtyByKey}
              summaryColumn
            />
          )}
        </div>
      </section>

      {/* ---------- Team coverage ---------- */}
      <section className="mt-12">
        <p className="bt-eyebrow">Snapshot</p>
        <h2 className="mt-1 font-display text-4xl uppercase tracking-wider text-ink">
          Team coverage
        </h2>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coverage.map((c) => {
            const pctL2 = c.total > 0 ? Math.round((c.proficientPlus / c.total) * 100) : 0;
            const pctL3 = c.total > 0 ? Math.round((c.expert / c.total) * 100) : 0;
            return (
              <div key={c.skillKey} className="bt-card !p-5">
                <div className="font-headline text-sm font-extrabold text-bark-deep">
                  {c.skillName}
                </div>
                <CoverageRow label="Proficient+" pct={pctL2} count={c.proficientPlus} total={c.total} tone="l2" />
                <CoverageRow label="Expert" pct={pctL3} count={c.expert} total={c.total} tone="l3" />
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-fg-3">
          Counts include every active crew member, regardless of primary
          position — cross-training counts.
        </p>
      </section>

    </main>
  );
}

// ----- helpers -----

/**
 * Order the position list so the two-column grid lays out as:
 *   row 1 → Climber | Equipment Operator
 *   row 2 → Bucket  | Nifty
 *   row 3 → PHC     | -
 * Anything not in this list falls to the end in its original order.
 */
// "Bucket Crew" / "Nifty Crew" stay singular when used as a section title;
// everything else (Climber, Equipment Operator, PHC Technician) pluralizes.
function pluralizePosition(displayName: string): string {
  if (displayName.toLowerCase().endsWith('crew')) return displayName;
  return `${displayName}s`;
}

function gridOrderedPositions(positions: Position[]): Position[] {
  const PREFERRED = [
    'climber',
    'equipment_operator',
    'bucket_crew',
    'nifty_crew',
    'phc_technician',
  ];
  const known = PREFERRED.map((k) => positions.find((p) => p.key === k)).filter(
    (p): p is Position => Boolean(p),
  );
  const others = positions.filter((p) => !PREFERRED.includes(p.key));
  return [...known, ...others];
}

function PositionSection({
  title,
  tone,
  note,
  employees,
  columns,
  allSkillKeys,
  specialtyByKey,
  summaryColumn = false,
}: {
  title: string;
  tone?: 'warn';
  note?: string;
  employees: Employee[];
  columns: { key: string; label: string }[];
  allSkillKeys: string[];
  specialtyByKey: Map<string, string>;
  summaryColumn?: boolean;
}) {
  const borderClass = tone === 'warn' ? 'border-orange' : 'border-lime';
  return (
    <div className={`flex h-full flex-col rounded-card border-[3px] ${borderClass} bg-paper p-4 sm:p-5`}>
      <h3 className="font-headline text-base font-black uppercase tracking-ribbon text-bark-deep">
        {title}{' '}
        <span className="ml-1 inline-flex items-center rounded-full bg-bark px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-cream">
          {employees.length}
        </span>
      </h3>
      {note && <p className="mt-2 text-sm text-fg-2">{note}</p>}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-paper-edge text-left">
              <th className="py-1.5 pr-2 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                Name
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="py-1.5 px-1.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3"
                >
                  {c.label}
                </th>
              ))}
              {summaryColumn && (
                <th className="py-1.5 px-1.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  Skill summary · L1 / L2 / L3
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr
                key={e.slug}
                className="border-b border-paper-edge/60 last:border-0"
              >
                <td className="py-1.5 pr-2">
                  <Link
                    href={`/crew/employees/${e.slug}`}
                    className="font-headline font-extrabold text-bark-deep hover:underline"
                  >
                    {e.name}
                  </Link>
                  {(e.leads_crew || e.specialties.length > 0) && (
                    <span className="ml-1.5 inline-flex flex-wrap items-center gap-1">
                      {e.leads_crew && <ForemanPill />}
                      {e.specialties.map((sp) => (
                        <SpecialtyPill
                          key={sp}
                          specialtyKey={sp}
                          label={specialtyByKey.get(sp) ?? sp}
                        />
                      ))}
                    </span>
                  )}
                </td>
                {columns.map((c) => (
                  <td key={c.key} className="py-1.5 px-1.5">
                    <SkillBadge level={e.skills[c.key] ?? null} />
                  </td>
                ))}
                {summaryColumn && (
                  <td className="py-1.5 px-1.5">
                    {(() => {
                      const s = summarizeSkills(e, allSkillKeys);
                      return (
                        <div className="flex gap-1.5">
                          <SkillBadge level={1} className="!min-w-[2.5rem] justify-center" />
                          <span className="font-headline text-xs">{s.l1}</span>
                          <SkillBadge level={2} className="!min-w-[2.5rem] justify-center" />
                          <span className="font-headline text-xs">{s.l2}</span>
                          <SkillBadge level={3} className="!min-w-[2.5rem] justify-center" />
                          <span className="font-headline text-xs">{s.l3}</span>
                        </div>
                      );
                    })()}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PhcSection({
  title,
  employees,
  licenseByEmployee,
  specialtyByKey,
}: {
  title: string;
  employees: Employee[];
  licenseByEmployee: Map<string, LicenseStatus>;
  specialtyByKey: Map<string, string>;
}) {
  return (
    <div className="flex h-full flex-col rounded-card border-[3px] border-lime bg-paper p-4 sm:p-5">
      <h3 className="font-headline text-base font-black uppercase tracking-ribbon text-bark-deep">
        {title}{' '}
        <span className="ml-1 inline-flex items-center rounded-full bg-bark px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-cream">
          {employees.length}
        </span>
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-paper-edge text-left">
              <th className="py-1.5 pr-2 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                Name
              </th>
              <th className="py-1.5 px-1.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                <Link href="/crew/trainings/applicators_license" className="hover:underline">
                  Applicator&rsquo;s License
                </Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.slug} className="border-b border-paper-edge/60 last:border-0">
                <td className="py-1.5 pr-2">
                  <Link
                    href={`/crew/employees/${e.slug}`}
                    className="font-headline font-extrabold text-bark-deep hover:underline"
                  >
                    {e.name}
                  </Link>
                  {(e.leads_crew || e.specialties.length > 0) && (
                    <span className="ml-1.5 inline-flex flex-wrap items-center gap-1">
                      {e.leads_crew && <ForemanPill />}
                      {e.specialties.map((sp) => (
                        <SpecialtyPill
                          key={sp}
                          specialtyKey={sp}
                          label={specialtyByKey.get(sp) ?? sp}
                        />
                      ))}
                    </span>
                  )}
                </td>
                <td className="py-1.5 px-1.5">
                  <LicenseBadge status={licenseByEmployee.get(e.slug) ?? null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LicenseBadge({ status }: { status: LicenseStatus }) {
  const map = {
    passed: { label: 'Passed', cls: 'bg-green-dark text-white' },
    in_progress: { label: 'In progress', cls: 'bg-status-warn/30 text-orange-press' },
    failed: { label: 'Failed', cls: 'bg-orange-press text-white' },
    null: { label: 'Not yet', cls: 'bg-paper-edge text-fg-2' },
  } as const;
  const cfg = status ? map[status] : map.null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function CoverageRow({
  label,
  pct,
  count,
  total,
  tone,
}: {
  label: string;
  pct: number;
  count: number;
  total: number;
  tone: 'l2' | 'l3';
}) {
  const fill = tone === 'l3' ? 'bg-green-dark' : 'bg-green';
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-fg-2">
        <span className="font-headline font-extrabold uppercase tracking-ribbon text-fg-3">
          {label}
        </span>
        <span className="font-headline">
          {count} / {total}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-paper-edge">
        <span
          className={`block h-full ${fill}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
