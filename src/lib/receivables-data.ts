// ============================================================================
// Collections list — database read
// ============================================================================
// The one query both surfaces share: fetch the active uploaded report. Kept
// apart from lib/receivables.ts so the maths there stays pure (no Supabase
// import, so it can be reasoned about and exercised without a session).
// ============================================================================

import { serverClient } from '@/lib/supabase';
import { hydrateReceivables, type ReceivablesData } from '@/lib/receivables';

export type ActiveReceivables = {
  data: ReceivablesData;
  uploadedAt: string;
} | null;

/**
 * The current collections report, or null when nothing has been uploaded yet.
 *
 * Null is a normal state, not an error: the feature ships before the first
 * upload exists, and every caller is expected to render an empty state rather
 * than break.
 */
export async function loadActiveReceivables(): Promise<ActiveReceivables> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('receivables_uploads')
    .select('payload, uploaded_at')
    .eq('is_active', true)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.payload) return null;
  return {
    // Every read is hydrated: a payload written before a field existed is
    // missing it permanently, and reading it raw throws.
    data: hydrateReceivables(data.payload as ReceivablesData),
    uploadedAt: String(data.uploaded_at),
  };
}
