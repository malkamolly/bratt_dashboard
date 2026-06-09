import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { addTask, toggleTask, updateTask, deleteTask } from './actions';

export const dynamic = 'force-dynamic';

type Task = {
  id: string;
  project: string;
  title: string;
  notes: string | null;
  done: boolean;
  due_date: string | null;
  sort_order: number;
  created_at: string;
};

const INBOX = 'Inbox';

// Format an ISO date (yyyy-mm-dd) as "Jun 9" without dragging in a date lib —
// the value is already a plain calendar date, no timezone math needed.
function formatDue(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(iso: string): boolean {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return iso < todayKey;
}

export default async function ProjectsPage() {
  await requireOwner();

  const supabase = await serverClient();
  const { data } = await supabase
    .from('personal_tasks')
    .select('id, project, title, notes, done, due_date, sort_order, created_at')
    .order('done', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  const tasks = (data ?? []) as Task[];

  // Group tasks by project name (blank => Inbox). Build an ordered list of
  // group names so rendering is deterministic: Inbox first, then the rest
  // alphabetically.
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.project.trim() || INBOX;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  const groupNames = Array.from(groups.keys()).sort((a, b) => {
    if (a === INBOX) return -1;
    if (b === INBOX) return 1;
    return a.localeCompare(b);
  });

  // Existing project names power the datalist on the add form, so typing an
  // existing project autocompletes instead of accidentally creating a new one.
  const projectOptions = Array.from(
    new Set(tasks.map((t) => t.project.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const openCount = tasks.filter((t) => !t.done).length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        My Projects
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        My Projects
      </h1>
      <p className="mt-4 max-w-2xl text-fg-2">
        Your private project checklist &mdash; only you can see this.{' '}
        {openCount === 0
          ? 'Nothing open right now.'
          : `${openCount} open ${openCount === 1 ? 'item' : 'items'}.`}
      </p>

      {/* Add a new task ---------------------------------------------------- */}
      <form
        action={addTask}
        className="mt-8 rounded-lg border border-line bg-white p-4 shadow-sm"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="bt-eyebrow block">Task</span>
            <input
              name="title"
              required
              placeholder="What needs doing?"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-ink focus:border-orange focus:outline-none"
            />
          </label>
          <label className="sm:w-44">
            <span className="bt-eyebrow block">Project</span>
            <input
              name="project"
              list="project-options"
              placeholder="Inbox"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-ink focus:border-orange focus:outline-none"
            />
            <datalist id="project-options">
              {projectOptions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="sm:w-40">
            <span className="bt-eyebrow block">Due</span>
            <input
              type="date"
              name="due_date"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-ink focus:border-orange focus:outline-none"
            />
          </label>
          <button type="submit" className="bt-btn bt-btn-primary sm:mb-[1px]">
            Add
          </button>
        </div>
      </form>

      {/* Grouped checklist ------------------------------------------------- */}
      {groupNames.length === 0 ? (
        <p className="mt-10 text-center text-fg-3">
          No tasks yet. Add your first one above.
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {groupNames.map((name) => {
            const items = groups.get(name)!;
            const remaining = items.filter((t) => !t.done).length;
            return (
              <section key={name}>
                <div className="flex items-baseline justify-between border-b border-line pb-2">
                  <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
                    {name}
                  </h2>
                  <span className="text-sm text-fg-3">
                    {remaining} of {items.length} open
                  </span>
                </div>
                <ul className="mt-2 divide-y divide-line">
                  {items.map((t) => (
                    <li key={t.id} className="py-2">
                      <div className="flex items-start gap-3">
                        {/* Toggle done — a tiny form so it works without JS. */}
                        <form action={toggleTask}>
                          <input type="hidden" name="id" value={t.id} />
                          <input
                            type="hidden"
                            name="done"
                            value={t.done ? 'false' : 'true'}
                          />
                          <button
                            type="submit"
                            aria-label={t.done ? 'Mark not done' : 'Mark done'}
                            className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border ${
                              t.done
                                ? 'border-orange bg-orange text-white'
                                : 'border-fg-3 bg-white text-transparent hover:border-orange'
                            }`}
                          >
                            ✓
                          </button>
                        </form>

                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span
                              className={
                                t.done
                                  ? 'text-fg-3 line-through'
                                  : 'text-ink'
                              }
                            >
                              {t.title}
                            </span>
                            {t.due_date && (
                              <span
                                className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                                  !t.done && isOverdue(t.due_date)
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-cream text-fg-2'
                                }`}
                              >
                                {formatDue(t.due_date)}
                              </span>
                            )}
                          </div>
                          {t.notes && (
                            <p className="mt-0.5 text-sm text-fg-2">{t.notes}</p>
                          )}

                          {/* Edit / delete tucked behind a disclosure so the
                              list stays clean. */}
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-fg-3 hover:text-orange">
                              Edit
                            </summary>
                            <form
                              action={updateTask}
                              className="mt-2 space-y-2 rounded-md border border-line bg-cream/50 p-3"
                            >
                              <input type="hidden" name="id" value={t.id} />
                              <div className="flex flex-col gap-2 sm:flex-row">
                                <input
                                  name="title"
                                  defaultValue={t.title}
                                  required
                                  className="flex-1 rounded-md border border-line px-2 py-1 text-sm"
                                />
                                <input
                                  name="project"
                                  defaultValue={t.project}
                                  list="project-options"
                                  placeholder="Inbox"
                                  className="rounded-md border border-line px-2 py-1 text-sm sm:w-40"
                                />
                                <input
                                  type="date"
                                  name="due_date"
                                  defaultValue={t.due_date ?? ''}
                                  className="rounded-md border border-line px-2 py-1 text-sm sm:w-36"
                                />
                              </div>
                              <textarea
                                name="notes"
                                defaultValue={t.notes ?? ''}
                                placeholder="Notes (optional)"
                                rows={2}
                                className="w-full rounded-md border border-line px-2 py-1 text-sm"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="submit"
                                  className="bt-btn bt-btn-primary text-sm"
                                >
                                  Save
                                </button>
                              </div>
                            </form>
                            <form action={deleteTask} className="mt-2">
                              <input type="hidden" name="id" value={t.id} />
                              <button
                                type="submit"
                                className="bt-btn bt-btn-ghost text-sm text-red-600"
                              >
                                Delete task
                              </button>
                            </form>
                          </details>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
