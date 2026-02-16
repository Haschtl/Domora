import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from "chart.js";
import { Loader2, MoreHorizontal, Plus } from "lucide-react";
import { Bar, Line } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import { Checkbox } from "../../components/ui/checkbox";
import type { HouseholdMember, ShoppingItem, ShoppingItemCompletion, ShoppingRecurrenceUnit } from "../../lib/types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { InputWithSuffix } from "../../components/ui/input-with-suffix";
import { Label } from "../../components/ui/label";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { useSmartSuggestions } from "../../hooks/use-smart-suggestions";
import { addRecurringIntervalToIso, formatDateTime, formatShortDay } from "../../lib/date";
import { createMemberLabelGetter } from "../../lib/member-label";
import { suggestCategoryLabel } from "../../lib/category-heuristics";
import { useShoppingSuggestions, type ShoppingSuggestion } from "../../features/hooks/use-shopping-suggestions";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

interface ShoppingPageProps {
  section?: "list" | "history";
  items: ShoppingItem[];
  completions: ShoppingItemCompletion[];
  members: HouseholdMember[];
  userId: string;
  busy: boolean;
  mobileTabBarVisible?: boolean;
  onAdd: (
    title: string,
    tags: string[],
    recurrenceInterval: { value: number; unit: ShoppingRecurrenceUnit } | null
  ) => Promise<void>;
  onToggle: (item: ShoppingItem) => Promise<void>;
  onUpdate: (
    item: ShoppingItem,
    input: {
      title: string;
      tags: string[];
      recurrenceInterval: { value: number; unit: ShoppingRecurrenceUnit } | null;
    }
  ) => Promise<void>;
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

export const ShoppingPage = ({
  section = "list",
  items,
  completions,
  members,
  userId,
  busy,
  mobileTabBarVisible = true,
  onAdd,
  onToggle,
  onUpdate,
  onDelete
}: ShoppingPageProps) => {
  const { t, i18n } = useTranslation();
  const [recurrenceUnit, setRecurrenceUnit] = useState<ShoppingRecurrenceUnit>("days");
  const [editRecurrenceUnit, setEditRecurrenceUnit] = useState<ShoppingRecurrenceUnit>("days");
  const [showCompletedItems, setShowCompletedItems] = useState(false);
  const [itemPendingDelete, setItemPendingDelete] = useState<ShoppingItem | null>(null);
  const [itemBeingEdited, setItemBeingEdited] = useState<ShoppingItem | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [togglingItemIds, setTogglingItemIds] = useState<Set<string>>(() => new Set());
  const [addItemTagsTouched, setAddItemTagsTouched] = useState(false);
  const [isMobileComposer, setIsMobileComposer] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false
  );
  const addItemComposerContainerRef = useRef<HTMLDivElement | null>(null);
  const addItemRowRef = useRef<HTMLDivElement | null>(null);
  const [addItemPopoverWidth, setAddItemPopoverWidth] = useState(320);
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
      setAddItemTagsTouched(false);
    }
  });
  const handleToggleItem = async (item: ShoppingItem) => {
    if (togglingItemIds.has(item.id)) return;
    setTogglingItemIds((current) => {
      const next = new Set(current);
      next.add(item.id);
      return next;
    });
    try {
      await onToggle(item);
    } finally {
      setTogglingItemIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };
  const editForm = useForm({
    defaultValues: {
      title: "",
      tagsInput: "",
      recurrenceValue: ""
    },
    onSubmit: async ({
      value
    }: {
      value: { title: string; tagsInput: string; recurrenceValue: string };
    }) => {
      if (!itemBeingEdited) return;
      if (!value.title.trim()) return;

      const parsedValue = Number(value.recurrenceValue);
      const recurrenceInterval =
        Number.isFinite(parsedValue) && parsedValue > 0
          ? {
              value: Math.floor(parsedValue),
              unit: editRecurrenceUnit
            }
          : null;

      await onUpdate(itemBeingEdited, {
        title: value.title,
        tags: normalizeTags(value.tagsInput),
        recurrenceInterval
      });
      setEditDialogOpen(false);
      setItemBeingEdited(null);
      setEditRecurrenceUnit("days");
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
  const latestItemByTitle = useMemo(() => {
    const byTitle = new Map<string, ShoppingItem>();
    const sortedItems = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
    sortedItems.forEach((item) => {
      const key = item.title.trim().toLocaleLowerCase();
      if (!key || byTitle.has(key)) return;
      byTitle.set(key, item);
    });
    return byTitle;
  }, [items]);

  const applySuggestion = (suggestion: ShoppingSuggestion) => {
    form.setFieldValue("title", suggestion.title);
    const matchedItem = latestItemByTitle.get(suggestion.title.trim().toLocaleLowerCase());

    const tagsToApply = matchedItem ? matchedItem.tags : suggestion.tags;
    form.setFieldValue("tagsInput", tagsToApply.join(", "));
    setAddItemTagsTouched(false);

    if (matchedItem?.recurrence_interval_value && matchedItem.recurrence_interval_unit) {
      form.setFieldValue("recurrenceValue", String(matchedItem.recurrence_interval_value));
      setRecurrenceUnit(matchedItem.recurrence_interval_unit);
    } else {
      form.setFieldValue("recurrenceValue", "");
      setRecurrenceUnit("days");
    }
  };
  const tryAutofillTagsFromTitle = (titleValue: string) => {
    const normalizedTitle = titleValue.trim().toLocaleLowerCase();
    if (!normalizedTitle) return;
    if (form.state.values.tagsInput.trim().length > 0) return;

    const matchedItem = latestItemByTitle.get(normalizedTitle);
    if (matchedItem && matchedItem.tags.length > 0) {
      form.setFieldValue("tagsInput", matchedItem.tags.join(", "));
      return;
    }

    const matchedSuggestion = allSuggestions.find((entry) => entry.title.trim().toLocaleLowerCase() === normalizedTitle);
    if (matchedSuggestion && matchedSuggestion.tags.length > 0) {
      form.setFieldValue("tagsInput", matchedSuggestion.tags.join(", "));
      return;
    }

    if (!addItemTagsTouched) {
      const suggestion = suggestCategoryLabel(titleValue, language);
      if (suggestion) {
        form.setFieldValue("tagsInput", suggestion);
      }
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
  const whoBuysWhatSeries = useMemo(() => {
    const titleCountsByMember = new Map<string, Map<string, number>>();
    const uniqueMemberIds = new Set<string>();

    completions.forEach((entry) => {
      const title = entry.title_snapshot.trim() || t("shopping.fallbackItemTitle");
      const byMember = titleCountsByMember.get(title) ?? new Map<string, number>();
      byMember.set(entry.completed_by, (byMember.get(entry.completed_by) ?? 0) + 1);
      titleCountsByMember.set(title, byMember);
      uniqueMemberIds.add(entry.completed_by);
    });

    const topTitles = [...titleCountsByMember.entries()]
      .map(([title, counts]) => ({
        title,
        total: [...counts.values()].reduce((sum, count) => sum + count, 0)
      }))
      .sort((left, right) => right.total - left.total || left.title.localeCompare(right.title, language))
      .slice(0, 8);

    const labels = topTitles.map((entry) => entry.title);
    const memberIds = [...uniqueMemberIds].sort((left, right) => userLabel(left).localeCompare(userLabel(right), language));
    const colors = [
      "rgba(14, 116, 144, 0.75)",
      "rgba(21, 128, 61, 0.75)",
      "rgba(147, 51, 234, 0.75)",
      "rgba(217, 119, 6, 0.75)",
      "rgba(190, 24, 93, 0.75)",
      "rgba(37, 99, 235, 0.75)"
    ];

    const datasets = memberIds.map((memberId, index) => ({
      label: userLabel(memberId),
      data: topTitles.map((entry) => titleCountsByMember.get(entry.title)?.get(memberId) ?? 0),
      backgroundColor: colors[index % colors.length],
      borderRadius: 6,
      borderSkipped: false as const
    }));

    return { labels, datasets };
  }, [completions, language, t, userLabel]);

  useEffect(() => {
    const updateWidth = () => {
      const next =
        addItemComposerContainerRef.current?.getBoundingClientRect().width ??
        addItemRowRef.current?.getBoundingClientRect().width;
      if (!next || Number.isNaN(next)) return;
      setAddItemPopoverWidth(Math.max(220, Math.round(next)));
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [isMobileComposer]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const onChange = (event: MediaQueryListEvent) => setIsMobileComposer(event.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const showList = section === "list";
  const showHistory = section === "history";
  const openItemsCount = useMemo(() => items.filter((item) => !item.done).length, [items]);
  const completedItemsCount = useMemo(() => items.filter((item) => item.done).length, [items]);
  const visibleItems = useMemo(
    () => (showCompletedItems ? items : items.filter((item) => !item.done)),
    [items, showCompletedItems]
  );
  const onStartEditItem = (item: ShoppingItem) => {
    setItemBeingEdited(item);
    editForm.setFieldValue("title", item.title);
    editForm.setFieldValue("tagsInput", item.tags.join(", "));
    editForm.setFieldValue("recurrenceValue", item.recurrence_interval_value ? String(item.recurrence_interval_value) : "");
    setEditRecurrenceUnit(item.recurrence_interval_unit ?? "days");
    setEditDialogOpen(true);
  };
  const renderAddItemComposer = (mobile: boolean) => (
    <form
      className={mobile ? "space-y-0" : "space-y-2"}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className="flex items-end">
        <form.Field
          name="title"
          children={(field: {
            state: { value: string };
            handleChange: (value: string) => void;
          }) => (
            <Popover open={titleFocused && suggestions.length > 0}>
              <div className="relative flex-1 space-y-1">
                <Label className={mobile ? "sr-only" : ""}>
                  {t("shopping.itemLabel")}
                </Label>
                <PopoverAnchor asChild>
                  <div>
                    <Popover>
                      <PopoverAnchor asChild>
                        <div
                          ref={addItemRowRef}
                          className="flex h-10 items-stretch overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-slate-700 dark:bg-slate-900 focus-within:border-brand-500 focus-within:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.45)] dark:focus-within:border-slate-500 dark:focus-within:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]"
                        >
                          <Input
                            value={field.state.value}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              field.handleChange(nextValue);
                              tryAutofillTagsFromTitle(nextValue);
                            }}
                            onFocus={onTitleFocus}
                            onBlur={(event) => {
                              onTitleBlur();
                              tryAutofillTagsFromTitle(event.target.value);
                            }}
                            onKeyDown={onTitleKeyDown}
                            placeholder={t("shopping.placeholder")}
                            autoComplete="off"
                            className="h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                          />
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-full w-10 shrink-0 rounded-none border-l border-brand-200 p-0 dark:border-slate-700"
                              aria-label={t("shopping.moreOptions")}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <Button
                            type="submit"
                            disabled={busy}
                            className="h-full shrink-0 rounded-none border-l border-brand-200 px-3 dark:border-slate-700"
                          >
                            <Plus className="h-4 w-4 sm:hidden" />
                            <span className="hidden sm:inline">
                              {t("common.add")}
                            </span>
                          </Button>
                        </div>
                      </PopoverAnchor>
                      <PopoverContent
                        align="start"
                        side={mobile ? "top" : "bottom"}
                        sideOffset={12}
                        className="w-auto -translate-x-1.5 space-y-3 rounded-xl border-brand-100 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 dark:border-slate-700"
                        style={{ width: `${addItemPopoverWidth}px` }}
                      >
                        <form.Field
                          name="tagsInput"
                          children={(tagField: {
                            state: { value: string };
                            handleChange: (value: string) => void;
                          }) => (
                            <div className="space-y-1">
                              <Label>{t("shopping.tagsLabel")}</Label>
                              <Input
                                value={tagField.state.value}
                                onChange={(event) => {
                                  tagField.handleChange(event.target.value);
                                  setAddItemTagsTouched(true);
                                }}
                                placeholder={t("shopping.tagsPlaceholder")}
                              />
                            </div>
                          )}
                        />
                        <div className="space-y-1">
                          <form.Field
                            name="recurrenceValue"
                            children={(recurrenceField: {
                              state: { value: string };
                              handleChange: (value: string) => void;
                            }) => (
                              <div className="space-y-1">
                                <Label>
                                  {t("shopping.recurrenceValueLabel")}
                                </Label>
                                <InputWithSuffix
                                  suffix={
                                    <Select
                                      value={recurrenceUnit}
                                      onValueChange={(value: string) =>
                                        setRecurrenceUnit(
                                          value as ShoppingRecurrenceUnit,
                                        )
                                      }
                                    >
                                      <SelectTrigger className="h-7 w-[110px] border-brand-200 bg-white/95 px-2 text-xs dark:border-slate-700 dark:bg-slate-900">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent
                                        side={mobile ? "top" : "bottom"}
                                      >
                                        {unitOptions.map((option) => (
                                          <SelectItem
                                            key={option.id}
                                            value={option.id}
                                          >
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  }
                                  type="number"
                                  min="1"
                                  inputMode="numeric"
                                  value={recurrenceField.state.value}
                                  onChange={(event) =>
                                    recurrenceField.handleChange(
                                      event.target.value,
                                    )
                                  }
                                  placeholder={t(
                                    "shopping.recurrenceValuePlaceholder",
                                  )}
                                  interactiveSuffix
                                  suffixContainerClassName="right-1"
                                  inputClassName="pr-[7.75rem]"
                                />
                              </div>
                            )}
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </PopoverAnchor>
                <PopoverContent
                  align="start"
                  side={mobile ? "top" : "bottom"}
                  sideOffset={10}
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  onCloseAutoFocus={(event) => event.preventDefault()}
                  className="w-[var(--radix-popover-trigger-width)] rounded-xl border border-brand-100 bg-white p-1 shadow-lg duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 dark:border-slate-700 dark:bg-slate-900"
                >
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("shopping.suggestionsTitle")}
                  </p>
                  <ul className="max-h-56 overflow-y-auto">
                    {suggestions.map(
                      (suggestion: ShoppingSuggestion, index: number) => (
                        <li key={suggestion.key}>
                          <button
                            type="button"
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-brand-50/80 dark:hover:bg-slate-800/70 ${
                              index === activeSuggestionIndex
                                ? "bg-brand-100/20"
                                : ""
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
                                {t("shopping.suggestionBoughtCount", {
                                  count: suggestion.count,
                                })}
                              </Badge>
                            ) : (
                              <Badge className="text-[10px]">
                                {t("shopping.suggestionLibraryBadge")}
                              </Badge>
                            )}
                          </button>
                        </li>
                      ),
                    )}
                  </ul>
                </PopoverContent>
              </div>
            </Popover>
          )}
        />
      </div>
    </form>
  );

  if (showList) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{t("shopping.title")}</CardTitle>
              <Badge>{t("shopping.openCount", { count: openItemsCount })}</Badge>
            </div>
            <CardDescription>{t("shopping.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {!isMobileComposer ? renderAddItemComposer(false) : null}
          </CardContent>
        </Card>

        <div className={isMobileComposer ? "pb-40" : ""}>
          {completedItemsCount > 0 ? (
            <div className="mb-2 flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowCompletedItems((prev) => !prev)}
              >
                {showCompletedItems
                  ? t("shopping.hideCompleted")
                  : t("shopping.showCompleted", { count: completedItemsCount })}
              </Button>
            </div>
          ) : null}
          <ul className="space-y-2">
            {visibleItems.map((item) => {
              const nextOpenAt =
                item.done && item.done_at && item.recurrence_interval_value && item.recurrence_interval_unit
                  ? addRecurringIntervalToIso(item.done_at, item.recurrence_interval_value, item.recurrence_interval_unit)
                  : null;
              const isToggling = togglingItemIds.has(item.id);

              return (
                <li
                  key={item.id}
                  className={`relative z-0 rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 ${
                    isToggling
                      ? "ring-2 ring-amber-300/80 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.35)] opacity-80 cursor-wait"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={item.done}
                      disabled={busy || isToggling}
                      onCheckedChange={() => void handleToggleItem(item)}
                    />
                    {isToggling ? (
                      <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                    ) : null}
                    <span
                      className={
                        item.done
                          ? "flex-1 text-slate-400 line-through"
                          : "flex-1 text-slate-800 dark:text-slate-100"
                      }
                    >
                      {item.title}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t("shopping.itemActions")}
                          disabled={busy}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onStartEditItem(item)}>
                          {t("shopping.editItem")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setItemPendingDelete(item)}
                          className="text-rose-600 dark:text-rose-300"
                        >
                          {t("shopping.removeItem")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <Badge key={`${item.id}-${tag}`} className="text-[10px]">
                        #{tag}
                      </Badge>
                    ))}

                    {item.recurrence_interval_value &&
                    item.recurrence_interval_unit ? (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                        {t("shopping.recursAfter", {
                          value: formatRecurrence(
                            item.recurrence_interval_value,
                            item.recurrence_interval_unit,
                            t,
                          ),
                        })}
                      </Badge>
                    ) : null}
                  </div>

                  {item.done_at ? (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {t("shopping.doneAt", {
                        value: formatDateTime(item.done_at, language),
                      })}
                    </p>
                  ) : null}

                  {nextOpenAt ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("shopping.reopensAt", {
                        value: formatDateTime(nextOpenAt, language),
                      })}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {visibleItems.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("shopping.empty")}</p> : null}
        </div>
        <Dialog open={itemPendingDelete !== null} onOpenChange={(open) => !open && setItemPendingDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("shopping.deleteConfirmTitle")}</DialogTitle>
              <DialogDescription>
                {t("shopping.deleteConfirmDescription", { title: itemPendingDelete?.title ?? "" })}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">{t("common.cancel")}</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (!itemPendingDelete) return;
                    void onDelete(itemPendingDelete);
                    setItemPendingDelete(null);
                  }}
                >
                  {t("shopping.deleteConfirmAction")}
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) {
              setItemBeingEdited(null);
              setEditRecurrenceUnit("days");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("shopping.editItemTitle")}</DialogTitle>
              <DialogDescription>{t("shopping.editItemDescription")}</DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void editForm.handleSubmit();
              }}
            >
              <editForm.Field
                name="title"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <div className="space-y-1">
                    <Label>{t("shopping.itemLabel")}</Label>
                    <Input value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} required />
                  </div>
                )}
              />
              <editForm.Field
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
              <editForm.Field
                name="recurrenceValue"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <div className="space-y-1">
                    <Label>{t("shopping.recurrenceValueLabel")}</Label>
                    <InputWithSuffix
                      suffix={
                        <Select
                          value={editRecurrenceUnit}
                          onValueChange={(value: string) => setEditRecurrenceUnit(value as ShoppingRecurrenceUnit)}
                        >
                          <SelectTrigger className="h-7 w-[110px] border-brand-200 bg-white/95 px-2 text-xs dark:border-slate-700 dark:bg-slate-900">
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
                      }
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder={t("shopping.recurrenceValuePlaceholder")}
                      interactiveSuffix
                      suffixContainerClassName="right-1"
                      inputClassName="pr-[7.75rem]"
                    />
                  </div>
                )}
              />
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="ghost">{t("common.cancel")}</Button>
                </DialogClose>
                <Button type="submit" disabled={busy}>
                  {t("shopping.saveItem")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        {isMobileComposer ? (
          <div
            className={`fixed inset-x-0 z-40 px-3 sm:hidden ${
              mobileTabBarVisible
                ? "bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]"
                : "bottom-[calc(env(safe-area-inset-bottom)+0.2rem)]"
            }`}
          >
            <div
              ref={addItemComposerContainerRef}
              className="rounded-2xl border border-brand-200/70 bg-white/75 p-1.5 shadow-xl backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/75"
            >
              {renderAddItemComposer(true)}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

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
                <Popover open={titleFocused && suggestions.length > 0}>
                  <div className="relative flex-1 space-y-1">
                    <Label>{t("shopping.itemLabel")}</Label>
                    <PopoverAnchor asChild>
                      <Input
                        value={field.state.value}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          field.handleChange(nextValue);
                          tryAutofillTagsFromTitle(nextValue);
                        }}
                        onFocus={onTitleFocus}
                        onBlur={(event) => {
                          onTitleBlur();
                          tryAutofillTagsFromTitle(event.target.value);
                        }}
                        onKeyDown={onTitleKeyDown}
                        placeholder={t("shopping.placeholder")}
                        autoComplete="off"
                      />
                    </PopoverAnchor>
                    <PopoverContent
                      align="start"
                      side="bottom"
                      sideOffset={6}
                      onOpenAutoFocus={(event) => event.preventDefault()}
                      onCloseAutoFocus={(event) => event.preventDefault()}
                      className="w-[var(--radix-popover-trigger-width)] rounded-xl border border-brand-100 bg-white p-1 shadow-lg duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t("shopping.suggestionsTitle")}
                      </p>
                      <ul className="max-h-56 overflow-y-auto">
                        {suggestions.map((suggestion: ShoppingSuggestion, index: number) => (
                          <li key={suggestion.key}>
                        <button
                          type="button"
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-brand-50/80 dark:hover:bg-slate-800/70 ${
                            index === activeSuggestionIndex
                              ? "bg-brand-100/70 dark:bg-slate-700/70"
                              : ""
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
                    </PopoverContent>
                  </div>
                </Popover>
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
                    onChange={(event) => {
                      field.handleChange(event.target.value);
                      setAddItemTagsTouched(true);
                    }}
                    placeholder={t("shopping.tagsPlaceholder")}
                  />
                </div>
              )}
            />
            <div className="space-y-1">
              <form.Field
                name="recurrenceValue"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <div className="space-y-1">
                    <Label>{t("shopping.recurrenceValueLabel")}</Label>
                    <InputWithSuffix
                      suffix={
                        <Select
                          value={recurrenceUnit}
                          onValueChange={(value: string) => setRecurrenceUnit(value as ShoppingRecurrenceUnit)}
                        >
                          <SelectTrigger className="h-7 w-[110px] border-brand-200 bg-white/95 px-2 text-xs dark:border-slate-700 dark:bg-slate-900">
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
                      }
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder={t("shopping.recurrenceValuePlaceholder")}
                      interactiveSuffix
                      suffixContainerClassName="right-1"
                      inputClassName="pr-[7.75rem]"
                    />
                  </div>
                )}
              />
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
            const isToggling = togglingItemIds.has(item.id);

            return (
              <li
                key={item.id}
                className={`rounded-xl border border-brand-100 bg-white p-3 transition dark:border-slate-700 dark:bg-slate-900 ${
                  isToggling ? "ring-2 ring-amber-300/80 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.35)] opacity-80 cursor-wait" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={item.done}
                    disabled={busy || isToggling}
                    onCheckedChange={() => void handleToggleItem(item)}
                  />
                  {isToggling ? <Loader2 className="h-4 w-4 animate-spin text-amber-500" /> : null}
                  <span
                    className={
                      item.done ? "flex-1 text-slate-400 line-through" : "flex-1 text-slate-800 dark:text-slate-100"
                    }
                  >
                    {item.title}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(item)} aria-label={t("shopping.deleteItem")}>
                    <MoreHorizontal className="h-4 w-4" />
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
          <>
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
            {whoBuysWhatSeries.labels.length > 0 ? (
              <div className="mb-3 rounded-lg bg-white p-2 dark:bg-slate-900">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("shopping.whoBuysWhatChartTitle")}
                </p>
                <div className="h-[260px]">
                  <Bar
                    data={{
                      labels: whoBuysWhatSeries.labels,
                      datasets: whoBuysWhatSeries.datasets
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: "bottom" as const }
                      },
                      scales: {
                        x: {
                          stacked: true
                        },
                        y: {
                          stacked: true,
                          beginAtZero: true,
                          ticks: { precision: 0 }
                        }
                      }
                    }}
                  />
                </div>
              </div>
            ) : null}
            {completions.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("shopping.historyEmpty")}</p>
            ) : null}

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
          </>
        ) : null}
      </CardContent>
    </Card>
  );
};
