// ============================================================================
// PHC renewals — shared parsing + scheduling-view logic
// ============================================================================
// Pure helpers (no database / no exceljs imports) shared by the upload action
// and the hub pages:
//   - parseDescription: pull tree fields out of the free-text Item Description
//   - deriveType / stripPrefix: normalize the treatment name + type
//   - buildProperties: join services to treatment timing, compute flags,
//     detect duplicates, group by property, and order the call list
// ============================================================================

export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// The outreach cadence: two texts, then hand to the salesperson to confirm,
// ending in Scheduled or Declined.
export const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started',
  text_1: '1st text sent',
  text_2: '2nd text sent',
  with_sales: 'With salesperson',
  scheduled: 'Scheduled',
  // Kept the internal key 'declined' but shown as "Dismissed" to match ServiceTitan.
  declined: 'Dismissed',
};

// All valid statuses (used for validation).
export const STATUS_ORDER = [
  'not_started', 'text_1', 'text_2', 'with_sales', 'scheduled', 'declined',
];

// The linear happy-path funnel. "declined" sits off the funnel as an outcome
// that can happen at any point.
export const STATUS_FUNNEL = [
  'not_started', 'text_1', 'text_2', 'with_sales', 'scheduled',
];

/** The next step in the funnel, or null if there isn't one (terminal). */
export function nextStatus(current: string): string | null {
  const i = STATUS_FUNNEL.indexOf(current);
  if (i < 0 || i >= STATUS_FUNNEL.length - 1) return null;
  return STATUS_FUNNEL[i + 1];
}

/** The previous step in the funnel, or null if at the start / off-funnel. */
export function prevStatus(current: string): string | null {
  const i = STATUS_FUNNEL.indexOf(current);
  if (i <= 0) return null;
  return STATUS_FUNNEL[i - 1];
}

/** A parsed tree from one Item Description. */
export type ParsedTree = {
  count: string;
  species: string;
  treeLocation: string;
  dbh: string;
};

/** Strip the "Tree Health Care: " prefix so names match the timing table. */
export function stripPrefix(name: string): string {
  return name.replace(/\u00a0/g, ' ').replace(/^Tree Health Care:\s*/i, '').trim();
}

/** 'injection' | 'spray' | null, inferred from a treatment name. */
export function deriveType(name: string): 'spray' | 'injection' | null {
  const n = name.toLowerCase();
  if (n.includes('inject')) return 'injection';
  if (n.includes('spray') || n.includes('drench')) return 'spray';
  return null;
}

function matchField(desc: string, patterns: RegExp[]): string {
  for (const line of desc.split('\n')) {
    const t = line.trim();
    for (const p of patterns) {
      const m = t.match(p);
      if (m) return m[1].trim().replace(/^["\s]+|["\s]+$/g, '');
    }
  }
  return '';
}

