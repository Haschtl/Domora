import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { MoreHorizontal } from "lucide-react";
import { ReceiptPreviewDialog } from "../../components/receipt-preview-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";
import type { FinanceEntry } from "../../lib/types";
import { cn } from "../../lib/utils";

interface FinanceEntriesListProps {
  header?: ReactNode;
  entries: FinanceEntry[];
  itemClassName?: string;
  containerClassName?: string;
  formatMoney: (value: number) => string;
  paidByText: (entry: FinanceEntry) => string;
  entryDateText?: (entry: FinanceEntry) => string | null;
  receiptImageUrl?: (entry: FinanceEntry) => string | null;
  receiptLabel?: string;
  entryChipText?: (entry: FinanceEntry) => string | null;
  entryChipClassName?: (entry: FinanceEntry) => string | undefined;
  amountClassName?: string;
  createdByTooltip?: (entry: FinanceEntry) => string | null;
  onEdit?: (entry: FinanceEntry) => void;
  onDelete?: (entry: FinanceEntry) => void;
  canEditEntry?: (entry: FinanceEntry) => boolean;
  canDeleteEntry?: (entry: FinanceEntry) => boolean;
  actionsLabel?: string;
  editLabel?: string;
  deleteLabel?: string;
  busy?: boolean;
  virtualized?: boolean;
}

export const FinanceEntriesList = ({
  header,
  entries,
  itemClassName,
  containerClassName,
  formatMoney,
  paidByText,
  entryDateText,
  receiptImageUrl,
  receiptLabel = "Receipt",
  entryChipText,
  entryChipClassName,
  amountClassName = "text-sm font-semibold text-brand-800 dark:text-brand-200",
  createdByTooltip,
  onEdit,
  onDelete,
  canEditEntry,
  canDeleteEntry,
  actionsLabel = "Actions",
  editLabel = "Edit",
  deleteLabel = "Delete",
  busy = false,
  virtualized = false
}: FinanceEntriesListProps) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);
  const virtualItemGap = 12;

  useLayoutEffect(() => {
    if (!virtualized || typeof window === "undefined" || !listRef.current) return;

    const nextScrollMargin = listRef.current.getBoundingClientRect().top + window.scrollY;
    setScrollMargin((current) => (Math.abs(current - nextScrollMargin) < 1 ? current : nextScrollMargin));
  }, [entries.length, header, virtualized]);

  const rowVirtualizer = useWindowVirtualizer({
    count: virtualized ? entries.length : 0,
    estimateSize: () => 130,
    getItemKey: (index) => entries[index]?.id ?? index,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 8,
    scrollMargin
  });

  const renderEntry = (entry: FinanceEntry, asListItem: boolean) => {
    const EntryTag = asListItem ? "li" : "div";

    return (
      <EntryTag
        key={entry.id}
        className={
          itemClassName ??
          "rounded-xl border border-brand-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
        }
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <p className="font-medium text-slate-900 dark:text-slate-100">{entry.description}</p>
            <Badge className="w-fit text-[10px]">{entry.category}</Badge>
          </div>
          <div className="flex items-center gap-1">
            {(onEdit || onDelete) &&
            ((onEdit && (canEditEntry?.(entry) ?? true)) || (onDelete && (canDeleteEntry?.(entry) ?? true))) ? (
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
                    <DropdownMenuItem onClick={() => onEdit(entry)}>{editLabel}</DropdownMenuItem>
                  ) : null}
                  {onDelete && (canDeleteEntry?.(entry) ?? true) ? (
                    <DropdownMenuItem onClick={() => onDelete(entry)} className="text-rose-600 dark:text-rose-300">
                      {deleteLabel}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <div className="flex flex-col items-end gap-1">
              {entryChipText ? (
                (() => {
                  const chipText = entryChipText(entry);
                  return chipText ? <Badge className={entryChipClassName?.(entry)}>{chipText}</Badge> : null;
                })()
              ) : null}
              <p className={amountClassName}>{formatMoney(entry.amount)}</p>
            </div>
          </div>
        </div>
        <div className="mt-1 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">{paidByText(entry)}</p>
            {receiptImageUrl && receiptImageUrl(entry) ? (
              <button
                type="button"
                className="mt-1 inline-flex items-center text-xs text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-600 dark:text-brand-300 dark:decoration-brand-700"
                onClick={() => {
                  setPreviewUrl(receiptImageUrl(entry) ?? null);
                  setPreviewTitle(entry.description);
                }}
              >
                {receiptLabel}
              </button>
            ) : null}
          </div>
          {entryDateText ? (
            <p
              className="shrink-0 text-xs text-slate-500 dark:text-slate-400"
              title={createdByTooltip ? createdByTooltip(entry) ?? undefined : undefined}
            >
              {entryDateText(entry)}
            </p>
          ) : null}
        </div>
      </EntryTag>
    );
  };

  return (
    <>
      {header ? <div className="mt-4">{header}</div> : null}
      {!virtualized ? (
        <ul className="mt-4 list-none space-y-2">{entries.map((entry) => renderEntry(entry, true))}</ul>
      ) : (
        <div ref={listRef} className={cn("relative mt-4 w-full", containerClassName)}>
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
                  ref={rowVirtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  data-index={virtualItem.index}
                  style={{
                    transform: `translateY(${virtualItem.start - scrollMargin}px)`,
                    paddingBottom: `${virtualItemGap}px`
                  }}
                >
                  {renderEntry(entry, false)}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <ReceiptPreviewDialog
        open={Boolean(previewUrl)}
        imageUrl={previewUrl}
        title={previewTitle}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewUrl(null);
            setPreviewTitle(null);
          }
        }}
      />
    </>
  );
};
