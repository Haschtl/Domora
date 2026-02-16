import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FinanceEntry } from "../../lib/types";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ReceiptPreviewDialog } from "../../components/receipt-preview-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";

interface FinanceEntriesListProps {
  header?: ReactNode;
  entries: FinanceEntry[];
  itemClassName?: string;
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
  virtualHeight?: number | string;
  virtualLayout?: "absolute" | "inline";
}

export const FinanceEntriesList = ({
  header,
  entries,
  itemClassName,
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
  virtualized = false,
  virtualHeight = 420,
  virtualLayout = "absolute"
}: FinanceEntriesListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);
  const virtualItemGap = 12;
  const virtualCount = header ? entries.length + 1 : entries.length;
  const rowVirtualizer = useVirtualizer({
    count: virtualCount,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => {
      if (header && index === 0) return "list-header";
      const entry = entries[header ? index - 1 : index];
      return entry?.id ?? index;
    },
    estimateSize: () => 118 + virtualItemGap,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 8
  });

  const renderEntry = (entry: FinanceEntry) => (
    <li
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
    </li>
  );

  if (!virtualized) {
    return (
      <>
        {header ? <div className="mt-4">{header}</div> : null}
        <ul className="mt-4 list-none space-y-2">{entries.map((entry) => renderEntry(entry))}</ul>
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
  }

  const virtualContainerClassName =
    virtualLayout === "inline"
      ? "relative w-full overflow-auto rounded-xl border border-brand-100 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900"
      : "w-[100vw] sm:w-full left-0 p-4 pt-8 pb-20 absolute sm:relative sm:h-full sm:w-full overflow-auto -translate-y-8 sm:translate-y-0";

  return (
    <div
      ref={parentRef}
      className={virtualContainerClassName}
      style={{ height: typeof virtualHeight === "number" ? `${virtualHeight}px` : virtualHeight }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: "relative",
          width: "100%"
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          if (header && virtualItem.index === 0) {
            return (
              <div
                key="list-header"
                ref={rowVirtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                data-index={virtualItem.index}
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                  paddingBottom: `${virtualItemGap}px`,
                }}
              >
                {header}
              </div>
            );
          }
          const entry = entries[header ? virtualItem.index - 1 : virtualItem.index];
          if (!entry) return null;
          return (
            <div
              key={entry.id}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 top-0 w-full list-none"
              data-index={virtualItem.index}
              style={{
                transform: `translateY(${virtualItem.start}px)`,
                paddingBottom: `${virtualItemGap}px`
              }}
            >
              {renderEntry(entry)}
            </div>
          );
        })}
      </div>
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
    </div>
  );
};
