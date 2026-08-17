// ============================================================================
// /hub/followup — The Follow-Through Scorecard
// ============================================================================
// What calling back is worth: the open board, the money sitting in records that
// got one call, what following up earned each arborist, and who to call first.
//
// This page is ARBORIST-FACING — the team reads it about themselves. The copy is
// written for them ("we", "your board"), and the framing is deliberate: gaps are
// described as money still available, not as anybody's failure. Keep that tone
// if you edit it.
//
// It is also embargoed from sales arborists until the release time in
// canSeeFollowupScorecard(), so leadership can walk them through it at the
// weekly meeting rather than have them find it cold. See src/lib/auth.ts.
//
// Numbers come from the most recent uploaded export (followup_uploads.is_active),
// falling back to FALLBACK_SCORECARD so the page is never blank on a fresh
// deploy. Read the header comment in src/lib/followup-scorecard.ts before
// quoting any figure — the population is narrower than "all our sales".
//
// Every number in the PROSE is derived from the data, never typed in. This page
// is re-uploaded weekly, so a hardcoded finding would quietly go stale, which is
// the most dangerous kind of wrong here.
// ============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  requireHubAccess,
  canSeeFollowupScorecard,
  canUploadFollowupData,
} from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { HubSubNav } from '@/components/HubSubNav';
import { uploadFollowupData } from './actions';
import { StackedBar, SingleBar, type BarSegment } from './ChartBars';
import {
  FALLBACK_SCORECARD,
  CALL_DEPTH_COLORS,
  CALL_DEPTH_LABELS,
  CALL_DEPTH_ORDER,
  RECENCY_COLORS,
  RECENCY_LABELS,
  usd,
  usdShort,
  windowLabel,
  asOfLabel,
  oneInN,
  narrative,
  listNames,
  boardReadouts,
  type OpenBoard,
  type ScorecardData,
} from '@/lib/followup-scorecard';

export const dynamic = 'force-dynamic';

type Search = Promise<{ saved?: string; error?: string }>;

const CALL_ORDER = CALL_DEPTH_ORDER;

/**
 * The active uploaded report, or the baked-in Aug 2026 snapshot if nothing has
 * been uploaded yet. The shape check guards against an older payload written by
 * a previous version of computeScorecard — better the known-good fallback than a
 * page of undefineds.
 */
async function loadScorecard(): Promise<{ data: ScorecardData; fromUpload: boolean }> {
  try {
    const supabase = await serverClient();
    const { data: row } = await supabase
      .from('followup_uploads')
      .select('payload')
      .eq('is_active', true)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const p = row?.payload as ScorecardData | undefined;
    if (p?.totals && p.meta && Array.isArray(p.revenue) && Array.isArray(p.openBoards)) {
      return { data: p, fromUpload: true };
    }
  } catch {
    // Table missing (migration not run yet) or unreadable — fall back rather
    // than 500 a report the whole team is about to open.
  }
  return { data: FALLBACK_SCORECARD, fromUpload: false };
}

// Open-board call buckets, fewest calls first, so every stacked bar on the page
// runs the same direction: problem end on the left.
const CALL_BUCKETS = [
  { key: 'never', label: 'No calls yet', color: null },
  { key: 'one', label: '1 call', color: CALL_DEPTH_COLORS.c1 },
  { key: 'two', label: '2 calls', color: CALL_DEPTH_COLORS.c2 },
  { key: 'threeFour', label: '3–4 calls', color: CALL_DEPTH_COLORS.c34 },
  { key: 'fivePlus', label: '5+ calls', color: CALL_DEPTH_COLORS.c5 },
] as const;

const RECENCY_BUCKETS = [
  { key: 'neverTouched', label: RECENCY_LABELS.neverTouched, color: null },
  { key: 'd31plus', label: RECENCY_LABELS.d31plus, color: RECENCY_COLORS.d31plus },
  { key: 'd30', label: RECENCY_LABELS.d30, color: RECENCY_COLORS.d30 },
  { key: 'd14', label: RECENCY_LABELS.d14, color: RECENCY_COLORS.d14 },
  { key: 'd7', label: RECENCY_LABELS.d7, color: RECENCY_COLORS.d7 },
] as const;

// A "nothing happened" fill for legend swatches, distinct from every step of
// the call ramp because it isn't a quantity — the record has no history at all.
// The bars themselves carry their own copy of this (see ChartBars).
const HATCH =
  'repeating-linear-gradient(135deg, #F5EDDB 0 6px, #7A6B55 6px 7px)';

// ---------------------------------------------------------------------------

