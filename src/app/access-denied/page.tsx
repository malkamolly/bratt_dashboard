import Image from 'next/image';
import Link from 'next/link';

export default function AccessDeniedPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-140px)] max-w-md flex-col justify-center px-6 py-12">
      <div className="bt-card-orange text-center">
        <Image
          src="/brand/mascot-circle.png"
          alt="Bratt Tree"
          width={84}
          height={84}
          className="mx-auto opacity-70"
        />
        <p className="bt-eyebrow mt-4">Access Denied</p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-wider text-bark-deep">
          Looks like that branch isn&apos;t here.
        </h1>
        <p className="mt-3 text-sm text-fg-2">
          Your email isn&apos;t on the Bratt Tree PACE allowlist. If this is a
          mistake, ask Molly to add you.
        </p>
        <Link href="/login" className="bt-btn bt-btn-dark mt-6 justify-center">
          Back to Sign In
        </Link>
      </div>
    </main>
  );
}
