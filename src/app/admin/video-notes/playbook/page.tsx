import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAllowedUser } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { personFromEmail } from '@/lib/format';
import PlaybookManager, { type AdminPlaybookEntry } from './PlaybookManager';

export const dynamic = 'force-dynamic';

// Admin-only view of the Sales Arborist Playbook — every entry the analyzer
// applies, from the Library import and from Coach Mode, editable in one place.
export default async function PlaybookPage() {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/access-denied');

  const supabase = await serverClient();
  const { data } = await supabase
    .from('arborist_playbook')
    .select('id, category, title, content, source, active, created_at, created_by')
    .order('created_at', { ascending: false });

  // Derive the author label here rather than in the client so the house naming
  // rule (First name + Last initial) is applied in one place.
  const entries: AdminPlaybookEntry[] = (data ?? []).map((row) => {
    const r = row as Omit<AdminPlaybookEntry, 'author'>;
    return { ...r, author: personFromEmail(r.created_by) };
  });

  return (
    <main className="bt-page">
      <p className="text-sm text-neutral-500 mb-1">
        <Link href="/admin/video-notes" className="hover:underline">
          Video Notes
        </Link>{' '}
        / Playbook
      </p>
      <h1 className="text-2xl font-bold mb-2">Sales Arborist Playbook</h1>
      <p className="text-sm text-neutral-600 mb-6 max-w-2xl">
        Everything the video analyzer applies. Library entries come from the
        Training Library import; Coach entries come from Coach Mode sessions;
        Reference entries come from the PDF import. Edit the wording, turn an
        entry off without deleting it, or remove it entirely. Inactive entries
        are ignored by analyses.
      </p>
      <PlaybookManager initialEntries={entries} />
    </main>
  );
}
