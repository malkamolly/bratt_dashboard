import Image from 'next/image';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { getAllowedUser } from '@/lib/auth';

export async function BrandHeader() {
  const user = await getAllowedUser();

  return (
    <header className="bt-nav sticky top-0 z-30 border-b-2 border-bark-deep">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2 sm:px-6 sm:py-3">
        <Link
          href={user ? '/' : '/login'}
          className="flex shrink-0 items-center gap-2 sm:gap-3"
        >
          <Image
            src="/brand/mascot-circle.png"
            alt="Bratt Tree"
            width={44}
            height={44}
            priority
            className="h-9 w-9 rounded-full sm:h-11 sm:w-11"
          />
          <span className="font-display text-base tracking-wider sm:text-xl">
            BRATT TREE
            <span className="ml-1 align-middle text-[9px] tracking-ribbon text-lime sm:ml-2 sm:text-xs">
              PACE
            </span>
          </span>
        </Link>

        {user ? (
          <nav className="flex items-center gap-0.5 font-headline text-[11px] font-extrabold uppercase tracking-ribbon sm:gap-3 sm:text-sm">
            <Link
              href="/sales"
              className="rounded-full px-2 py-1.5 hover:bg-bark-deep sm:px-3 sm:py-2"
            >
              Sales
            </Link>
            <Link
              href="/production"
              className="rounded-full px-2 py-1.5 hover:bg-bark-deep sm:px-3 sm:py-2"
            >
              <span className="hidden sm:inline">Production</span>
              <span className="sm:hidden">Prod</span>
            </Link>
            {user.role === 'admin' && (
              <Link
                href="/admin"
                className="rounded-full px-2 py-1.5 hover:bg-bark-deep sm:px-3 sm:py-2"
              >
                Admin
              </Link>
            )}
            <form action="/auth/signout" method="post" className="ml-0.5 sm:ml-2">
              <button
                type="submit"
                className="flex items-center rounded-full px-2 py-1.5 text-cream/70 hover:bg-bark-deep hover:text-cream sm:px-3 sm:py-2"
                title={`Sign out (${user.email})`}
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4 sm:hidden" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </form>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