function Tile({
  label,
  value,
  note,
  tone = 'plain',
}: {
  label: string;
  value: string;
  note: React.ReactNode;
  tone?: 'plain' | 'good' | 'alarm';
}) {
  const valueColor =
    tone === 'good' ? 'text-teal' : tone === 'alarm' ? 'text-orange' : 'text-ink';
  return (
    <div className="rounded-card border-2 border-ink bg-white p-4 shadow-sh-1">
      <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
        {label}
      </p>
      <p
        className={`mt-1 font-headline text-3xl font-black tabular-nums leading-none ${valueColor}`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs leading-snug text-fg-2">{note}</p>
    </div>
  );
}

function Legend({
  items,
  trailing,
}: {
  items: ReadonlyArray<{ label: string; color: string | null }>;
  trailing?: string;
}) {
  return (
    <ul className="mb-5 flex list-none flex-wrap items-center gap-x-4 gap-y-2 p-0">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2 text-xs font-bold text-fg-2">
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 flex-none rounded-1 border border-ink"
            style={i.color ? { background: i.color } : { background: HATCH }}
          />
          {i.label}
        </li>
      ))}
      {trailing && <li className="text-xs text-fg-3">{trailing}</li>}
    </ul>
  );
}

/** Row label: name plus one line of context. */
function RowLabel({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="min-w-0">
      <p className="font-headline text-sm font-black leading-tight text-ink">{name}</p>
      <p className="text-[11px] tabular-nums text-fg-3">{sub}</p>
    </div>
  );
}

function RowFigure({
  value,
  label,
  tone = 'plain',
}: {
  value: string;
  label: React.ReactNode;
  tone?: 'plain' | 'good' | 'alarm';
}) {
  const color =
    tone === 'good' ? 'text-teal' : tone === 'alarm' ? 'text-orange' : 'text-ink';
  return (
    <div className="flex items-center justify-end gap-2 tabular-nums">
      <span className={`font-headline text-lg font-black leading-none ${color}`}>
        {value}
      </span>
      <span className="font-headline text-[10px] font-extrabold uppercase leading-tight tracking-wider text-fg-3">
        {label}
      </span>
    </div>
  );
}

