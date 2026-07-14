'use client';

import { useState, type ReactNode } from 'react';

export type CalculatorTab = {
  /** Stable id used for the active-tab state. */
  id: string;
  /** Short label shown on the tab button. */
  label: string;
  /** The calculator (and any surrounding notes) to render when active. */
  content: ReactNode;
};

/**
 * Segmented tab switcher for the calculators page. Shows one calculator at a
 * time so the arborist isn't scrolling past a second full quote builder or
 * entering numbers in the wrong one. Add a new calculator by adding a tab to
 * the `tabs` array on the page — no changes needed here.
 */
export function CalculatorTabs({ tabs }: { tabs: CalculatorTab[] }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? '');
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <div>
      {/* Segmented control — one button per calculator. */}
      <div
        role="tablist"
        aria-label="Calculators"
        className="inline-flex flex-wrap gap-1 rounded-card border-2 border-paper-edge bg-white/60 p-1"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active?.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveId(tab.id)}
              className={`rounded-2 px-4 py-2 font-headline text-xs font-extrabold uppercase tracking-ribbon transition-colors ${
                isActive
                  ? 'bg-orange text-white'
                  : 'text-fg-2 hover:bg-orange/10 hover:text-orange-press'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active calculator. */}
      <div className="mt-8" role="tabpanel">
        {active?.content}
      </div>
    </div>
  );
}
