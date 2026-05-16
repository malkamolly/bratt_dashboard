import Image from 'next/image';
import { requestMagicLink } from './actions';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ sent?: string; error?: string; next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { sent, error, next } = await searchParams;

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

        {sent === '1' ? (
          <div className="mt-6 rounded-3 bg-green/20 p-4 text-left text-sm text-bark-deep">
            <p className="font-bold uppercase tracking-ribbon text-green-dark">
              Check your inbox
            </p>
            <p className="mt-1">
              We sent a sign-in link to your email. Click it to log in. The link is
              good for 1 hour.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm text-fg-2">
              Enter your work email. We&apos;ll send you a one-click sign-in link.
            </p>
            <form action={requestMagicLink} className="mt-6 flex flex-col gap-3 text-left">
              <input type="hidden" name="next" value={next ?? '/'} />
              <label className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep">
                Email
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="you@bratttree.com"
                  className="mt-1 block w-full rounded-3 border-2 border-paper-edge bg-white px-4 py-3 font-sans text-base font-normal normal-case tracking-normal text-ink placeholder:text-fg-3 focus:border-ink focus:outline-none focus:ring-4 focus:ring-lime"
                />
              </label>
              {error && (
                <p className="rounded-2 bg-orange-press/10 px-3 py-2 text-xs text-orange-press">
                  {decodeURIComponent(error)}
                </p>
              )}
              <button type="submit" className="bt-btn bt-btn-primary justify-center">
                Send Sign-In Link
              </button>
            </form>
          </>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-fg-3">
        Trouble signing in? Ask Connor or the admin to add your email to the allowlist.
      </p>
    </main>
  );
}
