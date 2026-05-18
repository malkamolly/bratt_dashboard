import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  await requireHubAccess('hub');

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Onboarding
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Onboarding
      </h1>
      <p className="mt-3 text-fg-2">
        What every new Sales Arborist needs to know on day one.
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub/onboarding" />
      </div>

      <div className="rounded-card border-2 border-dashed border-orange/60 bg-orange/5 p-5 text-sm text-fg-2">
        <strong className="text-orange-press">Placeholder.</strong> Send over
        the current onboarding PowerPoint and we&apos;ll translate it into a
        real page here. The structure below will be replaced with your real
        content.
      </div>

      <section className="mt-8 space-y-8 text-fg-2">
        <div>
          <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
            Welcome to Bratt Tree Service
          </h2>
          <p className="mt-2">
            Your introduction to the company, our mission, and what makes us
            different.
          </p>
        </div>

        <div>
          <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
            Your First Week
          </h2>
          <p className="mt-2">
            A checklist of who to meet, what to read, and what to do during
            week one.
          </p>
        </div>

        <div>
          <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
            Tools &amp; Systems
          </h2>
          <p className="mt-2">
            Where to find the CRM, scheduling, and other systems you&apos;ll
            use daily.
          </p>
        </div>

        <div>
          <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
            Sales Approach
          </h2>
          <p className="mt-2">
            How we sell tree care — our values, process, and what a great
            proposal looks like.
          </p>
        </div>
      </section>
    </main>
  );
}
