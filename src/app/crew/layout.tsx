import { CrewQuickLinksAuto } from '@/components/crew/CrewQuickLinks';

export default function CrewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <div className="mx-auto max-w-6xl px-6 pb-12">
        <CrewQuickLinksAuto />
      </div>
    </>
  );
}
