import Image from 'next/image';
import { signInWithPassword } from './actions';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{
  error?: string;
  next?: string;
  email?: string;
}>;

/**
 * Dedicated password sign-in screen.
 *
 * Not linked from anywhere in the app — share the URL only with the people who
 * should use it. You can pre-fill the email by adding it to the link, e.g.
 *   /easy-login?email=sean@bratttree.com
 * so that person only has to type their password.
 */
export default async function EasyLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, next, email } = await searchParams;
  const hasEmail = !!email;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-140px)] max-w-md flex-col justify-center px-6 py-12">
      <div className="bt-card text-center">
        <Image
          src="/brand/mascot-circle.png"
          alt="Bratt Tree"
          width={84}
          height={84}
          className="mx-auto"
          priority
        />
        <p className="bt-eyebrow mt-4">Bratt Tree PACE</p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-wider text-bark-deep">
          Sign In
        </h1>
        <p className="mt-3 text-sm text-fg-2">
          Enter your password to sign in.
        </p>

        <form
          action={signInWithPassword}
          className="mt-6 flex flex-col gap-3 text-left"
        >
          <input type="hidden" name="next" value={next ?? '/'} />

          <label className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep">
            Email
            <input
              type="email"
              name="email"
              required
              autoComplete="username"
              defaultValue={email ?? ''}
              autoFocus={!hasEmail}
              placeholder="you@bratttree.com"
              className="mt-1 block w-full rounded-3 border-2 border-paper-edge bg-white px-4 py-3 font-sans text-base font-normal normal-case tracking-normal text-ink placeholder:text-fg-3 focus:border-ink focus:outline-none focus:ring-4 focus:ring-lime"
            />
          </label>

          <label className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep">
            Password
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              autoFocus={hasEmail}
              placeholder="Your password"
              className="mt-1 block w-full rounded-3 border-2 border-paper-edge bg-white px-4 py-3 font-sans text-base font-normal normal-case tracking-normal text-ink placeholder:text-fg-3 focus:border-ink focus:outline-none focus:ring-4 focus:ring-lime"
            />
          </label>

          {error && (
            <p className="rounded-2 bg-orange-press/10 px-3 py-2 text-xs text-orange-press">
              {decodeURIComponent(error)}
            </p>
          )}

          <button type="submit" className="bt-btn bt-btn-primary justify-center">
            Sign In
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-xs text-fg-3">
        Trouble signing in? Ask Molly to reset your password.
      </p>
    </main>
  );
}
