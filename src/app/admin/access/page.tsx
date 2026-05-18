import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getAllowedUser,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type Role,
} from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { SectionCard, FlashBanner } from '@/components/admin-shared';
import {
  addAllowedEmail,
  updateAllowedEmailRole,
  removeAllowedEmail,
} from '../actions';

export const dynamic = 'force-dynamic';

type Search = Promise<{ saved?: string; error?: string }>;

type AllowedEmailRow = {
  email: string;
  role: Role;
  added_at: string;
};

const ROLE_OPTIONS: Role[] = ['admin', 'user', 'sales_arborist', 'field_crew'];

export default async function AccessAdminPage({
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
    .from('allowed_emails')
    .select('email, role, added_at')
    .order('role', { ascending: true })
    .order('email', { ascending: true });

  const rows = (data ?? []) as AllowedEmailRow[];
  const myEmailLower = user.email.toLowerCase();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Access
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink">
        Access
      </h1>
      <p className="mt-3 max-w-2xl text-fg-2">
        People who can sign in to the dashboard. Each role controls which hubs
        someone can see:
      </p>
      <ul className="mt-3 space-y-1 text-sm text-fg-2">
        {ROLE_OPTIONS.map((r) => (
          <li key={r}>
            <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep">
              {ROLE_LABELS[r]}
            </span>{' '}
            &mdash; {ROLE_DESCRIPTIONS[r]}
          </li>
        ))}
      </ul>

      <FlashBanner saved={sp.saved} error={sp.error} />

      <div className="mt-8 space-y-6">
        <SectionCard
          eyebrow="Add"
          title="Invite Someone"
          description="They'll get access the next time they sign in with this exact email address (magic link)."
        >
          <form
            action={addAllowedEmail}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <label className="flex-1">
              <span className="block font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Email
              </span>
              <input
                type="email"
                name="email"
                required
                placeholder="name@bratttree.com"
                className="mt-1 w-full rounded-2 border-2 border-paper-edge bg-white px-3 py-2 font-headline text-sm focus:border-orange focus:outline-none"
              />
            </label>
            <label className="sm:w-52">
              <span className="block font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Role
              </span>
              <select
                name="role"
                defaultValue="user"
                className="mt-1 w-full rounded-2 border-2 border-paper-edge bg-white px-3 py-2 font-headline text-sm focus:border-orange focus:outline-none"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="bt-btn bt-btn-primary justify-center sm:w-auto"
            >
              Add Person
            </button>
          </form>
        </SectionCard>

        <SectionCard
          eyebrow="Manage"
          title="Current Access"
          description="Change someone's role or remove their access. Changes take effect on their next request."
        >
          {rows.length === 0 ? (
            <p className="text-sm text-fg-2">No one added yet.</p>
          ) : (
            <ul className="divide-y divide-paper-edge">
              {rows.map((row) => {
                const isSelf = row.email.toLowerCase() === myEmailLower;
                return (
                  <li
                    key={row.email}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-headline text-sm font-bold text-ink">
                        {row.email}
                        {isSelf && (
                          <span className="ml-2 rounded-full bg-paper-edge px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-ribbon text-fg-2">
                            You
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-fg-3">
                        Added {new Date(row.added_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={updateAllowedEmailRole} className="flex items-center gap-2">
                        <input type="hidden" name="email" value={row.email} />
                        <select
                          name="role"
                          defaultValue={row.role}
                          disabled={isSelf}
                          className="rounded-2 border-2 border-paper-edge bg-white px-2 py-1 font-headline text-xs disabled:opacity-50"
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          disabled={isSelf}
                          title={isSelf ? "You can't change your own role" : 'Save role'}
                          className="bt-btn bt-btn-ghost text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Save
                        </button>
                      </form>
                      <form action={removeAllowedEmail}>
                        <input type="hidden" name="email" value={row.email} />
                        <button
                          type="submit"
                          disabled={isSelf}
                          title={isSelf ? "You can't remove yourself" : 'Remove access'}
                          className="bt-btn bt-btn-ghost text-xs text-orange-press disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
