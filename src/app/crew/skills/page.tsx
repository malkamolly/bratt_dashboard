// ============================================================================
// Skill catalog — /crew/skills
// ============================================================================
// Replaces skills/index.md. Shows what each level means and lists every
// tracked skill.
// ============================================================================

import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { getCatalogs } from '@/lib/crew-data';

export const dynamic = 'force-dynamic';

export default async function SkillCatalogPage() {
  await requireHubAccess('crew');
  const { skills } = await getCatalogs();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
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

      <div className="mt-8 overflow-hidden rounded-card border border-paper-edge bg-paper">
        <table className="w-full text-sm">
          <thead className="bg-bone">
            <tr>
              <th className="px-4 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                Skill
              </th>
            </tr>
          </thead>
          <tbody>
            {skills.map((s) => (
              <tr key={s.key} className="border-t border-paper-edge/60">
                <td className="px-4 py-2">
                  <Link
                    href={`/crew/skills/${s.key}`}
                    className="font-headline font-extrabold text-bark-deep hover:underline"
                  >
                    {s.display_name}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
