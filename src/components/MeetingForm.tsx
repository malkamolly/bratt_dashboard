import Link from 'next/link';
import { ImageUploadButton } from './ImageUploadButton';
import { TagInput } from './TagInput';

type Meeting = {
  date: string;
  title: string;
  slug?: string;
  educational_title: string | null;
  educational_tags: string[];
  educational_body: string | null;
  operational_body: string | null;
  topic_slug: string | null;
};

export type TopicDeckOption = {
  slug: string;
  title: string;
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  initial?: Meeting;
  knownTags: string[];
  /** Available topic decks the meeting can be linked to */
  topicDeckOptions: TopicDeckOption[];
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
  topicDeckOptions,
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
            The teaching portion of the meeting. Either pick a topic deck
            from the library, or write educational slides inline below.
          </p>
          <FormattingHelp />
        </div>

        <label className="block">
          <span className="block font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Use a topic deck
          </span>
          <select
            name="topic_slug"
            defaultValue={initial?.topic_slug ?? ''}
            className={FIELD_CLASS}
          >
            <option value="">— None (write slides inline below) —</option>
            {topicDeckOptions.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.title}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-xs text-fg-3">
            When a topic deck is selected, the inline Topic / Tags / Slides
            fields below are ignored.
          </span>
        </label>

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

        <div>
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
          <ImageUploadButton targetName="educational_body" />
        </div>
      </section>

      <section className="bt-card space-y-4">
        <div>
          <p className="bt-eyebrow">Operational Updates</p>
          <p className="mt-1 text-sm text-fg-2">
            Housekeeping, CRM updates, schedule changes, promos. Same
            formatting rules as above.
          </p>
        </div>

        <div>
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
          <ImageUploadButton targetName="operational_body" />
        </div>
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

function FormattingHelp() {
  return (
    <details className="mt-3 rounded-2 border-2 border-paper-edge bg-paper px-3 py-2 text-sm">
      <summary className="cursor-pointer font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2 [&::-webkit-details-marker]:hidden">
        ⓘ Formatting cheat sheet
      </summary>
      <div className="mt-3 space-y-2 text-sm text-fg-2">
        <p>
          <code className="rounded bg-paper-edge px-1"># Heading</code> on its
          own line starts a new slide; the heading becomes the slide title.
        </p>
        <p>
          <code className="rounded bg-paper-edge px-1">## Subheading</code>,{' '}
          <code className="rounded bg-paper-edge px-1">**bold**</code>,{' '}
          <code className="rounded bg-paper-edge px-1">- bullet point</code>,
          and{' '}
          <code className="rounded bg-paper-edge px-1">1. numbered list</code>{' '}
          all work inside a slide.
        </p>
        <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep">
          Photos
        </p>
        <p>
          Use the <strong>Add image</strong> buttons below the textarea to
          upload. Each layout option inserts a different bit of markdown:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <code className="rounded bg-paper-edge px-1">
              ![alt](url)
            </code>{' '}
            — <strong>inline</strong>, image appears within the text flow.
          </li>
          <li>
            <code className="rounded bg-paper-edge px-1">
              ![alt](url)&#123;hero&#125;
            </code>{' '}
            — <strong>hero</strong>, large image fills the top of the slide.
          </li>
          <li>
            <code className="rounded bg-paper-edge px-1">
              ![alt](url)&#123;side&#125;
            </code>{' '}
            — <strong>side</strong>, image on the left half, slide text on the
            right half.
          </li>
        </ul>
        <p>
          You can edit the alt text and modifier by hand after uploading. Only
          one hero or side image per slide — extras render inline.
        </p>
      </div>
    </details>
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
