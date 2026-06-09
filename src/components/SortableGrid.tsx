'use client';

// ============================================================================
// SortableGrid — the app's STANDARD drag-and-drop reorder control.
// ============================================================================
// Whenever a list or grid of things needs to be reorderable by the user, use
// this instead of up/down buttons. Built on @dnd-kit so it supports mouse,
// touch, and keyboard (accessible) out of the box.
//
// Usage (from a server component): pass each item's id plus its already-
// rendered card as `content`, and a server action that persists the new order:
//
//   <SortableGrid
//     items={projects.map((p) => ({ id: p.id, content: <Card .../> }))}
//     onReorder={reorderProjects}                 // (ids: string[]) => Promise
//     className="grid grid-cols-1 gap-6 md:grid-cols-2 items-start"
//   />
//
// Each card gets a grip handle at the top-center; dragging it reorders the
// grid instantly (optimistic) and then calls onReorder to save.
// ============================================================================

import { type ReactNode, useEffect, useState, useTransition } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripHorizontal } from 'lucide-react';

export type SortableEntry = { id: string; content: ReactNode };

export function SortableGrid({
  items,
  onReorder,
  className = '',
}: {
  items: SortableEntry[];
  onReorder: (orderedIds: string[]) => Promise<void> | void;
  className?: string;
}) {
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const [, startTransition] = useTransition();

  // Re-sync when the server sends a different set/order of items (e.g. after
  // a project is added or deleted and the page revalidates).
  const incoming = items.map((i) => i.id).join(',');
  useEffect(() => {
    setOrder(items.map((i) => i.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  const sensors = useSensors(
    // Require a little movement before a drag starts so a plain click on a
    // button or dropdown inside a card isn't swallowed.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const byId = new Map(items.map((i) => [i.id, i.content]));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next); // instant visual reorder
    startTransition(() => {
      void onReorder(next); // persist to the database
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={order} strategy={rectSortingStrategy}>
        <div className={className}>
          {order.map((id) => (
            <SortableCard key={id} id={id}>
              {byId.get(id)}
            </SortableCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableCard({ id, children }: { id: string; children: ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${isDragging ? 'z-10 opacity-80' : ''}`}
    >
      {/* Grip handle — the only draggable spot, so the rest of the card stays
          clickable. Sits in the card's top padding, clear of the content. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="absolute left-1/2 top-1 z-10 -translate-x-1/2 cursor-grab text-fg-3 hover:text-orange active:cursor-grabbing"
      >
        <GripHorizontal size={18} />
      </button>
      {children}
    </div>
  );
}
