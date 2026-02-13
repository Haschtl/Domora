import { FormEvent, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ShoppingItem, ShoppingItemCompletion } from "../../lib/types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { getDateLocale } from "../../i18n";

type RecurrenceUnit = "minutes" | "hours" | "days";

const recurrenceFactor: Record<RecurrenceUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 60 * 24
};

interface ShoppingTabProps {
  items: ShoppingItem[];
  completions: ShoppingItemCompletion[];
  userId: string;
  busy: boolean;
  onAdd: (title: string, tags: string[], recurrenceIntervalMinutes: number | null) => Promise<void>;
  onToggle: (item: ShoppingItem) => Promise<void>;
  onDelete: (item: ShoppingItem) => Promise<void>;
}

const normalizeTags = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 10);

const formatRecurrence = (minutes: number, t: (key: string, opts?: Record<string, unknown>) => string) => {
  if (minutes % (60 * 24) === 0) {
    return t("shopping.recurrenceEveryDays", { count: minutes / (60 * 24) });
  }

  if (minutes % 60 === 0) {
    return t("shopping.recurrenceEveryHours", { count: minutes / 60 });
  }

  return t("shopping.recurrenceEveryMinutes", { count: minutes });
};

const userLabel = (memberId: string, ownUserId: string, ownLabel: string) =>
  memberId === ownUserId ? ownLabel : memberId.slice(0, 8);

export const ShoppingTab = ({ items, completions, userId, busy, onAdd, onToggle, onDelete }: ShoppingTabProps) => {
  const { t, i18n } = useTranslation();
  const [title, setTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [recurrenceValue, setRecurrenceValue] = useState("");
  const [recurrenceUnit, setRecurrenceUnit] = useState<RecurrenceUnit>("hours");

  const locale = getDateLocale(i18n.resolvedLanguage ?? i18n.language);

  const unitOptions: Array<{ id: RecurrenceUnit; label: string }> = useMemo(
    () => [
      { id: "minutes", label: t("shopping.recurrenceUnitMinutes") },
      { id: "hours", label: t("shopping.recurrenceUnitHours") },
      { id: "days", label: t("shopping.recurrenceUnitDays") }
    ],
    [t]
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;

    const parsedValue = Number(recurrenceValue);
    const recurrenceMinutes = Number.isFinite(parsedValue) && parsedValue > 0
      ? Math.floor(parsedValue * recurrenceFactor[recurrenceUnit])
      : null;

    await onAdd(title, normalizeTags(tagsInput), recurrenceMinutes);
    setTitle("");
    setTagsInput("");
    setRecurrenceValue("");
    setRecurrenceUnit("hours");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("shopping.title")}</CardTitle>
        <CardDescription>{t("shopping.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="mb-4 space-y-2" onSubmit={onSubmit}>
          <div className="flex gap-2">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("shopping.placeholder")} />
            <Button type="submit" disabled={busy}>
              {t("common.add")}
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder={t("shopping.tagsPlaceholder")}
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                type="number"
                min="1"
                inputMode="numeric"
                value={recurrenceValue}
                onChange={(event) => setRecurrenceValue(event.target.value)}
                placeholder={t("shopping.recurrenceValuePlaceholder")}
              />
              <select
                className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={recurrenceUnit}
                onChange={(event) => setRecurrenceUnit(event.target.value as RecurrenceUnit)}
              >
                {unitOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>

        <ul className="space-y-2">
          {items.map((item) => {
            const nextOpenAt =
              item.done && item.done_at && item.recurrence_interval_minutes
                ? new Date(new Date(item.done_at).getTime() + item.recurrence_interval_minutes * 60_000)
                : null;

            return (
              <li
                key={item.id}
                className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 dark:border-slate-700 dark:bg-slate-800/70"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.done}
                    className="h-5 w-5 accent-brand-700"
                    onChange={() => onToggle(item)}
                  />
                  <span
                    className={
                      item.done ? "flex-1 text-slate-400 line-through" : "flex-1 text-slate-800 dark:text-slate-100"
                    }
                  >
                    {item.title}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(item)} aria-label={t("shopping.deleteItem")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <Badge key={`${item.id}-${tag}`} className="text-[10px]">
                      #{tag}
                    </Badge>
                  ))}

                  {item.recurrence_interval_minutes ? (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                      {t("shopping.recursAfter", {
                        value: formatRecurrence(item.recurrence_interval_minutes, t)
                      })}
                    </Badge>
                  ) : null}
                </div>

                {item.done_at ? (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {t("shopping.doneAt", {
                      value: new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeStyle: "short"
                      }).format(new Date(item.done_at))
                    })}
                  </p>
                ) : null}

                {nextOpenAt ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("shopping.reopensAt", {
                      value: new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeStyle: "short"
                      }).format(nextOpenAt)
                    })}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>

        {items.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("shopping.empty")}</p> : null}

        <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="mb-2 text-sm font-semibold text-brand-900 dark:text-brand-100">{t("shopping.historyTitle")}</p>
          {completions.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("shopping.historyEmpty")}</p> : null}

          {completions.length > 0 ? (
            <ul className="space-y-2">
              {completions.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-lg border border-brand-100 bg-white/90 p-2 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{entry.title_snapshot}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeStyle: "short"
                      }).format(new Date(entry.completed_at))}
                    </p>
                  </div>

                  {entry.tags_snapshot.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {entry.tags_snapshot.map((tag) => (
                        <Badge key={`${entry.id}-${tag}`} className="text-[10px]">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("shopping.historyBy", { value: userLabel(entry.completed_by, userId, t("common.you")) })}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};
