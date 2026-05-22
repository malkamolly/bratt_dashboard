// ============================================================================
// Skill catalog — /crew/skills
// ============================================================================
// Replaces skills/index.md. Shows what each level means and lists every
// tracked skill.
// ============================================================================

import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { getCatalogs, listEmployees } from '@/lib/crew-data';

export const dynamic = 'force-dynamic';

export default async function SkillCatalogPage() {
  await requireHubAccess('crew');
  const [{ skills }, employees] = await Promise.all([
    getCatalogs(),
    listEmployees({ activeOnly: true }),
  ]);

  // Per-skill counts: L3 / L2 / L1 / Unrated.
  const counts = new Map<
    string,
    { l1: number; l2: number; l3: number; unrated: number; total: number }
  >();
  for (const s of skills) {
    counts.set(s.key, { l1: 0, l2: 0, l3: 0, unrated: 0, total: employees.length });
  }
  for (const e of employees) {
    for (const s of skills) {
      const v = e.skills[s.key];
      const c = counts.get(s.key)!;
      if (v === 1) c.l1 += 1;
      else if (v === 2) c.l2 += 1;
      else if (v === 3) c.l3 += 1;
      else c.unrated += 1;
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Skills
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Skill catalog
      </h1>
      <p className="mt-3 max-w-2xl text-fg-2">
        Every employee is rated on the {skills.length} skills below. Levels:
      </p>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LevelExplainer level={1} title="Learning" body="Needs supervision; building fundamentals." />
        <LevelExplainer level={2} title="Proficient" body="Works independently at expected pace and quality." />
        <LevelExplainer level={3} title="Expert" body="Can train others; trusted with hardest cases." />
      </ul>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((s) => {
          const c = counts.get(s.key)!;
          return (
            <Link
              key={s.key}
              href={`/crew/skills/${s.key}`}
              className="group bt-card flex flex-col justify-between transition-colors hover:!border-orange"
            >
              <div>
                <h3 className="font-headline text-xl font-black uppercase text-bark-deep group-hover:text-orange-press">
                  {s.display_name}
                </h3>
                <p className="mt-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  {c.l1 + c.l2 + c.l3} of {c.total} rated
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <SkillCountChip value={c.l3} label="L3" tone="green-dark" />
                <SkillCountChip value={c.l2} label="L2" tone="green" />
                <SkillCountChip value={c.l1} label="L1" tone="orange" />
                <SkillCountChip value={c.unrated} label="—" tone="muted" />
              </div>
              <p className="mt-4 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
                View &amp; edit ratings &rarr;
              </p>
            </Link>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-fg-3">
        Note: &ldquo;Forwarding Machine&rdquo; appears here <em>and</em> on the{' '}
        <Link href="/crew/trainings" className="text-orange hover:underline">
          Trainings catalog
        </Link>{' '}
        — the skill measures hands-on proficiency (L1/L2/L3); the training
        records formal completion. They&apos;re tracked separately on purpose.
      </p>
    </main>
  );
}

function SkillCountChip({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
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
      <span className="text-sm">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function LevelExplainer({ level, title, body }: { level: 1 | 2 | 3; title: string; body: string }) {
  const colors =
    level === 1
      ? 'border-orange/50 bg-orange/5'
      : level === 2
        ? 'border-green/60 bg-green/5'
        : 'border-green-dark bg-green-dark/5';
  return (
    <li className={`rounded-card border-2 ${colors} p-4`}>
      <div className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
        Level {level}
      </div>
      <div className="mt-1 font-headline text-lg font-black uppercase text-bark-deep">
        {title}
      </div>
      <p className="mt-1 text-sm text-fg-2">{body}</p>
    </li>
  );
}
