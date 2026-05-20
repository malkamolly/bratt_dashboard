import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser, canAccessHub } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { SalespersonDetail } from '@/components/SalespersonDetail';
import { getArboristBySalespersonName } from '@/lib/hub-content';

export const dynamic = 'force-dynamic';

type Params = Promise<{ salespersonId: string }>;
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

export default async function SalespersonDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');

  const { salespersonId } = await params;
  const sp = await searchParams;
  const now = new Date();
  const year = parseIntInRange(sp.year, 2000, 2100) ?? now.getFullYear();
  const month = parseIntInRange(sp.month, 1, 12) ?? now.getMonth() + 1;

  // Look up the matching arborist (if any) for photo + cert badge.
  const supabase = await serverClient();
  const { data: person } = await supabase
    .from('salespeople')
    .select('name, photo_url')
    .eq('id', salespersonId)
    .maybeSingle();
  const arborist = person?.name
    ? getArboristBySalespersonName(person.name)
    : null;
  // Admin-uploaded photo wins; otherwise fall back to the markdown file's photo.
  const photo = person?.photo_url ?? arborist?.photo ?? null;

  const breadcrumb = (
    <p className="bt-eyebrow">
      <Link href="/sales" className="hover:underline">
        Sales PACE
      </Link>
      <span className="mx-2 text-fg-3">/</span>
      Salesperson
    </p>
  );

  const canEdit = canAccessHub(user.role, 'pace');

  return (
    <SalespersonDetail
      salespersonId={salespersonId}
      year={year}
      month={month}
      breadcrumb={breadcrumb}
      basePath={`/sales/${salespersonId}`}
      canEdit={canEdit}
      arborist={
        arborist
          ? {
              photo,
              certified: arborist.certified,
              isa_number: arborist.isa_number ?? null,
              manager: !!arborist.manager,
            }
          : photo
            ? { photo, certified: false, isa_number: null, manager: false }
            : null
      }
    />
  );
}
