import type { ReactNode } from "react";
import type { FinanceEntry } from "../../../lib/types";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { SectionPanel } from "../../../components/ui/section-panel";
import { FinanceEntriesList } from "./FinanceEntriesList";

interface FinanceHistoryCardProps {
  title: string;
  description?: string;
  summaryText?: ReactNode;
  totalBadgeText?: string;
  entries: FinanceEntry[];
  emptyText: string;
  paidByText: (entry: FinanceEntry) => string;
  formatMoney: (value: number) => string;
  headerRight?: ReactNode;
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
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
}

export const FinanceHistoryCard = ({
  title,
  description,
  summaryText,
  totalBadgeText,
  entries,
  emptyText,
  paidByText,
  formatMoney,
  headerRight,
  entryChipText,
  entryChipClassName,
  amountClassName,
  onEdit,
  onDelete,
  canEditEntry,
  canDeleteEntry,
  actionsLabel,
  editLabel,
  deleteLabel,
  busy = false,
  virtualized = false,
  virtualHeight = 420,
  collapsible = false,
  defaultOpen = true,
  className
}: FinanceHistoryCardProps) => {
  const list = (
    <>
      <FinanceEntriesList
        entries={entries}
        formatMoney={formatMoney}
        paidByText={paidByText}
        entryChipText={entryChipText}
        entryChipClassName={entryChipClassName}
        amountClassName={amountClassName}
        onEdit={onEdit}
        onDelete={onDelete}
        canEditEntry={canEditEntry}
        canDeleteEntry={canDeleteEntry}
        actionsLabel={actionsLabel}
        editLabel={editLabel}
        deleteLabel={deleteLabel}
        busy={busy}
        virtualized={virtualized}
        virtualHeight={virtualHeight}
      />
      {entries.length === 0 ? <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{emptyText}</p> : null}
    </>
  );

  if (collapsible) {
    return (
      <SectionPanel className={className}>
        <details className="group" open={defaultOpen}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-1 py-1 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">{title}</p>
              {summaryText ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{summaryText}</div> : null}
            </div>
            <div className="flex items-center gap-2">
              {totalBadgeText ? <Badge>{totalBadgeText}</Badge> : null}
              <span className="text-xs text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-400">▼</span>
            </div>
          </summary>
          <div className="mt-2">{list}</div>
        </details>
      </SectionPanel>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {headerRight}
        </div>
        {summaryText ? <div className="text-xs text-slate-500 dark:text-slate-400">{summaryText}</div> : null}
      </CardHeader>
      <CardContent>{list}</CardContent>
    </Card>
  );
};
