// ============================================================================
// Per-skill detail — /crew/skills/[key]
// ============================================================================
// One row per active crew member with their current level (— / L1 / L2 / L3).
// Admins / field managers can change the rating inline.
// ============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import { getSkill, listSkillEmployeeRecords } from '@/lib/crew-data';
import { SkillRowEditor } from '@/components/crew/SkillRowEditor';

export const dynamic = 'force-dynamic';

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const user = await requireHubAccess('crew');
  const editable = canEditCrew(user.role);
  const { key } = await params;

  const skill = await getSkill(key);
  if (!skill) notFound();

  const records = await listSkillEmployeeRecords(key);
  const counts = records.reduce(
    (acc, r) => {
      if (r.level === null) acc.unrated += 1;
      else if (r.level === 1) acc.l1 += 1;
      else if (r.level === 2) acc.l2 += 1;
      else acc.l3 += 1;
      return acc;
    },
    { unrated: 0, l1: 0, l2: 0, l3: 0 },
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/crew/skills" className="hover:underline">
          Skills
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        {skill.display_name}
      </p>

      <header className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
          {skill.display_name}
        </h1>
        <div className="flex flex-wrap gap-3 text-sm text-fg-2">
          <CountPill label="L3" value={counts.l3} tone="green-dark" />
          <CountPill label="L2" value={counts.l2} tone="green" />
          <CountPill label="L1" value={counts.l1} tone="orange" />
          <CountPill label="Unrated" value={counts.unrated} tone="muted" />
        </div>
      </header>

      <p className="mt-3 max-w-2xl text-sm text-fg-2">
        L1 = learning, L2 = proficient, L3 = expert. Click a level to update.
        {!editable && ' View-only — only admins and field managers can edit.'}
      </p>

      <div className="mt-6 overflow-hidden rounded-card border border-paper-edge bg-paper">
        <table className="w-full text-sm">
          <thead className="bg-bone">
            <tr>
              <th className="px-3 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                Employee
              </th>
              <th className="px-3 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                Level
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <SkillRowEditor
                key={r.employee_slug}
                record={r}
                skillKey={skill.key}
                editable={editable}
              />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function CountPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'green-dark' | 'green' | 'orange' | 'muted';
}) {
  const color =
    tone === 'green-dark'
      ? 'bg-green-dark text-white'
      : tone === 'green'
        ? 'bg-green text-white'
        : tone === 'orange'
          ? 'bg-orange text-white'
          : 'bg-paper-edge text-fg-2';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon ${color}`}
    >
      <span className="text-sm">{value}</span> {label}
    </span>
  );
}
