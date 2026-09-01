// ============================================================================
// Scheduled Revenue — database read
// ============================================================================
// The one query the page uses: fetch the active snapshot. Kept apart from
// lib/scheduled-revenue.ts so the maths there stays pure — no Supabase import,
// so it can be reasoned about and exercised without a session.
// ============================================================================

import { serverClient } from '@/lib/supabase';
import {
  hydrateScheduledRevenue,
  type ScheduledRevenueData,
} from '@/lib/scheduled-revenue';

export type ActiveScheduledRevenue = {
  data: ScheduledRevenueData;
  uploadedAt: string;
} | null;

/**
 * The current scheduled-revenue snapshot, or null when nothing has been
 * imported yet.
 *
 * Null is a normal state, not an error: the page ships before the first import
 * exists, and the caller renders an empty state rather than breaking.
 */
export async function loadActiveScheduledRevenue(): Promise<ActiveScheduledRevenue> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('scheduled_revenue_uploads')
    .select('payload, uploaded_at')
    .eq('is_active', true)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.payload) return null;
  return {
    // Every read is hydrated: a payload written before a field existed is
    // missing it permanently, and reading it raw throws.
    data: hydrateScheduledRevenue(data.payload as ScheduledRevenueData),
    uploadedAt: String(data.uploaded_at),
  };
}
