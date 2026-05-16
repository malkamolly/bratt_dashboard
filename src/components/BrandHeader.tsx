import Image from 'next/image';
import Link from 'next/link';
import { getAllowedUser } from '@/lib/auth';

export async function BrandHeader() {
  const user = await getAllowedUser();

  return (
    <header className="bt-nav sticky top-0 z-30 border-b-2 border-bark-deep">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href={user ? '/' : '/login'} className="flex items-center gap-3">
          <Image
            src="/brand/mascot-circle.png"
            alt="Bratt Tree"
            width={44}
            height={44}
            priority
            className="rounded-full"
          />
          <span className="font-display text-xl tracking-wider">
            BRATT TREE
            <span className="ml-2 align-middle text-xs tracking-ribbon text-lime">PACE</span>
          </span>
        </Link>

        {user ? (
          <nav className="flex items-center gap-1 font-headline text-sm font-extrabold uppercase tracking-ribbon sm:gap-3">
            <Link href="/sales" className="rounded-full px-3 py-2 hover:bg-bark-deep">Sales</Link>
            <Link href="/production" className="rounded-full px-3 py-2 hover:bg-bark-deep">Production</Link>
            {user.role === 'admin' && (
              <Link href="/admin" className="rounded-full px-3 py-2 hover:bg-bark-deep">Admin</Link>
            )}
            <form action="/auth/signout" method="post" className="ml-2">
              <button
                type="submit"
                className="rounded-full px-3 py-2 text-cream/70 hover:bg-bark-deep hover:text-cream"
                title={user.email}
              >
                Sign Out
              </button>
            </form>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
