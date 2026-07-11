import { useState } from 'react';
import type { DragEvent } from 'react';
import { GripVertical } from 'lucide-react';

/** Move an item from one index to another (full move, not a swap). */
export function reorderList<T>(rows: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Drag-to-reorder for a vertical list. Only the drag handle starts a drag, so inputs
 * inside each row stay fully usable. Each row is a drop target.
 *
 * const { handleProps, rowProps, dragIndex } = useDragReorder(onReorder);
 * <div {...rowProps(i)}><button {...handleProps(i)}><GripVertical/></button>…</div>
 */
export function useDragReorder(onReorder: (from: number, to: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleProps = (index: number) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => {
      setDragIndex(index);
      event.dataTransfer.effectAllowed = 'move';
      // Firefox needs data set for a drag to actually begin.
      event.dataTransfer.setData('text/plain', String(index));
    },
    onDragEnd: () => {
      setDragIndex(null);
      setOverIndex(null);
    },
  });

  const rowProps = (index: number) => ({
    onDragOver: (event: DragEvent) => {
      if (dragIndex === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (overIndex !== index) setOverIndex(index);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      if (dragIndex !== null && dragIndex !== index) onReorder(dragIndex, index);
      setDragIndex(null);
      setOverIndex(null);
    },
    'data-dragging': dragIndex === index ? '' : undefined,
    'data-drag-over': overIndex === index && dragIndex !== index ? '' : undefined,
  });

  return { handleProps, rowProps, dragIndex, overIndex };
}

/** Grip affordance for a draggable row. Spread `handleProps(index)` onto it. */
export function DragHandle({
  label = 'Kéo để đổi thứ tự',
  size = 16,
  ...rest
}: {
  label?: string;
  size?: number;
} & Record<string, unknown>) {
  return (
    <button type="button" className="icon-btn drag-handle" aria-label={label} title={label} {...rest}>
      <GripVertical size={size} />
    </button>
  );
}
