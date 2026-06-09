import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { SortableGrid } from '@/components/SortableGrid';
import { StatusControl } from './StatusControl';
import { type Status } from './status';
import {
  addProject,
  renameProject,
  deleteProject,
  reorderProjects,
  addItem,
  renameItem,
  deleteItem,
} from './actions';

export const dynamic = 'force-dynamic';

type Project = {
  id: string;
  name: string;
  status: Status;
};

type Item = {
  id: string;
  project_id: string;
  parent_item_id: string | null;
  title: string;
  status: Status;
};

export default async function ProjectsPage() {
  await requireOwner();

  const supabase = await serverClient();
  const [{ data: projectData }, { data: itemData }] = await Promise.all([
    supabase
      .from('personal_projects')
      .select('id, name, status')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('personal_project_items')
      .select('id, project_id, parent_item_id, title, status')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  const projects = (projectData ?? []) as Project[];
  const items = (itemData ?? []) as Item[];

  // Index items by project, splitting top-level tasks from sub-tasks.
  const topTasksByProject = new Map<string, Item[]>();
  const subTasksByParent = new Map<string, Item[]>();
  for (const it of items) {
    if (it.parent_item_id) {
      if (!subTasksByParent.has(it.parent_item_id))
        subTasksByParent.set(it.parent_item_id, []);
      subTasksByParent.get(it.parent_item_id)!.push(it);
    } else {
      if (!topTasksByProject.has(it.project_id))
        topTasksByProject.set(it.project_id, []);
      topTasksByProject.get(it.project_id)!.push(it);
    }
  }

  return (
    <main className="bt-page">
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
        Your private project board &mdash; only you can see this. Each project,
        task, and sub-task tracks its own status.
      </p>

      {/* Add a new project ------------------------------------------------- */}
      <form
        action={addProject}
        className="mt-8 flex flex-col gap-3 rounded-lg border border-line bg-white p-4 shadow-sm sm:flex-row sm:items-end"
      >
        <label className="flex-1">
          <span className="bt-eyebrow block">New project</span>
          <input
            name="name"
            required
            placeholder="Name your project"
            className="mt-1 w-full rounded-md border border-line px-3 py-2 text-ink focus:border-orange focus:outline-none"
          />
        </label>
        <button type="submit" className="bt-btn bt-btn-primary sm:mb-[1px]">
          Add project
        </button>
      </form>

      {/* Project list ------------------------------------------------------ */}
      {projects.length === 0 ? (
        <p className="mt-10 text-center text-fg-3">
          No projects yet. Add your first one above.
        </p>
      ) : (
        <SortableGrid
          className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-2"
          onReorder={reorderProjects}
          items={projects.map((project) => {
            const tasks = topTasksByProject.get(project.id) ?? [];
            const doneCount = tasks.filter((t) => t.status === 'done').length;
            return {
              id: project.id,
              content: (
              <section className="bt-card">
                {/* Project header (grip handle sits in the top padding) */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
                    {project.name}
                  </h2>
                  <div className="flex items-center gap-3">
                    {tasks.length > 0 && (
                      <span className="text-xs text-fg-3">
                        {doneCount}/{tasks.length} done
                      </span>
                    )}
                    <StatusControl
                      id={project.id}
                      kind="project"
                      status={project.status}
                    />
                  </div>
                </div>

                {/* Rename / delete project, tucked behind a disclosure */}
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-fg-3 hover:text-orange">
                    Edit project
                  </summary>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <form action={renameProject} className="flex flex-1 gap-2">
                      <input type="hidden" name="id" value={project.id} />
                      <input
                        name="name"
                        defaultValue={project.name}
                        required
                        className="flex-1 rounded-md border border-line px-2 py-1 text-sm"
                      />
                      <button
                        type="submit"
                        className="bt-btn bt-btn-primary text-sm"
                      >
                        Rename
                      </button>
                    </form>
                    <form action={deleteProject}>
                      <input type="hidden" name="id" value={project.id} />
                      <button
                        type="submit"
                        className="bt-btn bt-btn-ghost text-sm text-red-600"
                      >
                        Delete project
                      </button>
                    </form>
                  </div>
                </details>

                {/* Tasks */}
                <ul className="mt-3 space-y-3">
                  {tasks.map((task) => {
                    const subs = subTasksByParent.get(task.id) ?? [];
                    return (
                      <li
                        key={task.id}
                        className="rounded-md border border-line p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={
                              task.status === 'done'
                                ? 'text-fg-3 line-through'
                                : 'text-ink'
                            }
                          >
                            {task.title}
                          </span>
                          <StatusControl
                            id={task.id}
                            kind="item"
                            status={task.status}
                          />
                        </div>

                        {/* Sub-tasks */}
                        {subs.length > 0 && (
                          <ul className="mt-2 space-y-1 border-l border-line pl-3">
                            {subs.map((sub) => (
                              <li
                                key={sub.id}
                                className="flex flex-wrap items-center justify-between gap-2"
                              >
                                <span
                                  className={`text-sm ${
                                    sub.status === 'done'
                                      ? 'text-fg-3 line-through'
                                      : 'text-fg-2'
                                  }`}
                                >
                                  {sub.title}
                                </span>
                                <div className="flex items-center gap-2">
                                  <StatusControl
                                    id={sub.id}
                                    kind="item"
                                    status={sub.status}
                                  />
                                  <form action={deleteItem}>
                                    <input
                                      type="hidden"
                                      name="id"
                                      value={sub.id}
                                    />
                                    <button
                                      type="submit"
                                      aria-label="Delete sub-task"
                                      className="text-fg-3 hover:text-red-600"
                                    >
                                      &times;
                                    </button>
                                  </form>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}

                        {/* Add a sub-task + edit/delete this task */}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <form
                            action={addItem}
                            className="flex flex-1 gap-2"
                          >
                            <input
                              type="hidden"
                              name="project_id"
                              value={project.id}
                            />
                            <input
                              type="hidden"
                              name="parent_item_id"
                              value={task.id}
                            />
                            <input
                              name="title"
                              placeholder="Add a sub-task…"
                              className="flex-1 rounded-md border border-line px-2 py-1 text-sm"
                            />
                            <button
                              type="submit"
                              className="bt-btn bt-btn-ghost text-sm"
                            >
                              + Sub-task
                            </button>
                          </form>
                        </div>

                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-fg-3 hover:text-orange">
                            Edit task
                          </summary>
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <form
                              action={renameItem}
                              className="flex flex-1 gap-2"
                            >
                              <input type="hidden" name="id" value={task.id} />
                              <input
                                name="title"
                                defaultValue={task.title}
                                required
                                className="flex-1 rounded-md border border-line px-2 py-1 text-sm"
                              />
                              <button
                                type="submit"
                                className="bt-btn bt-btn-primary text-sm"
                              >
                                Rename
                              </button>
                            </form>
                            <form action={deleteItem}>
                              <input type="hidden" name="id" value={task.id} />
                              <button
                                type="submit"
                                className="bt-btn bt-btn-ghost text-sm text-red-600"
                              >
                                Delete task
                              </button>
                            </form>
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>

                {/* Add a top-level task */}
                <form action={addItem} className="mt-3 flex gap-2">
                  <input type="hidden" name="project_id" value={project.id} />
                  <input
                    name="title"
                    placeholder="Add a task or note…"
                    className="flex-1 rounded-md border border-line px-3 py-2 text-sm focus:border-orange focus:outline-none"
                  />
                  <button type="submit" className="bt-btn bt-btn-dark text-sm">
                    Add task
                  </button>
                </form>
              </section>
              ),
            };
          })}
        />
      )}
    </main>
  );
}
