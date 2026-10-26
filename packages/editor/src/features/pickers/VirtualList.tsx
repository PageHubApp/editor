/**
 * VirtualList — fixed-size windowing for the icon and font lists (replaces react-window): a
 * scroll box of `height` px, `columns` per row, only the visible rows (plus overscan) mounted.
 *
 *   <VirtualList count={n} columns={7} itemSize={44} height={352} renderItem={(i) => <Cell i={i} />} scrollToIndex={focused} />
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

interface VirtualListProps {
  count: number;
  columns?: number;
  itemSize: number;
  height: number;
  overscan?: number;
  /** Scrolls the item into view when it changes. */
  scrollToIndex?: number;
  renderItem(index: number): ReactNode;
  className?: string;
  role?: string;
  ariaLabel?: string;
}

export function VirtualList({ count, columns = 1, itemSize, height, overscan = 3, scrollToIndex, renderItem, className, role, ariaLabel }: VirtualListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const rows = Math.ceil(count / columns);
  const first = Math.max(0, Math.floor(top / itemSize) - overscan);
  const last = Math.min(rows - 1, Math.ceil((top + height) / itemSize) + overscan);

  useEffect(() => {
    const el = ref.current;
    if (!el || scrollToIndex === undefined || scrollToIndex < 0) return;
    const row = Math.floor(scrollToIndex / columns);
    if (row * itemSize < el.scrollTop) el.scrollTop = row * itemSize;
    else if ((row + 1) * itemSize > el.scrollTop + height) el.scrollTop = (row + 1) * itemSize - height;
    setTop(el.scrollTop);
  }, [scrollToIndex, columns, itemSize, height]);

  const items: ReactNode[] = [];
  for (let row = first; row <= last; row++) {
    for (let c = 0; c < columns; c++) {
      const i = row * columns + c;
      if (i >= count) break;
      items.push(
        <div key={i} style={{ position: "absolute", top: row * itemSize, left: c * itemSize, width: columns === 1 ? "100%" : itemSize, height: itemSize }}>
          {renderItem(i)}
        </div>,
      );
    }
  }
  return (
    <div ref={ref} role={role} aria-label={ariaLabel} onScroll={(e) => setTop(e.currentTarget.scrollTop)} className={`relative overflow-y-auto ${className ?? ""}`} style={{ height }}>
      <div style={{ height: rows * itemSize, position: "relative" }}>{items}</div>
    </div>
  );
}
