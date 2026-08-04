import { requireHubAccess } from '@/lib/auth';
import VideoNotesClient from './VideoNotesClient';

// Video Notes: upload an arborist estimate-walkthrough video and get an
// AI findings report (visual analysis). Gated to hub roles.
export default async function VideoNotesPage() {
  const user = await requireHubAccess('hub');

  return (
    <main className="bt-page">
      <h1 className="text-2xl font-bold mb-2">Video Notes</h1>
      <p className="text-sm text-neutral-600 mb-6 max-w-2xl">
        Upload an estimate-walkthrough video. Your browser pulls a set of still
        frames and Claude reviews them for power lines, slopes, wet areas,
        access/parking concerns, and extra trees worth quoting. Everything Claude
        flags visually should be verified on site.
      </p>
      <VideoNotesClient isAdmin={user.role === 'admin'} />
    </main>
  );
}