/** Pull #trees / species / location / DBH out of the messy description text. */
export function parseDescription(rawIn: string): ParsedTree {
  const desc = (rawIn || '').replace(/\u00a0/g, ' ');
  return {
    count: matchField(desc, [/^#\s*of\s*tree\(?s?\)?\s*:?\s*(.*)$/i, /^#of\s*trees?\s*:?\s*(.*)$/i]),
    species: matchField(desc, [/^(?:tree\s*)?species\s*:?\s*(.*)$/i]),
    treeLocation: matchField(desc, [/^location(?:\s*of\s*tree\(?s?\)?)?\s*:?\s*(.*)$/i]),
    dbh: matchField(desc, [/^(?:total\s*)?dbh\s*:?\s*(.*)$/i]),
  };
}

/** First non-empty line of a description (used for type-mismatch detection). */
export function descTitle(rawIn: string): string {
  const desc = (rawIn || '').replace(/\u00a0/g, ' ');
  for (const line of desc.split('\n')) {
    if (line.trim()) return line.trim();
  }
  return '';
}

// ----------------------------------------------------------------------------
// Timing + service shapes (subset of the DB rows we need here).
// ----------------------------------------------------------------------------

export type TimingInfo = {
  name: string;
  treatment_type: 'spray' | 'injection' | null;
  visits: number;
  visit_interval_days: number;
  anytime: boolean;
  is_first_of_season: boolean;
  window_start_month: number | null;
  window_end_month: number | null;
  window2_start_month: number | null;
  window2_end_month: number | null;
  needs_pricing: boolean;
  timing_note: string | null;
};

export type ServiceRow = {
  id: string;
  event_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  location_id: string | null;
  location_address: string | null;
  customer_phone: string | null;
  location_phone: string | null;
  treatment_name: string;
  treatment_type: 'spray' | 'injection' | null;
  num_trees: string | null;
  species: string | null;
  tree_location: string | null;
  dbh: string | null;
  desc_title: string | null;
};

export type StatusRow = {
  location_id: string;
  status: string;
  note: string | null;
  assigned_salesperson_id: string | null;
  updated_at: string;
};

/** A sales arborist option (display name already composed as "First L"). */
export type Salesperson = { id: string; name: string };

/** A human window label like "Anytime", "May", "May or Sep", "Apr–Jun". */
export function windowLabel(t: TimingInfo | undefined): string {
  if (!t) return '—';
  if (t.anytime) return 'Anytime';
  const fmt = (a: number | null, b: number | null) =>
    a == null ? null : a === b || b == null ? MONTHS[a - 1] : `${MONTHS[a - 1]}–${MONTHS[b - 1]}`;
  const w1 = fmt(t.window_start_month, t.window_end_month);
  const w2 = fmt(t.window2_start_month, t.window2_end_month);
  if (w1 && w2) return `${w1} or ${w2}`;
  return w1 ?? w2 ?? 'No window set';
}

/** Lower = earlier in the season = higher call priority. */
function timingOrder(t: TimingInfo | undefined): number {
  if (!t) return 50;
  if (t.is_first_of_season) return 0;
  if (t.anytime) return 90;
  const starts = [t.window_start_month, t.window2_start_month].filter(
    (m): m is number => m != null,
  );
  return starts.length ? Math.min(...starts) : 50;
}

export type EnrichedService = ServiceRow & {
  timing?: TimingInfo;
  windowLabel: string;
  visits: number;
  isFirst: boolean;
  flags: string[];
  isDuplicate: boolean;
};

export type PropertyGroup = {
  locationId: string;
  customerId: string;
  customer: string;
  address: string;
  customerPhone: string;
  locationPhone: string;
  services: EnrichedService[];
  status: string;
  note: string;
  assignedSalespersonId: string;
  assignedName: string;
  hasFirst: boolean;
  needsInfoCount: number;
  hasMismatch: boolean;
  hasDuplicate: boolean;
  order: number;
};

export type ViewSummary = {
  totalServices: number;
  totalProperties: number;
  bundles: number;
  bundlesWithFirst: number;
  needsInfo: number;
  mismatches: number;
  duplicates: number;
  unpriced: number;
  notStarted: number;
};

/**
 * A plain-text summary of a property's renewals, ready to paste into a text or
 * DM to the sales arborist who's confirming it.
 */
export function buildHandoffText(p: PropertyGroup): string {
  const lines: string[] = [`Renewal to confirm — ${p.customer}`];
  if (p.address) lines.push(p.address);
  const ids = [
    p.customerId && `Customer ${p.customerId}`,
    p.locationId && `Location ${p.locationId}`,
  ]
    .filter(Boolean)
    .join(' · ');
  if (ids) lines.push(`ServiceTitan: ${ids}`);
  const phones = [
    p.customerPhone && `Customer ${p.customerPhone}`,
    p.locationPhone && `Location ${p.locationPhone}`,
  ]
    .filter(Boolean)
    .join(' · ');
  if (phones) lines.push(`Phone: ${phones}`);
  lines.push('', 'Treatments:');
  for (const s of p.services) {
    const details = [
      s.num_trees && `${s.num_trees} tree(s)`,
      s.species,
      s.tree_location,
      s.dbh && `DBH ${s.dbh}`,
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(`• ${s.treatment_name} (${s.windowLabel})${details ? ` — ${details}` : ''}`);
  }
  if (p.note) lines.push('', `Note: ${p.note}`);
  return lines.join('\n');
}

/** Flags for a single service given its timing. */
function serviceFlags(s: ServiceRow, t: TimingInfo | undefined): string[] {
  const f: string[] = [];
  const type = t?.treatment_type ?? s.treatment_type ?? deriveType(s.treatment_name);
  if (!(s.tree_location || '').trim()) f.push('No location');
  if (!(s.species || '').trim()) f.push('No species');
  if (type === 'injection' && !(s.dbh || '').trim()) f.push('No DBH (needed)');
  const titleType = deriveType(s.desc_title || '');
  if (type && titleType && type !== titleType) f.push('Type mismatch');
  if (t?.needs_pricing) f.push('Not in price book');
  return f;
}

/**
 * Join services to timing, compute flags + duplicates, group by property, and
 * order the list for the spring call-through (must-go-first + tightest windows
 * bubble up). Pure — pass in the three tables' rows.
 */
export function buildProperties(
  services: ServiceRow[],
  timing: TimingInfo[],
  statuses: StatusRow[],
  salespeople: Salesperson[] = [],
): { properties: PropertyGroup[]; summary: ViewSummary } {
  const timingMap = new Map(timing.map((t) => [t.name.toLowerCase(), t]));
  const statusMap = new Map(statuses.map((s) => [s.location_id, s]));
  const salesMap = new Map(salespeople.map((sp) => [sp.id, sp.name]));

  // Group raw services by property first, so we can detect duplicates within.
  const byLoc = new Map<string, ServiceRow[]>();
  for (const s of services) {
    const key = s.location_id || `noloc-${s.id}`;
    (byLoc.get(key) ?? byLoc.set(key, []).get(key)!).push(s);
  }

  const properties: PropertyGroup[] = [];
  let needsInfo = 0, mismatches = 0, duplicates = 0, unpriced = 0;

  for (const [locId, rows] of byLoc) {
    // Duplicate detection: same treatment + identical species/location/DBH.
    const dupIds = new Set<string>();
    const byTreatment = new Map<string, ServiceRow[]>();
    for (const s of rows) {
      const k = s.treatment_name.toLowerCase();
      (byTreatment.get(k) ?? byTreatment.set(k, []).get(k)!).push(s);
    }
    for (const g of byTreatment.values()) {
      if (g.length < 2) continue;
      const seen = new Map<string, string>();
      for (const s of g) {
        const sig = `${(s.species || '').toLowerCase()}|${(s.tree_location || '').toLowerCase()}|${(s.dbh || '').toLowerCase()}`;
        if (seen.has(sig)) {
          dupIds.add(s.id);
          dupIds.add(seen.get(sig)!);
        } else {
          seen.set(sig, s.id);
        }
      }
    }

    const enriched: EnrichedService[] = rows.map((s) => {
      const t = timingMap.get(s.treatment_name.toLowerCase());
      const flags = serviceFlags(s, t);
      const isDuplicate = dupIds.has(s.id);
      if (flags.some((x) => x !== 'Type mismatch' && x !== 'Not in price book' ? x.startsWith('No ') : false)) needsInfo++;
      if (flags.includes('Type mismatch')) mismatches++;
      if (flags.includes('Not in price book')) unpriced++;
      if (isDuplicate) duplicates++;
      return {
        ...s,
        timing: t,
        windowLabel: windowLabel(t),
        visits: t?.visits ?? 1,
        isFirst: !!t?.is_first_of_season,
        flags,
        isDuplicate,
      };
    });

    const st = statusMap.get(locId);
    const hasFirst = enriched.some((e) => e.isFirst);
    properties.push({
      locationId: locId,
      customerId: rows[0].customer_id || '',
      customer: rows[0].customer_name || '(no name)',
      address: rows[0].location_address || '',
      customerPhone: rows[0].customer_phone || '',
      locationPhone: rows[0].location_phone || '',
      services: enriched,
      status: st?.status || 'not_started',
      note: st?.note || '',
      assignedSalespersonId: st?.assigned_salesperson_id || '',
      assignedName: (st?.assigned_salesperson_id && salesMap.get(st.assigned_salesperson_id)) || '',
      hasFirst,
      needsInfoCount: enriched.filter((e) =>
        e.flags.some((f) => f.startsWith('No ')),
      ).length,
      hasMismatch: enriched.some((e) => e.flags.includes('Type mismatch')),
      hasDuplicate: enriched.some((e) => e.isDuplicate),
      order: Math.min(...enriched.map((e) => timingOrder(e.timing))),
    });
  }

  // Call-list order: earliest/must-go-first first, then bigger bundles.
  properties.sort(
    (a, b) => a.order - b.order || b.services.length - a.services.length ||
      a.customer.localeCompare(b.customer),
  );

  const bundles = properties.filter((p) => p.services.length >= 2);
  const summary: ViewSummary = {
    totalServices: services.length,
    totalProperties: properties.length,
    bundles: bundles.length,
    bundlesWithFirst: bundles.filter((p) => p.hasFirst).length,
    needsInfo,
    mismatches,
    duplicates,
    unpriced,
    notStarted: properties.filter((p) => p.status === 'not_started').length,
  };

  return { properties, summary };
}
