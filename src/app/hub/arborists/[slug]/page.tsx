import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireHubAccess, canAccessHub } from '@/lib/auth';
import { SalespersonDetail } from '@/components/SalespersonDetail';
import { HubSubNav } from '@/components/HubSubNav';
import { PhcAssignedRenewals } from '@/components/PhcAssignedRenewals';
import { ArboristBalancesDue } from '@/components/ArboristBalancesDue';
import { getRosterMemberBySlug } from '@/lib/roster-data';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;
type Search = Promise<{ year?: string; month?: string }>;

function parseIntInRange(
  raw: string | undefined,
  min: number,
  max: number,
): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

export default async function ArboristDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const user = await requireHubAccess('hub');
  // Edit access on day cells = same roles that can edit Pace.
  // Sales arborists see the page but day rows are non-clickable for them.
  const canEdit = canAccessHub(user.role, 'pace');
  const { slug } = await params;
  const sp = await searchParams;

  const a = await getRosterMemberBySlug(slug);
  if (!a) notFound();

  const now = new Date();
  const year = parseIntInRange(sp.year, 2000, 2100) ?? now.getFullYear();
  const month = parseIntInRange(sp.month, 1, 12) ?? now.getMonth() + 1;

  // The roster member IS a salesperson row, so its id and photo come straight
  // through.
  const salespersonId = a.id;
  const photo = a.photo;

  const breadcrumb = (
    <>
      <p className="bt-eyebrow">
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/hub/arborists" className="hover:underline">
          Roster
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        {a.name}
      </p>
      <div className="mt-6">
        <HubSubNav active="/hub/arborists" />
      </div>
    </>
  );

  return (
    <SalespersonDetail
      salespersonId={salespersonId}
      year={year}
      month={month}
      breadcrumb={breadcrumb}
      basePath={`/hub/arborists/${a.slug}`}
      canEdit={canEdit}
      arborist={{
        photo,
        certified: a.certified,
        isa_number: a.isa_number ?? null,
        manager: !!a.manager,
      }}
      footer={
        <>
          <PhcAssignedRenewals salespersonId={a.id} salespersonName={a.name} />
          {/* Collections sits below the PHC renewals: both are "what to do
              next" lists, and this one decides for itself whether the viewer is
              allowed to see it (see ArboristBalancesDue). */}
          <ArboristBalancesDue
            salespersonName={a.salesperson_name}
            displayName={a.name}
          />
        </>
      }
    />
  );
}
