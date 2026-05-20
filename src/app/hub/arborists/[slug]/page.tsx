import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireHubAccess, canAccessHub } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { SalespersonDetail } from '@/components/SalespersonDetail';
import { HubSubNav } from '@/components/HubSubNav';
import { getArborist } from '@/lib/hub-content';

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

  const a = getArborist(slug);
  if (!a) notFound();

  const now = new Date();
  const year = parseIntInRange(sp.year, 2000, 2100) ?? now.getFullYear();
  const month = parseIntInRange(sp.month, 1, 12) ?? now.getMonth() + 1;

  // Resolve the matching salesperson row in the dashboard, if any.
  let salespersonId: string | null = null;
  let salespersonPhotoUrl: string | null = null;
  if (a.salesperson_name) {
    const supabase = await serverClient();
    const { data: person } = await supabase
      .from('salespeople')
      .select('id, photo_url')
      .ilike('name', a.salesperson_name)
      .maybeSingle();
    salespersonId = person?.id ?? null;
    salespersonPhotoUrl = person?.photo_url ?? null;
  }
  // Admin-uploaded photo wins over the markdown file's photo.
  const photo = salespersonPhotoUrl ?? a.photo ?? null;

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

  // No matching salesperson — fall back to a name-only page.
  if (!salespersonId) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        {breadcrumb}
        <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink">
          {a.name}
        </h1>
        <p className="mt-2 text-fg-2">{a.title}</p>
        <p className="mt-8 rounded-card border-2 border-dashed border-paper-edge bg-paper p-6 text-center text-sm text-fg-2">
          No salesperson record found in the dashboard for &quot;
          {a.salesperson_name ?? a.name}&quot;.
        </p>
      </main>
    );
  }

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
    />
  );
}
