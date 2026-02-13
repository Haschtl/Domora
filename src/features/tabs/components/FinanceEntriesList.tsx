import type { FinanceEntry } from "../../../lib/types";
import { Badge } from "../../../components/ui/badge";

interface FinanceEntriesListProps {
  entries: FinanceEntry[];
  formatMoney: (value: number) => string;
  paidByText: (entry: FinanceEntry) => string;
}

export const FinanceEntriesList = ({ entries, formatMoney, paidByText }: FinanceEntriesListProps) => (
  <ul className="mt-4 space-y-2">
    {entries.map((entry) => (
      <li key={entry.id} className="rounded-xl border border-brand-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <p className="font-medium text-slate-900 dark:text-slate-100">{entry.description}</p>
            <Badge className="w-fit text-[10px]">{entry.category}</Badge>
          </div>
          <p className="text-sm font-semibold text-brand-800 dark:text-brand-200">{formatMoney(entry.amount)}</p>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{paidByText(entry)}</p>
      </li>
    ))}
  </ul>
);
