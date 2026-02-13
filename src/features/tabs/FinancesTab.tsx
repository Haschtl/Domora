import { useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from "chart.js";
import { MoreHorizontal } from "lucide-react";
import { Doughnut, Line } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import type { FinanceEntry, HouseholdMember } from "../../lib/types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { SectionPanel } from "../../components/ui/section-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { getDateLocale } from "../../i18n";
import { formatDateOnly, formatShortDay } from "../../lib/date";
import { FinanceEntriesList } from "./components/FinanceEntriesList";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend);

interface FinancesTabProps {
  section?: "overview" | "stats" | "archive" | "subscriptions";
  entries: FinanceEntry[];
  members: HouseholdMember[];
  userId: string;
  busy: boolean;
  onAdd: (description: string, amount: number, category: string) => Promise<void>;
  onRequestCashAudit: () => Promise<void>;
}

const formatMoney = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR"
  }).format(value);

export const FinancesTab = ({
  section = "overview",
  entries,
  members,
  userId,
  busy,
  onAdd,
  onRequestCashAudit
}: FinancesTabProps) => {
  const { t, i18n } = useTranslation();
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const locale = getDateLocale(i18n.resolvedLanguage ?? i18n.language);
  const showOverview = section === "overview";
  const showStats = section === "stats";
  const showArchive = section === "archive";
  const showSubscriptions = section === "subscriptions";
  const addEntryForm = useForm({
    defaultValues: {
      description: "",
      category: "general",
      amount: ""
    },
    onSubmit: async ({
      value,
      formApi
    }: {
      value: { description: string; category: string; amount: string };
      formApi: { reset: () => void };
    }) => {
      const parsedAmount = Number(value.amount);
      if (!value.description.trim() || Number.isNaN(parsedAmount)) return;

      await onAdd(value.description, parsedAmount, value.category);
      formApi.reset();
    }
  });
  const archiveFilterForm = useForm({
    defaultValues: {
      filterFrom: "",
      filterTo: "",
      filterMember: "all",
      filterCategory: "all",
      searchText: ""
    },
    onSubmit: async () => {}
  });
  const archiveFilters = archiveFilterForm.state.values;

  const total = useMemo(() => entries.reduce((sum, entry) => sum + entry.amount, 0), [entries]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = archiveFilters.searchText.trim().toLowerCase();

    return entries.filter((entry) => {
      if (archiveFilters.filterMember !== "all" && entry.paid_by !== archiveFilters.filterMember) return false;
      if (archiveFilters.filterCategory !== "all" && entry.category !== archiveFilters.filterCategory) return false;

      const entryDay = entry.created_at.slice(0, 10);
      if (archiveFilters.filterFrom && entryDay < archiveFilters.filterFrom) return false;
      if (archiveFilters.filterTo && entryDay > archiveFilters.filterTo) return false;

      if (normalizedSearch && !entry.description.toLowerCase().includes(normalizedSearch)) return false;
      return true;
    });
  }, [archiveFilters, entries]);

  const filteredTotal = useMemo(
    () => filteredEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [filteredEntries]
  );

  const memberIds = useMemo(() => {
    const values = new Set<string>();
    members.forEach((member) => values.add(member.user_id));
    entries.forEach((entry) => values.add(entry.paid_by));
    return [...values];
  }, [members, entries]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    entries.forEach((entry) => values.add(entry.category));
    values.add("general");
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const byUser = useMemo(() => {
    const totals = new Map<string, number>();
    filteredEntries.forEach((entry) => {
      totals.set(entry.paid_by, (totals.get(entry.paid_by) ?? 0) + entry.amount);
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [filteredEntries]);

  const historySeries = useMemo(() => {
    const byDay = new Map<string, number>();
    filteredEntries.forEach((entry) => {
      const day = entry.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + entry.amount);
    });
    const labels = [...byDay.keys()].sort();
    const values = labels.map((label) => byDay.get(label) ?? 0);

    return {
      labels: labels.map((label) => formatShortDay(label, language, label)),
      values
    };
  }, [filteredEntries, language]);

  const categorySeries = useMemo(() => {
    const byCategory = new Map<string, number>();
    filteredEntries.forEach((entry) => {
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.amount);
    });
    const labels = [...byCategory.keys()];
    const values = labels.map((label) => byCategory.get(label) ?? 0);

    return { labels, values };
  }, [filteredEntries]);

  const memberLabel = (memberId: string) => (memberId === userId ? t("common.you") : memberId.slice(0, 8));
  const moneyLabel = (value: number) => formatMoney(value, locale);
  const paidByText = (entry: FinanceEntry) =>
    entry.paid_by === userId
      ? t("finances.paidByYou", {
          date: formatDateOnly(entry.created_at, language, entry.created_at.slice(0, 10))
        })
      : t("finances.paidByMember", {
          member: memberLabel(entry.paid_by),
          date: formatDateOnly(entry.created_at, language, entry.created_at.slice(0, 10))
        });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>{t("finances.title")}</CardTitle>
            <CardDescription>{t("finances.description")}</CardDescription>
          </div>
          <Badge>{formatMoney(total, locale)}</Badge>
        </div>
      </CardHeader>

      <CardContent>
        {showOverview ? (
          <>
            <form
              className="mb-4 grid gap-2 sm:grid-cols-[1fr_140px_120px_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void addEntryForm.handleSubmit();
              }}
            >
              <addEntryForm.Field
                name="description"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <Input
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("finances.descriptionPlaceholder")}
                    required
                  />
                )}
              />
              <addEntryForm.Field
                name="category"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <Input
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("finances.categoryPlaceholder")}
                  />
                )}
              />
              <addEntryForm.Field
                name="amount"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("finances.amountPlaceholder")}
                    required
                  />
                )}
              />
              <Button type="submit" disabled={busy}>
                {t("common.add")}
              </Button>
            </form>

            <Dialog open={auditDialogOpen} onOpenChange={setAuditDialogOpen}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" aria-label={t("common.trigger")}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setAuditDialogOpen(true)}>
                    {t("finances.startAudit")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("finances.auditDialogTitle")}</DialogTitle>
                  <DialogDescription>{t("finances.auditDialogDescription")}</DialogDescription>
                </DialogHeader>
                <div className="mt-4 flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="ghost">{t("common.cancel")}</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button
                      onClick={() => {
                        void onRequestCashAudit();
                      }}
                    >
                      {t("common.trigger")}
                    </Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>

            <FinanceEntriesList entries={entries} formatMoney={moneyLabel} paidByText={paidByText} />

            {entries.length === 0 ? <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t("finances.empty")}</p> : null}
          </>
        ) : null}

        {showStats ? (
          <>
            <SectionPanel>
              <p className="mb-2 text-sm font-semibold text-brand-900 dark:text-brand-100">{t("finances.historyTitle")}</p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {t("finances.filteredTotal", { value: formatMoney(filteredTotal, locale), count: filteredEntries.length })}
              </p>

              {historySeries.labels.length > 0 ? (
                <div className="mt-3 rounded-lg bg-white p-2 dark:bg-slate-900">
                  <Line
                    data={{
                      labels: historySeries.labels,
                      datasets: [
                        {
                          label: t("finances.chartDailyTotal"),
                          data: historySeries.values,
                          borderColor: "#7c3aed",
                          backgroundColor: "rgba(124, 58, 237, 0.18)",
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
                        y: { beginAtZero: true }
                      }
                    }}
                    height={170}
                  />
                </div>
              ) : null}

              {categorySeries.labels.length > 0 ? (
                <div className="mt-3 rounded-lg bg-white p-2 dark:bg-slate-900">
                  <Doughnut
                    data={{
                      labels: categorySeries.labels,
                      datasets: [
                        {
                          label: t("finances.chartCategoryShare"),
                          data: categorySeries.values,
                          backgroundColor: [
                            "rgba(37, 99, 235, 0.7)",
                            "rgba(16, 185, 129, 0.7)",
                            "rgba(124, 58, 237, 0.7)",
                            "rgba(245, 158, 11, 0.7)",
                            "rgba(239, 68, 68, 0.7)",
                            "rgba(14, 165, 233, 0.7)"
                          ]
                        }
                      ]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false
                    }}
                    height={210}
                  />
                </div>
              ) : null}
            </SectionPanel>

            {byUser.length > 0 ? (
              <SectionPanel className="mt-4">
                <p className="mb-2 text-sm font-semibold text-brand-900 dark:text-brand-100">{t("finances.byMember")}</p>
                <ul className="space-y-1 text-sm">
                  {byUser.map(([memberId, value]) => (
                    <li key={memberId} className="flex justify-between gap-2">
                      <span className={memberId === userId ? "font-medium" : "text-slate-600 dark:text-slate-300"}>
                        {memberLabel(memberId)}
                      </span>
                      <span>{moneyLabel(value)}</span>
                    </li>
                  ))}
                </ul>
              </SectionPanel>
            ) : null}
          </>
        ) : null}

        {showArchive ? (
          <>
            <SectionPanel>
              <p className="mb-2 text-sm font-semibold text-brand-900 dark:text-brand-100">{t("finances.historyTitle")}</p>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                }}
              >
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <archiveFilterForm.Field
                    name="filterFrom"
                    children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                      <Input
                        type="date"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        title={t("finances.filterFrom")}
                      />
                    )}
                  />
                  <archiveFilterForm.Field
                    name="filterTo"
                    children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                      <Input
                        type="date"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        title={t("finances.filterTo")}
                      />
                    )}
                  />
                  <archiveFilterForm.Field
                    name="filterMember"
                    children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                      <Select value={field.state.value} onValueChange={field.handleChange}>
                        <SelectTrigger aria-label={t("finances.filterByMember")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("finances.filterByMemberAll")}</SelectItem>
                        {memberIds.map((memberId) => (
                          <SelectItem key={memberId} value={memberId}>
                            {memberLabel(memberId)}
                          </SelectItem>
                        ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <archiveFilterForm.Field
                    name="filterCategory"
                    children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                      <Select value={field.state.value} onValueChange={field.handleChange}>
                        <SelectTrigger aria-label={t("finances.filterByCategory")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("finances.filterByCategoryAll")}</SelectItem>
                        {categories.map((entryCategory) => (
                          <SelectItem key={entryCategory} value={entryCategory}>
                            {entryCategory}
                          </SelectItem>
                        ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <archiveFilterForm.Field
                    name="searchText"
                    children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                      <Input
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder={t("finances.searchPlaceholder")}
                      />
                    )}
                  />
                </div>
              </form>

              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {t("finances.filteredTotal", { value: formatMoney(filteredTotal, locale), count: filteredEntries.length })}
              </p>
            </SectionPanel>

            <FinanceEntriesList entries={filteredEntries} formatMoney={moneyLabel} paidByText={paidByText} />
          </>
        ) : null}

        {showSubscriptions ? (
          <SectionPanel className="mt-4">
            <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">{t("finances.subscriptionsTitle")}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("finances.subscriptionsDescription")}</p>
          </SectionPanel>
        ) : null}

        {showArchive && entries.length > 0 && filteredEntries.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("finances.emptyFiltered")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
};
