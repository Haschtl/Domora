import { type CSSProperties, useEffect, useMemo, useState } from "react";
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
import {
  AlertTriangle,
  Crown,
  Leaf,
  MoreHorizontal,
  PartyPopper,
  Scale,
  SlidersHorizontal,
  Smile,
  Sparkles,
  TrendingDown
} from "lucide-react";
import { Doughnut, Line } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import { PersonSelect } from "../../components/person-select";
import type {
  CashAuditRequest,
  FinanceEntry,
  FinanceSubscription,
  FinanceSubscriptionRecurrence,
  Household,
  HouseholdMember,
  NewFinanceSubscriptionInput,
  UpdateHouseholdInput
} from "../../lib/types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { InputWithSuffix } from "../../components/ui/input-with-suffix";
import { Label } from "../../components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { SectionPanel } from "../../components/ui/section-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";
import { getDateLocale } from "../../i18n";
import { createDiceBearAvatarDataUri } from "../../lib/avatar";
import { formatDateOnly, formatShortDay } from "../../lib/date";
import { calculateSettlementTransfers, splitAmountEvenly } from "../../lib/finance-math";
import { createMemberLabelGetter, type MemberLabelCase } from "../../lib/member-label";
import { FinanceHistoryCard } from "./components/FinanceHistoryCard";
import { useFinancesDerivedData } from "./hooks/use-finances-derived-data";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend);

interface FinancesTabProps {
  section?: "overview" | "stats" | "archive" | "subscriptions";
  entries: FinanceEntry[];
  subscriptions: FinanceSubscription[];
  cashAuditRequests: CashAuditRequest[];
  household: Household;
  currentMember: HouseholdMember | null;
  members: HouseholdMember[];
  userId: string;
  busy: boolean;
  onAdd: (input: {
    description: string;
    amount: number;
    category: string;
    paidByUserIds: string[];
    beneficiaryUserIds: string[];
    entryDate?: string | null;
  }) => Promise<void>;
  onUpdateEntry: (
    entry: FinanceEntry,
    input: {
      description: string;
      amount: number;
      category: string;
      paidByUserIds: string[];
      beneficiaryUserIds: string[];
      entryDate?: string | null;
    }
  ) => Promise<void>;
  onDeleteEntry: (entry: FinanceEntry) => Promise<void>;
  onAddSubscription: (input: NewFinanceSubscriptionInput) => Promise<void>;
  onUpdateSubscription: (subscription: FinanceSubscription, input: NewFinanceSubscriptionInput) => Promise<void>;
  onDeleteSubscription: (subscription: FinanceSubscription) => Promise<void>;
  onUpdateHousehold: (input: UpdateHouseholdInput) => Promise<void>;
  onUpdateMemberSettings: (input: { roomSizeSqm: number | null; commonAreaFactor: number }) => Promise<void>;
  onRequestCashAudit: () => Promise<void>;
}

const formatMoney = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR"
  }).format(value);

const COMMON_FACTOR_MIN = 0;
const COMMON_FACTOR_MAX = 2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const commonFactorLevelMeta = [
  { icon: AlertTriangle, className: "text-rose-600 dark:text-rose-400" },
  { icon: TrendingDown, className: "text-rose-500 dark:text-rose-400" },
  { icon: TrendingDown, className: "text-orange-500 dark:text-orange-400" },
  { icon: Scale, className: "text-amber-500 dark:text-amber-400" },
  { icon: Scale, className: "text-lime-600 dark:text-lime-400" },
  { icon: Leaf, className: "text-emerald-600 dark:text-emerald-400" },
  { icon: Sparkles, className: "text-emerald-500 dark:text-emerald-300" },
  { icon: Smile, className: "text-teal-500 dark:text-teal-300" },
  { icon: PartyPopper, className: "text-cyan-500 dark:text-cyan-300" },
  { icon: Crown, className: "text-blue-500 dark:text-blue-300" }
];

const toNumericInputValue = (value: number | null) => (value === null ? "" : String(value));
const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

interface MemberMultiSelectFieldProps {
  label: string;
  members: HouseholdMember[];
  value: string[];
  onChange: (value: string[]) => void;
  currentUserId: string;
  youLabel: string;
  placeholder: string;
  compactLabel?: boolean;
}

const MemberMultiSelectField = ({
  label,
  members,
  value,
  onChange,
  currentUserId,
  youLabel,
  placeholder,
  compactLabel = false
}: MemberMultiSelectFieldProps) => (
  <div className="space-y-1">
    {compactLabel ? (
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</p>
    ) : (
      <Label>{label}</Label>
    )}
    <PersonSelect
      mode="multiple"
      members={members}
      value={value}
      onChange={onChange}
      currentUserId={currentUserId}
      youLabel={youLabel}
      placeholder={placeholder}
    />
  </div>
);

const cronPatternToFinanceRecurrence = (cronPattern: string): FinanceSubscriptionRecurrence => {
  if (cronPattern === "0 9 * * 1") return "weekly";
  if (cronPattern === "0 9 1 */3 *") return "quarterly";
  return "monthly";
};

