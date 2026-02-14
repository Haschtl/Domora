import { type CSSProperties, useEffect, useId, useMemo, useState } from "react";
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
import { calculateBalancesByMember, calculateSettlementTransfers, splitAmountEvenly } from "../../lib/finance-math";
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

interface CategoryInputFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suggestionsListId: string;
  hasSuggestions: boolean;
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

const CategoryInputField = ({
  label,
  value,
  onChange,
  placeholder,
  suggestionsListId,
  hasSuggestions
}: CategoryInputFieldProps) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      list={hasSuggestions ? suggestionsListId : undefined}
    />
  </div>
);

const cronPatternToFinanceRecurrence = (cronPattern: string): FinanceSubscriptionRecurrence => {
  if (cronPattern === "0 9 * * 1") return "weekly";
  if (cronPattern === "0 9 1 */3 *") return "quarterly";
  return "monthly";
};

const financeRecurrenceToMonthlyFactor = (recurrence: FinanceSubscriptionRecurrence) => {
  if (recurrence === "weekly") return 52 / 12;
  if (recurrence === "quarterly") return 1 / 3;
  return 1;
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
  const categorySuggestionsListId = useId();
  const entryNameSuggestionsListId = useId();
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
      utilitiesMonthly: toNumericInputValue(household.utilities_monthly),
      utilitiesOnRoomSqmPercent: String(household.utilities_on_room_sqm_percent ?? 0)
    },
    onSubmit: async ({ value }: {
      value: {
        apartmentSizeSqm: string;
        coldRentMonthly: string;
        utilitiesMonthly: string;
        utilitiesOnRoomSqmPercent: string;
      };
    }) => {
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

      const parsedUtilitiesOnRoomSqmPercent = Number(value.utilitiesOnRoomSqmPercent);
      if (
        !Number.isFinite(parsedUtilitiesOnRoomSqmPercent) ||
        parsedUtilitiesOnRoomSqmPercent < 0 ||
        parsedUtilitiesOnRoomSqmPercent > 100
      ) {
        setRentFormError(t("settings.utilitiesOnRoomSqmPercentError"));
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
        utilitiesMonthly: parsedUtilities,
        utilitiesOnRoomSqmPercent: parsedUtilitiesOnRoomSqmPercent
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
    rentHouseholdForm.setFieldValue("utilitiesOnRoomSqmPercent", String(household.utilities_on_room_sqm_percent ?? 0));
  }, [
    household.apartment_size_sqm,
    household.cold_rent_monthly,
    household.id,
    household.utilities_monthly,
    household.utilities_on_room_sqm_percent,
    rentHouseholdForm
  ]);

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
  const reimbursementPreviewSummary = useMemo(() => {
    const positiveEntries = reimbursementPreview.filter((entry) => entry.value > 0.004);
    if (positiveEntries.length === 0) return null;

    const memberIds = [...new Set(positiveEntries.map((entry) => entry.memberId))];
    const totalAmount = positiveEntries.reduce((sum, entry) => sum + entry.value, 0);
    const amountLabel = moneyLabel(totalAmount);

    if (memberIds.length === 1) {
      const memberId = memberIds[0];
      if (memberId === userId) {
        return t("finances.reimbursementYou", { amount: amountLabel });
      }
      return t("finances.reimbursementSingle", {
        member: memberLabel(memberId),
        amount: amountLabel
      });
    }

    return t("finances.reimbursementGroup", {
      members: memberIds.map((memberId) => memberLabel(memberId)).join(", "),
      amount: amountLabel
    });
  }, [memberLabel, moneyLabel, reimbursementPreview, t, userId]);
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
    value === null ? "-" : `${Number(value.toFixed(2)).toString()} m²`;
  const rentColdPerSqm = useMemo(() => {
    if (household.apartment_size_sqm === null || household.apartment_size_sqm <= 0 || household.cold_rent_monthly === null) return null;
    return household.cold_rent_monthly / household.apartment_size_sqm;
  }, [household.apartment_size_sqm, household.cold_rent_monthly]);
  const rentRoomPerSqmWithUtilities = useMemo(() => {
    if (totalRoomAreaSqm <= 0 || household.cold_rent_monthly === null || household.utilities_monthly === null) return null;
    const utilitiesShareOnRoomSqm = household.utilities_monthly * ((household.utilities_on_room_sqm_percent ?? 0) / 100);
    return (household.cold_rent_monthly + utilitiesShareOnRoomSqm) / totalRoomAreaSqm;
  }, [
    household.cold_rent_monthly,
    household.utilities_monthly,
    household.utilities_on_room_sqm_percent,
    totalRoomAreaSqm
  ]);
  const rentTotalPerSqm = useMemo(() => {
    if (
      household.apartment_size_sqm === null ||
      household.apartment_size_sqm <= 0 ||
      household.cold_rent_monthly === null ||
      household.utilities_monthly === null
    ) {
      return null;
    }
    return (household.cold_rent_monthly + household.utilities_monthly) / household.apartment_size_sqm;
  }, [household.apartment_size_sqm, household.cold_rent_monthly, household.utilities_monthly]);
  const rentTotalMonthly = useMemo(() => {
    if (household.cold_rent_monthly === null || household.utilities_monthly === null) return null;
    return household.cold_rent_monthly + household.utilities_monthly;
  }, [household.cold_rent_monthly, household.utilities_monthly]);
  const costTableData = useMemo(() => {
    const apartmentSizeSqm = household.apartment_size_sqm;
    const coldRentMonthly = household.cold_rent_monthly;
    const utilitiesMonthly = household.utilities_monthly;
    const utilitiesOnRoomFactor = (household.utilities_on_room_sqm_percent ?? 0) / 100;
    const utilitiesOnRoomPool = utilitiesMonthly === null ? null : utilitiesMonthly * utilitiesOnRoomFactor;
    const coldPerApartmentSqm =
      apartmentSizeSqm !== null && apartmentSizeSqm > 0 && coldRentMonthly !== null
        ? coldRentMonthly / apartmentSizeSqm
        : null;
    const utilitiesPerRoomSqm =
      utilitiesOnRoomPool !== null && totalRoomAreaSqm > 0 ? utilitiesOnRoomPool / totalRoomAreaSqm : null;

    const byMember = new Map<
      string,
      {
        coldForRoom: number | null;
        utilitiesForRoom: number | null;
        roomSubtotal: number | null;
        commonCostsShare: number | null;
        totalBeforeContracts: number | null;
        extraContracts: number;
        grandTotal: number | null;
      }
    >();

    members.forEach((member) => {
      const roomSize = member.room_size_sqm ?? 0;
      const coldForRoom = coldPerApartmentSqm === null ? null : coldPerApartmentSqm * roomSize;
      const utilitiesForRoom = utilitiesPerRoomSqm === null ? null : utilitiesPerRoomSqm * roomSize;
      const roomSubtotal =
        coldForRoom === null || utilitiesForRoom === null ? null : coldForRoom + utilitiesForRoom;
      byMember.set(member.user_id, {
        coldForRoom,
        utilitiesForRoom,
        roomSubtotal,
        commonCostsShare: null,
        totalBeforeContracts: null,
        extraContracts: 0,
        grandTotal: null
      });
    });

    const sharedAreaSqmRaw = apartmentSizeSqm === null ? null : apartmentSizeSqm - totalRoomAreaSqm;
    const sharedAreaColdCosts =
      coldPerApartmentSqm === null || sharedAreaSqmRaw === null ? null : coldPerApartmentSqm * sharedAreaSqmRaw;
    const sharedUtilitiesCosts =
      utilitiesMonthly === null || utilitiesOnRoomPool === null ? null : utilitiesMonthly - utilitiesOnRoomPool;
    const remainingApartmentCosts =
      sharedAreaColdCosts === null || sharedUtilitiesCosts === null ? null : sharedAreaColdCosts + sharedUtilitiesCosts;
    const totalCommonWeight = members.reduce((sum, member) => sum + member.common_area_factor, 0);

    members.forEach((member) => {
      const entry = byMember.get(member.user_id);
      if (!entry) return;
      const commonCostsShare =
        remainingApartmentCosts === null || totalCommonWeight <= 0
          ? null
          : (remainingApartmentCosts * member.common_area_factor) / totalCommonWeight;
      const totalBeforeContracts =
        entry.roomSubtotal === null || commonCostsShare === null ? null : entry.roomSubtotal + commonCostsShare;
      entry.commonCostsShare = commonCostsShare;
      entry.totalBeforeContracts = totalBeforeContracts;
    });

    subscriptions.forEach((subscription) => {
      const recurrence = cronPatternToFinanceRecurrence(subscription.cron_pattern);
      const monthlyAmount = subscription.amount * financeRecurrenceToMonthlyFactor(recurrence);
      const beneficiaryIds = subscription.beneficiary_user_ids.filter((memberId) => householdMemberIds.includes(memberId));
      const normalizedBeneficiaryIds = beneficiaryIds.length > 0 ? beneficiaryIds : householdMemberIds;
      if (normalizedBeneficiaryIds.length === 0) return;
      const contractShareByMember = splitAmountEvenly(monthlyAmount, normalizedBeneficiaryIds);
      members.forEach((member) => {
        const entry = byMember.get(member.user_id);
        if (!entry) return;
        entry.extraContracts += contractShareByMember.get(member.user_id) ?? 0;
      });
    });

    members.forEach((member) => {
      const entry = byMember.get(member.user_id);
      if (!entry) return;
      entry.grandTotal = entry.totalBeforeContracts === null ? null : entry.totalBeforeContracts + entry.extraContracts;
    });

    return { byMember, remainingApartmentCosts, sharedAreaColdCosts, sharedUtilitiesCosts };
  }, [
    household.apartment_size_sqm,
    household.cold_rent_monthly,
    household.utilities_monthly,
    household.utilities_on_room_sqm_percent,
    householdMemberIds,
    members,
    subscriptions,
    totalRoomAreaSqm
  ]);
  const costTableTotals = useMemo(() => {
    const sumNullable = (values: Array<number | null>) => {
      if (values.length === 0 || values.some((value) => value === null)) return null;
      return (values as number[]).reduce((sum, value) => sum + value, 0);
    };
    const sumNumeric = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
    const coldForRoomValues = members.map((member) => costTableData.byMember.get(member.user_id)?.coldForRoom ?? null);
    const utilitiesForRoomValues = members.map((member) => costTableData.byMember.get(member.user_id)?.utilitiesForRoom ?? null);
    const roomSubtotalValues = members.map((member) => costTableData.byMember.get(member.user_id)?.roomSubtotal ?? null);
    const commonCostsShareValues = members.map((member) => costTableData.byMember.get(member.user_id)?.commonCostsShare ?? null);
    const totalBeforeContractsValues = members.map(
      (member) => costTableData.byMember.get(member.user_id)?.totalBeforeContracts ?? null
    );
    const extraContractsValues = members.map((member) => costTableData.byMember.get(member.user_id)?.extraContracts ?? 0);
    const grandTotalValues = members.map((member) => costTableData.byMember.get(member.user_id)?.grandTotal ?? null);

    return {
      coldForRoom: sumNullable(coldForRoomValues),
      utilitiesForRoom: sumNullable(utilitiesForRoomValues),
      roomSubtotal: sumNullable(roomSubtotalValues),
      sharedAreaColdCosts: costTableData.sharedAreaColdCosts,
      sharedUtilitiesCosts: costTableData.sharedUtilitiesCosts,
      remainingApartmentCosts: costTableData.remainingApartmentCosts,
      commonCostsShare: sumNullable(commonCostsShareValues),
      totalBeforeContracts: sumNullable(totalBeforeContractsValues),
      extraContracts: sumNumeric(extraContractsValues),
      grandTotal: sumNullable(grandTotalValues)
    };
  }, [costTableData, members]);
  const formatMoneyPerSqm = (value: number | null) => (value === null ? "-" : `${moneyLabel(value)}/m²`);
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
  const canManageFinanceEntry = (entry: FinanceEntry) => entry.created_by === userId;
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
  const categorySuggestions = useMemo(() => {
    const byKey = new Map<string, string>();
    const pushCategory = (value: string | null | undefined) => {
      const normalized = (value ?? "").trim();
      if (!normalized) return;
      const key = normalized.toLocaleLowerCase(language);
      if (!byKey.has(key)) byKey.set(key, normalized);
    };

    pushCategory("general");
    entries.forEach((entry) => pushCategory(entry.category));
    subscriptions.forEach((subscription) => pushCategory(subscription.category));

    return [...byKey.values()].sort((left, right) => left.localeCompare(right, language));
  }, [entries, language, subscriptions]);
  const entryNameSuggestions = useMemo(() => {
    const byKey = new Map<string, string>();
    entries.forEach((entry) => {
      const normalized = entry.description.trim();
      if (!normalized) return;
      const key = normalized.toLocaleLowerCase(language);
      if (!byKey.has(key)) byKey.set(key, normalized);
    });
    return [...byKey.values()].sort((left, right) => left.localeCompare(right, language));
  }, [entries, language]);
  const latestEntryByDescription = useMemo(() => {
    const byKey = new Map<string, FinanceEntry>();
    const sortedEntries = [...entries].sort((left, right) => right.created_at.localeCompare(left.created_at));
    sortedEntries.forEach((entry) => {
      const key = entry.description.trim().toLocaleLowerCase(language);
      if (!key || byKey.has(key)) return;
      byKey.set(key, entry);
    });
    return byKey;
  }, [entries, language]);
  const tryAutofillNewEntryFromDescription = (descriptionValue: string) => {
    const normalized = descriptionValue.trim().toLocaleLowerCase(language);
    if (!normalized) return;
    const matchedEntry = latestEntryByDescription.get(normalized);
    if (!matchedEntry) return;

    const paidByUserIds = matchedEntry.paid_by_user_ids.length > 0 ? matchedEntry.paid_by_user_ids : [matchedEntry.paid_by];
    const beneficiaryUserIds =
      matchedEntry.beneficiary_user_ids.length > 0
        ? matchedEntry.beneficiary_user_ids
        : members.map((member) => member.user_id);
    const entryDate = matchedEntry.entry_date ?? matchedEntry.created_at.slice(0, 10);

    addEntryForm.setFieldValue("amount", String(matchedEntry.amount));
    addEntryForm.setFieldValue("category", matchedEntry.category || "general");
    addEntryForm.setFieldValue("paidByUserIds", paidByUserIds);
    addEntryForm.setFieldValue("beneficiaryUserIds", beneficiaryUserIds);
    addEntryForm.setFieldValue("entryDate", entryDate);
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
            <CategoryInputField
              label={t("finances.subscriptionCategoryLabel")}
              value={field.state.value}
              onChange={field.handleChange}
              placeholder={t("finances.categoryPlaceholder")}
              suggestionsListId={categorySuggestionsListId}
              hasSuggestions={categorySuggestions.length > 0}
            />
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
  const archiveGroupsWithSettlement = useMemo(() => {
    const resolveGroupMemberIds = (groupEntries: FinanceEntry[]) => {
      if (householdMemberIds.length > 0) return householdMemberIds;

      const ids = new Set<string>();
      groupEntries.forEach((entry) => {
        const payerIds = entry.paid_by_user_ids.length > 0 ? entry.paid_by_user_ids : [entry.paid_by];
        const beneficiaryIds = entry.beneficiary_user_ids.length > 0 ? entry.beneficiary_user_ids : payerIds;
        payerIds.forEach((memberId) => ids.add(memberId));
        beneficiaryIds.forEach((memberId) => ids.add(memberId));
      });
      return [...ids];
    };

    return archiveGroups.map((group) => {
      const settlementMemberIdsForGroup = resolveGroupMemberIds(group.entries);
      const balances = calculateBalancesByMember(group.entries, settlementMemberIdsForGroup);
      const transfers = calculateSettlementTransfers(balances);
      return {
        ...group,
        settlementTransfers: transfers
      };
    });
  }, [archiveGroups, householdMemberIds]);

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
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              field.handleChange(nextValue);
                              tryAutofillNewEntryFromDescription(nextValue);
                            }}
                            onBlur={(event) => {
                              tryAutofillNewEntryFromDescription(event.target.value);
                            }}
                            placeholder={t("finances.descriptionPlaceholder")}
                            list={entryNameSuggestions.length > 0 ? entryNameSuggestionsListId : undefined}
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
                          name="category"
                          children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                            <CategoryInputField
                              label={t("finances.subscriptionCategoryLabel")}
                              value={field.state.value}
                              onChange={field.handleChange}
                              placeholder={t("finances.categoryPlaceholder")}
                              suggestionsListId={categorySuggestionsListId}
                              hasSuggestions={categorySuggestions.length > 0}
                            />
                          )}
                        />
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

                {reimbursementPreviewSummary ? (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                    {reimbursementPreviewSummary}
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

            {archiveGroupsWithSettlement.map((group) => (
              <FinanceHistoryCard
                key={group.id}
                className="mt-4"
                collapsible
                defaultOpen={false}
                title={group.title}
                summaryText={
                  <>
                    <div>
                      {t("finances.filteredTotal", {
                        value: moneyLabel(group.total),
                        count: group.entries.length
                      })}
                    </div>
                    <div className="mt-1">{t("finances.settlementPlanTitle")}:</div>
                    {group.settlementTransfers.length > 0 ? (
                      <div className="mt-1">
                        {group.settlementTransfers.map((transfer, index) => (
                          <div key={`${group.id}-transfer-${index}`}>
                            {t("finances.settlementTransferLine", {
                              from: memberLabel(transfer.fromMemberId),
                              to: memberLabel(transfer.toMemberId),
                              amount: moneyLabel(transfer.amount)
                            })}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1">{t("finances.settlementPlanEmpty")}</div>
                    )}
                  </>
                }
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
                canEditEntry={group.isEditable ? canManageFinanceEntry : undefined}
                canDeleteEntry={group.isEditable ? canManageFinanceEntry : undefined}
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
                className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]"
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
                        suffix="m²"
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
                <rentHouseholdForm.Field
                  name="utilitiesOnRoomSqmPercent"
                  children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                    <div className="space-y-1">
                      <Label>{t("settings.utilitiesOnRoomSqmPercentLabel")}</Label>
                      <InputWithSuffix
                        suffix="%"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        disabled={!canEditApartment}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder={t("settings.utilitiesOnRoomSqmPercentLabel")}
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

              <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/30 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">{t("finances.rentColdPerSqmLabel")}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{formatMoneyPerSqm(rentColdPerSqm)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">{t("finances.rentRoomPerSqmWithUtilitiesLabel")}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatMoneyPerSqm(rentRoomPerSqmWithUtilities)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">{t("finances.rentTotalPerSqmLabel")}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{formatMoneyPerSqm(rentTotalPerSqm)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">{t("finances.rentTotalMonthlyLabel")}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {rentTotalMonthly === null ? "-" : moneyLabel(rentTotalMonthly)}
                  </span>
                </div>
              </div>
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
                        suffix="m²"
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

            <SectionPanel className="mt-4">
              <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
                {t("finances.costBreakdownTitle")}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t("finances.costBreakdownDescription")}
              </p>

              <div className="mt-3 overflow-x-auto rounded-xl border border-brand-100 dark:border-slate-700">
                <table className="min-w-[860px] w-full text-sm">
                  <thead className="bg-brand-50/50 dark:bg-slate-800/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">
                        {t("finances.costBreakdownRowLabel")}
                      </th>
                      {members.map((member) => (
                        <th
                          key={`cost-breakdown-head-${member.user_id}`}
                          className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200"
                        >
                          {memberLabel(member.user_id)}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">
                        {t("finances.costBreakdownTotalColumn")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-brand-100 dark:border-slate-700">
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{t("finances.costBreakdownColdRoom")}</td>
                      {members.map((member) => {
                        const value = costTableData.byMember.get(member.user_id)?.coldForRoom ?? null;
                        return (
                          <td key={`cost-breakdown-cold-${member.user_id}`} className="px-3 py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                            {value === null ? "-" : moneyLabel(value)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {costTableTotals.coldForRoom === null ? "-" : moneyLabel(costTableTotals.coldForRoom)}
                      </td>
                    </tr>
                    <tr className="border-t border-brand-100 dark:border-slate-700">
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{t("finances.costBreakdownUtilitiesRoom")}</td>
                      {members.map((member) => {
                        const value = costTableData.byMember.get(member.user_id)?.utilitiesForRoom ?? null;
                        return (
                          <td key={`cost-breakdown-utilities-${member.user_id}`} className="px-3 py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                            {value === null ? "-" : moneyLabel(value)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {costTableTotals.utilitiesForRoom === null ? "-" : moneyLabel(costTableTotals.utilitiesForRoom)}
                      </td>
                    </tr>
                    <tr className="border-t border-brand-100 dark:border-slate-700 bg-brand-50/20 dark:bg-slate-800/30">
                      <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{t("finances.costBreakdownRoomSubtotal")}</td>
                      {members.map((member) => {
                        const value = costTableData.byMember.get(member.user_id)?.roomSubtotal ?? null;
                        return (
                          <td key={`cost-breakdown-subtotal-${member.user_id}`} className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {value === null ? "-" : moneyLabel(value)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {costTableTotals.roomSubtotal === null ? "-" : moneyLabel(costTableTotals.roomSubtotal)}
                      </td>
                    </tr>
                    <tr className="border-t border-brand-100 dark:border-slate-700">
                      <td className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300">{t("finances.costBreakdownSharedAreaCosts")}</td>
                      {members.map((member) => (
                        <td key={`cost-breakdown-shared-area-empty-${member.user_id}`} className="px-3 py-2 text-right font-medium text-slate-500 dark:text-slate-300">
                          -
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {costTableTotals.sharedAreaColdCosts === null ? "-" : moneyLabel(costTableTotals.sharedAreaColdCosts)}
                      </td>
                    </tr>
                    <tr className="border-t border-brand-100 dark:border-slate-700">
                      <td className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300">{t("finances.costBreakdownSharedUtilitiesCosts")}</td>
                      {members.map((member) => (
                        <td key={`cost-breakdown-shared-utilities-empty-${member.user_id}`} className="px-3 py-2 text-right font-medium text-slate-500 dark:text-slate-300">
                          -
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {costTableTotals.sharedUtilitiesCosts === null ? "-" : moneyLabel(costTableTotals.sharedUtilitiesCosts)}
                      </td>
                    </tr>
                    <tr className="border-t border-brand-100 dark:border-slate-700">
                      <td className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300">{t("finances.costBreakdownRemainingApartment")}</td>
                      {members.map((member) => (
                        <td key={`cost-breakdown-remaining-empty-${member.user_id}`} className="px-3 py-2 text-right font-medium text-slate-500 dark:text-slate-300">
                          -
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {costTableTotals.remainingApartmentCosts === null ? "-" : moneyLabel(costTableTotals.remainingApartmentCosts)}
                      </td>
                    </tr>
                    <tr className="border-t border-brand-100 dark:border-slate-700">
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{t("finances.costBreakdownCommonShare")}</td>
                      {members.map((member) => {
                        const value = costTableData.byMember.get(member.user_id)?.commonCostsShare ?? null;
                        return (
                          <td key={`cost-breakdown-common-${member.user_id}`} className="px-3 py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                            {value === null ? "-" : moneyLabel(value)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {costTableTotals.commonCostsShare === null ? "-" : moneyLabel(costTableTotals.commonCostsShare)}
                      </td>
                    </tr>
                    <tr className="border-t-4 border-double border-brand-300 dark:border-slate-500 bg-brand-50/20 dark:bg-slate-800/30">
                      <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{t("finances.costBreakdownTotal")}</td>
                      {members.map((member) => {
                        const value = costTableData.byMember.get(member.user_id)?.totalBeforeContracts ?? null;
                        return (
                          <td key={`cost-breakdown-total-${member.user_id}`} className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {value === null ? "-" : moneyLabel(value)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {costTableTotals.totalBeforeContracts === null ? "-" : moneyLabel(costTableTotals.totalBeforeContracts)}
                      </td>
                    </tr>
                  </tbody>
                  <tbody className="border-t-2 border-brand-200 dark:border-slate-600">
                    <tr className="border-t border-brand-100 dark:border-slate-700">
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{t("finances.costBreakdownExtraContracts")}</td>
                      {members.map((member) => {
                        const value = costTableData.byMember.get(member.user_id)?.extraContracts ?? 0;
                        return (
                          <td key={`cost-breakdown-contracts-${member.user_id}`} className="px-3 py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                            {moneyLabel(value)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {moneyLabel(costTableTotals.extraContracts)}
                      </td>
                    </tr>
                    <tr className="border-t border-brand-100 bg-brand-100/40 dark:border-slate-700 dark:bg-slate-700/30">
                      <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">{t("finances.costBreakdownGrandTotal")}</td>
                      {members.map((member) => {
                        const value = costTableData.byMember.get(member.user_id)?.grandTotal ?? null;
                        return (
                          <td key={`cost-breakdown-grand-${member.user_id}`} className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {value === null ? "-" : moneyLabel(value)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {costTableTotals.grandTotal === null ? "-" : moneyLabel(costTableTotals.grandTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
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
          canEditEntry={canManageFinanceEntry}
          canDeleteEntry={canManageFinanceEntry}
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
                    list={entryNameSuggestions.length > 0 ? entryNameSuggestionsListId : undefined}
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
              name="category"
              children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                <CategoryInputField
                  label={t("finances.subscriptionCategoryLabel")}
                  value={field.state.value}
                  onChange={field.handleChange}
                  placeholder={t("finances.categoryPlaceholder")}
                  suggestionsListId={categorySuggestionsListId}
                  hasSuggestions={categorySuggestions.length > 0}
                />
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
      {categorySuggestions.length > 0 ? (
        <datalist id={categorySuggestionsListId}>
          {categorySuggestions.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      ) : null}
      {entryNameSuggestions.length > 0 ? (
        <datalist id={entryNameSuggestionsListId}>
          {entryNameSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
};
