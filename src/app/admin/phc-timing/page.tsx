import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { FlashBanner } from '@/components/admin-shared';
import { updatePhcTiming } from './actions';

export const dynamic = 'force-dynamic';

type Search = Promise<{ saved?: string; error?: string }>;

type TimingRow = {
  id: string;
  name: string;
  price_book_id: string | null;
  treatment_type: 'spray' | 'injection' | null;
  visits: number;
  visit_interval_days: number;
  frequency_months: number;
  anytime: boolean;
  is_first_of_season: boolean;
  window_start_month: number | null;
  window_end_month: number | null;
  window2_start_month: number | null;
  window2_end_month: number | null;
  timing_note: string | null;
  needs_pricing: boolean;
};

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const FREQ_OPTIONS: { value: number; label: string }[] = [
  { value: 12, label: 'Every year' },
  { value: 24, label: 'Every other year' },
  { value: 36, label: 'Every 3 years' },
];

const inputCls =
  'mt-1 w-full rounded-2 border-2 border-paper-edge bg-white px-2 py-1.5 font-headline text-sm focus:border-orange focus:outline-none';
const fieldLabelCls =
  'block font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-2';

function MonthSelect({ name, value }: { name: string; value: number | null }) {
  return (
    <select name={name} defaultValue={value ?? ''} className={inputCls}>
      <option value="">—</option>
      {MONTHS.map((m, i) => (
        <option key={m} value={i + 1}>
          {m}
        </option>
      ))}
    </select>
  );
}

/** Short human summary of a treatment's window, for the card header. */
function windowSummary(t: TimingRow): string {
  if (t.anytime) return 'Anytime in season';
  const fmt = (a: number | null, b: number | null) =>
    a == null ? null : a === b ? MONTHS[a - 1] : `${MONTHS[a - 1]}–${MONTHS[(b ?? a) - 1]}`;
  const w1 = fmt(t.window_start_month, t.window_end_month);
  const w2 = fmt(t.window2_start_month, t.window2_end_month);
  if (w1 && w2) return `${w1} or ${w2}`;
  return w1 ?? w2 ?? 'No window set';
}

