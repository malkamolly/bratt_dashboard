'use client';

export function PrintButton({ children = 'Print / Save PDF' }: { children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bt-btn bt-btn-primary"
    >
      {children}
    </button>
  );
}