export const FinancesTab = ({
  section = "overview",
  entries,
  subscriptions,
  cashAuditRequests,
  household,
  currentMember,
  members,
  userId,
  busy,
  onAdd,
  onUpdateEntry,
  onDeleteEntry,
  onAddSubscription,
  onUpdateSubscription,
  onDeleteSubscription,
  onUpdateHousehold,
  onUpdateMemberSettings,
  onRequestCashAudit
}: FinancesTabProps) => {
  const { t, i18n } = useTranslation();
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [archiveFilterDialogOpen, setArchiveFilterDialogOpen] = useState(false);
  const [editEntryDialogOpen, setEditEntryDialogOpen] = useState(false);
  const [entryBeingEdited, setEntryBeingEdited] = useState<FinanceEntry | null>(null);
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
  const [editSubscriptionDialogOpen, setEditSubscriptionDialogOpen] = useState(false);
  const [subscriptionBeingEdited, setSubscriptionBeingEdited] = useState<FinanceSubscription | null>(null);
  const [rentFormError, setRentFormError] = useState<string | null>(null);
  const [memberRentFormError, setMemberRentFormError] = useState<string | null>(null);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const locale = getDateLocale(i18n.resolvedLanguage ?? i18n.language);
  const showOverview = section === "overview";
  const showStats = section === "stats";
  const showArchive = section === "archive";
  const showSubscriptions = section === "subscriptions";
  const canEditApartment = currentMember?.role === "owner";
  const addEntryForm = useForm({
    defaultValues: {
      description: "",
      category: "general",
      amount: "",
      entryDate: "",
      paidByUserIds: [userId],
      beneficiaryUserIds: [] as string[]
    },
    onSubmit: async ({
      value,
      formApi
    }: {
      value: {
        description: string;
        category: string;
        amount: string;
        entryDate: string;
        paidByUserIds: string[];
        beneficiaryUserIds: string[];
      };
      formApi: { reset: () => void };
    }) => {
      const parsedAmount = Number(value.amount);
      if (
        !value.description.trim() ||
        Number.isNaN(parsedAmount) ||
        parsedAmount < 0 ||
        value.paidByUserIds.length === 0 ||
        value.beneficiaryUserIds.length === 0
      ) {
        return;
      }

      await onAdd({
        description: value.description,
        amount: parsedAmount,
        category: value.category,
        paidByUserIds: value.paidByUserIds,
        beneficiaryUserIds: value.beneficiaryUserIds,
        entryDate: value.entryDate || null
      });
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
  const editEntryForm = useForm({
    defaultValues: {
      description: "",
      category: "general",
      amount: "",
      entryDate: "",
      paidByUserIds: [userId],
      beneficiaryUserIds: [] as string[]
    },
    onSubmit: async ({
      value
    }: {
      value: {
        description: string;
        category: string;
        amount: string;
        entryDate: string;
        paidByUserIds: string[];
        beneficiaryUserIds: string[];
      };
    }) => {
      if (!entryBeingEdited) return;
      const parsedAmount = Number(value.amount);
      if (
        !value.description.trim() ||
        Number.isNaN(parsedAmount) ||
        parsedAmount < 0 ||
        value.paidByUserIds.length === 0 ||
        value.beneficiaryUserIds.length === 0
      ) {
        return;
      }

      await onUpdateEntry(entryBeingEdited, {
        description: value.description,
        amount: parsedAmount,
        category: value.category,
        paidByUserIds: value.paidByUserIds,
        beneficiaryUserIds: value.beneficiaryUserIds,
        entryDate: value.entryDate || null
      });
      setEditEntryDialogOpen(false);
      setEntryBeingEdited(null);
    }
  });
  const subscriptionForm = useForm({
    defaultValues: {
      name: "",
      category: "general",
      amount: "",
      paidByUserIds: [userId],
      beneficiaryUserIds: [] as string[],
      recurrence: "monthly" as FinanceSubscriptionRecurrence
    },
    onSubmit: async ({
      value,
      formApi
    }: {
      value: {
        name: string;
        category: string;
        amount: string;
        paidByUserIds: string[];
        beneficiaryUserIds: string[];
        recurrence: FinanceSubscriptionRecurrence;
      };
      formApi: { reset: () => void };
    }) => {
      const parsedAmount = Number(value.amount);
      if (
        !value.name.trim() ||
        Number.isNaN(parsedAmount) ||
        parsedAmount < 0 ||
        value.paidByUserIds.length === 0 ||
        value.beneficiaryUserIds.length === 0
      ) {
        return;
      }

      await onAddSubscription({
        name: value.name.trim(),
        category: value.category.trim(),
        amount: parsedAmount,
        paidByUserIds: value.paidByUserIds,
        beneficiaryUserIds: value.beneficiaryUserIds,
        recurrence: value.recurrence
      });
      formApi.reset();
      setSubscriptionDialogOpen(false);
    }
  });
  const editSubscriptionForm = useForm({
    defaultValues: {
      name: "",
      category: "general",
      amount: "",
      paidByUserIds: [userId],
      beneficiaryUserIds: [] as string[],
      recurrence: "monthly" as FinanceSubscriptionRecurrence
    },
    onSubmit: async ({
      value
    }: {
      value: {
        name: string;
        category: string;
        amount: string;
        paidByUserIds: string[];
        beneficiaryUserIds: string[];
        recurrence: FinanceSubscriptionRecurrence;
      };
    }) => {
      if (!subscriptionBeingEdited) return;
      const parsedAmount = Number(value.amount);
      if (
        !value.name.trim() ||
        Number.isNaN(parsedAmount) ||
        parsedAmount < 0 ||
        value.paidByUserIds.length === 0 ||
        value.beneficiaryUserIds.length === 0
      ) {
        return;
      }

      await onUpdateSubscription(subscriptionBeingEdited, {
        name: value.name.trim(),
        category: value.category.trim(),
        amount: parsedAmount,
        paidByUserIds: value.paidByUserIds,
        beneficiaryUserIds: value.beneficiaryUserIds,
        recurrence: value.recurrence
      });
      setEditSubscriptionDialogOpen(false);
      setSubscriptionBeingEdited(null);
    }
  });
  const rentHouseholdForm = useForm({
    defaultValues: {
      apartmentSizeSqm: toNumericInputValue(household.apartment_size_sqm),
      coldRentMonthly: toNumericInputValue(household.cold_rent_monthly),
      utilitiesMonthly: toNumericInputValue(household.utilities_monthly)
    },
    onSubmit: async ({ value }: { value: { apartmentSizeSqm: string; coldRentMonthly: string; utilitiesMonthly: string } }) => {
      const parsedHouseholdSize = parseOptionalNumber(value.apartmentSizeSqm);
      if (Number.isNaN(parsedHouseholdSize) || (parsedHouseholdSize !== null && parsedHouseholdSize <= 0)) {
        setRentFormError(t("settings.householdSizeError"));
        return;
      }

      const parsedColdRent = parseOptionalNumber(value.coldRentMonthly);
      if (Number.isNaN(parsedColdRent) || (parsedColdRent !== null && parsedColdRent < 0)) {
        setRentFormError(t("settings.coldRentError"));
        return;
      }

      const parsedUtilities = parseOptionalNumber(value.utilitiesMonthly);
      if (Number.isNaN(parsedUtilities) || (parsedUtilities !== null && parsedUtilities < 0)) {
        setRentFormError(t("settings.utilitiesError"));
        return;
      }

      setRentFormError(null);
      await onUpdateHousehold({
        name: household.name,
        imageUrl: household.image_url ?? "",
        address: household.address ?? "",
        currency: household.currency ?? "EUR",
        apartmentSizeSqm: parsedHouseholdSize,
        coldRentMonthly: parsedColdRent,
        utilitiesMonthly: parsedUtilities
      });
    }
  });
  const rentMemberForm = useForm({
    defaultValues: {
      roomSizeSqm: toNumericInputValue(currentMember?.room_size_sqm ?? null),
      commonAreaFactor: currentMember ? String(currentMember.common_area_factor) : "1"
    },
    onSubmit: async ({ value }: { value: { roomSizeSqm: string; commonAreaFactor: string } }) => {
      const parsedRoomSize = parseOptionalNumber(value.roomSizeSqm);
      if (Number.isNaN(parsedRoomSize) || (parsedRoomSize !== null && parsedRoomSize <= 0)) {
        setMemberRentFormError(t("settings.roomSizeError"));
        return;
      }

      const parsedFactor = Number(value.commonAreaFactor);
      if (!Number.isFinite(parsedFactor) || parsedFactor < 0 || parsedFactor > 2) {
        setMemberRentFormError(t("settings.commonFactorError"));
        return;
      }

      setMemberRentFormError(null);
      await onUpdateMemberSettings({
        roomSizeSqm: parsedRoomSize,
        commonAreaFactor: parsedFactor
      });
    }
  });
  const archiveFilters = archiveFilterForm.state.values;

  const addEntryPayers = addEntryForm.state.values.paidByUserIds;
  const addEntryBeneficiaries = addEntryForm.state.values.beneficiaryUserIds;

  useEffect(() => {
    const currentPayers = addEntryPayers;
    const currentBeneficiaries = addEntryBeneficiaries;
    const memberIds = members.map((member) => member.user_id);

    if (currentPayers.length === 0) {
      addEntryForm.setFieldValue("paidByUserIds", [userId]);
    }
    if (currentBeneficiaries.length === 0 && memberIds.length > 0) {
      addEntryForm.setFieldValue("beneficiaryUserIds", memberIds);
    }
  }, [addEntryBeneficiaries, addEntryForm, addEntryPayers, members, userId]);

  useEffect(() => {
    const memberIds = members.map((member) => member.user_id);
    const currentPayers = subscriptionForm.state.values.paidByUserIds;
    const currentBeneficiaries = subscriptionForm.state.values.beneficiaryUserIds;

    if (currentPayers.length === 0) {
      subscriptionForm.setFieldValue("paidByUserIds", [userId]);
    }
    if (currentBeneficiaries.length === 0 && memberIds.length > 0) {
      subscriptionForm.setFieldValue("beneficiaryUserIds", memberIds);
    }
  }, [members, subscriptionForm, userId]);

  useEffect(() => {
    rentHouseholdForm.setFieldValue("apartmentSizeSqm", toNumericInputValue(household.apartment_size_sqm));
    rentHouseholdForm.setFieldValue("coldRentMonthly", toNumericInputValue(household.cold_rent_monthly));
    rentHouseholdForm.setFieldValue("utilitiesMonthly", toNumericInputValue(household.utilities_monthly));
  }, [household.apartment_size_sqm, household.cold_rent_monthly, household.id, household.utilities_monthly, rentHouseholdForm]);

  useEffect(() => {
    rentMemberForm.setFieldValue("roomSizeSqm", toNumericInputValue(currentMember?.room_size_sqm ?? null));
    rentMemberForm.setFieldValue("commonAreaFactor", currentMember ? String(currentMember.common_area_factor) : "1");
  }, [currentMember, rentMemberForm]);

  const lastCashAuditAt = cashAuditRequests[0]?.created_at ?? null;
  const {
    periodTotal,
    entriesSinceLastAudit,
    balancesByMember,
    filteredEntries,
    filteredTotal,
    categories,
    byUser,
    historySeries,
    categorySeries,
    reimbursementPreview,
    parseDateFallback
  } = useFinancesDerivedData({
    entries,
    members,
    lastCashAuditAt,
    archiveFilters,
    previewAmount: Number(addEntryForm.state.values.amount),
    previewPayerIds: addEntryForm.state.values.paidByUserIds,
    previewBeneficiaryIds: addEntryForm.state.values.beneficiaryUserIds
  });

  const memberLabel = useMemo(
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
  const memberById = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const memberAvatarSrc = (memberId: string) => {
    const member = memberById.get(memberId);
    const avatarUrl = member?.avatar_url?.trim() ?? "";
    if (avatarUrl) return avatarUrl;
    const seed = member?.display_name?.trim() || memberLabel(memberId);
    return createDiceBearAvatarDataUri(seed);
  };
  const moneyLabel = (value: number) => formatMoney(value, locale);
  const settlementTransfers = useMemo(() => calculateSettlementTransfers(balancesByMember), [balancesByMember]);
  const householdMemberIds = useMemo(() => [...new Set(members.map((member) => member.user_id))], [members]);
  const allMembersLabel = t("finances.allMembers");
  const allExceptMemberLabel = (memberId: string, labelCase: MemberLabelCase) =>
    t("finances.allExceptMember", {
      member: memberLabel(memberId, labelCase)
    });
  const formatMemberGroupLabel = (ids: string[], labelCase: MemberLabelCase) => {
    const normalizedIds = [...new Set(ids)];
    const normalizedInHousehold = normalizedIds.filter((memberId) => householdMemberIds.includes(memberId));
    const isAllMembers =
      householdMemberIds.length > 0 &&
      householdMemberIds.every((memberId) => normalizedInHousehold.includes(memberId));
    if (isAllMembers) return allMembersLabel;
    if (householdMemberIds.length >= 4 && normalizedInHousehold.length === householdMemberIds.length - 1) {
      const missingMemberId = householdMemberIds.find((memberId) => !normalizedInHousehold.includes(memberId));
      if (missingMemberId) return allExceptMemberLabel(missingMemberId, labelCase);
    }
    return normalizedIds.map((memberId) => memberLabel(memberId, labelCase)).join(", ");
  };
  const personalBalance = useMemo(
    () => balancesByMember.find((entry) => entry.memberId === userId)?.balance ?? 0,
    [balancesByMember, userId]
  );
  const personalBalanceLabel = `${personalBalance > 0.004 ? "+" : ""}${moneyLabel(personalBalance)}`;
  const totalRoomAreaSqm = useMemo(
    () => members.reduce((sum, member) => sum + (member.room_size_sqm ?? 0), 0),
    [members]
  );
  const sharedAreaSqm = useMemo(() => {
    if (household.apartment_size_sqm === null) return null;
    return household.apartment_size_sqm - totalRoomAreaSqm;
  }, [household.apartment_size_sqm, totalRoomAreaSqm]);
  const formatSqm = (value: number | null) =>
    value === null ? "-" : `${Number(value.toFixed(2)).toString()} qm`;
  const personalEntryDelta = (entry: FinanceEntry) => {
    const payerIds = entry.paid_by_user_ids.length > 0 ? entry.paid_by_user_ids : [entry.paid_by];
    const beneficiaryIds = entry.beneficiary_user_ids.length > 0 ? entry.beneficiary_user_ids : householdMemberIds;
    const paidByUser = splitAmountEvenly(entry.amount, payerIds).get(userId) ?? 0;
    const consumedByUser = splitAmountEvenly(entry.amount, beneficiaryIds).get(userId) ?? 0;
    return paidByUser - consumedByUser;
  };
  const personalEntryDeltaLabel = (entry: FinanceEntry) => {
    const delta = personalEntryDelta(entry);
    const sign = delta > 0.004 ? "+" : "";
    return t("finances.personalEntryImpactChip", {
      value: `${sign}${moneyLabel(delta)}`
    });
  };
  const personalEntryDeltaChipClassName = (entry: FinanceEntry) => {
    const delta = personalEntryDelta(entry);
    if (delta > 0.004) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100";
    if (delta < -0.004) return "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100";
    return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  };
  const paidByText = (entry: FinanceEntry) =>
    t("finances.paidByMembers", {
      members: formatMemberGroupLabel(
        entry.paid_by_user_ids.length > 0 ? entry.paid_by_user_ids : [entry.paid_by],
        "dative"
      ),
      forMembers: formatMemberGroupLabel(
        entry.beneficiary_user_ids.length > 0 ? entry.beneficiary_user_ids : householdMemberIds,
        "accusative"
      ),
      date: formatDateOnly(parseDateFallback(entry), language, parseDateFallback(entry))
    });
  const recurrenceOptions: Array<{ value: FinanceSubscriptionRecurrence; label: string }> = [
    { value: "weekly", label: t("finances.subscriptionRecurrenceWeekly") },
    { value: "monthly", label: t("finances.subscriptionRecurrenceMonthly") },
    { value: "quarterly", label: t("finances.subscriptionRecurrenceQuarterly") }
  ];
  const recurrenceLabel = (subscription: FinanceSubscription) => {
    const recurrence = cronPatternToFinanceRecurrence(subscription.cron_pattern);
    return recurrenceOptions.find((entry) => entry.value === recurrence)?.label ?? recurrenceOptions[1].label;
  };
  const subscriptionParticipantsText = (subscription: FinanceSubscription) =>
    t("finances.subscriptionParticipants", {
      paidBy: formatMemberGroupLabel(subscription.paid_by_user_ids, "dative"),
      forMembers: formatMemberGroupLabel(subscription.beneficiary_user_ids, "accusative")
    });
  const renderSubscriptionFormFields = (
    form: typeof subscriptionForm | typeof editSubscriptionForm
  ) => (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <form.Field
          name="name"
          children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
            <div className="space-y-1">
              <Label>{t("finances.subscriptionNameLabel")}</Label>
              <Input
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder={t("finances.subscriptionNamePlaceholder")}
                required
              />
            </div>
          )}
        />
        <form.Field
          name="amount"
          children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
            <div className="space-y-1">
              <Label>{t("finances.entryAmountLabel")}</Label>
              <InputWithSuffix
                suffix="€"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder={t("finances.amountPlaceholder")}
                required
                inputClassName="pr-7"
              />
            </div>
          )}
        />
        <form.Field
          name="category"
          children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
            <div className="space-y-1">
              <Label>{t("finances.subscriptionCategoryLabel")}</Label>
              <Input
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder={t("finances.categoryPlaceholder")}
              />
            </div>
          )}
        />
        <form.Field
          name="recurrence"
          children={(field: { state: { value: FinanceSubscriptionRecurrence }; handleChange: (value: FinanceSubscriptionRecurrence) => void }) => (
            <div className="space-y-1">
              <Label>{t("finances.subscriptionRecurrenceLabel")}</Label>
              <Select value={field.state.value} onValueChange={field.handleChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {recurrenceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <form.Field
          name="paidByUserIds"
          children={(field: { state: { value: string[] }; handleChange: (value: string[]) => void }) => (
            <MemberMultiSelectField
              label={t("finances.paidByLabel")}
              members={members}
              value={field.state.value}
              onChange={field.handleChange}
              currentUserId={userId}
              youLabel={t("common.you")}
              placeholder={t("finances.paidByLabel")}
            />
          )}
        />
        <form.Field
          name="beneficiaryUserIds"
          children={(field: { state: { value: string[] }; handleChange: (value: string[]) => void }) => (
            <MemberMultiSelectField
              label={t("finances.forWhomLabel")}
              members={members}
              value={field.state.value}
              onChange={field.handleChange}
              currentUserId={userId}
              youLabel={t("common.you")}
              placeholder={t("finances.forWhomLabel")}
            />
          )}
        />
      </div>
    </>
  );
  const renderEntryMemberFields = (
    form: typeof addEntryForm | typeof editEntryForm,
    compactLabel: boolean
  ) => (
    <>
      <form.Field
        name="paidByUserIds"
        children={(field: { state: { value: string[] }; handleChange: (value: string[]) => void }) => (
          <MemberMultiSelectField
            compactLabel={compactLabel}
            label={t("finances.paidByLabel")}
            members={members}
            value={field.state.value}
            onChange={field.handleChange}
            currentUserId={userId}
            youLabel={t("common.you")}
            placeholder={t("finances.paidByLabel")}
          />
        )}
      />
      <form.Field
        name="beneficiaryUserIds"
        children={(field: { state: { value: string[] }; handleChange: (value: string[]) => void }) => (
          <MemberMultiSelectField
            compactLabel={compactLabel}
            label={t("finances.forWhomLabel")}
            members={members}
            value={field.state.value}
            onChange={field.handleChange}
            currentUserId={userId}
            youLabel={t("common.you")}
            placeholder={t("finances.forWhomLabel")}
          />
        )}
      />
    </>
  );
  const onStartEditEntry = (entry: FinanceEntry) => {
    setEntryBeingEdited(entry);
    editEntryForm.setFieldValue("description", entry.description);
    editEntryForm.setFieldValue("category", entry.category || "general");
    editEntryForm.setFieldValue("amount", String(entry.amount));
    editEntryForm.setFieldValue("entryDate", entry.entry_date ?? "");
    editEntryForm.setFieldValue(
      "paidByUserIds",
      entry.paid_by_user_ids.length > 0 ? entry.paid_by_user_ids : [entry.paid_by]
    );
    editEntryForm.setFieldValue(
      "beneficiaryUserIds",
      entry.beneficiary_user_ids.length > 0 ? entry.beneficiary_user_ids : members.map((member) => member.user_id)
    );
    setEditEntryDialogOpen(true);
  };
  const onStartEditSubscription = (subscription: FinanceSubscription) => {
    setSubscriptionBeingEdited(subscription);
    editSubscriptionForm.setFieldValue("name", subscription.name);
    editSubscriptionForm.setFieldValue("category", subscription.category || "general");
    editSubscriptionForm.setFieldValue("amount", String(subscription.amount));
    editSubscriptionForm.setFieldValue("paidByUserIds", subscription.paid_by_user_ids);
    editSubscriptionForm.setFieldValue("beneficiaryUserIds", subscription.beneficiary_user_ids);
    editSubscriptionForm.setFieldValue("recurrence", cronPatternToFinanceRecurrence(subscription.cron_pattern));
    setEditSubscriptionDialogOpen(true);
  };
  const sortedFilteredEntries = useMemo(
    () =>
      [...filteredEntries].sort((left, right) => {
        const leftDay = parseDateFallback(left);
        const rightDay = parseDateFallback(right);
        if (leftDay !== rightDay) return rightDay.localeCompare(leftDay);
        return right.created_at.localeCompare(left.created_at);
      }),
    [filteredEntries, parseDateFallback]
  );
  const archiveGroups = useMemo(() => {
    const auditDays = [...new Set(cashAuditRequests.map((entry) => entry.created_at.slice(0, 10)))].sort((a, b) =>
      b.localeCompare(a)
    );
    if (sortedFilteredEntries.length === 0) return [];

    const groups: Array<{
      id: string;
      title: string;
      entries: FinanceEntry[];
      total: number;
      isEditable: boolean;
    }> = [];
    const pushGroup = (id: string, title: string, list: FinanceEntry[], isEditable: boolean) => {
      if (list.length === 0) return;
      groups.push({
        id,
        title,
        entries: list,
        total: list.reduce((sum, entry) => sum + entry.amount, 0),
        isEditable
      });
    };

    if (auditDays.length === 0) {
      pushGroup("all", t("finances.historyTitle"), sortedFilteredEntries, true);
      return groups;
    }

    const latestAuditDay = auditDays[0];
    pushGroup(
      "current",
      t("finances.currentPeriodTitle", {
        date: formatDateOnly(latestAuditDay, language, latestAuditDay)
      }),
      sortedFilteredEntries.filter((entry) => parseDateFallback(entry) > latestAuditDay),
      true
    );

    auditDays.forEach((auditDay, index) => {
      const nextOlderAuditDay = auditDays[index + 1];
      pushGroup(
        `audit-${auditDay}`,
        t("finances.auditPeriodTitle", {
          date: formatDateOnly(auditDay, language, auditDay)
        }),
        sortedFilteredEntries.filter((entry) => {
          const entryDay = parseDateFallback(entry);
          if (entryDay > auditDay) return false;
          if (nextOlderAuditDay && entryDay <= nextOlderAuditDay) return false;
          return true;
        }),
        false
      );
    });

    return groups;
  }, [cashAuditRequests, language, parseDateFallback, sortedFilteredEntries, t]);

  return (
    <div className="space-y-4">
      {showOverview ? (
          <>
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>{t("finances.newEntryTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void addEntryForm.handleSubmit();
                  }}
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <addEntryForm.Field
                      name="description"
                      children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                        <div className="min-w-[220px] flex-1 space-y-1">
                          <Label>{t("finances.entryNameLabel")}</Label>
                          <Input
                            value={field.state.value}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder={t("finances.descriptionPlaceholder")}
                            required
                          />
                        </div>
                      )}
                    />
                    <addEntryForm.Field
                      name="amount"
                      children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                        <div className="w-36 space-y-1">
                          <Label>{t("finances.entryAmountLabel")}</Label>
                          <InputWithSuffix
                            suffix="€"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={field.state.value}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder={t("finances.amountPlaceholder")}
                            required
                            inputClassName="pr-7"
                          />
                        </div>
                      )}
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 w-10 p-0"
                          aria-label={t("finances.moreOptions")}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-[320px] space-y-3">
                        <addEntryForm.Field
                          name="entryDate"
                          children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("finances.entryDate")}</p>
                              <Input
                                type="date"
                                value={field.state.value}
                                onChange={(event) => field.handleChange(event.target.value)}
                                title={t("finances.entryDate")}
                              />
                            </div>
                          )}
                        />
                        {renderEntryMemberFields(addEntryForm, true)}
                      </PopoverContent>
                    </Popover>
                    <Button type="submit" disabled={busy}>
                      {t("common.add")}
                    </Button>
                  </div>
                </form>

                {reimbursementPreview.length > 0 ? (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                    {reimbursementPreview
                      .map((entry) =>
                        t("finances.reimbursementLine", {
                          member: memberLabel(entry.memberId),
                          amount: moneyLabel(entry.value)
                        })
                      )
                      .join(" • ")}
                  </p>
                ) : null}
              </CardContent>
            </Card>

          </>
        ) : null}

        {showStats ? (
          <>
            <SectionPanel className="mb-4">
              <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">{t("finances.settlementTitle")}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {lastCashAuditAt
                  ? t("finances.settlementSince", {
                      date: formatDateOnly(lastCashAuditAt, language, lastCashAuditAt.slice(0, 10))
                    })
                  : t("finances.settlementSinceStart")}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t("finances.settlementStats", {
                  count: entriesSinceLastAudit.length,
                  total: formatMoney(periodTotal, locale)
                })}
              </p>

              {balancesByMember.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {balancesByMember.map((entry) => {
                    const isPositive = entry.balance > 0.004;
                    const isNegative = entry.balance < -0.004;
                    return (
                      <li
                        key={entry.memberId}
                        className="flex items-center justify-between rounded-lg border border-brand-100 bg-white/90 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 overflow-hidden rounded-full border border-brand-100 bg-brand-50 dark:border-slate-700 dark:bg-slate-800">
                            <img
                              src={memberAvatarSrc(entry.memberId)}
                              alt={memberLabel(entry.memberId)}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <span className={entry.memberId === userId ? "font-semibold" : "text-slate-700 dark:text-slate-300"}>
                            {memberLabel(entry.memberId)}
                          </span>
                        </div>
                        <span
                          className={
                            isPositive
                              ? "font-semibold text-emerald-700 dark:text-emerald-300"
                              : isNegative
                                ? "font-semibold text-rose-700 dark:text-rose-300"
                                : "font-semibold text-slate-600 dark:text-slate-300"
                          }
                        >
                          {isPositive ? "+" : ""}
                          {formatMoney(entry.balance, locale)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("finances.settlementEmpty")}</p>
              )}

              <div className="mt-4">
                <Button type="button" variant="outline" onClick={() => setAuditDialogOpen(true)}>
                  {t("finances.startAudit")}
                </Button>
              </div>
            </SectionPanel>

            <Dialog open={auditDialogOpen} onOpenChange={setAuditDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("finances.auditDialogTitle")}</DialogTitle>
                  <DialogDescription>{t("finances.auditDialogDescription")}</DialogDescription>
                </DialogHeader>
                <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">{t("finances.settlementPlanTitle")}</p>
                  {settlementTransfers.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {settlementTransfers.map((transfer, index) => (
                        <li key={`${transfer.fromMemberId}-${transfer.toMemberId}-${index}`} className="text-sm text-slate-700 dark:text-slate-200">
                          {t("finances.settlementTransferLine", {
                            from: memberLabel(transfer.fromMemberId),
                            to: memberLabel(transfer.toMemberId),
                            amount: moneyLabel(transfer.amount)
                          })}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("finances.settlementPlanEmpty")}</p>
                  )}
                </div>
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

            <SectionPanel>
              <p className="mb-2 text-sm font-semibold text-brand-900 dark:text-brand-100">{t("finances.historyTitle")}</p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {t("finances.filteredTotal", { value: formatMoney(filteredTotal, locale), count: filteredEntries.length })}
              </p>

              {historySeries.labels.length > 0 ? (
                <div className="mt-3 rounded-lg bg-white p-2 dark:bg-slate-900">
                  <Line
                    data={{
                      labels: historySeries.labels.map((label) => formatShortDay(label, language, label)),
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
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">{t("finances.historyTitle")}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setArchiveFilterDialogOpen(true)}>
                  <SlidersHorizontal className="mr-1 h-4 w-4" />
                  {t("finances.filtersButton")}
                </Button>
              </div>

              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {t("finances.filteredTotal", { value: formatMoney(filteredTotal, locale), count: filteredEntries.length })}
              </p>
            </SectionPanel>

            <Dialog open={archiveFilterDialogOpen} onOpenChange={setArchiveFilterDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("finances.filtersDialogTitle")}</DialogTitle>
                  <DialogDescription>{t("finances.filtersDialogDescription")}</DialogDescription>
                </DialogHeader>
                <form
                  className="mt-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                  }}
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    <archiveFilterForm.Field
                      name="filterFrom"
                      children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                        <div className="space-y-1">
                          <Label>{t("finances.filterFrom")}</Label>
                          <Input
                            type="date"
                            value={field.state.value}
                            onChange={(event) => field.handleChange(event.target.value)}
                            title={t("finances.filterFrom")}
                          />
                        </div>
                      )}
                    />
                    <archiveFilterForm.Field
                      name="filterTo"
                      children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                        <div className="space-y-1">
                          <Label>{t("finances.filterTo")}</Label>
                          <Input
                            type="date"
                            value={field.state.value}
                            onChange={(event) => field.handleChange(event.target.value)}
                            title={t("finances.filterTo")}
                          />
                        </div>
                      )}
                    />
                    <archiveFilterForm.Field
                      name="filterMember"
                      children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                        <div className="space-y-1">
                          <Label>{t("finances.filterByMember")}</Label>
                          <PersonSelect
                            mode="single"
                            members={members}
                            value={field.state.value}
                            onChange={field.handleChange}
                            currentUserId={userId}
                            youLabel={t("common.you")}
                            allValue="all"
                            allLabel={t("finances.filterByMemberAll")}
                            placeholder={t("finances.filterByMember")}
                          />
                        </div>
                      )}
                    />
                    <archiveFilterForm.Field
                      name="filterCategory"
                      children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                        <div className="space-y-1">
                          <Label>{t("finances.filterByCategory")}</Label>
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
                        </div>
                      )}
                    />
                    <archiveFilterForm.Field
                      name="searchText"
                      children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                        <div className="space-y-1">
                          <Label>{t("finances.searchLabel")}</Label>
                          <Input
                            value={field.state.value}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder={t("finances.searchPlaceholder")}
                          />
                        </div>
                      )}
                    />
                  </div>
                </form>

                <div className="mt-4 flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="ghost">{t("common.cancel")}</Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>

            {archiveGroups.map((group) => (
              <FinanceHistoryCard
                key={group.id}
                className="mt-4"
                collapsible
                defaultOpen={false}
                title={group.title}
                summaryText={t("finances.filteredTotal", {
                  value: moneyLabel(group.total),
                  count: group.entries.length
                })}
                totalBadgeText={moneyLabel(group.total)}
                entries={group.entries}
                emptyText={t("finances.emptyFiltered")}
                paidByText={paidByText}
                formatMoney={moneyLabel}
                virtualized
                virtualHeight={420}
                onEdit={group.isEditable ? onStartEditEntry : undefined}
                onDelete={
                  group.isEditable
                    ? (entry) => {
                        void onDeleteEntry(entry);
                      }
                    : undefined
                }
                actionsLabel={t("finances.entryActions")}
                editLabel={t("finances.editEntry")}
                deleteLabel={t("finances.deleteEntry")}
                busy={busy}
              />
            ))}
          </>
        ) : null}

        {showSubscriptions ? (
          <>
            <SectionPanel className="mt-4">
              <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">{t("finances.rentApartmentTitle")}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("finances.rentApartmentDescription")}</p>

              <form
                className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void rentHouseholdForm.handleSubmit();
                }}
              >
                <rentHouseholdForm.Field
                  name="apartmentSizeSqm"
                  children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                    <div className="space-y-1">
                      <Label>{t("settings.householdSizeLabel")}</Label>
                      <InputWithSuffix
                        suffix="qm"
                        type="number"
                        min="0.1"
                        step="0.1"
                        disabled={!canEditApartment}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder={t("settings.householdSizeLabel")}
                      />
                    </div>
                  )}
                />
                <rentHouseholdForm.Field
                  name="coldRentMonthly"
                  children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                    <div className="space-y-1">
                      <Label>{t("settings.coldRentLabel")}</Label>
                      <InputWithSuffix
                        suffix="€"
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!canEditApartment}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder={t("settings.coldRentLabel")}
                        inputClassName="pr-7"
                      />
                    </div>
                  )}
                />
                <rentHouseholdForm.Field
                  name="utilitiesMonthly"
                  children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                    <div className="space-y-1">
                      <Label>{t("settings.utilitiesLabel")}</Label>
                      <InputWithSuffix
                        suffix="€"
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!canEditApartment}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder={t("settings.utilitiesLabel")}
                        inputClassName="pr-7"
                      />
                    </div>
                  )}
                />
                <Button type="submit" disabled={busy || !canEditApartment}>
                  {t("finances.rentSave")}
                </Button>
              </form>

              {!canEditApartment ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("finances.rentOwnerOnlyHint")}</p>
              ) : null}

              {rentFormError ? (
                <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                  {rentFormError}
                </p>
              ) : null}
            </SectionPanel>

            <SectionPanel className="mt-4">
              <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">{t("finances.rentMineTitle")}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("finances.rentMineDescription")}</p>

              <form
                className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void rentMemberForm.handleSubmit();
                }}
              >
                <rentMemberForm.Field
                  name="roomSizeSqm"
                  children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                    <div className="space-y-1">
                      <Label>{t("settings.roomSizeLabel")}</Label>
                      <InputWithSuffix
                        suffix="qm"
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder={t("settings.roomSizeLabel")}
                      />
                    </div>
                  )}
                />
                <rentMemberForm.Field
                  name="commonAreaFactor"
                  children={(field: { state: { value: string }; handleChange: (value: string) => void }) => {
                    const parsed = Number(field.state.value);
                    const sliderValue = Number.isFinite(parsed) ? clamp(parsed, COMMON_FACTOR_MIN, COMMON_FACTOR_MAX) : 1;
                    const percentage = Math.round(sliderValue * 100);
                    const levelIndex = Math.min(9, Math.floor((sliderValue / COMMON_FACTOR_MAX) * 10));
                    const level = commonFactorLevelMeta[levelIndex];
                    const LevelIcon = level.icon;
                    const hue = Math.round((sliderValue / COMMON_FACTOR_MAX) * 120);
                    const sliderStyle = {
                      "--slider-gradient": "linear-gradient(90deg, #ef4444 0%, #f59e0b 25%, #22c55e 50%, #16a34a 75%, #15803d 100%)",
                      "--slider-thumb": `hsl(${hue} 80% 42%)`
                    } as CSSProperties;

                    return (
                      <div className="space-y-2 sm:col-span-2">
                        <input
                          type="range"
                          min={COMMON_FACTOR_MIN}
                          max={COMMON_FACTOR_MAX}
                          step="0.01"
                          value={sliderValue}
                          onChange={(event) => field.handleChange(event.target.value)}
                          className="common-factor-slider w-full"
                          style={sliderStyle}
                          aria-label={t("settings.commonFactorLabel")}
                        />
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-rose-600 dark:text-rose-400">0</span>
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">1.00</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">2.00</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className={`inline-flex items-center gap-1 text-xs font-semibold ${level.className}`}>
                            <LevelIcon className="h-3.5 w-3.5" />
                            {t(`settings.commonFactorLevel${levelIndex + 1}`)}
                          </div>
                          <div className="text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {percentage}% ({sliderValue.toFixed(2)})
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Button type="submit" variant="outline" disabled={busy}>
                  {t("finances.rentSaveMine")}
                </Button>
              </form>

              {memberRentFormError ? (
                <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                  {memberRentFormError}
                </p>
              ) : null}
            </SectionPanel>

            <SectionPanel className="mt-4">
              <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">{t("finances.rentOverviewTitle")}</p>
              <ul className="mt-2 space-y-2">
                {members.map((member) => (
                  <li
                    key={member.user_id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/60"
                  >
                    <span className={member.user_id === userId ? "font-semibold" : "text-slate-700 dark:text-slate-300"}>
                      {memberLabel(member.user_id)}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {formatSqm(member.room_size_sqm)}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {t("finances.rentFactorValue", { value: member.common_area_factor.toFixed(2) })}
                    </span>
                  </li>
                ))}
                <li className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-dashed border-brand-200 bg-brand-50/20 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/40">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{t("finances.sharedAreaLabel")}</span>
                  <span className="text-slate-600 dark:text-slate-300">{formatSqm(sharedAreaSqm)}</span>
                  <span className="text-slate-500 dark:text-slate-400">-</span>
                </li>
              </ul>
              {members.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("finances.rentAreaOverviewEmpty")}</p>
              ) : null}
            </SectionPanel>

            <SectionPanel className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">{t("finances.subscriptionListTitle")}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("finances.subscriptionsDescription")}</p>
                </div>
                <Button type="button" onClick={() => setSubscriptionDialogOpen(true)} disabled={busy}>
                  {t("finances.addSubscriptionAction")}
                </Button>
              </div>

              {subscriptions.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("finances.subscriptionEmpty")}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {subscriptions.map((subscription) => (
                    <li
                      key={subscription.id}
                      className="rounded-xl border border-brand-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{subscription.name}</p>
                            <Badge className="text-[10px]">{subscription.category}</Badge>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t("finances.subscriptionRecursLabel", { value: recurrenceLabel(subscription) })}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{subscriptionParticipantsText(subscription)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <p className="text-sm font-semibold text-brand-800 dark:text-brand-200">{moneyLabel(subscription.amount)}</p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                aria-label={t("finances.subscriptionActions")}
                                disabled={busy}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onStartEditSubscription(subscription)}>
                                {t("finances.editSubscriptionAction")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  void onDeleteSubscription(subscription);
                                }}
                                className="text-rose-600 dark:text-rose-300"
                              >
                                {t("finances.deleteSubscriptionAction")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionPanel>
          </>
        ) : null}

        {showArchive && entries.length > 0 && filteredEntries.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("finances.emptyFiltered")}</p>
        ) : null}

      {showOverview ? (
        <FinanceHistoryCard
          title={t("finances.currentEntriesTitle")}
          description={t("finances.currentEntriesDescription")}
          headerRight={
            <Badge className="text-xs">
              {t("finances.personalBalanceChip", { value: personalBalanceLabel })}
            </Badge>
          }
          entries={entriesSinceLastAudit}
          emptyText={t("finances.empty")}
          paidByText={paidByText}
          formatMoney={moneyLabel}
          entryChipText={personalEntryDeltaLabel}
          entryChipClassName={personalEntryDeltaChipClassName}
          amountClassName="text-xs text-slate-500 dark:text-slate-400"
          onEdit={onStartEditEntry}
          onDelete={(entry) => {
            void onDeleteEntry(entry);
          }}
          actionsLabel={t("finances.entryActions")}
          editLabel={t("finances.editEntry")}
          deleteLabel={t("finances.deleteEntry")}
          busy={busy}
        />
      ) : null}

      <Dialog open={subscriptionDialogOpen} onOpenChange={setSubscriptionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finances.addSubscriptionAction")}</DialogTitle>
            <DialogDescription>{t("finances.subscriptionsDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void subscriptionForm.handleSubmit();
            }}
          >
            {renderSubscriptionFormFields(subscriptionForm)}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">{t("common.cancel")}</Button>
              </DialogClose>
              <Button type="submit" disabled={busy}>
                {t("finances.addSubscriptionAction")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editSubscriptionDialogOpen}
        onOpenChange={(open) => {
          setEditSubscriptionDialogOpen(open);
          if (!open) setSubscriptionBeingEdited(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finances.editSubscriptionTitle")}</DialogTitle>
            <DialogDescription>{t("finances.editSubscriptionDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void editSubscriptionForm.handleSubmit();
            }}
          >
            {renderSubscriptionFormFields(editSubscriptionForm)}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">{t("common.cancel")}</Button>
              </DialogClose>
              <Button type="submit" disabled={busy}>
                {t("finances.saveSubscriptionAction")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editEntryDialogOpen}
        onOpenChange={(open) => {
          setEditEntryDialogOpen(open);
          if (!open) setEntryBeingEdited(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finances.editEntryTitle")}</DialogTitle>
            <DialogDescription>{t("finances.editEntryDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void editEntryForm.handleSubmit();
            }}
          >
            <editEntryForm.Field
              name="description"
              children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                <div className="space-y-1">
                  <Label>{t("finances.entryNameLabel")}</Label>
                  <Input
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("finances.descriptionPlaceholder")}
                    required
                  />
                </div>
              )}
            />
            <editEntryForm.Field
              name="amount"
              children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                <div className="space-y-1">
                  <Label>{t("finances.entryAmountLabel")}</Label>
                  <InputWithSuffix
                    suffix="€"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("finances.amountPlaceholder")}
                    required
                    inputClassName="pr-7"
                  />
                </div>
              )}
            />
            <editEntryForm.Field
              name="entryDate"
              children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                <div className="space-y-1">
                  <Label>{t("finances.entryDate")}</Label>
                  <Input
                    type="date"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    title={t("finances.entryDate")}
                  />
                </div>
              )}
            />
            {renderEntryMemberFields(editEntryForm, false)}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">{t("common.cancel")}</Button>
              </DialogClose>
              <Button type="submit" disabled={busy}>
                {t("finances.saveEntry")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
