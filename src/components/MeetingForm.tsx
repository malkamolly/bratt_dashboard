import Link from 'next/link';
import { TagInput } from './TagInput';

type Meeting = {
  date: string;
  title: string;
  slug?: string;
  educational_title: string | null;
  educational_tags: string[];
  educational_body: string | null;
  operational_body: string | null;
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  initial?: Meeting;
  knownTags: string[];
  /** Where the Cancel button should send the user */
  cancelHref: string;
  /** Optional submit button label override (default "Save meeting") */
  submitLabel?: string;
};

const FIELD_CLASS =
  'mt-1 w-full rounded-2 border-2 border-paper-edge bg-white px-3 py-2 font-headline text-sm focus:border-orange focus:outline-none';

export function MeetingForm({
  action,
  initial,
  knownTags,
  cancelHref,
  submitLabel = 'Save meeting',
}: Props) {
  return (
    <form action={action} className="space-y-6">
      {initial?.slug && (
        <input type="hidden" name="original_slug" value={initial.slug} />
      )}

      <section className="bt-card space-y-4">
        <p className="bt-eyebrow">Meeting</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            <span className="block font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
              Date
            </span>
            <input
              type="date"
              name="date"
              required
              defaultValue={initial?.date ?? nextTuesdayIso()}
              className={FIELD_CLASS}
            />
          </label>
          <label>
            <span className="block font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
              Title
            </span>
            <input
              type="text"
              name="title"
              required
              defaultValue={initial?.title ?? defaultTitle()}
              className={FIELD_CLASS}
            />
          </label>
        </div>
      </section>

      <section className="bt-card space-y-4">
        <div>
          <p className="bt-eyebrow">Educational</p>
          <p className="mt-1 text-sm text-fg-2">
            The teaching portion of the meeting. This is what feeds the
            training library. Use <code className="rounded bg-paper-edge px-1">#&nbsp;Heading</code>{' '}
            on its own line to start a new slide.
          </p>
        </div>

        <label className="block">
          <span className="block font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Topic
          </span>
          <input
            type="text"
            name="educational_title"
            placeholder="e.g. Oak Wilt"
            defaultValue={initial?.educational_title ?? ''}
            className={FIELD_CLASS}
          />
        </label>

        <div>
          <span className="block font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Tags
          </span>
          <div className="mt-1">
            <TagInput
              name="educational_tags"
              defaultValue={initial?.educational_tags ?? []}
              knownTags={knownTags}
            />
          </div>
        </div>

        <label className="block">
          <span className="block font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Slides
          </span>
          <textarea
            name="educational_body"
            rows={14}
            defaultValue={initial?.educational_body ?? ''}
            placeholder={EXAMPLE_EDUCATIONAL}
            className={`${FIELD_CLASS} font-mono text-[13px] leading-relaxed`}
          />
        </label>
      </section>

      <section className="bt-card space-y-4">
        <div>
          <p className="bt-eyebrow">Operational Updates</p>
          <p className="mt-1 text-sm text-fg-2">
            Housekeeping, CRM updates, schedule changes, promos. Same{' '}
            <code className="rounded bg-paper-edge px-1">#&nbsp;Heading</code>{' '}
            rule for splitting into slides.
          </p>
        </div>

        <label className="block">
          <span className="block font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Slides
          </span>
          <textarea
            name="operational_body"
            rows={10}
            defaultValue={initial?.operational_body ?? ''}
            placeholder={EXAMPLE_OPERATIONAL}
            className={`${FIELD_CLASS} font-mono text-[13px] leading-relaxed`}
          />
        </label>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="bt-btn bt-btn-primary">
          {submitLabel}
        </button>
        <Link href={cancelHref} className="bt-btn bt-btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function nextTuesdayIso(): string {
  const today = new Date();
  const day = today.getDay(); // 0=Sun ... 6=Sat
  // Days to add to reach next Tuesday. If today is Tuesday, jump a full week.
  const add = ((2 - day + 7) % 7) || 7;
  const target = new Date(today);
  target.setDate(today.getDate() + add);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function defaultTitle(): string {
  const iso = nextTuesdayIso();
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const long = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `Weekly Sales Meeting — ${long}`;
}

const EXAMPLE_EDUCATIONAL = `# What is it?
Short intro paragraph.

# How to identify it
- Bullet point one
- Bullet point two

# Sales talking points
- Lead with…`;

const EXAMPLE_OPERATIONAL = `# Housekeeping
- Timesheet reminder
- Memorial Day office closure

# Updates
- New CRM template live`;
