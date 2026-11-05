import { cn } from "@/lib/utils";

export type RecordTableProps = {
  title: string;
  /** Short labels as the source writes them: "YDS", "W-L". */
  columns: readonly string[];
  /** Each row's name sits above its figures, so any number of columns fits a phone. */
  rows: readonly { label: string; cells: readonly string[] }[];
  className?: string;
};

/** A table whose columns come from the data: box scores, standings and game logs in any sport. */
export function RecordTable({ title, columns, rows, className }: RecordTableProps) {
  const grid = { gridTemplateColumns: `repeat(${columns.length || 1}, minmax(0, 1fr))` };
  return (
    <section data-node-id="record-table" className={cn("flex flex-col gap-4 rounded-[24px] bg-kino-surface-card p-4", className)}>
      <h4 className="text-[17px] leading-[22px] font-semibold">{title}</h4>
      <div className="flex flex-col gap-3">
        <div className="grid gap-1 text-[13px] leading-[18px] text-kino-ink-secondary" style={grid}>
          {columns.map((column, index) => <span key={index} className="truncate">{column}</span>)}
        </div>
        <div className="flex flex-col divide-y divide-kino-outline-subtle">
          {rows.map((row, index) => (
            <div key={index} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <span className="line-clamp-2 text-[15px] leading-[22px] font-medium">{row.label}</span>
              <div className="grid gap-1 text-[13px] leading-[18px] tabular-nums" style={grid}>
                {row.cells.map((cell, cellIndex) => <span key={cellIndex} className="truncate">{cell}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
