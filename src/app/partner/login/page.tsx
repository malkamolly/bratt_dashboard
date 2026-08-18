import { PARTNER } from '@/lib/partner-config';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ error?: string; next?: string }>;

/** The login page owns the wording; the endpoint only sends a code. */
const ERRORS: Record<string, string> = {
  'bad-password': 'That password is not right. Check with your Bratt Tree contact.',
  'not-configured':
    'This hub is not set up yet — please contact your Bratt Tree contact.',
};

/**
 * Partner Hub sign-in: one shared password for the partner's whole sales team
 * (see lib/partner-auth.ts). Deliberately unrelated to the internal /login and
 * /easy-login screens — no email, no Supabase, no allowlist, no roles.
 *
 * A plain form POST to /partner/session, not a server action. See the comment
 * at the top of that route for why.
 */
export default async function PartnerLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, next } = await searchParams;
  const message = error ? ERRORS[error] ?? ERRORS['bad-password'] : null;
  const safeNext = next?.startsWith('/partner') ? next : '/partner';

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{PARTNER.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{PARTNER.tagline}</p>

        <form
          method="post"
          action="/partner/session"
          className="mt-8 flex flex-col gap-4"
        >
          <input type="hidden" name="next" value={safeNext} />

          {/* Browsers and password managers expect a username field beside a
              password field, even when there's only one shared password. */}
          <input
            type="text"
            name="username"
            value="partner"
            autoComplete="username"
            readOnly
            hidden
            aria-hidden="true"
            tabIndex={-1}
          />

          <label className="text-sm font-semibold text-slate-700">
            Password
            <input
              type="password"
              name="password"
              required
              autoFocus
              autoComplete="current-password"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
            />
          </label>

          {message && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            className="mt-1 rounded-lg bg-emerald-700 px-4 py-2.5 text-base font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/40"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-400">
          Pricing tool provided by Bratt Tree Company.
        </p>
      </div>
    </main>
  );
}
