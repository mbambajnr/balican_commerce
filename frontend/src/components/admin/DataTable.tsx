"use client";

import { ReactNode } from "react";
import EmptyState from "./EmptyState";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => ReactNode;
  className?: string;
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  emptyIcon,
  emptyTitle,
  emptyAction,
  onRowClick,
}: {
  columns: Column<T>[];
  data: T[];
  emptyIcon?: string;
  emptyTitle?: string;
  emptyAction?: ReactNode;
  onRowClick?: (item: T) => void;
}) {
  if (data.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle || "No data found"} action={emptyAction} />;
  }

  return (
    <div className="card mt-6 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-muted uppercase tracking-wider">
              {columns.map((col) => (
                <th key={col.key} className={`px-6 py-4 ${col.className || ""}`}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, i) => (
              <tr
                key={item.id || i}
                className={`border-b border-border/50 text-sm transition-colors ${onRowClick ? "hover:bg-zinc-50 cursor-pointer" : "hover:bg-zinc-50"}`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-6 py-4 ${col.className || ""}`}>
                    {col.render ? col.render(item) : item[col.key] ?? "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
