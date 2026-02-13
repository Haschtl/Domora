import { useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from "chart.js";
import { Trash2 } from "lucide-react";
import { Line } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import { Checkbox } from "../../components/ui/checkbox";
import type { ShoppingItem, ShoppingItemCompletion } from "../../lib/types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { addMinutesToIso, formatDateTime, formatShortDay } from "../../lib/date";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

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
  const [recurrenceUnit, setRecurrenceUnit] = useState<RecurrenceUnit>("hours");
  const form = useForm({
    defaultValues: {
      title: "",
      tagsInput: "",
      recurrenceValue: ""
    },
    onSubmit: async ({
      value,
      formApi
    }: {
      value: { title: string; tagsInput: string; recurrenceValue: string };
      formApi: { reset: () => void };
    }) => {
      if (!value.title.trim()) return;

      const parsedValue = Number(value.recurrenceValue);
      const recurrenceMinutes =
        Number.isFinite(parsedValue) && parsedValue > 0 ? Math.floor(parsedValue * recurrenceFactor[recurrenceUnit]) : null;

      await onAdd(value.title, normalizeTags(value.tagsInput), recurrenceMinutes);
      formApi.reset();
      setRecurrenceUnit("hours");
    }
  });

  const language = i18n.resolvedLanguage ?? i18n.language;

  const unitOptions: Array<{ id: RecurrenceUnit; label: string }> = useMemo(
    () => [
      { id: "minutes", label: t("shopping.recurrenceUnitMinutes") },
      { id: "hours", label: t("shopping.recurrenceUnitHours") },
      { id: "days", label: t("shopping.recurrenceUnitDays") }
    ],
    [t]
  );

  const completionSeries = useMemo(() => {
    const byDay = new Map<string, number>();
    completions.forEach((entry) => {
      const day = entry.completed_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    });

    const labels = [...byDay.keys()].sort();
    const values = labels.map((label) => byDay.get(label) ?? 0);

    return {
      labels: labels.map((label) => formatShortDay(label, language, label)),
      values
    };
  }, [completions, language]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("shopping.title")}</CardTitle>
        <CardDescription>{t("shopping.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="mb-4 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <div className="flex gap-2">
            <form.Field
              name="title"
              children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                <Input
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={t("shopping.placeholder")}
                />
              )}
            />
            <Button type="submit" disabled={busy}>
              {t("common.add")}
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <form.Field
              name="tagsInput"
              children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                <Input
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={t("shopping.tagsPlaceholder")}
                />
              )}
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <form.Field
                name="recurrenceValue"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <Input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("shopping.recurrenceValuePlaceholder")}
                  />
                )}
              />
              <Select value={recurrenceUnit} onValueChange={(value: string) => setRecurrenceUnit(value as RecurrenceUnit)}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                {unitOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>

        <ul className="space-y-2">
          {items.map((item) => {
            const nextOpenAt =
              item.done && item.done_at && item.recurrence_interval_minutes
                ? addMinutesToIso(item.done_at, item.recurrence_interval_minutes)
                : null;

            return (
              <li
                key={item.id}
                className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 dark:border-slate-700 dark:bg-slate-800/70"
              >
                <div className="flex items-center gap-2">
                  <Checkbox checked={item.done} onCheckedChange={() => onToggle(item)} />
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
                      value: formatDateTime(item.done_at, language)
                    })}
                  </p>
                ) : null}

                {nextOpenAt ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("shopping.reopensAt", {
                      value: formatDateTime(nextOpenAt, language)
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
          {completionSeries.labels.length > 0 ? (
            <div className="mb-3 rounded-lg bg-white p-2 dark:bg-slate-900">
              <Line
                data={{
                  labels: completionSeries.labels,
                  datasets: [
                    {
                      label: t("shopping.historyChartLabel"),
                      data: completionSeries.values,
                      borderColor: "#0f766e",
                      backgroundColor: "rgba(15, 118, 110, 0.2)",
                      borderWidth: 2,
                      tension: 0.3,
                      fill: true
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: { precision: 0 }
                    }
                  }
                }}
                height={180}
              />
            </div>
          ) : null}
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
                      {formatDateTime(entry.completed_at, language)}
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
