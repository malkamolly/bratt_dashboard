import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';

export const dynamic = 'force-dynamic';

export default async function ManagerGuidePage() {
  await requireHubAccess('hub');

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Manager Guide
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Talking to Claude
      </h1>
      <p className="mt-3 text-fg-2">
        Your weekly playbook for building Tuesday meetings, updating the
        roster, and keeping the training library current — just by chatting.
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub" />
      </div>

      <section className="mt-6 space-y-8 text-fg-2">
        <div>
          <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
            Logging in (one time)
          </h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5">
            <li>
              Open <strong>claude.ai/code</strong> in your browser.
            </li>
            <li>
              Sign in with <strong>your Claude account</strong> (your email).
            </li>
            <li>
              Pick the project <code className="rounded bg-paper-edge px-1 py-0.5">bratt_dashboard</code>.
            </li>
            <li>
              When Claude asks to connect GitHub, use the{' '}
              <strong>publisher login</strong> the owner set up for you. Never
              use those credentials on github.com directly — only inside
              Claude Code.
            </li>
          </ol>
        </div>

        <div>
          <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
            What Claude does for you
          </h2>
          <p className="mt-3">
            Claude builds the Tuesday meeting page, files topics into the
            training library (with tags), updates the arborist roster, and
            updates the onboarding page. The dashboard refreshes about 30
            seconds after Claude saves.
          </p>
        </div>

        <div>
          <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
            Each week, tell Claude four things
          </h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5">
            <li>
              <strong>Date</strong> of the meeting (e.g. &quot;Tuesday, May 19,
              2026&quot;).
            </li>
            <li>
              <strong>Educational topic</strong> — title plus your notes.
              Bullets or prose, both fine. Each sub-topic you list becomes a
              slide.
            </li>
            <li>
              <strong>Housekeeping</strong> — timesheets, schedules,
              ride-alongs, etc.
            </li>
            <li>
              <strong>Operational updates</strong> — CRM changes, promos,
              pricing, new services.
            </li>
          </ol>
          <p className="mt-3">
            If a section doesn&apos;t apply this week, just say &quot;no
            housekeeping this week.&quot;
          </p>
        </div>
      </section>
    </main>
  );
}
