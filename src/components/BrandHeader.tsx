import Image from 'next/image';
import Link from 'next/link';

export function BrandHeader() {
  return (
    <header className="bt-nav sticky top-0 z-30 border-b-2 border-bark-deep">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-3">
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
            <span className="ml-2 text-xs text-lime tracking-ribbon align-middle">PACE</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-3 font-headline text-sm font-extrabold uppercase tracking-ribbon">
          <Link href="/sales" className="rounded-full px-3 py-2 hover:bg-bark-deep">Sales</Link>
          <Link href="/production" className="rounded-full px-3 py-2 hover:bg-bark-deep">Production</Link>
          <Link href="/admin" className="rounded-full px-3 py-2 hover:bg-bark-deep">Admin</Link>
        </nav>
      </div>
    </header>
  );
}
