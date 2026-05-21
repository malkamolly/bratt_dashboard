// ============================================================================
// Daily huddle (latest) — /crew/reports/huddle
// ============================================================================
// Redirects to the most-recent huddle, or shows "no huddles yet" if empty.
// ============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import { getLatestHuddle } from '@/lib/crew-data';

export const dynamic = 'force-dynamic';

export default async function LatestHuddlePage() {
  const user = await requireHubAccess('crew');
  const latest = await getLatestHuddle();
  if (latest) redirect(`/crew/reports/huddle/${latest.date}`);

  const editable = canEditCrew(user.role);
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/crew/reports" className="hover:underline">
          Reports
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Daily huddle
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Daily huddle
      </h1>
      <div className="mt-8 rounded-card border-2 border-dashed border-paper-edge bg-paper p-8 text-center">
        <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
          Empty
        </p>
        <p className="mt-2 text-sm text-fg-2">No huddles on file yet.</p>
        {editable && (
          <Link href="/admin/crew/huddles/new" className="mt-4 inline-block bt-btn bt-btn-primary text-xs">
            Write the first huddle
          </Link>
        )}
      </div>
    </main>
  );
}