export default async function PhcTimingAdminPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/access-denied');

  const sp = await searchParams;

  const supabase = await serverClient();
  const { data } = await supabase
    .from('phc_treatment_timing')
    .select(
      'id, name, price_book_id, treatment_type, visits, visit_interval_days, frequency_months, anytime, is_first_of_season, window_start_month, window_end_month, window2_start_month, window2_end_month, timing_note, needs_pricing',
    )
    .order('name', { ascending: true });

  const rows = (data ?? []) as TimingRow[];
  const needPricing = rows.filter((r) => r.needs_pricing);
  const estimated = rows.filter((r) => (r.timing_note ?? '').includes('Estimated'));

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        PHC Treatment Timing
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink">
        PHC Treatment Timing
      </h1>
      <p className="mt-3 max-w-2xl text-fg-2">
        When each Plant Health Care treatment can happen during the season, how
        many visits it needs, and which must go first. This is what drives
        renewal scheduling. Only admins can change it. Edit a treatment and hit
        Save — windows use month ranges (we can get more precise later).
      </p>

      <FlashBanner saved={sp.saved} error={sp.error} />

      {/* Things that still need attention */}
      {(needPricing.length > 0 || estimated.length > 0) && (
        <div className="mt-6 space-y-3">
          {needPricing.length > 0 && (
            <div className="rounded-2 border-2 border-orange-press bg-orange/10 px-4 py-3 text-sm text-orange-press">
              <p className="font-bold">
                {needPricing.length} treatment{needPricing.length === 1 ? '' : 's'} not yet in the price book / calculator:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {needPricing.map((r) => (
                  <li key={r.id}>{r.name}</li>
                ))}
              </ul>
              <p className="mt-1">
                Add a price for these in the price book, then clear their “needs
                pricing” box and fill in the matching price-book ID below.
              </p>
            </div>
          )}
          {estimated.length > 0 && (
            <div className="rounded-2 border-2 border-paper-edge bg-white/60 px-4 py-3 text-sm text-fg-2">
              <span className="font-bold text-bark-deep">
                {estimated.length} window{estimated.length === 1 ? '' : 's'} are best-guess estimates
              </span>{' '}
              (their note says “confirm with expert”). These work for now but
              should be verified with the tree-care experts.
            </div>
          )}
        </div>
      )}

      <p className="mt-6 text-sm text-fg-3">
        {rows.length} treatments
      </p>

      <div className="mt-4 space-y-5">
        {rows.map((t) => (
          <form
            key={t.id}
            action={updatePhcTiming}
            className="bt-card"
          >
            <input type="hidden" name="id" value={t.id} />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-headline text-lg font-black uppercase text-bark-deep">
                  {t.name}
                </h2>
                <p className="mt-1 text-xs text-fg-3">
                  {windowSummary(t)}
                  {t.visits > 1 && ` · ${t.visits} visits, ${t.visit_interval_days} days apart`}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {t.is_first_of_season && (
                  <span className="rounded-full bg-orange/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press">
                    First of season
                  </span>
                )}
                {t.needs_pricing && (
                  <span className="rounded-full bg-orange-press/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press">
                    Not in calculator
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label>
                <span className={fieldLabelCls}>Type (crew)</span>
                <select name="treatment_type" defaultValue={t.treatment_type ?? ''} className={inputCls}>
                  <option value="">—</option>
                  <option value="spray">Spray / Drench</option>
                  <option value="injection">Injection</option>
                </select>
              </label>
              <label>
                <span className={fieldLabelCls}>Visits</span>
                <input type="number" name="visits" min={1} defaultValue={t.visits} className={inputCls} />
              </label>
              <label>
                <span className={fieldLabelCls}>Days between</span>
                <input type="number" name="visit_interval_days" min={1} defaultValue={t.visit_interval_days} className={inputCls} />
              </label>
              <label>
                <span className={fieldLabelCls}>Renews</span>
                <select name="frequency_months" defaultValue={t.frequency_months} className={inputCls}>
                  {FREQ_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label>
                <span className={fieldLabelCls}>Window start</span>
                <MonthSelect name="window_start_month" value={t.window_start_month} />
              </label>
              <label>
                <span className={fieldLabelCls}>Window end</span>
                <MonthSelect name="window_end_month" value={t.window_end_month} />
              </label>
              <label>
                <span className={fieldLabelCls}>2nd window start</span>
                <MonthSelect name="window2_start_month" value={t.window2_start_month} />
              </label>
              <label>
                <span className={fieldLabelCls}>2nd window end</span>
                <MonthSelect name="window2_end_month" value={t.window2_end_month} />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-fg-2">
                <input type="checkbox" name="anytime" defaultChecked={t.anytime} className="h-4 w-4" />
                Anytime in season
              </label>
              <label className="flex items-center gap-2 text-sm text-fg-2">
                <input type="checkbox" name="is_first_of_season" defaultChecked={t.is_first_of_season} className="h-4 w-4" />
                Must be first of season
              </label>
              <label className="flex items-center gap-2 text-sm text-fg-2">
                <input type="checkbox" name="needs_pricing" defaultChecked={t.needs_pricing} className="h-4 w-4" />
                Not in calculator yet
              </label>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="sm:col-span-1">
                <span className={fieldLabelCls}>Price-book ID</span>
                <input
                  type="text"
                  name="price_book_id"
                  defaultValue={t.price_book_id ?? ''}
                  placeholder="(none — not priced)"
                  className={`${inputCls} normal-case`}
                />
              </label>
              <label className="sm:col-span-2">
                <span className={fieldLabelCls}>Note</span>
                <input
                  type="text"
                  name="timing_note"
                  defaultValue={t.timing_note ?? ''}
                  className={`${inputCls} normal-case`}
                />
              </label>
            </div>

            <div className="mt-4">
              <button type="submit" className="bt-btn bt-btn-primary">
                Save
              </button>
            </div>
          </form>
        ))}
      </div>
    </main>
  );
}
