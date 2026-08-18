import Image from 'next/image';
import { PROGRAM, BRATT } from '@/lib/partner-config';
import { PartnerLogo } from '@/components/partner/PartnerLogo';

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
      <div className="bt-card text-center">
        <Image
          src="/brand/mascot-circle.png"
          alt=""
          width={84}
          height={84}
          className="mx-auto"
          priority
        />
        <p className="bt-eyebrow mt-4">{BRATT.name}</p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-wider text-bark-deep">
          {PROGRAM.name}
        </h1>
        <div className="mt-5 flex flex-col items-center gap-2 border-t border-paper-edge pt-5">
          <span className="font-headline text-[0.6rem] font-extrabold uppercase tracking-ribbon text-fg-3">
            Prepared for
          </span>
          <PartnerLogo className="h-9" />
        </div>

        <form
          method="post"
          action="/partner/session"
          className="mt-7 flex flex-col gap-4 text-left"
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

          <label className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Password
            <input
              type="password"
              name="password"
              required
              autoFocus
              autoComplete="current-password"
              className="mt-1.5 block w-full rounded-2 border-2 border-paper-edge bg-white px-4 py-3 text-base text-ink focus:border-orange focus:outline-none"
            />
          </label>

          {message && (
            <p
              role="alert"
              className="rounded-2 border-2 border-orange-press bg-orange/10 px-3 py-2 text-sm font-bold text-orange-press"
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            className="bt-btn bt-btn-primary mt-1 justify-center"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-xs text-fg-3">
          Delivered by {BRATT.name}.
        </p>
      </div>
    </main>
  );
}
