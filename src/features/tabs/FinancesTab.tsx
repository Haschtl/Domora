import { type CSSProperties, type RefObject, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import imageCompression from "browser-image-compression";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip
} from "chart.js";
import {
  AlertTriangle,
  Camera,
  ChevronLeft,
  Crown,
  Leaf,
  MoreHorizontal,
  PartyPopper,
  Paperclip,
  Plus,
  Scale,
  SlidersHorizontal,
  Smile,
  Sparkles as SparklesIcon,
  TrendingDown
} from "lucide-react";
import SparklesEffect from "react-sparkle";
import { Bar, Doughnut } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import { PersonSelect } from "../../components/person-select";
import { PaymentBrandIcon } from "../../components/payment-brand-icon";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
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
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { SectionPanel } from "../../components/ui/section-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useSmartSuggestions } from "../../hooks/use-smart-suggestions";
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

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

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
  mobileTabBarVisible?: boolean;
  onAdd: (input: {
    description: string;
    amount: number;
    category: string;
    receiptImageUrl?: string | null;
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
      receiptImageUrl?: string | null;
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
  onUpdateMemberSettingsForUser: (
    targetUserId: string,
    input: { roomSizeSqm: number | null; commonAreaFactor: number }
  ) => Promise<void>;
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
  { icon: SparklesIcon, className: "text-emerald-500 dark:text-emerald-300" },
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

const renderSparkleIcon = (Icon: (props: { className?: string }) => JSX.Element) => {
  const icon = <Icon className="h-3.5 w-3.5" />;
  if (Icon !== SparklesIcon) return icon;
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      {icon}
      <span className="pointer-events-none absolute inset-0">
        <SparklesEffect
          color="currentColor"
          count={6}
          minSize={2}
          maxSize={4}
          overflowPx={4}
          fadeOutSpeed={8}
          flicker={false}
        />
      </span>
    </span>
  );
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

interface FinanceEntrySuggestion {
  key: string;
  title: string;
  count: number;
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

const encodePathSegment = (value: string) => encodeURIComponent(value.trim().replace(/^@+/, ""));

const normalizeUserColor = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
};

const fallbackColorFromUserId = (memberId: string) => {
  let hash = 0;
  for (let i = 0; i < memberId.length; i += 1) {
    hash = (hash << 5) - hash + memberId.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 48%)`;
};

type OcrDetectionResult = { rawValue?: string; text?: string };
type TextDetectorLike = { detect: (input: ImageBitmapSource) => Promise<OcrDetectionResult[]> };
type TextDetectorConstructor = new (options?: { languages?: string[] }) => TextDetectorLike;

const getTextDetectorConstructor = (): TextDetectorConstructor | null => {
  if (typeof window === "undefined") return null;
  const maybeCtor = (window as unknown as { TextDetector?: TextDetectorConstructor }).TextDetector;
  return typeof maybeCtor === "function" ? maybeCtor : null;
};

const extractPriceFromOcrText = (text: string) => {
  const normalized = text.replace(/\s/g, "");
  const matches = [...normalized.matchAll(/(\d{1,4}(?:[.,]\d{2}))(?:€|EUR)?/gi)].map((entry) => entry[1] ?? "");
  if (matches.length === 0) return null;

  const candidate = matches[matches.length - 1].replace(",", ".");
  const parsed = Number(candidate);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const extractProductFromOcrText = (text: string) => {
  const blocked = new Set(["summe", "gesamt", "total", "mwst", "eur", "euro", "karte", "kasse", "beleg"]);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 3)
    .filter((line) => /[a-zA-ZäöüÄÖÜß]/.test(line))
    .filter((line) => !/[0-9]{1,4}[.,][0-9]{2}/.test(line))
    .filter((line) => {
      const lowered = line.toLocaleLowerCase();
      return ![...blocked].some((word) => lowered.includes(word));
    });

  return lines[0] ?? null;
};

const MAX_RECEIPT_IMAGE_DIMENSION = 1600;
const MAX_RECEIPT_IMAGE_SIZE_MB = 0.9;
const RECEIPT_IMAGE_QUALITY = 0.78;

const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(blob);
  });

const compressImageToDataUrl = async (file: File) => {
  if (!file.type.startsWith("image/")) {
    return readBlobAsDataUrl(file);
  }

  const compressed = await imageCompression(file, {
    maxSizeMB: MAX_RECEIPT_IMAGE_SIZE_MB,
    maxWidthOrHeight: MAX_RECEIPT_IMAGE_DIMENSION,
    useWebWorker: true,
    initialQuality: RECEIPT_IMAGE_QUALITY
  });

  return imageCompression.getDataUrlFromFile(compressed);
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
  mobileTabBarVisible = true,
  onAdd,
  onUpdateEntry,
  onDeleteEntry,
  onAddSubscription,
  onUpdateSubscription,
  onDeleteSubscription,
  onUpdateHousehold,
  onUpdateMemberSettings,
  onUpdateMemberSettingsForUser,
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
  const [ocrCameraDialogOpen, setOcrCameraDialogOpen] = useState(false);
  const [ocrConfirmDialogOpen, setOcrConfirmDialogOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrCandidate, setOcrCandidate] = useState<{ description: string; amount: string; fullText: string } | null>(null);
  const [rentFormError, setRentFormError] = useState<string | null>(null);
  const [memberRentFormError, setMemberRentFormError] = useState<string | null>(null);
  const [overviewMemberRentFormError, setOverviewMemberRentFormError] = useState<string | null>(null);
  const [savingOverviewMemberId, setSavingOverviewMemberId] = useState<string | null>(null);
  const [receiptUploadError, setReceiptUploadError] = useState<string | null>(null);
  const [previewDescription, setPreviewDescription] = useState("");
  const [previewAmountInput, setPreviewAmountInput] = useState("");
  const getDefaultFinanceSelectionIds = useCallback(() => {
    const nonVacationMemberIds = members.filter((member) => !member.vacation_mode).map((member) => member.user_id);
    if (nonVacationMemberIds.length > 0) return nonVacationMemberIds;
    return members.map((member) => member.user_id);
  }, [members]);
  const [previewPayerIds, setPreviewPayerIds] = useState<string[]>(() => getDefaultFinanceSelectionIds());
  const [previewBeneficiaryIds, setPreviewBeneficiaryIds] = useState<string[]>(() => getDefaultFinanceSelectionIds());
  const addEntryComposerContainerRef = useRef<HTMLDivElement | null>(null);
  const addEntryRowRef = useRef<HTMLDivElement | null>(null);
  const ocrVideoRef = useRef<HTMLVideoElement | null>(null);
  const ocrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ocrStreamRef = useRef<MediaStream | null>(null);
  const addReceiptUploadInputRef = useRef<HTMLInputElement | null>(null);
  const addReceiptCameraInputRef = useRef<HTMLInputElement | null>(null);
  const editReceiptUploadInputRef = useRef<HTMLInputElement | null>(null);
  const editReceiptCameraInputRef = useRef<HTMLInputElement | null>(null);
  const [addEntryPopoverWidth, setAddEntryPopoverWidth] = useState(320);
  const [isMobileAddEntryComposer, setIsMobileAddEntryComposer] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false
  );
  const [memberOverviewDrafts, setMemberOverviewDrafts] = useState<Record<string, { roomSizeSqm: string; commonAreaFactor: string }>>({});
  const [rentDetailsOpen, setRentDetailsOpen] = useState(false);
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
      receiptImageUrl: "",
      entryDate: "",
      paidByUserIds: getDefaultFinanceSelectionIds(),
      beneficiaryUserIds: getDefaultFinanceSelectionIds()
    },
    onSubmit: async ({
      value,
      formApi
    }: {
      value: {
        description: string;
        category: string;
        amount: string;
        receiptImageUrl: string;
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
        receiptImageUrl: value.receiptImageUrl.trim() || null,
        paidByUserIds: value.paidByUserIds,
        beneficiaryUserIds: value.beneficiaryUserIds,
        entryDate: value.entryDate || null
      });
      formApi.reset();
      setReceiptUploadError(null);
      setPreviewDescription("");
      setPreviewAmountInput("");
      setPreviewPayerIds(getDefaultFinanceSelectionIds());
      setPreviewBeneficiaryIds(getDefaultFinanceSelectionIds());
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
      receiptImageUrl: "",
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
        receiptImageUrl: string;
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
        receiptImageUrl: value.receiptImageUrl.trim() || null,
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
  const memberIds = useMemo(() => members.map((member) => member.user_id), [members]);
  const previewPayerIdsEffective =
    previewPayerIds.length > 0 ? previewPayerIds : addEntryPayers.length > 0 ? addEntryPayers : [userId];
  const previewBeneficiaryIdsEffective =
    previewBeneficiaryIds.length > 0
      ? previewBeneficiaryIds
      : addEntryBeneficiaries.length > 0
        ? addEntryBeneficiaries
        : memberIds;

  useEffect(() => {
    const currentPayers = addEntryPayers;
    const currentBeneficiaries = addEntryBeneficiaries;

    const defaultSelectionIds = getDefaultFinanceSelectionIds();
    if (currentPayers.length === 0 && defaultSelectionIds.length > 0) {
      addEntryForm.setFieldValue("paidByUserIds", defaultSelectionIds);
    }
    if (currentBeneficiaries.length === 0 && defaultSelectionIds.length > 0) {
      addEntryForm.setFieldValue("beneficiaryUserIds", defaultSelectionIds);
    }
  }, [addEntryBeneficiaries, addEntryForm, addEntryPayers, getDefaultFinanceSelectionIds, memberIds]);

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

  useEffect(() => {
    setMemberOverviewDrafts(
      Object.fromEntries(
        members.map((member) => [
          member.user_id,
          {
            roomSizeSqm: toNumericInputValue(member.room_size_sqm),
            commonAreaFactor: String(member.common_area_factor)
          }
        ])
      )
    );
  }, [members]);

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
    previewAmount: Number(previewAmountInput),
    previewPayerIds: previewPayerIdsEffective,
    previewBeneficiaryIds: previewBeneficiaryIdsEffective
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
  const resolveMemberColor = useMemo(
    () => (memberId: string) => normalizeUserColor(memberById.get(memberId)?.user_color) ?? fallbackColorFromUserId(memberId),
    [memberById]
  );
  const memberAvatarSrc = (memberId: string) => {
    const member = memberById.get(memberId);
    const avatarUrl = member?.avatar_url?.trim() ?? "";
    if (avatarUrl) return avatarUrl;
    const seed = member?.display_name?.trim() || memberLabel(memberId);
    return createDiceBearAvatarDataUri(seed);
  };
  const moneyLabel = useCallback((value: number) => formatMoney(value, locale), [locale]);
  const buildPaymentLinks = (toMemberId: string, amount: number, settlementDateIsoDay?: string) => {
    const target = memberById.get(toMemberId);
    if (!target) return [];
    const normalizedAmount = Math.max(0, Number(amount.toFixed(2)));
    const links: Array<{ id: "paypal" | "revolut" | "wero"; label: string; href: string }> = [];
    const referenceDay = settlementDateIsoDay ?? new Date().toISOString().slice(0, 10);
    const itemName = `${household.name} - Kassensturz vom ${formatDateOnly(referenceDay, language, referenceDay)}`;
    const currencyCode = household.currency || "EUR";
    const appOrigin = typeof window !== "undefined" ? window.location.origin : "";
    const returnUrl = `${appOrigin}/redirect-payment/success`;
    const cancelReturnUrl = `${appOrigin}/redirect-payment/cancel`;

    if (target.paypal_name?.trim()) {
      const params = new URLSearchParams({
        cmd: "_xclick",
        business: target.paypal_name.trim(),
        amount: normalizedAmount.toFixed(2),
        currency_code: currencyCode,
        item_name: itemName,
        return: returnUrl,
        cancel_return: cancelReturnUrl
      });
      links.push({
        id: "paypal",
        label: t("finances.payWithPaypal"),
        href: `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`
      });
    }
    if (target.revolut_name?.trim()) {
      links.push({
        id: "revolut",
        label: t("finances.payWithRevolut"),
        href: `https://revolut.me/${encodePathSegment(target.revolut_name)}?amount=${normalizedAmount.toFixed(2)}`
      });
    }
    if (target.wero_name?.trim()) {
      links.push({
        id: "wero",
        label: t("finances.payWithWero"),
        href: `wero://pay?receiver=${encodeURIComponent(target.wero_name)}&amount=${normalizedAmount.toFixed(2)}`
      });
    }
    return links;
  };
  const settlementReferenceDate = lastCashAuditAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const reimbursementPreviewSummary = useMemo(() => {
    const positiveEntries = reimbursementPreview.filter((entry) => entry.value > 0.004);
    if (positiveEntries.length === 0) return null;

    const memberIds = [...new Set(positiveEntries.map((entry) => entry.memberId))];
    const totalAmount = positiveEntries.reduce((sum, entry) => sum + entry.value, 0);
    const amountLabel = formatMoney(totalAmount, locale);

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
  }, [locale, memberLabel, reimbursementPreview, t, userId]);
  const hasNewEntryDraftForPreview = useMemo(() => {
    const description = previewDescription.trim();
    const amount = Number(previewAmountInput);
    return description.length > 0 && Number.isFinite(amount) && amount > 0;
  }, [previewAmountInput, previewDescription]);
  const settlementTransfers = useMemo(() => calculateSettlementTransfers(balancesByMember), [balancesByMember]);
  const householdMemberIds = useMemo(() => [...new Set(members.map((member) => member.user_id))], [members]);
  const allMembersLabel = t("finances.allMembers");
  const andWord = t("common.and");
  const allExceptMemberLabel = (memberId: string, labelCase: MemberLabelCase) =>
    t("finances.allExceptMember", {
      member: memberLabel(memberId, labelCase)
    });
  const joinMemberNames = (names: string[]) => {
    if (names.length <= 1) return names[0] ?? "";
    if (names.length === 2) return `${names[0]} ${andWord} ${names[1]}`;
    const leading = names.slice(0, -1).join(", ");
    const trailing = names[names.length - 1];
    return `${leading} ${andWord} ${trailing}`;
  };
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
    return joinMemberNames(normalizedIds.map((memberId) => memberLabel(memberId, labelCase)));
  };
  const personalBalance = useMemo(
    () => balancesByMember.find((entry) => entry.memberId === userId)?.balance ?? 0,
    [balancesByMember, userId]
  );
  const isPersonalBalanceNegative = personalBalance < -0.004;
  const personalBalanceLabel = `${personalBalance > 0.004 ? "+" : ""}${formatMoney(personalBalance, locale)}`;
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
  const setOverviewMemberDraft = (memberId: string, patch: Partial<{ roomSizeSqm: string; commonAreaFactor: string }>) => {
    setMemberOverviewDrafts((current) => ({
      ...current,
      [memberId]: {
        roomSizeSqm: current[memberId]?.roomSizeSqm ?? "",
        commonAreaFactor: current[memberId]?.commonAreaFactor ?? "1",
        ...patch
      }
    }));
  };
  const onSaveAllOverviewMemberSettings = async () => {
    for (const member of members) {
      const draft = memberOverviewDrafts[member.user_id];
      if (!draft) continue;

      const parsedRoomSize = parseOptionalNumber(draft.roomSizeSqm);
      if (Number.isNaN(parsedRoomSize) || (parsedRoomSize !== null && parsedRoomSize <= 0)) {
        setOverviewMemberRentFormError(t("settings.roomSizeError"));
        return;
      }

      const parsedFactor = Number(draft.commonAreaFactor);
      if (!Number.isFinite(parsedFactor) || parsedFactor < 0 || parsedFactor > 2) {
        setOverviewMemberRentFormError(t("settings.commonFactorError"));
        return;
      }
    }

    setOverviewMemberRentFormError(null);
    setSavingOverviewMemberId("__all__");
    try {
      for (const member of members) {
        const draft = memberOverviewDrafts[member.user_id];
        if (!draft) continue;
        await onUpdateMemberSettingsForUser(member.user_id, {
          roomSizeSqm: parseOptionalNumber(draft.roomSizeSqm),
          commonAreaFactor: Number(draft.commonAreaFactor)
        });
      }
    } finally {
      setSavingOverviewMemberId(null);
    }
  };
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
      )
    });
  const entryDateText = (entry: FinanceEntry) => formatDateOnly(parseDateFallback(entry), language, parseDateFallback(entry));
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
  const financeEntrySuggestions = useMemo(() => {
    const byKey = new Map<string, FinanceEntrySuggestion>();
    entries.forEach((entry) => {
      const normalized = entry.description.trim();
      if (!normalized) return;
      const key = normalized.toLocaleLowerCase(language);
      const current = byKey.get(key);
      if (!current) {
        byKey.set(key, { key, title: normalized, count: 1 });
      } else {
        byKey.set(key, { ...current, count: current.count + 1 });
      }
    });
    return [...byKey.values()].sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.title.localeCompare(right.title, language);
    });
  }, [entries, language]);
  const entryNameSuggestions = useMemo(() => financeEntrySuggestions.map((entry) => entry.title), [financeEntrySuggestions]);
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
  const tryAutofillNewEntryFromDescription = (
    descriptionValue: string,
    options?: { forceCategoryFromSuggestion?: boolean }
  ) => {
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
    setPreviewAmountInput(String(matchedEntry.amount));
    const currentCategory = (addEntryForm.state.values.category ?? "").trim();
    const shouldAutofillCategory =
      options?.forceCategoryFromSuggestion === true ||
      currentCategory.length === 0 ||
      currentCategory.toLocaleLowerCase(language) === "general";
    if (shouldAutofillCategory) {
      addEntryForm.setFieldValue("category", matchedEntry.category || "general");
    }
    addEntryForm.setFieldValue("paidByUserIds", paidByUserIds);
    addEntryForm.setFieldValue("beneficiaryUserIds", beneficiaryUserIds);
    setPreviewPayerIds(paidByUserIds);
    setPreviewBeneficiaryIds(beneficiaryUserIds);
    addEntryForm.setFieldValue("entryDate", entryDate);
  };
  const {
    suggestions: entryDescriptionSuggestions,
    focused: entryDescriptionFocused,
    activeSuggestionIndex: activeEntryDescriptionSuggestionIndex,
    onFocus: onEntryDescriptionFocus,
    onBlur: onEntryDescriptionBlur,
    onKeyDown: onEntryDescriptionKeyDown,
    applySuggestion: onApplyEntryDescriptionSuggestion
  } = useSmartSuggestions<FinanceEntrySuggestion>({
    items: financeEntrySuggestions,
    query: addEntryForm.state.values.description,
    getLabel: (entry) => entry.title,
    onApply: (suggestion) => {
      addEntryForm.setFieldValue("description", suggestion.title);
      setPreviewDescription(suggestion.title);
      tryAutofillNewEntryFromDescription(suggestion.title, { forceCategoryFromSuggestion: true });
    },
    fuseOptions: {
      keys: [{ name: "title", weight: 1 }],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 2
    }
  });
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
  ) => {
    const isAddEntryForm = form === addEntryForm;

    return (
      <>
        <form.Field
          name="paidByUserIds"
          children={(field: { state: { value: string[] }; handleChange: (value: string[]) => void }) => (
            <MemberMultiSelectField
              compactLabel={compactLabel}
              label={t("finances.paidByLabel")}
              members={members}
              value={field.state.value}
              onChange={(value) => {
                field.handleChange(value);
                if (isAddEntryForm) setPreviewPayerIds(value);
              }}
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
              onChange={(value) => {
                field.handleChange(value);
                if (isAddEntryForm) setPreviewBeneficiaryIds(value);
              }}
              currentUserId={userId}
              youLabel={t("common.you")}
              placeholder={t("finances.forWhomLabel")}
            />
          )}
        />
      </>
    );
  };
  const handleReceiptFileSelect = async (file: File, form: typeof addEntryForm | typeof editEntryForm) => {
    try {
      const dataUrl = await compressImageToDataUrl(file);
      form.setFieldValue("receiptImageUrl", dataUrl);
      setReceiptUploadError(null);
    } catch {
      setReceiptUploadError(t("finances.receiptUploadError"));
    }
  };
  const renderReceiptFields = (
    form: typeof addEntryForm | typeof editEntryForm,
    refs: { uploadInputRef: RefObject<HTMLInputElement | null>; cameraInputRef: RefObject<HTMLInputElement | null> },
    compactLabel: boolean
  ) => (
    <form.Field
      name="receiptImageUrl"
      children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
        <div className="space-y-2">
          {compactLabel ? (
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("finances.receiptLabel")}</p>
          ) : (
            <Label>{t("finances.receiptLabel")}</Label>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              ref={refs.uploadInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void handleReceiptFileSelect(file, form);
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={refs.cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void handleReceiptFileSelect(file, form);
                event.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refs.uploadInputRef.current?.click()}
            >
              <Paperclip className="mr-1 h-4 w-4" />
              {t("finances.receiptUploadButton")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refs.cameraInputRef.current?.click()}
            >
              <Camera className="mr-1 h-4 w-4" />
              {t("finances.receiptCameraButton")}
            </Button>
            {field.state.value.trim().length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => field.handleChange("")}
              >
                {t("finances.receiptRemoveButton")}
              </Button>
            ) : null}
          </div>
          {field.state.value.trim().length > 0 ? (
            <a
              href={field.state.value}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-brand-100 bg-white px-2 py-1 text-xs text-brand-700 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-brand-300"
            >
              <img
                src={field.state.value}
                alt={t("finances.receiptPreviewAlt")}
                className="h-8 w-8 rounded object-cover"
              />
              <span>{t("finances.receiptPreviewLink")}</span>
            </a>
          ) : null}
        </div>
      )}
    />
  );
  const onStartEditEntry = (entry: FinanceEntry) => {
    setEntryBeingEdited(entry);
    setReceiptUploadError(null);
    editEntryForm.setFieldValue("description", entry.description);
    editEntryForm.setFieldValue("category", entry.category || "general");
    editEntryForm.setFieldValue("amount", String(entry.amount));
    editEntryForm.setFieldValue("receiptImageUrl", entry.receipt_image_url ?? "");
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

  useEffect(() => {
    const updateWidth = () => {
      const next =
        addEntryComposerContainerRef.current?.getBoundingClientRect().width ??
        addEntryRowRef.current?.getBoundingClientRect().width;
      if (!next || Number.isNaN(next)) return;
      setAddEntryPopoverWidth(Math.max(220, Math.round(next)));
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [isMobileAddEntryComposer]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const onChange = (event: MediaQueryListEvent) => setIsMobileAddEntryComposer(event.matches);
    setIsMobileAddEntryComposer(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const stopOcrCameraStream = useCallback(() => {
    if (!ocrStreamRef.current) return;
    ocrStreamRef.current.getTracks().forEach((track) => track.stop());
    ocrStreamRef.current = null;
  }, []);

  const startOcrCameraStream = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setOcrError(t("finances.ocrCameraNotSupported"));
      return;
    }

    try {
      setOcrError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      ocrStreamRef.current = stream;
      if (ocrVideoRef.current) {
        ocrVideoRef.current.srcObject = stream;
        await ocrVideoRef.current.play();
      }
    } catch {
      setOcrError(t("finances.ocrCameraAccessError"));
    }
  }, [t]);

  useEffect(() => {
    if (!ocrCameraDialogOpen) {
      stopOcrCameraStream();
      return;
    }
    void startOcrCameraStream();
    return () => stopOcrCameraStream();
  }, [ocrCameraDialogOpen, startOcrCameraStream, stopOcrCameraStream]);

  const captureAndAnalyzeOcr = useCallback(async () => {
    if (!ocrVideoRef.current || !ocrCanvasRef.current) return;
    if (ocrBusy) return;

    const detectorCtor = getTextDetectorConstructor();
    if (!detectorCtor) {
      setOcrError(t("finances.ocrUnsupported"));
      return;
    }

    const video = ocrVideoRef.current;
    const canvas = ocrCanvasRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      setOcrError(t("finances.ocrUnsupported"));
      return;
    }

    context.drawImage(video, 0, 0, width, height);

    setOcrBusy(true);
    setOcrError(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) {
        setOcrError(t("finances.ocrCaptureError"));
        return;
      }

      const bitmap = await createImageBitmap(blob);
      const detector = new detectorCtor({ languages: ["de", "en"] });
      const results = await detector.detect(bitmap);
      bitmap.close?.();
      const text = results.map((entry) => (entry.rawValue ?? entry.text ?? "").trim()).filter(Boolean).join("\n");

      const recognizedPrice = extractPriceFromOcrText(text);
      const recognizedProduct = extractProductFromOcrText(text);
      const candidate = {
        description: recognizedProduct ?? "",
        amount: recognizedPrice !== null ? recognizedPrice.toFixed(2) : "",
        fullText: text
      };
      setOcrCandidate(candidate);
      setOcrConfirmDialogOpen(true);
      setOcrCameraDialogOpen(false);
    } catch {
      setOcrError(t("finances.ocrReadError"));
    } finally {
      setOcrBusy(false);
    }
  }, [ocrBusy, t]);

  const useCameraInsteadOfAdd = useMemo(() => {
    const description = addEntryForm.state.values.description.trim();
    const amount = addEntryForm.state.values.amount.trim();
    return description.length === 0 && amount.length === 0;
  }, [addEntryForm.state.values.amount, addEntryForm.state.values.description]);
  const renderAddEntryComposer = (mobile: boolean) => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void addEntryForm.handleSubmit();
      }}
    >
      <div className="flex items-end">
        <addEntryForm.Field
          name="description"
          children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
            <div className="relative min-w-0 flex-1">
              <Popover>
                <PopoverAnchor asChild>
                  <div
                    ref={addEntryRowRef}
                    className="relative flex h-10 items-stretch overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-slate-700 dark:bg-slate-900 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200 dark:focus-within:border-slate-500 dark:focus-within:ring-slate-600/40"
                  >
                    <Input
                      value={field.state.value}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        field.handleChange(nextValue);
                        setPreviewDescription(nextValue);
                        tryAutofillNewEntryFromDescription(nextValue);
                      }}
                      onFocus={onEntryDescriptionFocus}
                      onBlur={(event) => {
                        onEntryDescriptionBlur();
                        tryAutofillNewEntryFromDescription(event.target.value);
                      }}
                      onKeyDown={onEntryDescriptionKeyDown}
                      placeholder={t("finances.descriptionPlaceholder")}
                      required
                      className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                    />
                    <addEntryForm.Field
                      name="amount"
                      children={(amountField: { state: { value: string }; handleChange: (value: string) => void }) => (
                        <div className="relative h-full w-28 shrink-0 border-l border-brand-200 dark:border-slate-700">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={amountField.state.value}
                            onChange={(event) => {
                              amountField.handleChange(event.target.value);
                              setPreviewAmountInput(event.target.value);
                            }}
                            placeholder={t("finances.amountPlaceholder")}
                            required
                            className="h-full rounded-none border-0 bg-transparent pr-7 shadow-none focus-visible:ring-0"
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 dark:text-slate-400">
                            €
                          </span>
                        </div>
                      )}
                    />
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-full w-10 shrink-0 rounded-none border-l border-brand-200 p-0 dark:border-slate-700"
                        aria-label={t("finances.moreOptions")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    {useCameraInsteadOfAdd ? (
                      <Button
                        type="button"
                        disabled={busy}
                        className="h-full shrink-0 rounded-none border-l border-brand-200 px-3 dark:border-slate-700"
                        onClick={() => {
                          setOcrError(null);
                          setOcrCameraDialogOpen(true);
                        }}
                      >
                        <Camera className="h-4 w-4 sm:hidden" />
                        <span className="hidden sm:inline">{t("finances.ocrCameraButton")}</span>
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        disabled={busy}
                        className="h-full shrink-0 rounded-none border-l border-brand-200 px-3 dark:border-slate-700"
                      >
                        <Plus className="h-4 w-4 sm:hidden" />
                        <span className="hidden sm:inline">{t("common.add")}</span>
                      </Button>
                    )}
                  </div>
                </PopoverAnchor>
                <PopoverContent
                  align="start"
                  side={mobile ? "top" : "bottom"}
                  sideOffset={12}
                  className="z-50 -translate-x-1.5 box-border w-auto space-y-3 rounded-xl border-brand-100 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 dark:border-slate-700"
                  style={{ width: `${addEntryPopoverWidth}px` }}
                >
                    <addEntryForm.Field
                      name="category"
                      children={(categoryField: { state: { value: string }; handleChange: (value: string) => void }) => (
                        <CategoryInputField
                          label={t("finances.subscriptionCategoryLabel")}
                          value={categoryField.state.value}
                          onChange={categoryField.handleChange}
                          placeholder={t("finances.categoryPlaceholder")}
                          suggestionsListId={categorySuggestionsListId}
                          hasSuggestions={categorySuggestions.length > 0}
                        />
                      )}
                    />
                    <addEntryForm.Field
                      name="entryDate"
                      children={(dateField: { state: { value: string }; handleChange: (value: string) => void }) => (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("finances.entryDate")}</p>
                          <Input
                            type="date"
                            lang={locale}
                            value={dateField.state.value}
                            onChange={(event) => dateField.handleChange(event.target.value)}
                            title={t("finances.entryDate")}
                          />
                        </div>
                      )}
                    />
                    {renderEntryMemberFields(addEntryForm, true)}
                    {renderReceiptFields(
                      addEntryForm,
                      {
                        uploadInputRef: addReceiptUploadInputRef,
                        cameraInputRef: addReceiptCameraInputRef
                      },
                      true
                    )}
                </PopoverContent>
              </Popover>
              {entryDescriptionFocused && entryDescriptionSuggestions.length > 0 ? (
                <div
                  className={`absolute left-0 right-0 z-50 rounded-xl border border-brand-100 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${
                    mobile ? "bottom-[calc(100%+0.65rem)]" : "top-[calc(100%+0.65rem)]"
                  } animate-in fade-in-0 zoom-in-95 duration-150`}
                >
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("finances.suggestionsTitle")}
                  </p>
                  <ul className="max-h-56 overflow-y-auto">
                    {entryDescriptionSuggestions.map((suggestion, index) => (
                      <li key={suggestion.key}>
                        <button
                          type="button"
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-brand-50 dark:hover:bg-slate-800 ${
                            index === activeEntryDescriptionSuggestionIndex ? "bg-brand-50 dark:bg-slate-800" : ""
                          }`}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            onApplyEntryDescriptionSuggestion(suggestion);
                          }}
                        >
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            {suggestion.title}
                          </p>
                          <Badge className="text-[10px]">
                            {t("finances.suggestionUsedCount", { count: suggestion.count })}
                          </Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        />
      </div>
    </form>
  );

  return (
    <div
      className={`space-y-4 ${showOverview && isMobileAddEntryComposer ? "pb-44" : ""}`}
    >
      {showOverview ? (
        <>
          {!isMobileAddEntryComposer ? (
            <Card
              className={`relative mb-4 ${entryDescriptionFocused ? "z-40" : "z-0"}`}
            >
              <CardHeader>
                <CardTitle>{t("finances.newEntryTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                {renderAddEntryComposer(false)}

                {hasNewEntryDraftForPreview && reimbursementPreviewSummary ? (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                    {reimbursementPreviewSummary}
                  </p>
                ) : null}
                {receiptUploadError ? (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">
                    {receiptUploadError}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          {isMobileAddEntryComposer ? (
            <div
              className={`fixed inset-x-0 z-40 px-3 sm:hidden ${
                mobileTabBarVisible
                  ? "bottom-[calc(env(safe-area-inset-bottom)+3.75rem)]"
                  : "bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]"
              }`}
            >
              <div
                ref={addEntryComposerContainerRef}
                className="rounded-2xl border border-brand-200/70 bg-white/75 p-1.5 shadow-xl backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/75"
              >
                {renderAddEntryComposer(true)}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {showStats ? (
        <>
          <SectionPanel className="mb-4">
            <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
              {t("finances.settlementTitle")}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {lastCashAuditAt
                ? t("finances.settlementSince", {
                    date: formatDateOnly(
                      lastCashAuditAt,
                      language,
                      lastCashAuditAt.slice(0, 10),
                    ),
                  })
                : t("finances.settlementSinceStart")}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("finances.settlementStats", {
                count: entriesSinceLastAudit.length,
                total: formatMoney(periodTotal, locale),
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
                        <span
                          className={
                            entry.memberId === userId
                              ? "font-semibold"
                              : "text-slate-700 dark:text-slate-300"
                          }
                        >
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
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {t("finances.settlementEmpty")}
              </p>
            )}

            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAuditDialogOpen(true)}
              >
                {t("finances.startAudit")}
              </Button>
            </div>
          </SectionPanel>

          <Dialog open={auditDialogOpen} onOpenChange={setAuditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("finances.auditDialogTitle")}</DialogTitle>
                <DialogDescription>
                  {t("finances.auditDialogDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
                  {t("finances.settlementPlanTitle")}
                </p>
                {settlementTransfers.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {settlementTransfers.map((transfer, index) => (
                      <li
                        key={`${transfer.fromMemberId}-${transfer.toMemberId}-${index}`}
                        className="text-sm text-slate-700 dark:text-slate-200"
                      >
                        {t("finances.settlementTransferLine", {
                          from: memberLabel(transfer.fromMemberId),
                          to: memberLabel(transfer.toMemberId),
                          amount: moneyLabel(transfer.amount),
                        })}
                        {transfer.fromMemberId === userId &&
                        buildPaymentLinks(
                          transfer.toMemberId,
                          transfer.amount,
                          settlementReferenceDate,
                        ).length > 0 ? (
                          <span className="ml-2 inline-flex gap-2 text-xs">
                            {buildPaymentLinks(
                              transfer.toMemberId,
                              transfer.amount,
                              settlementReferenceDate,
                            ).map((link) => (
                              <a
                                key={`${transfer.fromMemberId}-${transfer.toMemberId}-${index}-${link.id}`}
                                href={link.href}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-600 dark:text-brand-300 dark:decoration-brand-700"
                              >
                                <PaymentBrandIcon
                                  brand={link.id}
                                  className="h-3.5 w-3.5"
                                />
                                {link.label}
                              </a>
                            ))}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {t("finances.settlementPlanEmpty")}
                  </p>
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
            <p className="mb-2 text-sm font-semibold text-brand-900 dark:text-brand-100">
              {t("finances.historyTitle")}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t("finances.filteredTotal", {
                value: formatMoney(filteredTotal, locale),
                count: filteredEntries.length,
              })}
            </p>

            {historySeries.labels.length > 0 ? (
              <div className="mt-3 rounded-lg bg-white p-2 dark:bg-slate-900">
                <Bar
                  data={{
                    labels: historySeries.labels.map((label) =>
                      formatShortDay(label, language, label),
                    ),
                    datasets: historySeries.datasets.map((dataset) => ({
                      label: memberLabel(dataset.memberId),
                      data: dataset.values,
                      backgroundColor: resolveMemberColor(dataset.memberId),
                      borderColor: "transparent",
                      borderWidth: 0,
                      borderRadius: 6,
                    })),
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                      mode: "index",
                      intersect: false,
                    },
                    plugins: {
                      legend: { display: true, position: "bottom" },
                      tooltip: {
                        callbacks: {
                          label: (context) => {
                            const value = Number(context.parsed.y ?? 0);
                            return `${context.dataset.label ?? t("common.memberFallback")}: ${formatMoney(value, locale)}`;
                          },
                          footer: (items) => {
                            const total = items.reduce(
                              (sum, item) => sum + Number(item.parsed.y ?? 0),
                              0,
                            );
                            return t("finances.chartStackTotal", {
                              value: formatMoney(total, locale),
                            });
                          },
                        },
                      },
                    },
                    scales: {
                      x: { stacked: true },
                      y: { stacked: true, beginAtZero: true },
                    },
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
                          "rgba(14, 165, 233, 0.7)",
                        ],
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                  }}
                  height={210}
                />
              </div>
            ) : null}
          </SectionPanel>

          {byUser.length > 0 ? (
            <SectionPanel className="mt-4">
              <p className="mb-2 text-sm font-semibold text-brand-900 dark:text-brand-100">
                {t("finances.byMember")}
              </p>
              <ul className="space-y-1 text-sm">
                {byUser.map(([memberId, value]) => (
                  <li key={memberId} className="flex justify-between gap-2">
                    <span
                      className={
                        memberId === userId
                          ? "font-medium"
                          : "text-slate-600 dark:text-slate-300"
                      }
                    >
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
          <Card>
            <CardHeader>
              <CardTitle>

            <div className="mb-2 flex items-center justify-between gap-2">
                {t("finances.historyTitle")}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setArchiveFilterDialogOpen(true)}
              >
                <SlidersHorizontal className="mr-1 h-4 w-4" />
                {t("finances.filtersButton")}
              </Button>
            </div>
              </CardTitle>
            </CardHeader>

            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t("finances.filteredTotal", {
                value: formatMoney(filteredTotal, locale),
                count: filteredEntries.length,
              })}
            </p>
          </Card>

          <Dialog
            open={archiveFilterDialogOpen}
            onOpenChange={setArchiveFilterDialogOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("finances.filtersDialogTitle")}</DialogTitle>
                <DialogDescription>
                  {t("finances.filtersDialogDescription")}
                </DialogDescription>
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
                    children={(field: {
                      state: { value: string };
                      handleChange: (value: string) => void;
                    }) => (
                      <div className="space-y-1">
                        <Label>{t("finances.filterFrom")}</Label>
                        <Input
                          type="date"
                          lang={locale}
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          title={t("finances.filterFrom")}
                        />
                      </div>
                    )}
                  />
                  <archiveFilterForm.Field
                    name="filterTo"
                    children={(field: {
                      state: { value: string };
                      handleChange: (value: string) => void;
                    }) => (
                      <div className="space-y-1">
                        <Label>{t("finances.filterTo")}</Label>
                        <Input
                          type="date"
                          lang={locale}
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          title={t("finances.filterTo")}
                        />
                      </div>
                    )}
                  />
                  <archiveFilterForm.Field
                    name="filterMember"
                    children={(field: {
                      state: { value: string };
                      handleChange: (value: string) => void;
                    }) => (
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
                    children={(field: {
                      state: { value: string };
                      handleChange: (value: string) => void;
                    }) => (
                      <div className="space-y-1">
                        <Label>{t("finances.filterByCategory")}</Label>
                        <Select
                          value={field.state.value}
                          onValueChange={field.handleChange}
                        >
                          <SelectTrigger
                            aria-label={t("finances.filterByCategory")}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">
                              {t("finances.filterByCategoryAll")}
                            </SelectItem>
                            {categories.map((entryCategory) => (
                              <SelectItem
                                key={entryCategory}
                                value={entryCategory}
                              >
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
                    children={(field: {
                      state: { value: string };
                      handleChange: (value: string) => void;
                    }) => (
                      <div className="space-y-1">
                        <Label>{t("finances.searchLabel")}</Label>
                        <Input
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
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
                      count: group.entries.length,
                    })}
                  </div>
                  <div className="mt-1">
                    {t("finances.settlementPlanTitle")}:
                  </div>
                  {group.settlementTransfers.length > 0 ? (
                    <div className="mt-1">
                      {group.settlementTransfers.map((transfer, index) => (
                        <div key={`${group.id}-transfer-${index}`}>
                          {t("finances.settlementTransferLine", {
                            from: memberLabel(transfer.fromMemberId),
                            to: memberLabel(transfer.toMemberId),
                            amount: moneyLabel(transfer.amount),
                          })}
                          {transfer.fromMemberId === userId &&
                          buildPaymentLinks(
                            transfer.toMemberId,
                            transfer.amount,
                            group.id.startsWith("audit-")
                              ? group.id.replace("audit-", "")
                              : settlementReferenceDate,
                          ).length > 0 ? (
                            <span className="ml-2 inline-flex gap-2 text-xs">
                              {buildPaymentLinks(
                                transfer.toMemberId,
                                transfer.amount,
                                group.id.startsWith("audit-")
                                  ? group.id.replace("audit-", "")
                                  : settlementReferenceDate,
                              ).map((link) => (
                                <a
                                  key={`${group.id}-transfer-link-${index}-${link.id}`}
                                  href={link.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-600 dark:text-brand-300 dark:decoration-brand-700"
                                >
                                  <PaymentBrandIcon
                                    brand={link.id}
                                    className="h-3.5 w-3.5"
                                  />
                                  {link.label}
                                </a>
                              ))}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1">
                      {t("finances.settlementPlanEmpty")}
                    </div>
                  )}
                </>
              }
              totalBadgeText={moneyLabel(group.total)}
              entries={group.entries}
              emptyText={t("finances.emptyFiltered")}
              paidByText={paidByText}
              receiptImageUrl={(entry) => entry.receipt_image_url}
              receiptLabel={t("finances.receiptLink")}
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
              canEditEntry={
                group.isEditable ? canManageFinanceEntry : undefined
              }
              canDeleteEntry={
                group.isEditable ? canManageFinanceEntry : undefined
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
          {!rentDetailsOpen ? (
            <button
              type="button"
              className="mb-0 w-full rounded-xl border border-brand-100 bg-white p-3 text-left transition hover:border-brand-200 hover:bg-brand-50/30 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800/70"
              onClick={() => setRentDetailsOpen(true)}
            >
              <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
                {t("finances.rentCardTitle")}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  {t("finances.rentTotalMonthlyLabel")}
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {rentTotalMonthly === null
                    ? "-"
                    : moneyLabel(rentTotalMonthly)}
                </span>
              </div>
              {members.length > 0 ? (
                <ul className="mt-2 space-y-1 border-t border-brand-100 pt-2 dark:border-slate-700">
                  {members.map((member) => {
                    const perMemberRent =
                      costTableData.byMember.get(member.user_id)
                        ?.totalBeforeContracts ?? null;
                    return (
                      <li
                        key={`rent-card-member-${member.user_id}`}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="text-slate-600 dark:text-slate-300">
                          {memberLabel(member.user_id)}
                        </span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {perMemberRent === null
                            ? "-"
                            : moneyLabel(perMemberRent)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </button>
          ) : null}

          {rentDetailsOpen ? (
            <>
              <div className="mb-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRentDetailsOpen(false)}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  {t("common.back")}
                </Button>
              </div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
                    {t("finances.rentCardTitle")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("finances.rentCardDescription")}
                  </p>
                </div>
              </div>

              <SectionPanel className="mt-4">
                <>
                  <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
                    {t("finances.rentApartmentTitle")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("finances.rentApartmentDescription")}
                  </p>

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
                      children={(field: {
                        state: { value: string };
                        handleChange: (value: string) => void;
                      }) => (
                        <div className="space-y-1">
                          <Label>{t("settings.householdSizeLabel")}</Label>
                          <InputWithSuffix
                            suffix="m²"
                            type="number"
                            min="0.1"
                            step="0.1"
                            disabled={!canEditApartment}
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            placeholder={t("settings.householdSizeLabel")}
                          />
                        </div>
                      )}
                    />
                    <rentHouseholdForm.Field
                      name="coldRentMonthly"
                      children={(field: {
                        state: { value: string };
                        handleChange: (value: string) => void;
                      }) => (
                        <div className="space-y-1">
                          <Label>{t("settings.coldRentLabel")}</Label>
                          <InputWithSuffix
                            suffix="€"
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!canEditApartment}
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            placeholder={t("settings.coldRentLabel")}
                            inputClassName="pr-7"
                          />
                        </div>
                      )}
                    />
                    <rentHouseholdForm.Field
                      name="utilitiesMonthly"
                      children={(field: {
                        state: { value: string };
                        handleChange: (value: string) => void;
                      }) => (
                        <div className="space-y-1">
                          <Label>{t("settings.utilitiesLabel")}</Label>
                          <InputWithSuffix
                            suffix="€"
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!canEditApartment}
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            placeholder={t("settings.utilitiesLabel")}
                            inputClassName="pr-7"
                          />
                        </div>
                      )}
                    />
                    <rentHouseholdForm.Field
                      name="utilitiesOnRoomSqmPercent"
                      children={(field: {
                        state: { value: string };
                        handleChange: (value: string) => void;
                      }) => (
                        <div className="space-y-1">
                          <Label>
                            {t("settings.utilitiesOnRoomSqmPercentLabel")}
                          </Label>
                          <InputWithSuffix
                            suffix="%"
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            disabled={!canEditApartment}
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            placeholder={t(
                              "settings.utilitiesOnRoomSqmPercentLabel",
                            )}
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
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {t("finances.rentOwnerOnlyHint")}
                    </p>
                  ) : null}

                  {rentFormError ? (
                    <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                      {rentFormError}
                    </p>
                  ) : null}

                  <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/30 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/40">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-300">
                        {t("finances.rentColdPerSqmLabel")}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {formatMoneyPerSqm(rentColdPerSqm)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-300">
                        {t("finances.rentRoomPerSqmWithUtilitiesLabel")}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {formatMoneyPerSqm(rentRoomPerSqmWithUtilities)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-300">
                        {t("finances.rentTotalPerSqmLabel")}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {formatMoneyPerSqm(rentTotalPerSqm)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-300">
                        {t("finances.rentTotalMonthlyLabel")}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {rentTotalMonthly === null
                          ? "-"
                          : moneyLabel(rentTotalMonthly)}
                      </span>
                    </div>
                  </div>
                </>
              </SectionPanel>

              <SectionPanel className="mt-4">
                <>
                  <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
                    {t("finances.rentMineTitle")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("finances.rentMineDescription")}
                  </p>

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
                      children={(field: {
                        state: { value: string };
                        handleChange: (value: string) => void;
                      }) => (
                        <div className="space-y-1">
                          <Label>{t("settings.roomSizeLabel")}</Label>
                          <InputWithSuffix
                            suffix="m²"
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            placeholder={t("settings.roomSizeLabel")}
                          />
                        </div>
                      )}
                    />
                    <rentMemberForm.Field
                      name="commonAreaFactor"
                      children={(field: {
                        state: { value: string };
                        handleChange: (value: string) => void;
                      }) => {
                        const parsed = Number(field.state.value);
                        const sliderValue = Number.isFinite(parsed)
                          ? clamp(parsed, COMMON_FACTOR_MIN, COMMON_FACTOR_MAX)
                          : 1;
                        const percentage = Math.round(sliderValue * 100);
                        const levelIndex = Math.min(
                          9,
                          Math.floor((sliderValue / COMMON_FACTOR_MAX) * 10),
                        );
                        const level = commonFactorLevelMeta[levelIndex];
                        const LevelIcon = level.icon;
                        const hue = Math.round(
                          (sliderValue / COMMON_FACTOR_MAX) * 120,
                        );
                        const sliderStyle = {
                          "--slider-gradient":
                            "linear-gradient(90deg, #ef4444 0%, #f59e0b 25%, #22c55e 50%, #16a34a 75%, #15803d 100%)",
                          "--slider-thumb": `hsl(${hue} 80% 42%)`,
                        } as CSSProperties;

                        return (
                          <div className="space-y-2 sm:col-span-2">
                            <input
                              type="range"
                              min={COMMON_FACTOR_MIN}
                              max={COMMON_FACTOR_MAX}
                              step="0.01"
                              value={sliderValue}
                              onChange={(event) =>
                                field.handleChange(event.target.value)
                              }
                              className="common-factor-slider w-full"
                              style={sliderStyle}
                              aria-label={t("settings.commonFactorLabel")}
                            />
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-rose-600 dark:text-rose-400">
                                0
                              </span>
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                1.00
                              </span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                2.00
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div
                                className={`inline-flex items-center gap-1 text-xs font-semibold ${level.className}`}
                              >
                                {renderSparkleIcon(LevelIcon)}
                                {t(
                                  `settings.commonFactorLevel${levelIndex + 1}`,
                                )}
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
                </>
              </SectionPanel>

              <SectionPanel className="mt-4">
                <>
                  <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
                    {t("finances.rentOverviewTitle")}
                  </p>
                  <div className="mt-2 overflow-x-auto rounded-xl border border-brand-100 dark:border-slate-700">
                    <table className="min-w-[200px] w-full text-sm">
                      <thead className="bg-brand-50/50 dark:bg-slate-800/60">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">
                            {t("common.memberFallback")}
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">
                            {t("settings.roomSizeLabel")}
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">
                            {t("settings.commonFactorLabel")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((member) => (
                          <tr
                            key={member.user_id}
                            className="border-t border-brand-100 dark:border-slate-700"
                          >
                            <td
                              className={`px-3 py-2 ${
                                member.user_id === userId
                                  ? "font-semibold text-slate-900 dark:text-slate-100"
                                  : "text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              {memberLabel(member.user_id)}
                            </td>
                            <td className="px-3 py-2">
                              {canEditApartment ? (
                                <div className="w-28">
                                  <InputWithSuffix
                                    suffix="m²"
                                    type="number"
                                    min="0.1"
                                    step="0.1"
                                    value={
                                      memberOverviewDrafts[member.user_id]
                                        ?.roomSizeSqm ?? ""
                                    }
                                    onChange={(event) =>
                                      setOverviewMemberDraft(member.user_id, {
                                        roomSizeSqm: event.target.value,
                                      })
                                    }
                                    placeholder={t("settings.roomSizeLabel")}
                                  />
                                </div>
                              ) : (
                                <span className="text-slate-600 dark:text-slate-300">
                                  {formatSqm(member.room_size_sqm)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {canEditApartment ? (
                                <Input
                                  className="w-24"
                                  type="number"
                                  min="0"
                                  max="2"
                                  step="0.01"
                                  value={
                                    memberOverviewDrafts[member.user_id]
                                      ?.commonAreaFactor ?? "1"
                                  }
                                  onChange={(event) =>
                                    setOverviewMemberDraft(member.user_id, {
                                      commonAreaFactor: event.target.value,
                                    })
                                  }
                                  placeholder={t("settings.commonFactorLabel")}
                                />
                              ) : (
                                <span className="text-slate-600 dark:text-slate-300">
                                  {t("finances.rentFactorValue", {
                                    value: member.common_area_factor.toFixed(2),
                                  })}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-dashed border-brand-200 bg-brand-50/20 dark:border-slate-700 dark:bg-slate-800/40">
                          <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-300">
                            {t("finances.sharedAreaLabel")}
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                            {formatSqm(sharedAreaSqm)}
                          </td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                            -
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {canEditApartment && members.length > 0 ? (
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void onSaveAllOverviewMemberSettings()}
                        disabled={busy || savingOverviewMemberId !== null}
                      >
                        {t("finances.rentSaveMember")}
                      </Button>
                    </div>
                  ) : null}
                  {overviewMemberRentFormError ? (
                    <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                      {overviewMemberRentFormError}
                    </p>
                  ) : null}
                  {members.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      {t("finances.rentAreaOverviewEmpty")}
                    </p>
                  ) : null}
                </>
              </SectionPanel>

              <SectionPanel className="mt-4">
                <>
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
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                            {t("finances.costBreakdownColdRoom")}
                          </td>
                          {members.map((member) => {
                            const value =
                              costTableData.byMember.get(member.user_id)
                                ?.coldForRoom ?? null;
                            return (
                              <td
                                key={`cost-breakdown-cold-${member.user_id}`}
                                className="px-3 py-2 text-right font-medium text-slate-900 dark:text-slate-100"
                              >
                                {value === null ? "-" : moneyLabel(value)}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {costTableTotals.coldForRoom === null
                              ? "-"
                              : moneyLabel(costTableTotals.coldForRoom)}
                          </td>
                        </tr>
                        <tr className="border-t border-brand-100 dark:border-slate-700">
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                            {t("finances.costBreakdownUtilitiesRoom")}
                          </td>
                          {members.map((member) => {
                            const value =
                              costTableData.byMember.get(member.user_id)
                                ?.utilitiesForRoom ?? null;
                            return (
                              <td
                                key={`cost-breakdown-utilities-${member.user_id}`}
                                className="px-3 py-2 text-right font-medium text-slate-900 dark:text-slate-100"
                              >
                                {value === null ? "-" : moneyLabel(value)}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {costTableTotals.utilitiesForRoom === null
                              ? "-"
                              : moneyLabel(costTableTotals.utilitiesForRoom)}
                          </td>
                        </tr>
                        <tr className="border-t-4 border-double border-brand-300 dark:border-slate-500 bg-brand-50/20 dark:bg-slate-800/30">
                          <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                            {t("finances.costBreakdownRoomSubtotal")}
                          </td>
                          {members.map((member) => {
                            const value =
                              costTableData.byMember.get(member.user_id)
                                ?.roomSubtotal ?? null;
                            return (
                              <td
                                key={`cost-breakdown-subtotal-${member.user_id}`}
                                className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100"
                              >
                                {value === null ? "-" : moneyLabel(value)}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {costTableTotals.roomSubtotal === null
                              ? "-"
                              : moneyLabel(costTableTotals.roomSubtotal)}
                          </td>
                        </tr>
                        <tr className="border-t-4 border-double border-brand-300 dark:border-slate-500">
                          <td className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300">
                            {t("finances.costBreakdownSharedAreaCosts")}
                          </td>
                          {members.map((member) => (
                            <td
                              key={`cost-breakdown-shared-area-empty-${member.user_id}`}
                              className="px-3 py-2 text-right font-medium text-slate-500 dark:text-slate-300"
                            >
                              -
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {costTableTotals.sharedAreaColdCosts === null
                              ? "-"
                              : moneyLabel(costTableTotals.sharedAreaColdCosts)}
                          </td>
                        </tr>
                        <tr className="border-t border-brand-100 dark:border-slate-700">
                          <td className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300">
                            {t("finances.costBreakdownSharedUtilitiesCosts")}
                          </td>
                          {members.map((member) => (
                            <td
                              key={`cost-breakdown-shared-utilities-empty-${member.user_id}`}
                              className="px-3 py-2 text-right font-medium text-slate-500 dark:text-slate-300"
                            >
                              -
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {costTableTotals.sharedUtilitiesCosts === null
                              ? "-"
                              : moneyLabel(
                                  costTableTotals.sharedUtilitiesCosts,
                                )}
                          </td>
                        </tr>
                        <tr className="border-t border-brand-100 dark:border-slate-700">
                          <td className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300">
                            {t("finances.costBreakdownRemainingApartment")}
                          </td>
                          {members.map((member) => (
                            <td
                              key={`cost-breakdown-remaining-empty-${member.user_id}`}
                              className="px-3 py-2 text-right font-medium text-slate-500 dark:text-slate-300"
                            >
                              -
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {costTableTotals.remainingApartmentCosts === null
                              ? "-"
                              : moneyLabel(
                                  costTableTotals.remainingApartmentCosts,
                                )}
                          </td>
                        </tr>
                        <tr className="border-t border-brand-100 dark:border-slate-700">
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                            {t("finances.costBreakdownCommonShare")}
                          </td>
                          {members.map((member) => {
                            const value =
                              costTableData.byMember.get(member.user_id)
                                ?.commonCostsShare ?? null;
                            return (
                              <td
                                key={`cost-breakdown-common-${member.user_id}`}
                                className="px-3 py-2 text-right font-medium text-slate-900 dark:text-slate-100"
                              >
                                {value === null ? "-" : moneyLabel(value)}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {costTableTotals.commonCostsShare === null
                              ? "-"
                              : moneyLabel(costTableTotals.commonCostsShare)}
                          </td>
                        </tr>
                        <tr className="border-t-4 border-double border-brand-300 dark:border-slate-500 bg-brand-50/20 dark:bg-slate-800/30">
                          <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                            {t("finances.costBreakdownTotal")}
                          </td>
                          {members.map((member) => {
                            const value =
                              costTableData.byMember.get(member.user_id)
                                ?.totalBeforeContracts ?? null;
                            return (
                              <td
                                key={`cost-breakdown-total-${member.user_id}`}
                                className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100"
                              >
                                {value === null ? "-" : moneyLabel(value)}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {costTableTotals.totalBeforeContracts === null
                              ? "-"
                              : moneyLabel(
                                  costTableTotals.totalBeforeContracts,
                                )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              </SectionPanel>
            </>
          ) : null}

          {!rentDetailsOpen ? (
            <SectionPanel className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
                    {t("finances.subscriptionListTitle")}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {t("finances.subscriptionsDescription")}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => setSubscriptionDialogOpen(true)}
                  disabled={busy}
                >
                  {t("finances.addSubscriptionAction")}
                </Button>
              </div>

              {subscriptions.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {t("finances.subscriptionEmpty")}
                </p>
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
                            <p className="font-medium text-slate-900 dark:text-slate-100">
                              {subscription.name}
                            </p>
                            <Badge className="text-[10px]">
                              {subscription.category}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t("finances.subscriptionRecursLabel", {
                              value: recurrenceLabel(subscription),
                            })}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {subscriptionParticipantsText(subscription)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <p className="text-sm font-semibold text-brand-800 dark:text-brand-200">
                            {moneyLabel(subscription.amount)}
                          </p>
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
                              <DropdownMenuItem
                                onClick={() =>
                                  onStartEditSubscription(subscription)
                                }
                              >
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
          ) : null}

          {!rentDetailsOpen ? (
            <SectionPanel className="mt-4">
              <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
                {t("finances.rentSummaryTitle")}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t("finances.rentSummaryDescription")}
              </p>
              <div className="mt-3 overflow-x-auto rounded-xl border border-brand-100 dark:border-slate-700">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="bg-brand-50/50 dark:bg-slate-800/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">
                        {t("finances.costBreakdownRowLabel")}
                      </th>
                      {members.map((member) => (
                        <th
                          key={`rent-summary-head-${member.user_id}`}
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
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                        {t("finances.rentSummarySubtotal")}
                      </td>
                      {members.map((member) => {
                        const value =
                          costTableData.byMember.get(member.user_id)
                            ?.totalBeforeContracts ?? null;
                        return (
                          <td
                            key={`rent-summary-subtotal-${member.user_id}`}
                            className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100"
                          >
                            {value === null ? "-" : moneyLabel(value)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {costTableTotals.totalBeforeContracts === null
                          ? "-"
                          : moneyLabel(costTableTotals.totalBeforeContracts)}
                      </td>
                    </tr>
                    <tr className="border-t border-brand-100 dark:border-slate-700">
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                        {t("finances.rentSummaryContracts")}
                      </td>
                      {members.map((member) => {
                        const value =
                          costTableData.byMember.get(member.user_id)
                            ?.extraContracts ?? 0;
                        return (
                          <td
                            key={`rent-summary-contracts-${member.user_id}`}
                            className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100"
                          >
                            {moneyLabel(value)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {moneyLabel(costTableTotals.extraContracts)}
                      </td>
                    </tr>
                    <tr className="border-t border-brand-100 bg-brand-100/40 dark:border-slate-700 dark:bg-slate-700/30">
                      <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">
                        {t("finances.rentSummaryGrandTotal")}
                      </td>
                      {members.map((member) => {
                        const value =
                          costTableData.byMember.get(member.user_id)
                            ?.grandTotal ?? null;
                        return (
                          <td
                            key={`rent-summary-grand-${member.user_id}`}
                            className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100"
                          >
                            {value === null ? "-" : moneyLabel(value)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {costTableTotals.grandTotal === null
                          ? "-"
                          : moneyLabel(costTableTotals.grandTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </SectionPanel>
          ) : null}
        </>
      ) : null}

      {showArchive && entries.length > 0 && filteredEntries.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("finances.emptyFiltered")}
        </p>
      ) : null}

      {showOverview ? (
        <>
          <Card className="relative z-0">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle>{t("finances.currentEntriesTitle")}</CardTitle>
                  <CardDescription>
                    {t("finances.currentEntriesDescription")}
                  </CardDescription>
                </div>
                <Badge
                  className={
                    isPersonalBalanceNegative
                      ? "text-xs border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-800/60 dark:bg-rose-900/40 dark:text-rose-200"
                      : "text-xs border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/40 dark:text-emerald-200"
                  }
                >
                  {t("finances.personalBalanceChip", {
                    value: personalBalanceLabel,
                  })}
                </Badge>
              </div>
            </CardHeader>
          </Card>
          {entriesSinceLastAudit.length > 0 ? (
            <div className="mt-4 space-y-3">
              {entriesSinceLastAudit.map((entry) => (
                <Card
                  key={entry.id}
                  className="relative z-0 rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4"
                >
                  <CardContent>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                          {entry.description}
                        </p>
                        <Badge className="w-fit text-[10px]">
                          {entry.category}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="flex flex-col items-end gap-1">
                          {personalEntryDeltaLabel(entry) ? (
                            <Badge
                              className={personalEntryDeltaChipClassName(entry)}
                            >
                              {personalEntryDeltaLabel(entry)}
                            </Badge>
                          ) : null}
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {moneyLabel(entry.amount)}
                          </p>
                        </div>
                        {canManageFinanceEntry(entry) ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                aria-label={t("finances.entryActions")}
                                disabled={busy}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => onStartEditEntry(entry)}
                              >
                                {t("finances.editEntry")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  void onDeleteEntry(entry);
                                }}
                                className="text-rose-600 dark:text-rose-300"
                              >
                                {t("finances.deleteEntry")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-1 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {paidByText(entry)}
                        </p>
                        {entry.receipt_image_url ? (
                          <a
                            href={entry.receipt_image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center text-xs text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-600 dark:text-brand-300 dark:decoration-brand-700"
                          >
                            {t("finances.receiptLink")}
                          </a>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                        {entryDateText(entry)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              {t("finances.empty")}
            </p>
          )}
        </>
      ) : null}

      <Dialog
        open={subscriptionDialogOpen}
        onOpenChange={setSubscriptionDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finances.addSubscriptionAction")}</DialogTitle>
            <DialogDescription>
              {t("finances.subscriptionsDescription")}
            </DialogDescription>
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
            <DialogDescription>
              {t("finances.editSubscriptionDescription")}
            </DialogDescription>
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
          if (!open) {
            setEntryBeingEdited(null);
            setReceiptUploadError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finances.editEntryTitle")}</DialogTitle>
            <DialogDescription>
              {t("finances.editEntryDescription")}
            </DialogDescription>
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
              children={(field: {
                state: { value: string };
                handleChange: (value: string) => void;
              }) => (
                <div className="space-y-1">
                  <Label>{t("finances.entryNameLabel")}</Label>
                  <Input
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("finances.descriptionPlaceholder")}
                    list={
                      entryNameSuggestions.length > 0
                        ? entryNameSuggestionsListId
                        : undefined
                    }
                    required
                  />
                </div>
              )}
            />
            <editEntryForm.Field
              name="amount"
              children={(field: {
                state: { value: string };
                handleChange: (value: string) => void;
              }) => (
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
              children={(field: {
                state: { value: string };
                handleChange: (value: string) => void;
              }) => (
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
              children={(field: {
                state: { value: string };
                handleChange: (value: string) => void;
              }) => (
                <div className="space-y-1">
                  <Label>{t("finances.entryDate")}</Label>
                  <Input
                    type="date"
                    lang={locale}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    title={t("finances.entryDate")}
                  />
                </div>
              )}
            />
            {renderReceiptFields(
              editEntryForm,
              {
                uploadInputRef: editReceiptUploadInputRef,
                cameraInputRef: editReceiptCameraInputRef,
              },
              false,
            )}
            {renderEntryMemberFields(editEntryForm, false)}
            {receiptUploadError ? (
              <p className="text-xs text-rose-600 dark:text-rose-300">
                {receiptUploadError}
              </p>
            ) : null}
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
      <Dialog
        open={ocrCameraDialogOpen}
        onOpenChange={(open) => {
          setOcrCameraDialogOpen(open);
          if (!open) setOcrError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finances.ocrDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("finances.ocrDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-brand-100 bg-black dark:border-slate-700">
              <video
                ref={ocrVideoRef}
                className="h-64 w-full object-cover"
                autoPlay
                muted
                playsInline
              />
            </div>
            <canvas ref={ocrCanvasRef} className="hidden" />
            {ocrError ? (
              <p className="text-xs text-rose-600 dark:text-rose-300">
                {ocrError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost" type="button">
                  {t("common.cancel")}
                </Button>
              </DialogClose>
              <Button
                type="button"
                onClick={() => void captureAndAnalyzeOcr()}
                disabled={ocrBusy}
              >
                {ocrBusy
                  ? t("finances.ocrReadingButton")
                  : t("finances.ocrCaptureButton")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={ocrConfirmDialogOpen}
        onOpenChange={(open) => {
          setOcrConfirmDialogOpen(open);
          if (!open) setOcrCandidate(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finances.ocrConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("finances.ocrConfirmDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
              <p>
                <span className="font-semibold">
                  {t("finances.entryNameLabel")}:
                </span>{" "}
                {ocrCandidate?.description || "-"}
              </p>
              <p>
                <span className="font-semibold">
                  {t("finances.entryAmountLabel")}:
                </span>{" "}
                {ocrCandidate?.amount || "-"}
              </p>
            </div>
            {ocrCandidate?.fullText ? (
              <details className="text-xs text-slate-500 dark:text-slate-400">
                <summary className="cursor-pointer">
                  {t("finances.ocrRawTextToggle")}
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-brand-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                  {ocrCandidate.fullText}
                </pre>
              </details>
            ) : null}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost" type="button">
                  {t("common.cancel")}
                </Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  type="button"
                  onClick={() => {
                    if (!ocrCandidate) return;
                    if (
                      !addEntryForm.state.values.description.trim() &&
                      ocrCandidate.description
                    ) {
                      addEntryForm.setFieldValue(
                        "description",
                        ocrCandidate.description,
                      );
                      setPreviewDescription(ocrCandidate.description);
                    }
                    if (
                      !addEntryForm.state.values.amount.trim() &&
                      ocrCandidate.amount
                    ) {
                      addEntryForm.setFieldValue("amount", ocrCandidate.amount);
                      setPreviewAmountInput(ocrCandidate.amount);
                    }
                  }}
                >
                  {t("finances.ocrApplyButton")}
                </Button>
              </DialogClose>
            </div>
          </div>
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
