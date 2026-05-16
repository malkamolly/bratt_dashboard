// ============================================================================
// Shared admin UI bits
// ============================================================================
// Card wrapper + flash banner used by all /admin sub-pages. Stays a server
// component (no client interactivity needed).
// ============================================================================

export function SectionCard({
  eyebrow,
  title,
  description,
  headerRight,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bt-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="bt-eyebrow">{eyebrow}</p>
          <h2 className="mt-2 font-headline text-2xl font-black uppercase text-bark-deep">
            {title}
          </h2>
          {description && <p className="mt-2 text-sm text-fg-2">{description}</p>}
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

const FLASH_LABELS: Record<string, string> = {
  annual: 'Annual goal saved.',
  goals: 'Monthly goals saved.',
  historicals: 'Historical totals saved.',
  salesperson_added: 'Salesperson added.',
  salesperson_updated: 'Salesperson updated.',
  crew_member_added: 'Crew member added.',
  crew_member_updated: 'Crew member updated.',
};

export function FlashBanner({
  saved,
  error,
}: {
  saved?: string;
  error?: string;
}) {
  if (!saved && !error) return null;
  if (error) {
    return (
      <div className="mt-6 rounded-2 border-2 border-orange-press bg-orange/10 px-4 py-3 text-sm font-bold text-orange-press">
        Error: {decodeURIComponent(error)}
      </div>
    );
  }
  return (
    <div className="mt-6 rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm font-bold text-green-dark">
      {FLASH_LABELS[saved ?? ''] ?? 'Saved.'}
    </div>
  );
}
