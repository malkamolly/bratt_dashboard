// ============================================================================
// PHC renewals assigned to one sales arborist
// ============================================================================
// Rendered at the bottom of an arborist's detail page. Lists the properties
// currently assigned to them for confirmation and offers a one-click "copy all"
// so they (or the CSR) can paste the whole list into a message. Renders nothing
// if there's no active batch or nothing assigned to this person.
// ============================================================================

import { loadActiveView } from '@/lib/phc-data';
import { buildHandoffText } from '@/lib/phc-renewals';
import { CopyButton } from '@/components/CopyButton';

export async function PhcAssignedRenewals({
  salespersonId,
  salespersonName,
}: {
  salespersonId: string;
  salespersonName: string;
}) {
  const view = await loadActiveView();
  if (view.batch === null) return null;

  const mine = view.properties.filter((p) => p.assignedSalespersonId === salespersonId);
  if (mine.length === 0) return null;

  const allText = mine.map(buildHandoffText).join('\n\n————————————\n\n');

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="bt-eyebrow">Plant Health Care</p>
          <h2 className="mt-1 font-headline text-2xl font-black uppercase text-bark-deep">
            Renewals to confirm ({mine.length})
          </h2>
          <p className="mt-1 text-sm text-fg-2">
            PHC renewals assigned to {salespersonName}. Copy the whole list into
            a message, or grab one at a time.
          </p>
        </div>
        <CopyButton text={allText} label={`Copy all ${mine.length}`} />
      </div>

      <ul className="mt-4 space-y-2">
        {mine.map((p) => (
          <li key={p.locationId} className="bt-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-headline text-sm font-bold text-ink">{p.customer}</p>
                <p className="text-xs text-fg-3">{p.address}</p>
                {(p.locationPhone || p.customerPhone) && (
                  <p className="mt-1 text-xs font-bold text-bark-deep">
                    ☎{' '}
                    {p.locationPhone && <>{p.locationPhone}</>}
                    {p.locationPhone &&
                      p.customerPhone &&
                      p.customerPhone !== p.locationPhone && (
                        <span className="font-normal text-fg-3">
                          {' '}
                          · cust {p.customerPhone}
                        </span>
                      )}
                    {!p.locationPhone && p.customerPhone && <>{p.customerPhone}</>}
                  </p>
                )}
              </div>
              <CopyButton text={buildHandoffText(p)} label="Copy" />
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-fg-2">
              {p.services.map((s) => (
                <li key={s.id}>
                  &bull; {s.treatment_name}{' '}
                  <span className="text-fg-3">({s.windowLabel})</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
