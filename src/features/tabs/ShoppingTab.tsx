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
import type { HouseholdMember, ShoppingItem, ShoppingItemCompletion, ShoppingRecurrenceUnit } from "../../lib/types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useSmartSuggestions } from "../../hooks/use-smart-suggestions";
import { addRecurringIntervalToIso, formatDateTime, formatShortDay } from "../../lib/date";
import { createMemberLabelGetter } from "../../lib/member-label";
import { useShoppingSuggestions, type ShoppingSuggestion } from "./hooks/use-shopping-suggestions";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface ShoppingTabProps {
  section?: "list" | "history";
  items: ShoppingItem[];
  completions: ShoppingItemCompletion[];
  members: HouseholdMember[];
  userId: string;
  busy: boolean;
  onAdd: (
    title: string,
    tags: string[],
    recurrenceInterval: { value: number; unit: ShoppingRecurrenceUnit } | null
  ) => Promise<void>;
  onToggle: (item: ShoppingItem) => Promise<void>;
  onDelete: (item: ShoppingItem) => Promise<void>;
}

const normalizeTags = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 10);

const formatRecurrence = (
  value: number,
  unit: ShoppingRecurrenceUnit,
  t: (key: string, opts?: Record<string, unknown>) => string
) => {
  if (unit === "months") return t("shopping.recurrenceEveryMonths", { count: value });
  if (unit === "weeks") return t("shopping.recurrenceEveryWeeks", { count: value });
  return t("shopping.recurrenceEveryDays", { count: value });
};

export const ShoppingTab = ({
  section = "list",
  items,
  completions,
  members,
  userId,
  busy,
  onAdd,
  onToggle,
  onDelete
}: ShoppingTabProps) => {
  const { t, i18n } = useTranslation();
  const [recurrenceUnit, setRecurrenceUnit] = useState<ShoppingRecurrenceUnit>("days");
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
      const recurrenceInterval =
        Number.isFinite(parsedValue) && parsedValue > 0
          ? {
              value: Math.floor(parsedValue),
              unit: recurrenceUnit
            }
          : null;

      await onAdd(value.title, normalizeTags(value.tagsInput), recurrenceInterval);
      formApi.reset();
      setRecurrenceUnit("days");
    }
  });

  const language = i18n.resolvedLanguage ?? i18n.language;
  const titleQuery = form.state.values.title.trim();

  const allSuggestions = useShoppingSuggestions(completions, language);
  const userLabel = useMemo(
    () =>
      createMemberLabelGetter({
        members,
        currentUserId: userId,
        youLabel: t("common.you"),
        youLabels: {
          nominative: t("common.youNominative"),
          dative: t("common.youDative"),
          accusative: t("common.youAccusative")
        },
        fallbackLabel: t("common.memberFallback")
      }),
    [members, t, userId]
  );

  const applySuggestion = (suggestion: ShoppingSuggestion) => {
    form.setFieldValue("title", suggestion.title);
    if (!form.state.values.tagsInput.trim() && suggestion.tags.length > 0) {
      form.setFieldValue("tagsInput", suggestion.tags.join(", "));
    }
  };
  const {
    suggestions,
    focused: titleFocused,
    activeSuggestionIndex,
    onFocus: onTitleFocus,
    onBlur: onTitleBlur,
    onKeyDown: onTitleKeyDown,
    applySuggestion: onSelectSuggestion
  } = useSmartSuggestions<ShoppingSuggestion>({
    items: allSuggestions,
    query: titleQuery,
    getLabel: (entry) => entry.title,
    onApply: applySuggestion,
    fuseOptions: {
      keys: [
        { name: "title", weight: 0.85 },
        { name: "tags", weight: 0.15 }
      ],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 2
    }
  });

  const unitOptions: Array<{ id: ShoppingRecurrenceUnit; label: string }> = useMemo(
    () => [
      { id: "days", label: t("shopping.recurrenceUnitDays") },
      { id: "weeks", label: t("shopping.recurrenceUnitWeeks") },
      { id: "months", label: t("shopping.recurrenceUnitMonths") }
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
  const recurrenceUnitLabel =
    unitOptions.find((option) => option.id === recurrenceUnit)?.label ?? t("shopping.recurrenceUnitDays");
  const showList = section === "list";
  const showHistory = section === "history";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{showHistory ? t("shopping.historyTitle") : t("shopping.title")}</CardTitle>
        <CardDescription>{showHistory ? t("shopping.historyDescription") : t("shopping.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {showList ? (
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
                <div className="relative flex-1 space-y-1">
                  <Label>{t("shopping.itemLabel")}</Label>
                  <Input
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onFocus={onTitleFocus}
                    onBlur={onTitleBlur}
                    onKeyDown={onTitleKeyDown}
                    placeholder={t("shopping.placeholder")}
                    autoComplete="off"
                  />
                  {titleFocused && suggestions.length > 0 ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 rounded-xl border border-brand-100 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t("shopping.suggestionsTitle")}
                      </p>
                      <ul className="max-h-56 overflow-y-auto">
                        {suggestions.map((suggestion: ShoppingSuggestion, index: number) => (
                          <li key={suggestion.key}>
                            <button
                              type="button"
                              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-brand-50 dark:hover:bg-slate-800 ${
                                index === activeSuggestionIndex ? "bg-brand-50 dark:bg-slate-800" : ""
                              }`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                onSelectSuggestion(suggestion);
                              }}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {suggestion.title}
                                </p>
                                {suggestion.tags.length > 0 ? (
                                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                    #{suggestion.tags.join(" #")}
                                  </p>
                                ) : null}
                              </div>
                              {suggestion.source === "history" ? (
                                <Badge className="text-[10px]">
                                  {t("shopping.suggestionBoughtCount", { count: suggestion.count })}
                                </Badge>
                              ) : (
                                <Badge className="text-[10px]">{t("shopping.suggestionLibraryBadge")}</Badge>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
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
                <div className="space-y-1">
                  <Label>{t("shopping.tagsLabel")}</Label>
                  <Input
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("shopping.tagsPlaceholder")}
                  />
                </div>
              )}
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <form.Field
                name="recurrenceValue"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <div className="space-y-1">
                    <Label>{t("shopping.recurrenceValueLabel")}</Label>
                    <div className="relative">
                      <Input
                        className="pr-16"
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder={t("shopping.recurrenceValuePlaceholder")}
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 dark:text-slate-400">
                        {recurrenceUnitLabel}
                      </span>
                    </div>
                  </div>
                )}
              />
              <div className="space-y-1">
                <Label>{t("shopping.recurrenceUnitLabel")}</Label>
                <Select
                  value={recurrenceUnit}
                  onValueChange={(value: string) => setRecurrenceUnit(value as ShoppingRecurrenceUnit)}
                >
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
          </div>
          </form>
        ) : null}

        {showList ? (
          <ul className="space-y-2">
            {items.map((item) => {
            const nextOpenAt =
              item.done && item.done_at && item.recurrence_interval_value && item.recurrence_interval_unit
                ? addRecurringIntervalToIso(item.done_at, item.recurrence_interval_value, item.recurrence_interval_unit)
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

                  {item.recurrence_interval_value && item.recurrence_interval_unit ? (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                      {t("shopping.recursAfter", {
                        value: formatRecurrence(item.recurrence_interval_value, item.recurrence_interval_unit, t)
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
        ) : null}

        {showList && items.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("shopping.empty")}</p> : null}

        {showHistory ? (
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
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
                    {t("shopping.historyBy", { value: userLabel(entry.completed_by) })}
                  </p>
                </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
