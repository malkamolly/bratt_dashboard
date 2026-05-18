import Link from 'next/link';
import { getAllowedUser } from '@/lib/auth';

export async function BrandHeader() {
  const user = await getAllowedUser();

  return (
    <header className="site">
      <div className="inner">
        <Link href={user ? '/' : '/login'} className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/assets/img/logotype-color.png" alt="Bratt Tree" />
          <span className="sub">PACE Dashboard</span>
        </Link>
        {user ? (
          <nav>
            <Link href="/sales">Sales</Link>
            <Link href="/production">Production</Link>
            {user.role === 'admin' && <Link href="/admin">Admin</Link>}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="signout"
                title={`Sign out (${user.email})`}
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
