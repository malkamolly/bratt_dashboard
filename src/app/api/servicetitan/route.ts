// ============================================================================
// ServiceTitan integration placeholder (Phase 2)
// ============================================================================
// Phase 1 leaves this file intentionally empty. In Phase 2, this endpoint
// will pull invoices / sold jobs / completed jobs from ServiceTitan and
// upsert them into sales_entries and production_entries.
//
// Auth, ratelimiting, and crew/salesperson mapping all live here.
// Manual entry remains available as a fallback when this is offline.
// ============================================================================

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { ok: false, message: 'ServiceTitan integration not yet implemented (Phase 2).' },
    { status: 501 },
  );
}
