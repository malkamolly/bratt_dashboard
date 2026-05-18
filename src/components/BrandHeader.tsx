import Image from 'next/image';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { getAllowedUser } from '@/lib/auth';

export async function BrandHeader() {
  const user = await getAllowedUser();

  return (
    <header className="bt-nav sticky top-0 z-30 border-b-2 border-orange">
      <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-8 sm:py-3">
        <Link
          href={user ? '/' : '/login'}
          className="flex shrink-0 items-center gap-4 sm:gap-6"
        >
          <Image
            src="/brand/logo.png"
            alt="Bratt Tree"
            width={200}
            height={269}
            priority
            className="h-16 w-auto sm:h-24"
          />
          <span
            aria-hidden="true"
            className="hidden h-12 w-0.5 bg-orange sm:block sm:h-16"
          />
          <span className="hidden font-headline text-sm font-extrabold uppercase tracking-ribbon text-cream sm:inline sm:text-lg">
            PACE DASHBOARD
          </span>
        </Link>

        {user ? (
          <nav className="flex items-center gap-4 font-headline text-[11px] font-extrabold uppercase tracking-ribbon sm:gap-8 sm:text-base">
            <Link
              href="/sales"
              className="text-cream transition-colors hover:text-lime"
            >
              Sales
            </Link>
            <Link
              href="/production"
              className="text-cream transition-colors hover:text-lime"
            >
              <span className="hidden sm:inline">Production</span>
              <span className="sm:hidden">Prod</span>
            </Link>
            {user.role === 'admin' && (
              <Link
                href="/admin"
                className="text-cream transition-colors hover:text-lime"
              >
                Admin
              </Link>
            )}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="flex items-center uppercase tracking-ribbon text-cream/70 transition-colors hover:text-lime"
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
