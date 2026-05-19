import Image from 'next/image';
import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { HubSubNav } from '@/components/HubSubNav';
import { listArborists } from '@/lib/hub-content';

export const dynamic = 'force-dynamic';

export default async function ArboristRosterPage() {
  await requireHubAccess('hub');
  const arborists = listArborists();
  const certifiedCount = arborists.filter((a) => a.certified).length;

  // Pull any admin-uploaded photos so they override the markdown defaults.
  // Keyed by lowercased salesperson name to match `salesperson_name` frontmatter.
  const supabase = await serverClient();
  const { data: spRows } = await supabase
    .from('salespeople')
    .select('name, photo_url');
  const photoOverrides = new Map<string, string>();
  for (const row of spRows ?? []) {
    if (row.photo_url && row.name) {
      photoOverrides.set(String(row.name).toLowerCase(), String(row.photo_url));
    }
  }
  const photoFor = (a: {
    photo?: string | null;
    salesperson_name?: string | null;
  }): string | null => {
    const key = a.salesperson_name?.toLowerCase();
    return (key && photoOverrides.get(key)) || a.photo || null;
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Roster
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Team Roster
      </h1>
      <p className="mt-3 text-fg-2">
        {arborists.length} team members &middot; {certifiedCount} ISA Certified
        Arborists
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub/arborists" />
      </div>

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {arborists.map((a) => {
          const photo = photoFor(a);
          return (
          <li key={a.slug}>
            <Link
              href={`/hub/arborists/${a.slug}`}
              className="bt-card flex h-full flex-col gap-4 transition-colors hover:!border-orange"
            >
              <div className="flex items-center gap-4">
                {photo ? (
                  <Image
                    src={photo}
                    alt=""
                    width={72}
                    height={72}
                    className="h-18 w-18 shrink-0 rounded-full object-cover ring-2 ring-paper-edge"
                  />
                ) : (
                  <div className="flex h-18 w-18 shrink-0 items-center justify-center rounded-full bg-bark text-cream font-display text-2xl uppercase ring-2 ring-paper-edge">
                    {a.name.slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="truncate font-headline text-lg font-black uppercase text-bark-deep">
                    {a.name}
                  </h2>
                  <p className="truncate text-sm text-fg-2">{a.title}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {a.manager ? (
                  <span className="rounded-full bg-bark px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-cream">
                    Sales Manager
                  </span>
                ) : a.certified ? (
                  <>
                    <span className="rounded-full bg-green/15 px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-green-dark">
                      Certified
                    </span>
                    {a.isa_number && (
                      <span className="font-headline text-xs font-bold text-fg-3">
                        {a.isa_number}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="rounded-full bg-orange/15 px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press">
                    In progress
                  </span>
                )}
              </div>
            </Link>
          </li>
          );
        })}
      </ul>
    </main>
  );
}
