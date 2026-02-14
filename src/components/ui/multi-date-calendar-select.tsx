import { useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface MultiDateCalendarSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  locale: string;
  placeholder: string;
  clearLabel: string;
  doneLabel: string;
}

type CalendarCell = {
  iso: string;
  day: number;
  inMonth: boolean;
};

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (iso: string) => {
  const parsed = new Date(`${iso}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getMonthGrid = (monthDate: Date): CalendarCell[] => {
  const first = startOfMonth(monthDate);
  const firstWeekday = (first.getDay() + 6) % 7;
  const totalDays = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let index = firstWeekday - 1; index >= 0; index -= 1) {
    const date = new Date(first);
    date.setDate(first.getDate() - (index + 1));
    cells.push({ iso: toIsoDate(date), day: date.getDate(), inMonth: false });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    cells.push({ iso: toIsoDate(date), day, inMonth: true });
  }

  while (cells.length % 7 !== 0) {
    const lastIso = cells[cells.length - 1]?.iso;
    const last = lastIso ? parseIsoDate(lastIso) : null;
    const date = last ?? new Date(monthDate.getFullYear(), monthDate.getMonth(), totalDays);
    date.setDate(date.getDate() + 1);
    cells.push({ iso: toIsoDate(date), day: date.getDate(), inMonth: false });
  }

  return cells;
};

export const MultiDateCalendarSelect = ({
  value,
  onChange,
  disabled = false,
  locale,
  placeholder,
  clearLabel,
  doneLabel
}: MultiDateCalendarSelectProps) => {
  const [open, setOpen] = useState(false);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const selectedSet = useMemo(() => new Set(value), [value]);
  const sortedSelected = useMemo(() => [...new Set(value)].sort(), [value]);

  const weekdayLabels = useMemo(() => {
    const monday = new Date(Date.UTC(2026, 0, 5));
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(monday.getTime() + index * 86400000))
    );
  }, [locale]);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(monthDate),
    [locale, monthDate]
  );
  const monthCells = useMemo(() => getMonthGrid(monthDate), [monthDate]);
  const chipLabelFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }),
    [locale]
  );

  const toggleDate = (iso: string) => {
    if (selectedSet.has(iso)) {
      onChange(sortedSelected.filter((entry) => entry !== iso));
      return;
    }
    onChange([...sortedSelected, iso].sort());
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex min-h-10 w-full flex-wrap items-center gap-1 rounded-md border border-brand-200 bg-white px-2 py-1.5 text-left text-sm shadow-xs transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          aria-label={placeholder}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
          {sortedSelected.length === 0 ? (
            <span className="text-slate-500 dark:text-slate-400">{placeholder}</span>
          ) : (
            <>
              {sortedSelected.slice(0, 4).map((iso) => {
                const parsed = parseIsoDate(iso);
                const label = parsed ? chipLabelFormatter.format(parsed) : iso;
                return (
                  <span
                    key={iso}
                    className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs text-brand-800 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-200"
                  >
                    {label}
                  </span>
                );
              })}
              {sortedSelected.length > 4 ? (
                <span className="text-xs text-slate-500 dark:text-slate-400">+{sortedSelected.length - 4}</span>
              ) : null}
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-[min(24rem,92vw)] space-y-3 p-3"
      >
        <div className="flex items-center justify-between">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-medium capitalize text-slate-700 dark:text-slate-200">{monthLabel}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekdayLabels.map((label) => (
            <p key={label} className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {label}
            </p>
          ))}
          {monthCells.map((cell) => {
            const selected = selectedSet.has(cell.iso);
            return (
              <button
                key={cell.iso}
                type="button"
                className={
                  selected
                    ? "flex h-8 items-center justify-center rounded-md bg-brand-600 text-xs font-semibold text-white"
                    : `flex h-8 items-center justify-center rounded-md text-xs font-medium ${
                        cell.inMonth
                          ? "text-slate-700 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-slate-800"
                          : "text-slate-400 hover:bg-slate-100 dark:text-slate-600 dark:hover:bg-slate-800"
                      }`
                }
                onClick={() => toggleDate(cell.iso)}
              >
                {selected ? <Check className="h-3.5 w-3.5" /> : cell.day}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-brand-100 pt-2 dark:border-slate-700">
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange([])}>
            {clearLabel}
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            {doneLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
