// ============================================================================
// CDL pipeline stages
// ============================================================================
// The five stages a crew member moves through to get a Commercial Driver's
// License. Stored as a 1-based stage number in field_crew_cdl_progress; the
// labels live here so wording stays in one place.
// ============================================================================

export const CDL_STAGES = [
  'Independent Study',
  'Permit Test',
  '5-Day Course On-Site',
  'License Test',
  'CDL License Obtained',
] as const;

export const CDL_STAGE_COUNT = CDL_STAGES.length;
export type CdlStage = 1 | 2 | 3 | 4 | 5;

export function cdlStageLabel(stage: number): string {
  return CDL_STAGES[stage - 1] ?? `Stage ${stage}`;
}

export function isCdlStage(n: number): n is CdlStage {
  return Number.isInteger(n) && n >= 1 && n <= CDL_STAGE_COUNT;
}

/** The final stage means they've earned the license. */
export const CDL_DONE_STAGE: CdlStage = 5;
