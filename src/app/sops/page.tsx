import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser, canUseSops } from '@/lib/auth';
import { listSops, collectCategories } from '@/lib/sop-data';
import { SopLibrary } from './SopLibrary';

export const dynamic = 'force-dynamic';

export default async function SopsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Office-only tool. Gate the same way the hubs do.
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canUseSops(user.role)) redirect('/access-denied');

  const { error } = await searchParams;
  const docs = await listSops();
  const categories = collectCategories(docs);

  return (
    <main className="bt-page">
      <div className="mb-8">
        <p className="bt-eyebrow">
          <Link href="/" className="hover:underline">
            Bratt Tree
          </Link>
          <span className="mx-2 text-fg-3">/</span>
          Office
        </p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl tracking-wider text-ink uppercase">
          SOP Library
        </h1>
        <p className="mt-3 max-w-2xl text-fg-2">
          Standard operating procedures and documentation for the office team.
          Search, read, and download. (Asking questions across all of these is
          coming next.)
        </p>
      </div>

      <SopLibrary docs={docs} categories={categories} error={error} />
    </main>
  );
}
