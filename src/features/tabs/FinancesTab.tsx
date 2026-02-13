import { FormEvent, useMemo, useState } from "react";
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
  DialogTitle,
  DialogTrigger
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { getDateLocale } from "../../i18n";

interface FinancesTabProps {
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

export const FinancesTab = ({ entries, members, userId, busy, onAdd, onRequestCashAudit }: FinancesTabProps) => {
  const { t, i18n } = useTranslation();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [amount, setAmount] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterMember, setFilterMember] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchText, setSearchText] = useState("");
  const locale = getDateLocale(i18n.resolvedLanguage ?? i18n.language);

  const total = useMemo(() => entries.reduce((sum, entry) => sum + entry.amount, 0), [entries]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return entries.filter((entry) => {
      if (filterMember !== "all" && entry.paid_by !== filterMember) return false;
      if (filterCategory !== "all" && entry.category !== filterCategory) return false;

      const entryDay = entry.created_at.slice(0, 10);
      if (filterFrom && entryDay < filterFrom) return false;
      if (filterTo && entryDay > filterTo) return false;

      if (normalizedSearch && !entry.description.toLowerCase().includes(normalizedSearch)) return false;
      return true;
    });
  }, [entries, filterMember, filterCategory, filterFrom, filterTo, searchText]);

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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!description.trim() || Number.isNaN(parsedAmount)) return;

    await onAdd(description, parsedAmount, category);
    setDescription("");
    setCategory("general");
    setAmount("");
  };

  const memberLabel = (memberId: string) => (memberId === userId ? t("common.you") : memberId.slice(0, 8));

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
        <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_140px_120px_auto]" onSubmit={submit}>
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("finances.descriptionPlaceholder")}
            required
          />
          <Input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder={t("finances.categoryPlaceholder")}
          />
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={t("finances.amountPlaceholder")}
            required
          />
          <Button type="submit" disabled={busy}>
            {t("common.add")}
          </Button>
        </form>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">{t("finances.startAudit")}</Button>
          </DialogTrigger>
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
                <Button onClick={onRequestCashAudit}>{t("common.trigger")}</Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>

        <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="mb-2 text-sm font-semibold text-brand-900 dark:text-brand-100">{t("finances.historyTitle")}</p>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              type="date"
              value={filterFrom}
              onChange={(event) => setFilterFrom(event.target.value)}
              title={t("finances.filterFrom")}
            />
            <Input
              type="date"
              value={filterTo}
              onChange={(event) => setFilterTo(event.target.value)}
              title={t("finances.filterTo")}
            />
            <select
              className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={filterMember}
              onChange={(event) => setFilterMember(event.target.value)}
              aria-label={t("finances.filterByMember")}
            >
              <option value="all">{t("finances.filterByMemberAll")}</option>
              {memberIds.map((memberId) => (
                <option key={memberId} value={memberId}>
                  {memberLabel(memberId)}
                </option>
              ))}
            </select>
            <select
              className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={filterCategory}
              onChange={(event) => setFilterCategory(event.target.value)}
              aria-label={t("finances.filterByCategory")}
            >
              <option value="all">{t("finances.filterByCategoryAll")}</option>
              {categories.map((entryCategory) => (
                <option key={entryCategory} value={entryCategory}>
                  {entryCategory}
                </option>
              ))}
            </select>
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t("finances.searchPlaceholder")}
            />
          </div>

          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {t("finances.filteredTotal", { value: formatMoney(filteredTotal, locale), count: filteredEntries.length })}
          </p>
        </div>

        {byUser.length > 0 ? (
          <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="mb-2 text-sm font-semibold text-brand-900 dark:text-brand-100">{t("finances.byMember")}</p>
            <ul className="space-y-1 text-sm">
              {byUser.map(([memberId, value]) => (
                <li key={memberId} className="flex justify-between gap-2">
                    <span className={memberId === userId ? "font-medium" : "text-slate-600 dark:text-slate-300"}>
                    {memberLabel(memberId)}
                  </span>
                  <span>{formatMoney(value, locale)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ul className="mt-4 space-y-2">
          {filteredEntries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-brand-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{entry.description}</p>
                  <Badge className="w-fit text-[10px]">{entry.category}</Badge>
                </div>
                <p className="text-sm font-semibold text-brand-800 dark:text-brand-200">{formatMoney(entry.amount, locale)}</p>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {entry.paid_by === userId
                  ? t("finances.paidByYou", {
                      date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(entry.created_at))
                    })
                  : t("finances.paidByMember", {
                      member: memberLabel(entry.paid_by),
                      date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(entry.created_at))
                    })}
              </p>
            </li>
          ))}
        </ul>

        {entries.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("finances.empty")}</p> : null}
        {entries.length > 0 && filteredEntries.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("finances.emptyFiltered")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
};
