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
// Numbers are a point-in-time snapshot from src/lib/followup-scorecard.ts — read
// the header comment there before quoting any figure, because the population is
// narrower than "all our sales".
// ============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireHubAccess, canSeeFollowupScorecard } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import {
  FOLLOWUP_TOTALS as T,
  FOLLOWUP_REVENUE,
  FOLLOWUP_OPEN_BOARDS,
  CALL_DEPTH_COLORS,
  CALL_DEPTH_LABELS,
  RECENCY_COLORS,
  RECENCY_LABELS,
  usd,
  usdShort,
  type CallDepth,
  type OpenBoard,
} from '@/lib/followup-scorecard';

export const dynamic = 'force-dynamic';

const CALL_ORDER: CallDepth[] = ['c1', 'c2', 'c34', 'c5'];

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

// A "nothing happened" fill, distinct from every step of the call ramp because
// it isn't a quantity — the record has no history at all.
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

/**
 * A stacked bar of counts. `scale` shrinks the whole bar (used by the revenue
 * chart so bars compare in dollars); count charts leave it at 100 so each board
 * fills the track and the MIX is what compares.
 */
function StackedBar({
  segments,
  scale = 100,
  ariaLabel,
}: {
  segments: ReadonlyArray<{
    key: string;
    value: number;
    share: number;
    color: string | null;
    label: string;
    title: string;
  }>;
  scale?: number;
  ariaLabel: string;
}) {
  return (
    <div className="flex h-8 min-w-0 gap-[2px]" role="img" aria-label={ariaLabel}>
      {segments.map((s) => (
        <div
          key={s.key}
          title={s.title}
          className="relative flex items-center justify-center overflow-hidden border border-ink first:rounded-l-1 last:rounded-r-1"
          style={{
            flex: `0 0 ${s.share * scale}%`,
            background: s.color ?? HATCH,
          }}
        >
          {/* Only label a segment wide enough to hold the text; the rest carry a
              native tooltip so no figure is unreachable. */}
          {s.share * scale >= 9 && (
            <span
              className="whitespace-nowrap px-1 font-headline text-[11px] font-black tabular-nums"
              style={
                s.color
                  ? { color: s.color === CALL_DEPTH_COLORS.c1 ? '#1A0E05' : '#FFF8EC' }
                  : { color: '#4A3826', background: '#F5EDDB', borderRadius: 3 }
              }
            >
              {s.label}
            </span>
          )}
        </div>
      ))}
    </div>
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
  const segments = CALL_BUCKETS.flatMap((bucket) => {
    const value = b.calls[bucket.key];
    if (!value) return [];
    return [
      {
        key: bucket.key,
        value,
        share: value / b.open,
        color: bucket.color,
        label: String(value),
        title: `${b.name}: ${value} of ${b.open} open records — ${bucket.label.toLowerCase()}`,
      },
    ];
  });
  return (
    <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[100px_1fr_118px]">
      <RowLabel name={b.name} sub={`${b.open} open · avg ${b.avgCalls.toFixed(1)}`} />
      <StackedBar
        segments={segments}
        ariaLabel={`${b.name}: ${segments.map((s) => `${s.value} with ${CALL_BUCKETS.find((c) => c.key === s.key)?.label.toLowerCase()}`).join(', ')}`}
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
  const segments = RECENCY_BUCKETS.flatMap((bucket) => {
    const value = b.recency[bucket.key];
    if (!value) return [];
    return [
      {
        key: bucket.key,
        value,
        share: value / b.open,
        color: bucket.color,
        label: String(value),
        title: `${b.name}: ${value} of ${b.open} open records — ${bucket.label.toLowerCase()}`,
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
        ariaLabel={`${b.name}: ${segments.map((s) => `${s.value} at ${RECENCY_BUCKETS.find((c) => c.key === s.key)?.label.toLowerCase()}`).join(', ')}`}
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

export default async function FollowupScorecardPage() {
  const user = await requireHubAccess('hub');
  // Embargoed for sales arborists until the release time. Bounce rather than
  // render an empty shell, so an early link doesn't leak the headline numbers.
  if (!canSeeFollowupScorecard(user.role)) redirect('/hub');

  const droppedMax = Math.max(
    ...FOLLOWUP_OPEN_BOARDS.map((b) => b.droppedAfterOne / b.open),
  );
  const soldMax = Math.max(...FOLLOWUP_REVENUE.map((r) => r.sold));
  const droppedRanked = [
    ...FOLLOWUP_OPEN_BOARDS.filter((b) => !b.pinned).sort(
      (a, b) => b.droppedAfterOne / b.open - a.droppedAfterOne / a.open,
    ),
    ...FOLLOWUP_OPEN_BOARDS.filter((b) => b.pinned),
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

      {/* Scope first. Every number below is narrower than "our sales", and a
          reader who misses that will quote these figures wrong. */}
      <section className="rounded-card border-2 border-l-[7px] border-ink border-l-fg-3 bg-bone p-4">
        <p className="text-[13px] leading-relaxed text-fg-2">
          <strong className="font-black text-ink">
            What&apos;s in here, so the numbers mean what they say.
          </strong>{' '}
          This covers opportunities whose next follow-up date landed between{' '}
          <strong className="font-black text-ink">{T.windowLabel}</strong> — it is
          not our whole book, and these totals are not season sales. It also
          leaves out{' '}
          <strong className="font-black text-ink">
            {T.excluded} records that closed with no follow-up ever logged
          </strong>
          : those sold at the appointment and have nothing to say about following
          up. Everything here is the{' '}
          <strong className="font-black text-ink">
            {T.followed} opportunities that actually got called back
          </strong>
          . Report run {T.runLabel}.
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
            value="1 in 3"
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
          One in three opportunities we call back turns into a paying job — and
          that holds however many calls it takes.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fg-2">
          {T.won} wins out of {T.followed} records that got a follow-up, worth{' '}
          <strong className="font-black text-ink">{usd(T.sold)}</strong>. It
          doesn&apos;t taper off either: records on their first call convert at{' '}
          <strong className="font-black text-ink">37%</strong>, records on their
          fifth still convert at{' '}
          <strong className="font-black text-ink">32%</strong>. What does change
          is the write-off rate —{' '}
          <strong className="font-black text-ink">32%</strong> of one-call records
          end up Unreachable against{' '}
          <strong className="font-black text-ink">18%</strong> of the ones we stay
          on. The average follow-up win is{' '}
          <strong className="font-black text-ink">{usd(T.avgWin)}</strong>, so a
          record somebody gives up on early is about a thousand dollars of
          expected work walking out the door.
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
          : a record on its first call converts at 37%, so those aren&apos;t lost
          causes, they&apos;re work nobody has gotten back to yet.
        </p>

        <Legend
          items={CALL_BUCKETS.map((b) => ({ label: b.label, color: b.color }))}
          trailing="← fewer · more →"
        />

        <div className="flex flex-col gap-3.5">
          {FOLLOWUP_OPEN_BOARDS.map((b) => (
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
          <strong className="text-fg-2">
            Clayton T, Hayden R and Jake T aren&apos;t here because they have no
            open records at all
          </strong>{' '}
          — their work closes or gets cleared out, nothing sits. Shared and
          multi-name records are also left out.
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
          <strong className="font-black text-ink">35%</strong> and a third at{' '}
          <strong className="font-black text-ink">29%</strong>, against 37% on the
          first — so there&apos;s no drop-off that justifies stopping. This is the
          most winnable money on the page.
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
                  <div
                    className="flex h-8 min-w-0"
                    role="img"
                    aria-label={`${b.name}: ${Math.round(pct)}% of the open board dropped after one call or fewer`}
                  >
                    {pct > 0 ? (
                      <div
                        title={`${b.name}: ${b.droppedAfterOne} records marked Unreachable after one call or fewer — ${usd(b.onTheTable)} in estimate value`}
                        className="rounded-1 border border-ink bg-orange"
                        style={{ width: `${(pct / droppedMax / 100) * 100}%` }}
                      />
                    ) : (
                      <div
                        title={`${b.name}: nothing on this board was dropped after one call.`}
                        className="flex w-[72px] items-center justify-center rounded-1 border border-ink"
                        style={{ background: HATCH }}
                      >
                        <span
                          className="px-1 font-headline text-[11px] font-black"
                          style={{ color: '#4A3826', background: '#F5EDDB', borderRadius: 3 }}
                        >
                          none
                        </span>
                      </div>
                    )}
                  </div>
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
          {FOLLOWUP_REVENUE.map((r) => {
            const segments = CALL_ORDER.flatMap((d) => {
              const value = r.byDepth[d];
              if (!value) return [];
              const jobs = r.jobsByDepth[d];
              return [
                {
                  key: d,
                  value,
                  share: value / r.sold,
                  color: CALL_DEPTH_COLORS[d],
                  label: usdShort(value),
                  title: `${r.name} — ${CALL_DEPTH_LABELS[d].toLowerCase()}: ${usd(value)} across ${jobs} job${jobs === 1 ? '' : 's'}`,
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
          — the calls that are easiest to skip. Hayden R&apos;s longest chase ran
          to <strong className="text-fg-2">{T.maxCalls} calls</strong> before it
          closed. Win rate is wins as a share of the records that person followed
          up, so it reflects the mix of work each of us gets, not just how we
          sell.
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
          {FOLLOWUP_OPEN_BOARDS.map((b) => (
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
          two converts at <strong className="font-black text-ink">35%</strong> and
          call three at <strong className="font-black text-ink">29%</strong>,
          against 37% on call one — there&apos;s no drop-off to justify stopping.
          It&apos;s the cheapest revenue on this page.
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

      <p className="mt-8 text-center text-xs leading-relaxed text-fg-3">
        Source: <strong className="text-fg-2">Open Opportunities</strong> export,
        run {T.runLabel}, filtered to opportunities with a next follow-up date
        between <strong className="text-fg-2">{T.windowLabel}</strong> — of which
        the {T.followed} with at least one logged follow-up are shown here.
        &ldquo;Calls&rdquo; is the Follow-Ups count; won value is Total Amount of
        Estimate(s) Sold; &ldquo;on the table&rdquo; is Highest Estimate Value on
        open records that are Unreachable with one call or fewer. Names follow the
        First Name + Last Initial convention.
      </p>
    </main>
  );
}