/** A computed badge on the board-by-board read-out. */
function Badge({ label, tone }: { label: string; tone: 'good' | 'watch' }) {
  const cls =
    tone === 'good'
      ? 'border-teal bg-teal/10 text-teal'
      : 'border-wood-warm bg-wood-warm/10 text-wood-warm';
  return (
    <span
      className={`inline-flex items-center rounded-full border-2 px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase leading-tight tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}

/** Numeric cell. `tone` flags the figures worth a second look. */
function Td({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'alarm' | 'good';
}) {
  const cls =
    tone === 'alarm'
      ? 'font-black text-orange'
      : tone === 'good'
        ? 'font-black text-teal'
        : '';
  return (
    <td className={`whitespace-nowrap border-b border-paper-edge px-2 py-2 text-right text-[13px] tabular-nums ${cls}`}>
      {children}
    </td>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="max-w-[76px] border-b-2 border-ink px-2 pb-2 align-bottom text-right font-headline text-[9.5px] font-extrabold uppercase leading-tight tracking-wide text-fg-3"
    >
      {children}
    </th>
  );
}

/** The dashed divider + note that sets Alex P's board apart. See OpenBoard.pinned. */
function PinnedNote() {
  return (
    <p className="mt-1 border-t-2 border-dashed border-paper-edge pt-4 font-headline text-[11px] font-extrabold uppercase tracking-wider text-teal">
      Newest board — read separately
    </p>
  );
}

function CallsRow({ b }: { b: OpenBoard }) {
  const segments: BarSegment[] = CALL_BUCKETS.flatMap((bucket) => {
    const value = b.calls[bucket.key];
    if (!value) return [];
    const share = value / b.open;
    return [
      {
        key: bucket.key,
        share,
        color: bucket.color,
        label: String(value),
        tip: {
          heading: b.name,
          value: `${value} of ${b.open} open records`,
          detail: `${bucket.label.toLowerCase()} · ${Math.round(share * 100)}% of the board`,
        },
      },
    ];
  });
  return (
    <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[100px_1fr_118px]">
      <RowLabel name={b.name} sub={`${b.open} open · avg ${b.avgCalls.toFixed(1)}`} />
      <StackedBar
        segments={segments}
        ariaLabel={`${b.name}: ${CALL_BUCKETS.filter((c) => b.calls[c.key] > 0).map((c) => `${b.calls[c.key]} with ${c.label.toLowerCase()}`).join(', ')}`}
      />
      <RowFigure
        value={`${b.underTwoPct}%`}
        label={<>under 2<br />calls</>}
        tone={b.underTwoPct >= 40 ? 'alarm' : 'plain'}
      />
    </div>
  );
}

function RecencyRow({ b }: { b: OpenBoard }) {
  const segments: BarSegment[] = RECENCY_BUCKETS.flatMap((bucket) => {
    const value = b.recency[bucket.key];
    if (!value) return [];
    const share = value / b.open;
    return [
      {
        key: bucket.key,
        share,
        color: bucket.color,
        label: String(value),
        tip: {
          heading: b.name,
          value: `${value} of ${b.open} open records`,
          detail: `${bucket.label.toLowerCase()} since the last call · ${Math.round(share * 100)}% of the board`,
        },
      },
    ];
  });
  return (
    <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[100px_1fr_118px]">
      <RowLabel
        name={b.name}
        sub={`${b.open} open · median ${b.medianDaysSinceCall}d`}
      />
      <StackedBar
        segments={segments}
        ariaLabel={`${b.name}: ${RECENCY_BUCKETS.filter((c) => b.recency[c.key] > 0).map((c) => `${b.recency[c.key]} at ${c.label.toLowerCase()}`).join(', ')}`}
      />
      <RowFigure
        value={String(b.cold30)}
        label={<>cold<br />30+ days</>}
        tone={b.cold30 >= 5 ? 'alarm' : b.cold30 === 0 ? 'good' : 'plain'}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

export default async function FollowupScorecardPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const user = await requireHubAccess('hub');
  // Embargoed for sales arborists until the release time. Bounce rather than
  // render an empty shell, so an early link doesn't leak the headline numbers.
  if (!canSeeFollowupScorecard(user.role)) redirect('/hub');

  const sp = await searchParams;
  const canUpload = canUploadFollowupData(user.role);
  const { data, fromUpload } = await loadScorecard();
  const T = data.totals;
  const N = narrative(data);
  const boards = data.openBoards;
  const revenue = data.revenue;
  const readouts = boardReadouts(data);

  const droppedMax = Math.max(
    ...boards.map((b) => b.droppedAfterOne / b.open),
    // Guard against an all-zero column making every bar full width.
    Number.EPSILON,
  );
  const soldMax = Math.max(...revenue.map((r) => r.sold), 1);
  const droppedRanked = [
    ...boards
      .filter((b) => !b.pinned)
      .sort((a, b) => b.droppedAfterOne / b.open - a.droppedAfterOne / a.open),
    ...boards.filter((b) => b.pinned),
  ];

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Follow-Through Scorecard
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        What Calling Back Is Worth
      </h1>
      <p className="mt-4 max-w-2xl text-fg-2">
        Every opportunity that needed a second look — what we earned by staying
        on it, and what&apos;s still sitting on the board waiting for a call.
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub/followup" />
      </div>

      {sp.saved && (
        <div className="mb-6 rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm font-bold text-green-dark">
          {decodeURIComponent(sp.saved)}
        </div>
      )}
      {sp.error && (
        <div className="mb-6 rounded-2 border-2 border-orange-press bg-orange/10 px-4 py-3 text-sm font-bold text-orange-press">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* Scope first. Every number below is narrower than "our sales", and a
          reader who misses that will quote these figures wrong. */}
      <section className="rounded-card border-2 border-l-[7px] border-ink border-l-fg-3 bg-bone p-4">
        <p className="text-[13px] leading-relaxed text-fg-2">
          <strong className="font-black text-ink">
            What&apos;s in here, so the numbers mean what they say.
          </strong>{' '}
          This covers opportunities whose next follow-up date landed between{' '}
          <strong className="font-black text-ink">{windowLabel(data.meta)}</strong>{' '}
          — it is not our whole book, and these totals are not season sales. It
          also leaves out{' '}
          <strong className="font-black text-ink">
            {T.excludedNoFollowup} records that closed with no follow-up ever
            logged
          </strong>
          : those sold at the appointment and have nothing to say about following
          up. Everything here is the{' '}
          <strong className="font-black text-ink">
            {T.followed} opportunities that actually got called back
          </strong>
          .
        </p>
        <p className="mt-2 text-[13px] text-fg-3">
          Data as of <strong className="text-fg-2">{asOfLabel(data.meta)}</strong>
          {data.meta.sourceFilename ? ` · ${data.meta.sourceFilename}` : ''}
          {!fromUpload && ' · starting snapshot, nothing uploaded yet'}
          {canUpload && (
            <>
              {' · '}
              <a href="#refresh" className="font-bold text-orange hover:underline">
                Upload a new export
              </a>
            </>
          )}
        </p>
      </section>

      <section className="mt-8">
        <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
          What following up earned
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            tone="good"
            label="Won by calling back"
            value={usd(T.sold)}
            note={
              <>
                <strong className="font-black text-ink">{T.won}</strong> jobs that
                came in only because somebody followed up.
              </>
            }
          />
          <Tile
            tone="good"
            label="Records that convert"
            value={oneInN(T.winRate)}
            note={
              <>
                <strong className="font-black text-ink">{T.winRate}%</strong> of
                everything we call back turns into work.
              </>
            }
          />
          <Tile
            tone="good"
            label="Won after 3+ calls"
            value={usd(T.sold3Plus)}
            note={
              <>
                <strong className="font-black text-ink">{T.won3Plus}</strong> jobs
                nobody would have if we&apos;d stopped at two.
              </>
            }
          />
          <Tile
            tone="alarm"
            label="Still on the table"
            value={usd(T.onTheTable)}
            note={
              <>
                <strong className="font-black text-ink">
                  {T.droppedAfterOne}
                </strong>{' '}
                open records dropped after a single call.
              </>
            }
          />
        </div>
      </section>

      <section className="mt-8 rounded-card border-2 border-l-[7px] border-ink border-l-teal bg-bone p-5">
        <p className="font-headline text-base font-black text-ink">
          {oneInN(T.winRate)} opportunities we call back turns into a paying job —
          and that holds however many calls it takes.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fg-2">
          {T.won} wins out of {T.followed} records that got a follow-up, worth{' '}
          <strong className="font-black text-ink">{usd(T.sold)}</strong>. It
          doesn&apos;t taper off either: records on their first call convert at{' '}
          <strong className="font-black text-ink">{N.firstCallWinRate}%</strong>,
          records on their fifth still convert at{' '}
          <strong className="font-black text-ink">{N.deepCallWinRate}%</strong>.
          What does change is the write-off rate —{' '}
          <strong className="font-black text-ink">{N.firstCallDropRate}%</strong>{' '}
          of one-call records end up Unreachable against{' '}
          <strong className="font-black text-ink">{N.deepCallDropRate}%</strong>{' '}
          of the ones we stay on. The average follow-up win is{' '}
          <strong className="font-black text-ink">{usd(T.avgWin)}</strong>, so a
          record somebody gives up on early is about{' '}
          <strong className="font-black text-ink">{usd(N.valuePerRecord)}</strong>{' '}
          of expected work walking out the door.
        </p>
      </section>

      {/* ---------- 1. the open board ---------- */}
      <section className="mt-8 rounded-card border-2 border-ink bg-white p-6 shadow-sh-1">
        <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
          Chart 1 — the open board
        </p>
        <h2 className="mt-1 font-headline text-2xl font-black uppercase text-bark-deep">
          How many calls the still-open records have had
        </h2>
        <p className="mb-5 mt-2 max-w-3xl text-sm text-fg-2">
          Our live pipeline —{' '}
          <strong className="font-black text-ink">{T.openBoard} records</strong>{' '}
          not yet won or closed out. Each bar is one board split by calls so far,
          running left to right from fewest to most.{' '}
          <strong className="font-black text-ink">
            The left end is where the money is
          </strong>
          : a record on its first call converts at {N.firstCallWinRate}%, so those
          aren&apos;t lost causes, they&apos;re work nobody has gotten back to yet.
        </p>

        <Legend
          items={CALL_BUCKETS.map((b) => ({ label: b.label, color: b.color }))}
          trailing="← fewer · more →"
        />

        <div className="flex flex-col gap-3.5">
          {boards.map((b) => (
            <div key={b.name}>
              {b.pinned && <PinnedNote />}
              <div className={b.pinned ? 'mt-3.5' : ''}>
                <CallsRow b={b} />
              </div>
            </div>
          ))}
        </div>

        <p className="mt-5 border-t-2 border-paper-edge pt-3 text-xs text-fg-3">
          Bars are scaled to each board (100% width each) so the mix compares
          across different volumes.{' '}
          {N.noOpenBoard.length > 0 && (
            <>
              <strong className="text-fg-2">
                {listNames(N.noOpenBoard)}{' '}
                {N.noOpenBoard.length === 1 ? 'is' : 'are'} not here
                because they have no open records at all
              </strong>{' '}
              — their work closes or gets cleared out, nothing sits.{' '}
            </>
          )}
          Shared and multi-name records are left out.
        </p>
      </section>

      {/* ---------- 2. money still on the table ---------- */}
      <section className="mt-8 rounded-card border-2 border-ink bg-white p-6 shadow-sh-1">
        <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
          Chart 2 — money still on the table
        </p>
        <h2 className="mt-1 font-headline text-2xl font-black uppercase text-bark-deep">
          Records dropped after a single call
        </h2>
        <p className="mb-5 mt-2 max-w-3xl text-sm text-fg-2">
          Unreachable is something we choose by hand — the system never sets it.{' '}
          <strong className="font-black text-ink">
            {T.droppedAfterOne} open records
          </strong>{' '}
          carry exactly one call before somebody marked them unreachable, holding{' '}
          <strong className="font-black text-ink">{usd(T.onTheTable)}</strong> in
          estimate value. A second call converts at{' '}
          <strong className="font-black text-ink">{N.secondCallWinRate}%</strong>{' '}
          and a third at{' '}
          <strong className="font-black text-ink">{N.thirdCallWinRate}%</strong>,
          against {N.firstCallWinRate}% on the first — so there&apos;s no drop-off
          that justifies stopping. This is the most winnable money on the page.
        </p>

        <div className="flex flex-col gap-3.5">
          {droppedRanked.map((b) => {
            const pct = (b.droppedAfterOne / b.open) * 100;
            return (
              <div key={b.name}>
                {b.pinned && <PinnedNote />}
                <div
                  className={`grid grid-cols-1 items-center gap-3 sm:grid-cols-[100px_1fr_184px] ${b.pinned ? 'mt-3.5' : ''}`}
                >
                  <RowLabel
                    name={b.name}
                    sub={`${b.droppedAfterOne} of ${b.open} open`}
                  />
                  <SingleBar
                    empty={pct === 0}
                    width={(pct / droppedMax / 100) * 100}
                    ariaLabel={`${b.name}: ${Math.round(pct)}% of the open board dropped after one call or fewer`}
                    tip={
                      pct > 0
                        ? {
                            heading: b.name,
                            value: `${b.droppedAfterOne} of ${b.open} open records dropped after one call`,
                            detail: `${usd(b.onTheTable)} in estimate value · ${Math.round(pct)}% of the board`,
                          }
                        : {
                            heading: b.name,
                            value: 'Nothing dropped after one call',
                            detail: 'Every record on this board got a real chance.',
                          }
                    }
                  />
                  <RowFigure
                    value={`${Math.round(pct)}%`}
                    label={b.onTheTable ? `${usdShort(b.onTheTable)} on the table` : '—'}
                    tone={pct >= 30 ? 'alarm' : pct === 0 ? 'good' : 'plain'}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-8 rounded-card border-2 border-l-[7px] border-ink border-l-teal bg-bone p-5">
        <p className="font-headline text-base font-black text-ink">
          Those {T.droppedAfterOne} records are worth roughly{' '}
          {usd(T.recoverableEstimate)} of realistic work.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fg-2">
          {T.droppedAfterOne} records × our own{' '}
          <strong className="font-black text-ink">{T.winRate}%</strong> follow-up
          win rate × our{' '}
          <strong className="font-black text-ink">{usd(T.avgWin)}</strong> average
          follow-up job. It&apos;s an estimate, not a promise — but it&apos;s a
          couple of afternoons on the phone, not a marketing budget, and every one
          of those customers already asked us for a price.
        </p>
      </section>

      {/* ---------- 3. what calling back earned each of us ---------- */}
      <section className="mt-8 rounded-card border-2 border-ink bg-white p-6 shadow-sh-1">
        <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
          Chart 3 — the payoff, per person
        </p>
        <h2 className="mt-1 font-headline text-2xl font-black uppercase text-bark-deep">
          What calling back earned each of us
        </h2>
        <p className="mb-5 mt-2 max-w-3xl text-sm text-fg-2">
          Only jobs that needed a follow-up to close — first-visit sales are not
          in here. Each bar is split by{' '}
          <strong className="font-black text-ink">how many calls it took</strong>,
          running left to right from call one to call five-plus.{' '}
          <strong className="font-black text-ink">
            The further right a bar keeps going, the more of that money came from
            staying on it.
          </strong>
        </p>

        <Legend
          items={CALL_ORDER.map((d) => ({
            label: CALL_DEPTH_LABELS[d],
            color: CALL_DEPTH_COLORS[d],
          }))}
        />

        <div className="flex flex-col gap-3.5">
          {revenue.map((r) => {
            const segments: BarSegment[] = CALL_ORDER.flatMap((d) => {
              const value = r.byDepth[d];
              if (!value) return [];
              const jobs = r.jobsByDepth[d];
              return [
                {
                  key: d,
                  share: value / r.sold,
                  color: CALL_DEPTH_COLORS[d],
                  label: usdShort(value),
                  tip: {
                    heading: `${r.name} — ${CALL_DEPTH_LABELS[d].toLowerCase()}`,
                    value: `${usd(value)} across ${jobs} job${jobs === 1 ? '' : 's'}`,
                    detail: `${Math.round((value / r.sold) * 100)}% of what calling back earned ${r.name}`,
                  },
                },
              ];
            });
            return (
              <div
                key={r.name}
                className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[100px_1fr_112px]"
              >
                <RowLabel
                  name={r.name}
                  sub={`${r.won} of ${r.followed} · ${r.winRate}%`}
                />
                <StackedBar
                  segments={segments}
                  scale={(r.sold / soldMax) * 100}
                  ariaLabel={`${r.name}: ${usd(r.sold)} won by calling back across ${r.won} jobs, ${usd(r.deep)} of it on call three or later`}
                />
                <RowFigure
                  value={usdShort(r.sold)}
                  label={<>won<br />back</>}
                  tone="good"
                />
              </div>
            );
          })}
        </div>

        <p className="mt-5 border-t-2 border-paper-edge pt-3 text-xs text-fg-3">
          Bars are to scale in dollars across everyone.{' '}
          <strong className="text-fg-2">
            {usd(T.sold3Plus)} of this money came from calls three and beyond
          </strong>{' '}
          — the calls that are easiest to skip.
          {N.chaserName && N.chaserCalls > 2 && (
            <>
              {' '}
              {N.chaserName}&apos;s longest chase ran to{' '}
              <strong className="text-fg-2">{N.chaserCalls} calls</strong> before
              it closed.
            </>
          )}{' '}
          Win rate is wins as a share of the records that person followed up, so
          it reflects the mix of work each of us gets, not just how we sell.
        </p>
      </section>

      {/* ---------- 4. the Monday call list ---------- */}
      <section className="mt-8 rounded-card border-2 border-ink bg-white p-6 shadow-sh-1">
        <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
          Chart 4 — the Monday call list
        </p>
        <h2 className="mt-1 font-headline text-2xl font-black uppercase text-bark-deep">
          When was each open record actually last touched?
        </h2>
        <p className="mb-5 mt-2 max-w-3xl text-sm text-fg-2">
          The practical one. Same boards, split by days since the last real
          contact — coldest on the left, freshest on the right, so{' '}
          <strong className="font-black text-ink">
            the left end is who to call first
          </strong>
          .
        </p>

        <Legend
          items={RECENCY_BUCKETS.map((b) => ({ label: b.label, color: b.color }))}
          trailing="← colder · fresher →"
        />

        <div className="flex flex-col gap-3.5">
          {boards.map((b) => (
            <div key={b.name}>
              {b.pinned && <PinnedNote />}
              <div className={b.pinned ? 'mt-3.5' : ''}>
                <RecencyRow b={b} />
              </div>
            </div>
          ))}
        </div>

        <p className="mb-4 mt-7 max-w-3xl text-sm text-fg-2">
          <strong className="font-black text-ink">
            And about the follow-up date field itself:
          </strong>{' '}
          it can&apos;t be used as this call list, because every open record is
          already past due.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            tone="alarm"
            label="Open records past due"
            value={String(T.openBoard)}
            note={
              <>
                All of them.{' '}
                <strong className="font-black text-ink">Not one</strong> open
                record has a future follow-up date.
              </>
            }
          />
          <Tile
            label="Median days past due"
            value={String(T.medianDaysPastDue)}
            note={
              <>
                The freshest is{' '}
                <strong className="font-black text-ink">
                  {T.minDaysPastDue} days
                </strong>{' '}
                late; the furthest back is {T.maxDaysPastDue}.
              </>
            }
          />
          <Tile
            tone="good"
            label="Called after the due date"
            value={String(T.calledAfterDue)}
            note={
              <>
                The call happened, the date never moved. Most of us are working
                the list.
              </>
            }
          />
          <Tile
            tone="alarm"
            label="No contact in 30+ days"
            value={String(T.cold30)}
            note={
              <>
                Genuinely cold.{' '}
                <strong className="font-black text-ink">
                  {usd(T.cold30Value)}
                </strong>{' '}
                in estimate value.
              </>
            }
          />
        </div>
      </section>

      {/* ---------- the asks ---------- */}
      <section className="mt-8 rounded-card border-2 border-l-[7px] border-ink border-l-orange bg-bone p-5">
        <p className="font-headline text-base font-black text-ink">
          Two things that would make all of this easier.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-fg-2">
          <strong className="font-black text-ink">
            1. Give every record a second call before Unreachable.
          </strong>{' '}
          One call is where {T.droppedAfterOne} of our open records stopped. Call
          two converts at{' '}
          <strong className="font-black text-ink">{N.secondCallWinRate}%</strong>{' '}
          and call three at{' '}
          <strong className="font-black text-ink">{N.thirdCallWinRate}%</strong>,
          against {N.firstCallWinRate}% on call one — there&apos;s no drop-off to
          justify stopping. It&apos;s the cheapest revenue on this page.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-fg-2">
          <strong className="font-black text-ink">
            2. Move the follow-up date when you log the call.
          </strong>{' '}
          Every open record is past due and none has a future date, yet{' '}
          {T.calledAfterDue} of them were called after that date passed — the
          calls are happening, the field just isn&apos;t keeping up. That means it
          can&apos;t tell any of us who needs a call today, so cold records only
          surface in a report like this one. If the date moves when the call
          happens, the list works by itself.
        </p>
      </section>

      {/* ---------- board by board ---------- */}
      <section className="mt-8 rounded-card border-2 border-ink bg-white p-6 shadow-sh-1">
        <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
          Board by board
        </p>
        <h2 className="mt-1 font-headline text-2xl font-black uppercase text-bark-deep">
          Where each of us stands
        </h2>
        <p className="mb-2 mt-2 max-w-3xl text-sm text-fg-2">
          Everyone who called a record back this window, biggest follow-up
          earnings first. The badges are whoever leads the board on that measure
          in this upload.
        </p>

        <ul className="m-0 flex list-none flex-col gap-0 p-0">
          {readouts.map((r) => (
            <li
              key={r.name}
              className="flex flex-col gap-3 border-b border-paper-edge py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:gap-4"
            >
              <div className="flex flex-none flex-row flex-wrap items-center gap-2 sm:w-[172px] sm:flex-col sm:items-start">
                <p className="font-headline text-base font-black leading-tight text-ink">
                  {r.name}
                </p>
                {r.badges.map((bd) => (
                  <Badge key={bd.label} label={bd.label} tone={bd.tone} />
                ))}
              </div>
              <div className="min-w-0 text-sm leading-relaxed text-fg-2">
                {r.sentences.map((sentence, i) => (
                  <p key={i} className={i > 0 ? 'mt-1.5' : undefined}>
                    {sentence}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-5 border-t-2 border-paper-edge pt-3 text-xs text-fg-3">
          Written from the figures in this upload rather than by hand, so it
          can&apos;t describe last week while the charts describe this one.
        </p>
      </section>

      {/* ---------- full scorecard ---------- */}
      <section className="mt-8 rounded-card border-2 border-ink bg-white p-6 shadow-sh-1">
        <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
          All figures
        </p>
        <h2 className="mt-1 font-headline text-2xl font-black uppercase text-bark-deep">
          Full scorecard
        </h2>
        <p className="mb-5 mt-2 max-w-3xl text-sm text-fg-2">
          Every number on this page in one table, counting only records that got
          a follow-up. The open-board columns are blank for anyone carrying no
          open records.
        </p>

        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[760px] border-collapse tabular-nums">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 border-b-2 border-ink bg-white px-2 pb-2 text-left align-bottom font-headline text-[9.5px] font-extrabold uppercase leading-tight tracking-wide text-fg-3"
                >
                  Arborist
                </th>
                <Th>Records called back</Th>
                <Th>Won</Th>
                <Th>Win rate</Th>
                <Th>$ won by calling back</Th>
                <Th>Won on call 3+</Th>
                <Th>Most calls to a win</Th>
                <Th>Open now</Th>
                <Th>Dropped after 1 call</Th>
                <Th>$ on the table</Th>
                <Th>Cold 30+ days</Th>
              </tr>
            </thead>
            <tbody>
              {revenue.map((r) => {
                const b = boards.find((x) => x.name === r.name);
                return (
                  <tr key={r.name} className="hover:bg-bone">
                    <td className="sticky left-0 whitespace-nowrap border-b border-paper-edge bg-white px-2 py-2 text-left font-headline text-[13px] font-black text-ink">
                      {r.name}
                    </td>
                    <Td>{r.followed}</Td>
                    <Td>{r.won}</Td>
                    <Td tone={r.winRate >= 40 ? 'good' : undefined}>{r.winRate}%</Td>
                    <Td>{usd(r.sold)}</Td>
                    <Td>
                      {r.deepJobs} · {usd(r.deep)}
                    </Td>
                    <Td>{r.maxCalls}</Td>
                    <Td>{b ? b.open : '—'}</Td>
                    <Td tone={b && b.droppedAfterOne >= 20 ? 'alarm' : undefined}>
                      {b ? b.droppedAfterOne : '—'}
                    </Td>
                    <Td>{b && b.onTheTable ? usd(b.onTheTable) : '—'}</Td>
                    <Td tone={b && b.cold30 >= 5 ? 'alarm' : undefined}>
                      {b ? b.cold30 : '—'}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-bone font-black">
                <td className="sticky left-0 whitespace-nowrap border-t-2 border-ink bg-bone px-2 py-2 text-left font-headline text-[13px] font-black text-ink">
                  Everyone
                </td>
                <td className="whitespace-nowrap border-t-2 border-ink px-2 py-2 text-right text-[13px] tabular-nums">
                  {T.followed}
                </td>
                <td className="whitespace-nowrap border-t-2 border-ink px-2 py-2 text-right text-[13px] tabular-nums">
                  {T.won}
                </td>
                <td className="whitespace-nowrap border-t-2 border-ink px-2 py-2 text-right text-[13px] tabular-nums">
                  {T.winRate}%
                </td>
                <td className="whitespace-nowrap border-t-2 border-ink px-2 py-2 text-right text-[13px] tabular-nums">
                  {usd(T.sold)}
                </td>
                <td className="whitespace-nowrap border-t-2 border-ink px-2 py-2 text-right text-[13px] tabular-nums">
                  {T.won3Plus} · {usd(T.sold3Plus)}
                </td>
                <td className="whitespace-nowrap border-t-2 border-ink px-2 py-2 text-right text-[13px] tabular-nums">
                  {T.maxCalls}
                </td>
                <td className="whitespace-nowrap border-t-2 border-ink px-2 py-2 text-right text-[13px] tabular-nums">
                  {T.openBoard}
                </td>
                <td className="whitespace-nowrap border-t-2 border-ink px-2 py-2 text-right text-[13px] tabular-nums">
                  {T.droppedAfterOne}
                </td>
                <td className="whitespace-nowrap border-t-2 border-ink px-2 py-2 text-right text-[13px] tabular-nums">
                  {usd(T.onTheTable)}
                </td>
                <td className="whitespace-nowrap border-t-2 border-ink px-2 py-2 text-right text-[13px] tabular-nums">
                  {T.cold30}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-4 text-xs text-fg-3">
          Totals count every record in the upload, including any shared or
          multi-name ones that are left out of the per-person rows above — so the
          columns won&apos;t always add up to the footer.
        </p>
      </section>

      {/* Refresh — only for the people who run the sales meeting. An upload
          REPLACES the whole report for everyone, so it is not a hub-wide tool. */}
      {canUpload && (
        <section
          id="refresh"
          className="mt-8 scroll-mt-6 rounded-card border-2 border-dashed border-wood-light bg-bone p-6"
        >
          <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Manager tools
          </p>
          <h2 className="mt-1 font-headline text-2xl font-black uppercase text-bark-deep">
            Refresh this report
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-fg-2">
            Upload the{' '}
            <strong className="font-black text-ink">Open Opportunities</strong>{' '}
            export (.xlsx) straight from the service software &mdash; no
            reformatting. Filter it by <strong>Next Follow Up Date</strong> to the
            window you want to talk about, and include the{' '}
            <em>Won</em> and <em>Dismissed</em> statuses so the wins are in there.
          </p>
          <p className="mt-2 max-w-3xl text-sm text-fg-2">
            <strong className="font-black text-ink">
              A new upload replaces this report completely
            </strong>{' '}
            &mdash; every chart, figure and sentence above is recalculated from the
            file, and the previous week&apos;s numbers stop being shown. Nothing is
            merged or added up across uploads.
          </p>

          <form
            action={uploadFollowupData}
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <input
              type="file"
              name="file"
              accept=".xlsx,.xlsm,.csv"
              required
              aria-label="Open Opportunities export"
              className="block w-full text-sm text-fg-2 file:mr-4 file:rounded-2 file:border-0 file:bg-bark-deep file:px-4 file:py-2 file:font-headline file:text-xs file:font-extrabold file:uppercase file:tracking-ribbon file:text-white hover:file:bg-bark"
            />
            <button
              type="submit"
              className="bt-btn bt-btn-primary justify-center sm:w-auto"
            >
              Replace report
            </button>
          </form>

          <p className="mt-4 border-t-2 border-paper-edge pt-3 text-xs text-fg-3">
            The file needs these columns:{' '}
            <strong className="text-fg-2">
              Technician, Opportunity Status, Follow-Ups, Next Follow Up Date
            </strong>
            . It also reads Last Follow Up Date, Highest Estimate Value and Total
            Amount of Estimate(s) Sold when they&apos;re present. Anything else in
            the export is ignored, and if a required column is missing the upload
            is refused rather than showing you zeroes.
          </p>
        </section>
      )}

      <p className="mt-8 text-center text-xs leading-relaxed text-fg-3">
        Source: <strong className="text-fg-2">Open Opportunities</strong> export,
        read {asOfLabel(data.meta)}, filtered to opportunities with a next
        follow-up date between{' '}
        <strong className="text-fg-2">{windowLabel(data.meta)}</strong> — of which
        the {T.followed} with at least one logged follow-up are shown here.
        &ldquo;Calls&rdquo; is the Follow-Ups count; won value is Total Amount of
        Estimate(s) Sold; &ldquo;on the table&rdquo; is Highest Estimate Value on
        open records that are Unreachable with one call or fewer. Names follow the
        First Name + Last Initial convention.
      </p>
    </main>
  );
}
