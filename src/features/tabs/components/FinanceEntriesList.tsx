import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FinanceEntry } from "../../../lib/types";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../../components/ui/dropdown-menu";

interface FinanceEntriesListProps {
  entries: FinanceEntry[];
  formatMoney: (value: number) => string;
  paidByText: (entry: FinanceEntry) => string;
  entryChipText?: (entry: FinanceEntry) => string | null;
  entryChipClassName?: (entry: FinanceEntry) => string | undefined;
  amountClassName?: string;
  onEdit?: (entry: FinanceEntry) => void;
  onDelete?: (entry: FinanceEntry) => void;
  canEditEntry?: (entry: FinanceEntry) => boolean;
  canDeleteEntry?: (entry: FinanceEntry) => boolean;
  actionsLabel?: string;
  editLabel?: string;
  deleteLabel?: string;
  busy?: boolean;
  virtualized?: boolean;
  virtualHeight?: number;
}

export const FinanceEntriesList = ({
  entries,
  formatMoney,
  paidByText,
  entryChipText,
  entryChipClassName,
  amountClassName = "text-sm font-semibold text-brand-800 dark:text-brand-200",
  onEdit,
  onDelete,
  canEditEntry,
  canDeleteEntry,
  actionsLabel = "Actions",
  editLabel = "Edit",
  deleteLabel = "Delete",
  busy = false,
  virtualized = false,
  virtualHeight = 420
}: FinanceEntriesListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 106,
    overscan: 8
  });

  const renderEntry = (entry: FinanceEntry) => (
    <li key={entry.id} className="rounded-xl border border-brand-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-slate-900 dark:text-slate-100">{entry.description}</p>
          <Badge className="w-fit text-[10px]">{entry.category}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex flex-col items-end gap-1">
            {entryChipText ? (
              (() => {
                const chipText = entryChipText(entry);
                return chipText ? <Badge className={entryChipClassName?.(entry)}>{chipText}</Badge> : null;
              })()
            ) : null}
            <p className={amountClassName}>{formatMoney(entry.amount)}</p>
          </div>
          {(onEdit || onDelete) && ((onEdit && (canEditEntry?.(entry) ?? true)) || (onDelete && (canDeleteEntry?.(entry) ?? true))) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label={actionsLabel}
                  disabled={busy}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (canEditEntry?.(entry) ?? true) ? (
                  <DropdownMenuItem onClick={() => onEdit(entry)}>
                    {editLabel}
                  </DropdownMenuItem>
                ) : null}
                {onDelete && (canDeleteEntry?.(entry) ?? true) ? (
                  <DropdownMenuItem onClick={() => onDelete(entry)} className="text-rose-600 dark:text-rose-300">
                    {deleteLabel}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{paidByText(entry)}</p>
    </li>
  );

  if (!virtualized || entries.length < 24) {
    return <ul className="mt-4 space-y-2">{entries.map((entry) => renderEntry(entry))}</ul>;
  }

  return (
    <div
      ref={parentRef}
      className="mt-4 overflow-auto pr-1"
      style={{ height: `${virtualHeight}px` }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: "relative",
          width: "100%"
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const entry = entries[virtualItem.index];
          if (!entry) return null;
          return (
            <div
              key={entry.id}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
                paddingBottom: "0.5rem"
              }}
            >
              {renderEntry(entry)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
