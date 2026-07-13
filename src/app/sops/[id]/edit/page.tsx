import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { getAllowedUser, canUseSops } from '@/lib/auth';
import {
  getSop,
  listSops,
  collectCategories,
  htmlToMarkdown,
} from '@/lib/sop-data';
import { deleteSop } from '../../actions';
import { SopEditor } from './SopEditor';

export const dynamic = 'force-dynamic';

export default async function EditSopPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canUseSops(user.role)) redirect('/access-denied');

  const { id } = await params;
  const { error } = await searchParams;
  const doc = await getSop(id);
  if (!doc) notFound();

  // Docs uploaded before in-app editing have no markdown yet — seed the editor
  // from their extracted HTML the first time they're opened.
  const markdown = doc.body_markdown?.trim()
    ? doc.body_markdown
    : htmlToMarkdown(doc.body_html);

  const categories = collectCategories(await listSops());

  return (
    <main className="bt-page">
      <Link
        href={`/sops/${doc.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-2 hover:text-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to document
      </Link>

      <h1 className="mt-4 font-display text-3xl tracking-wide text-ink uppercase sm:text-4xl">
        Edit document
      </h1>

      {error && (
        <div className="mt-4 rounded-2 border-2 border-orange-press bg-orange-press/10 px-4 py-3 text-sm text-orange-press">
          {error}
        </div>
      )}

      <SopEditor
        id={doc.id}
        title={doc.title}
        category={doc.category}
        markdown={markdown}
        categories={categories}
      />

      <details className="mt-12 border-t-2 border-paper-edge pt-6">
        <summary className="inline-flex cursor-pointer items-center gap-2 font-headline text-sm font-extrabold uppercase tracking-ribbon text-orange-press hover:underline">
          <Trash2 className="h-4 w-4" />
          Delete this document
        </summary>
        <form action={deleteSop} className="mt-4">
          <input type="hidden" name="id" value={doc.id} />
          <p className="mb-3 text-sm text-fg-2">
            This hides the document from the library. This can’t be undone from
            here.
          </p>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-full bg-orange-press px-4 py-2 text-sm font-bold text-white hover:bg-orange-press/90"
          >
            <Trash2 className="h-4 w-4" />
            Delete document
          </button>
        </form>
      </details>
    </main>
  );
}
