import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import { SiteMarkupTool } from '@/components/site-markup/SiteMarkupTool';

export const dynamic = 'force-dynamic';

export default async function SitePlanPage() {
  // Anyone with Sales Arborist Hub access can use this (incl. Sales Arborists).
  await requireHubAccess('hub');

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Site Markup
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Site Markup
      </h1>
      <p className="mt-4 max-w-2xl text-fg-2">
        Build a marked-up map and photo of a job site for city permits or power
        line clearance. Draw the lane closures, safety zone, and tree
        locations, then save it as a PDF to attach or email.
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub/site-plan" />
      </div>

      <SiteMarkupTool />
    </main>
  );
}
