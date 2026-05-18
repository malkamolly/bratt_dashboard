import Link from 'next/link';
import { canAccessHub, getAllowedUser } from '@/lib/auth';

export async function BrandHeader() {
  const user = await getAllowedUser();
  const hasPace = user ? canAccessHub(user.role, 'pace') : false;
  const hasHub = user ? canAccessHub(user.role, 'hub') : false;

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
            {hasPace && <Link href="/sales">Sales</Link>}
            {hasPace && <Link href="/production">Production</Link>}
            {hasHub && <Link href="/hub">Arborist Hub</Link>}
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
