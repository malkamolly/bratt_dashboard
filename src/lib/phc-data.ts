// ============================================================================
// PHC Scheduling Hub — server-side data loader
// ============================================================================
// Loads the active renewal batch and joins services + treatment timing +
// call-status into the grouped, ordered view the pages render. Kept separate
// from phc-renewals.ts (pure logic) because this touches the database.
// ============================================================================

import { serverClient } from '@/lib/supabase';
import {
  buildProperties,
  type ServiceRow,
  type TimingInfo,
  type StatusRow,
  type PropertyGroup,
  type ViewSummary,
} from '@/lib/phc-renewals';

export type ActiveView =
  | { batch: null }
  | {
      batch: { id: string; label: string; uploaded_at: string; uploaded_by: string };
      properties: PropertyGroup[];
      summary: ViewSummary;
    };

export async function loadActiveView(): Promise<ActiveView> {
  const supabase = await serverClient();

  const { data: batch } = await supabase
    .from('phc_renewal_batches')
    .select('id, label, uploaded_at, uploaded_by')
    .eq('is_active', true)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!batch) return { batch: null };

  const [{ data: services }, { data: timing }, { data: statuses }] = await Promise.all([
    supabase
      .from('phc_renewal_services')
      .select(
        'id, event_id, customer_id, customer_name, location_id, location_address, treatment_name, treatment_type, num_trees, species, tree_location, dbh, desc_title',
      )
      .eq('batch_id', batch.id),
    supabase
      .from('phc_treatment_timing')
      .select(
        'name, treatment_type, visits, visit_interval_days, anytime, is_first_of_season, window_start_month, window_end_month, window2_start_month, window2_end_month, needs_pricing, timing_note',
      ),
    supabase
      .from('phc_property_status')
      .select('location_id, status, note, updated_at')
      .eq('batch_id', batch.id),
  ]);

  const { properties, summary } = buildProperties(
    (services ?? []) as ServiceRow[],
    (timing ?? []) as TimingInfo[],
    (statuses ?? []) as StatusRow[],
  );

  return { batch, properties, summary };
}
