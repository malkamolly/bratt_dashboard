// ============================================================================
// Training modules — /crew/modules
// ============================================================================
// Catalog of in-app training modules. Each is a self-contained
// presentation + test + certificate package (e.g. Avant 528 Operator).
// ============================================================================

import Link from 'next/link';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import { listTrainingModules } from '@/lib/crew-data';

export const dynamic = 'force-dynamic';

export default async function TrainingModulesIndex() {
  const user = await requireHubAccess('crew');
  const editable = canEditCrew(user.role);
  const modules = await listTrainingModules();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Training modules
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Training modules
      </h1>
      <p className="mt-3 max-w-2xl text-fg-2">
        Self-contained training packages: present the deck, assign the test,
        certify the crew. Each pass generates a certificate and updates the
        employee&apos;s trainings.
      </p>

      {modules.length === 0 ? (
        <div className="mt-8 rounded-card border-2 border-dashed border-paper-edge bg-paper p-8 text-center">
          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
            Empty
          </p>
          <p className="mt-2 text-sm text-fg-2">No modules yet.</p>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
          {modules.map((m) => (
            <li key={m.slug}>
              <Link
                href={`/crew/modules/${m.slug}`}
                className="bt-card flex h-full flex-col gap-3 transition-colors hover:!border-orange"
              >
                <p className="bt-eyebrow">v{m.version}</p>
                <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
                  {m.name}
                </h2>
                {m.description && (
                  <p className="text-sm text-fg-2">{m.description}</p>
                )}
                <p className="mt-auto font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  Pass: {m.pass_threshold}%
                  {m.requires_all_safety && ' · All safety questions required'}
                </p>
                <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
                  {editable ? 'Present & assign →' : 'View →'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
