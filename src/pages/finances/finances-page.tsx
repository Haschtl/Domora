import { type CSSProperties, type KeyboardEvent, type RefObject, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
  RotateCcw,
  Scale,
  SlidersHorizontal,
  Smile,
  Sparkles as SparklesIcon,
  TrendingDown,
  Zap,
  ZapOff
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
  HouseholdEvent,
  Household,
  HouseholdMember,
  HouseholdMemberVacation,
  NewFinanceSubscriptionInput,
  ShoppingItem,
  UpdateHouseholdInput
} from "../../lib/types";
import { isMemberOnVacationAt } from "../../lib/vacation-utils";
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
import { FullscreenDialog } from "../../components/ui/fullscreen-dialog";
import { Input } from "../../components/ui/input";
import { InputWithSuffix } from "../../components/ui/input-with-suffix";
import { Label } from "../../components/ui/label";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { SectionPanel } from "../../components/ui/section-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { Tooltip as RadixTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import { useSmartSuggestions } from "../../hooks/use-smart-suggestions";
import { suggestCategoryLabel } from "../../lib/category-heuristics";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";
import { getDateLocale } from "../../i18n";
import { createDiceBearAvatarDataUri, getMemberAvatarSeed } from "../../lib/avatar";
import { formatDateOnly, formatShortDay } from "../../lib/date";
import { calculateBalancesByMember, calculateSettlementTransfers, splitAmountEvenly } from "../../lib/finance-math";
import { createMemberLabelGetter, type MemberLabelCase } from "../../lib/member-label";
import { MemberAvatar } from "../../components/member-avatar";
import { ReceiptPreviewDialog } from "../../components/receipt-preview-dialog";
import { FinanceEntriesList } from "../../features/components/FinanceEntriesList";
import { FinanceHistoryCard } from "../../features/components/FinanceHistoryCard";
import { useFinancesDerivedData } from "../../features/hooks/use-finances-derived-data";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

interface FinancesPageProps {
  section?: "overview" | "stats" | "archive" | "subscriptions";
  entries: FinanceEntry[];
  entriesHasMore?: boolean;
  entriesLoadingMore?: boolean;
  onLoadMoreEntries?: () => void;
  subscriptions: FinanceSubscription[];
  cashAuditRequests: CashAuditRequest[];
  householdEvents: HouseholdEvent[];
  household: Household;
  currentMember: HouseholdMember | null;
  members: HouseholdMember[];
  memberVacations: HouseholdMemberVacation[];
  shoppingItems: ShoppingItem[];
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
  onToggleShoppingItem: (item: ShoppingItem) => Promise<void>;
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

const renderSparkleIcon = (
  Icon: (props: { className?: string }) => React.ReactNode,
) => {
  const icon = <Icon className="h-3.5 w-3.5" />;
  if (Icon !== SparklesIcon) return icon;
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      {icon}
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
  vacationMemberIds?: Set<string> | string[];
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
  vacationMemberIds,
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
      vacationMemberIds={vacationMemberIds}
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

const financeRecurrenceToCronPattern = (recurrence: FinanceSubscriptionRecurrence) => {
  if (recurrence === "weekly") return "0 9 * * 1";
  if (recurrence === "quarterly") return "0 9 1 */3 *";
  return "0 9 1 * *";
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

type OcrPreviewBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  text?: string;
  kind?: "price" | "product" | "other";
};

type OcrDetectionResult = {
  rawValue?: string;
  text?: string;
  boundingBox?: { x?: number; y?: number; width?: number; height?: number };
};
type OcrAmountCandidate = {
  value: number;
  token: string;
  score: number;
  index: number;
};
type OcrPassResult = {
  text: string;
  boxes: OcrPreviewBox[];
  meanConfidence: number;
  source: "detector" | "main" | "sparse" | "numeric" | "lowerNumeric" | "opencvSparse";
  region: "full" | "lower";
  numericFocused: boolean;
};
type OcrRankedAmountCandidate = {
  token: string;
  value: number;
  totalScore: number;
  maxScore: number;
  count: number;
  lastIndex: number;
};
type OcrDebugInfo = {
  sharpness: number;
  effectiveSharpness: number;
  passes: Array<{
    source: OcrPassResult["source"];
    region: OcrPassResult["region"];
    numericFocused: boolean;
    meanConfidence: number;
    textLength: number;
  }>;
  topAmountCandidates: OcrRankedAmountCandidate[];
};
type OcrCandidate = {
  description: string;
  amount: string;
  fullText: string;
  boxes: OcrPreviewBox[];
  debug?: OcrDebugInfo;
};
type TextDetectorLike = { detect: (input: ImageBitmapSource) => Promise<OcrDetectionResult[]> };
type TextDetectorConstructor = new (options?: { languages?: string[] }) => TextDetectorLike;
type TesseractWorkerLike = {
  recognize: (
    image: HTMLCanvasElement,
    options?: { rectangle?: { left: number; top: number; width: number; height: number } },
    output?: { text?: boolean; blocks?: boolean }
  ) => Promise<{
    data: {
      text: string;
      words?: Array<{ text?: string; confidence?: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }>;
      lines?: Array<{ text?: string; confidence?: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }>;
      blocks?: Array<{
        text?: string;
        confidence?: number;
        bbox?: { x0: number; y0: number; x1: number; y1: number };
        lines?: Array<{ text?: string; confidence?: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }>;
      }>;
    };
  }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

const getTextDetectorConstructor = (): TextDetectorConstructor | null => {
  if (typeof window === "undefined") return null;
  const maybeCtor = (window as unknown as { TextDetector?: TextDetectorConstructor }).TextDetector;
  return typeof maybeCtor === "function" ? maybeCtor : null;
};

const OCR_MIN_USEFUL_TEXT_LENGTH = 16;
const OCR_MAX_ANALYSIS_DIMENSION = 1800;
const OCR_MAX_PREVIEW_BOXES = 48;
const OCR_MIN_SHARPNESS_SCORE = 28;
const OCR_DEBUG_LOCALSTORAGE_KEY = "domora.ocr.debug-overlay.enabled";
const buildPublicAssetUrl = (relativePath: string) => {
  const basePath = import.meta.env.BASE_URL || "/";
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${normalizedBase}${relativePath.replace(/^\/+/, "")}`;
};
const LOCAL_TESSERACT_WORKER_PATH = buildPublicAssetUrl("tesseract/worker.min.js");
const LOCAL_TESSERACT_CORE_PATH = buildPublicAssetUrl("tesseract/core");
const LOCAL_TESSERACT_LANG_PATH = buildPublicAssetUrl("tesseract/lang");
let openCvModulePromise: Promise<Record<string, unknown> | null> | null = null;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const clampOcrSize = (width: number, height: number) => {
  if (width <= OCR_MAX_ANALYSIS_DIMENSION && height <= OCR_MAX_ANALYSIS_DIMENSION) {
    return { width, height };
  }
  const ratio = Math.min(OCR_MAX_ANALYSIS_DIMENSION / width, OCR_MAX_ANALYSIS_DIMENSION / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
};

const getOtsuThreshold = (pixels: Uint8ClampedArray) => {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 4) {
    histogram[pixels[i]] += 1;
  }
  const total = pixels.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = -1;
  let threshold = 128;

  for (let i = 0; i < 256; i += 1) {
    weightBackground += histogram[i];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += i * histogram[i];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }

  return threshold;
};

type OcrPreprocessMode = "balanced" | "highContrast" | "grayscale";

const preprocessOcrCanvas = (source: HTMLCanvasElement, mode: OcrPreprocessMode) => {
  const { width, height } = clampOcrSize(source.width, source.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return source;

  const filtersByMode: Record<OcrPreprocessMode, string> = {
    balanced: "grayscale(1) contrast(1.45) brightness(1.06)",
    highContrast: "grayscale(1) contrast(1.95) brightness(1.08)",
    grayscale: "grayscale(1) contrast(1.12) brightness(1.02)"
  };
  context.filter = filtersByMode[mode];
  context.drawImage(source, 0, 0, width, height);
  context.filter = "none";

  if (mode === "grayscale") {
    return canvas;
  }

  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const threshold = getOtsuThreshold(data) + (mode === "highContrast" ? -12 : 0);
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] >= threshold ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
};

const waitForOpenCvRuntime = async (cv: Record<string, unknown>) => {
  const cvAny = cv as {
    onRuntimeInitialized?: (() => void) | null;
    getBuildInformation?: (() => string) | undefined;
  };
  if (typeof cvAny.getBuildInformation === "function") return;
  if (!("onRuntimeInitialized" in cvAny)) return;

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 2500);
    cvAny.onRuntimeInitialized = () => {
      window.clearTimeout(timeout);
      resolve();
    };
  });
};

const getOpenCvModule = async () => {
  if (typeof window === "undefined") return null;
  if (openCvModulePromise) return openCvModulePromise;

  openCvModulePromise = (async () => {
    try {
      const moduleName = "@techstark/opencv-js";
      const module = (await import(/* @vite-ignore */ moduleName)) as Record<string, unknown>;
      const resolved = ((module.default as Record<string, unknown> | undefined) ?? module) as Record<string, unknown>;
      if (!resolved || typeof resolved !== "object" || !("Mat" in resolved)) return null;
      await waitForOpenCvRuntime(resolved);
      return resolved;
    } catch {
      return null;
    }
  })();

  return openCvModulePromise;
};

const estimateCanvasSharpness = (source: HTMLCanvasElement) => {
  const context = source.getContext("2d");
  if (!context || source.width < 3 || source.height < 3) return 0;
  const data = context.getImageData(0, 0, source.width, source.height).data;
  const width = source.width;
  const height = source.height;
  const gray = new Float32Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    gray[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const lap = -4 * gray[idx] + gray[idx - 1] + gray[idx + 1] + gray[idx - width] + gray[idx + width];
      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  return Math.sqrt(variance) / 4;
};

const preprocessOcrCanvasWithOpenCv = async (source: HTMLCanvasElement): Promise<{ canvas: HTMLCanvasElement | null; sharpness: number | null }> => {
  const cv = await getOpenCvModule();
  if (!cv) return { canvas: null, sharpness: null };
  const cvAny = cv as Record<string, unknown>;

  const { width, height } = clampOcrSize(source.width, source.height);
  const input = document.createElement("canvas");
  input.width = width;
  input.height = height;
  const inputContext = input.getContext("2d");
  if (!inputContext) return { canvas: null, sharpness: null };
  inputContext.drawImage(source, 0, 0, width, height);

  const src = (cvAny.imread as (canvas: HTMLCanvasElement) => { cols: number; rows: number; data32S?: Int32Array; delete?: () => void })(input);
  const gray = new (cvAny.Mat as new () => { delete?: () => void })();
  const laplacian = new (cvAny.Mat as new () => { data64F?: Float64Array; rows?: number; cols?: number; delete?: () => void })();
  const contours = new (cvAny.MatVector as new () => { size: () => number; get: (index: number) => { data32S?: Int32Array; rows?: number; cols?: number; delete?: () => void }; delete?: () => void })();
  const hierarchy = new (cvAny.Mat as new () => { delete?: () => void })();
  const edges = new (cvAny.Mat as new () => { rows?: number; cols?: number; data32S?: Int32Array; delete?: () => void })();
  const contourApprox = new (cvAny.Mat as new () => { rows?: number; data32S?: Int32Array; delete?: () => void })();
  const doc = new (cvAny.Mat as new () => { cols: number; rows: number; data32S?: Int32Array; delete?: () => void })();
  const blurred = new (cvAny.Mat as new () => { delete?: () => void })();
  const binary = new (cvAny.Mat as new () => { cols: number; rows: number; data32S?: Int32Array; delete?: () => void })();
  const cleaned = new (cvAny.Mat as new () => { cols: number; rows: number; delete?: () => void })();
  const resized = new (cvAny.Mat as new () => { delete?: () => void })();
  const rotationMatrix = new (cvAny.Mat as new () => { delete?: () => void })();
  const deskewed = new (cvAny.Mat as new () => { cols: number; rows: number; delete?: () => void })();
  const kernel = (cvAny.getStructuringElement as (shape: number, size: unknown) => { delete?: () => void })(
    cvAny.MORPH_RECT as number,
    new (cvAny.Size as new (width: number, height: number) => unknown)(2, 2)
  );

  try {
    (cvAny.cvtColor as (srcMat: unknown, dstMat: unknown, code: number, channels?: number) => void)(
      src,
      gray,
      cvAny.COLOR_RGBA2GRAY as number,
      0
    );
    (cvAny.Laplacian as (srcMat: unknown, dstMat: unknown, depth: number, ksize?: number, scale?: number, delta?: number, borderType?: number) => void)(
      gray,
      laplacian,
      cvAny.CV_64F as number,
      3,
      1,
      0,
      cvAny.BORDER_DEFAULT as number
    );
    const lapData = laplacian.data64F ?? new Float64Array();
    let lapSum = 0;
    let lapSq = 0;
    for (let i = 0; i < lapData.length; i += 1) {
      lapSum += lapData[i];
      lapSq += lapData[i] * lapData[i];
    }
    const lapMean = lapData.length > 0 ? lapSum / lapData.length : 0;
    const sharpness = lapData.length > 0 ? Math.sqrt(Math.max(0, lapSq / lapData.length - lapMean * lapMean)) / 4 : null;

    // Perspective correction by detecting the largest quadrilateral contour.
    (cvAny.Canny as (srcMat: unknown, dstMat: unknown, threshold1: number, threshold2: number) => void)(
      gray,
      edges,
      70,
      200
    );
    (cvAny.findContours as (image: unknown, contoursMat: unknown, hierarchyMat: unknown, mode: number, method: number) => void)(
      edges,
      contours,
      hierarchy,
      cvAny.RETR_LIST as number,
      cvAny.CHAIN_APPROX_SIMPLE as number
    );
    let bestQuad: number[] | null = null;
    let bestArea = 0;
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      const perimeter = (cvAny.arcLength as (curve: unknown, closed: boolean) => number)(contour, true);
      (cvAny.approxPolyDP as (curve: unknown, approxCurve: unknown, epsilon: number, closed: boolean) => void)(
        contour,
        contourApprox,
        0.02 * perimeter,
        true
      );
      const points = contourApprox.data32S ?? new Int32Array();
      const isQuad = contourApprox.rows === 4 && points.length >= 8;
      if (isQuad) {
        const area = Math.abs((cvAny.contourArea as (contour: unknown, oriented?: boolean) => number)(contourApprox, false));
        if (area > bestArea) {
          bestArea = area;
          bestQuad = Array.from(points.slice(0, 8));
        }
      }
      contour.delete?.();
    }

    let docSource: unknown = src;
    if (bestQuad && bestArea > src.cols * src.rows * 0.22) {
      const quadPoints: Array<[number, number]> = [
        [bestQuad[0] ?? 0, bestQuad[1] ?? 0],
        [bestQuad[2] ?? 0, bestQuad[3] ?? 0],
        [bestQuad[4] ?? 0, bestQuad[5] ?? 0],
        [bestQuad[6] ?? 0, bestQuad[7] ?? 0]
      ];
      const sorted = [...quadPoints].sort((a, b) => a[1] - b[1]);
      const top = sorted.slice(0, 2).sort((a, b) => a[0] - b[0]);
      const bottom = sorted.slice(2).sort((a, b) => a[0] - b[0]);
      const ordered: Array<[number, number]> = [top[0], top[1], bottom[1], bottom[0]];
      const dist = (left: [number, number], right: [number, number]) => Math.hypot(right[0] - left[0], right[1] - left[1]);
      const targetWidth = Math.max(1, Math.round(Math.max(dist(ordered[0], ordered[1]), dist(ordered[2], ordered[3]))));
      const targetHeight = Math.max(1, Math.round(Math.max(dist(ordered[0], ordered[3]), dist(ordered[1], ordered[2]))));
      const srcTri = (cvAny.matFromArray as (rows: number, cols: number, type: number, data: number[]) => unknown)(
        4,
        1,
        cvAny.CV_32FC2 as number,
        [ordered[0][0], ordered[0][1], ordered[1][0], ordered[1][1], ordered[2][0], ordered[2][1], ordered[3][0], ordered[3][1]]
      );
      const dstTri = (cvAny.matFromArray as (rows: number, cols: number, type: number, data: number[]) => unknown)(
        4,
        1,
        cvAny.CV_32FC2 as number,
        [0, 0, targetWidth - 1, 0, targetWidth - 1, targetHeight - 1, 0, targetHeight - 1]
      );
      const matrix = (cvAny.getPerspectiveTransform as (srcPts: unknown, dstPts: unknown) => unknown)(srcTri, dstTri);
      (cvAny.warpPerspective as (srcMat: unknown, dstMat: unknown, transform: unknown, size: unknown, flags?: number, borderMode?: number, borderValue?: unknown) => void)(
        src,
        doc,
        matrix,
        new (cvAny.Size as new (width: number, height: number) => unknown)(targetWidth, targetHeight),
        cvAny.INTER_LINEAR as number,
        cvAny.BORDER_REPLICATE as number,
        new (cvAny.Scalar as new (v0: number, v1: number, v2: number, v3: number) => unknown)(255, 255, 255, 255)
      );
      docSource = doc;
      (matrix as { delete?: () => void }).delete?.();
      (srcTri as { delete?: () => void }).delete?.();
      (dstTri as { delete?: () => void }).delete?.();
    }

    // Deskew: estimate dominant near-horizontal line angle and rotate back.
    const docGray = new (cvAny.Mat as new () => { rows?: number; cols?: number; data32S?: Int32Array; delete?: () => void })();
    const docEdges = new (cvAny.Mat as new () => { rows?: number; cols?: number; data32S?: Int32Array; delete?: () => void })();
    const lines = new (cvAny.Mat as new () => { data32S?: Int32Array; rows?: number; delete?: () => void })();
    (cvAny.cvtColor as (srcMat: unknown, dstMat: unknown, code: number, channels?: number) => void)(
      docSource,
      docGray,
      cvAny.COLOR_RGBA2GRAY as number,
      0
    );
    (cvAny.Canny as (srcMat: unknown, dstMat: unknown, threshold1: number, threshold2: number) => void)(docGray, docEdges, 50, 170);
    (cvAny.HoughLinesP as (image: unknown, linesMat: unknown, rho: number, theta: number, threshold: number, minLineLength?: number, maxLineGap?: number) => void)(
      docEdges,
      lines,
      1,
      Math.PI / 180,
      90,
      Math.max(30, Math.floor(((docGray.cols ?? width) + (docGray.rows ?? height)) * 0.12)),
      20
    );
    const lineData = lines.data32S ?? new Int32Array();
    const angles: number[] = [];
    for (let i = 0; i + 3 < lineData.length; i += 4) {
      const angle = (Math.atan2(lineData[i + 3] - lineData[i + 1], lineData[i + 2] - lineData[i]) * 180) / Math.PI;
      if (Math.abs(angle) <= 35) angles.push(angle);
    }
    angles.sort((left, right) => left - right);
    const deskewAngle = angles.length > 0 ? angles[Math.floor(angles.length / 2)] : 0;
    if (Math.abs(deskewAngle) >= 0.7) {
      const center = new (cvAny.Point as new (x: number, y: number) => unknown)((docGray.cols ?? width) / 2, (docGray.rows ?? height) / 2);
      const matrix = (cvAny.getRotationMatrix2D as (center: unknown, angle: number, scale: number) => unknown)(center, deskewAngle, 1);
      (cvAny.warpAffine as (srcMat: unknown, dstMat: unknown, transform: unknown, size: unknown, flags?: number, borderMode?: number, borderValue?: unknown) => void)(
        docSource,
        deskewed,
        matrix,
        new (cvAny.Size as new (width: number, height: number) => unknown)(docGray.cols ?? width, docGray.rows ?? height),
        cvAny.INTER_LINEAR as number,
        cvAny.BORDER_REPLICATE as number,
        new (cvAny.Scalar as new (v0: number, v1: number, v2: number, v3: number) => unknown)(255, 255, 255, 255)
      );
      docSource = deskewed;
      (matrix as { delete?: () => void }).delete?.();
    }
    docGray.delete?.();
    docEdges.delete?.();
    lines.delete?.();

    (cvAny.GaussianBlur as (srcMat: unknown, dstMat: unknown, ksize: unknown, sx: number, sy: number, bt?: number) => void)(
      docSource,
      blurred,
      new (cvAny.Size as new (width: number, height: number) => unknown)(3, 3),
      0,
      0,
      cvAny.BORDER_DEFAULT as number
    );
    (cvAny.adaptiveThreshold as (srcMat: unknown, dstMat: unknown, maxValue: number, adaptiveMethod: number, thresholdType: number, blockSize: number, c: number) => void)(
      blurred,
      binary,
      255,
      cvAny.ADAPTIVE_THRESH_GAUSSIAN_C as number,
      cvAny.THRESH_BINARY as number,
      31,
      12
    );
    (cvAny.morphologyEx as (srcMat: unknown, dstMat: unknown, op: number, kernelMat: unknown) => void)(
      binary,
      cleaned,
      cvAny.MORPH_CLOSE as number,
      kernel
    );

    const upscale = Math.min(1.6, Math.max(1, 1500 / Math.max(cleaned.cols, 1)));
    const targetWidth = Math.max(1, Math.round(cleaned.cols * upscale));
    const targetHeight = Math.max(1, Math.round(cleaned.rows * upscale));
    (cvAny.resize as (srcMat: unknown, dstMat: unknown, dsize: unknown, fx?: number, fy?: number, interpolation?: number) => void)(
      cleaned,
      resized,
      new (cvAny.Size as new (width: number, height: number) => unknown)(targetWidth, targetHeight),
      0,
      0,
      cvAny.INTER_CUBIC as number
    );

    const output = document.createElement("canvas");
    output.width = targetWidth;
    output.height = targetHeight;
    (cvAny.imshow as (canvas: HTMLCanvasElement, mat: unknown) => void)(output, resized);
    return { canvas: output, sharpness };
  } catch {
    return { canvas: null, sharpness: null };
  } finally {
    src.delete?.();
    gray.delete?.();
    laplacian.delete?.();
    contours.delete?.();
    hierarchy.delete?.();
    edges.delete?.();
    contourApprox.delete?.();
    doc.delete?.();
    blurred.delete?.();
    binary.delete?.();
    cleaned.delete?.();
    resized.delete?.();
    rotationMatrix.delete?.();
    deskewed.delete?.();
    kernel.delete?.();
  }
};

const OCR_BLOCKED_PRODUCT_WORDS = new Set([
  "summe",
  "gesamt",
  "total",
  "mwst",
  "eur",
  "euro",
  "karte",
  "kasse",
  "beleg",
  "zahlung",
  "saldo",
  "visa",
  "mastercard",
  "debit",
  "change",
  "cash"
]);

const OCR_TOTAL_KEYWORDS = [
  "summe",
  "gesamt",
  "total",
  "betrag",
  "zu zahlen",
  "endbetrag",
  "kartenzahlung",
  "ec",
  "card"
];

const normalizePriceToken = (value: string) => {
  const normalized = value
    .replace(/\s/g, "")
    .replace(/[Oo]/g, "0")
    .replace(/[Il]/g, "1")
    .replace(/€/g, "")
    .replace(/EUR/gi, "")
    .replace(/[^\d,.-]/g, "");
  const match = normalized.match(/-?\d[\d,.-]{1,16}/);
  if (!match?.[0]) return null;
  const raw = match[0].replace(/(?!^)-/g, "");
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalizedNumber = raw;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandSeparator = decimalSeparator === "," ? "." : ",";
    normalizedNumber = normalizedNumber.split(thousandSeparator).join("");
    if (decimalSeparator === ",") normalizedNumber = normalizedNumber.replace(",", ".");
  } else if (lastComma >= 0) {
    const fraction = raw.length - lastComma - 1;
    normalizedNumber = fraction === 2 ? raw.replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const fraction = raw.length - lastDot - 1;
    normalizedNumber = fraction === 2 ? raw : raw.replace(/\./g, "");
  }

  const parsed = Number(normalizedNumber);
  if (!Number.isFinite(parsed)) return null;
  return parsed.toFixed(2);
};

const parseAmountToken = (value: string) => {
  const token = normalizePriceToken(value);
  if (!token) return null;
  const parsed = Number(token);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000 || token.endsWith(".00")) return null;
  return parsed;
};

const extractPriceCandidatesFromOcrText = (
  text: string,
  options?: {
    baseWeight?: number;
    confidence?: number;
    lowerRegion?: boolean;
    numericFocused?: boolean;
  }
) => {
  const baseWeight = options?.baseWeight ?? 0;
  const confidence = options?.confidence ?? 0;
  const lowerRegion = options?.lowerRegion ?? false;
  const numericFocused = options?.numericFocused ?? false;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const candidates: OcrAmountCandidate[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lowered = line.toLocaleLowerCase();
    const matches = [...line.matchAll(/-?\d[\dOoIl.,-]{1,16}/g)];
    if (matches.length === 0) continue;
    for (const match of matches) {
      const parsed = parseAmountToken(match[0] ?? "");
      if (parsed === null) continue;
      const token = parsed.toFixed(2);
      let score = 8 + baseWeight + confidence * 0.5;
      if (parsed >= 1) score += 4;
      if (parsed <= 3000) score += 2;
      if (lowerRegion) score += 4;
      if (numericFocused) score += 6;
      if (OCR_TOTAL_KEYWORDS.some((keyword) => lowered.includes(keyword))) score += 40;
      if (/mwst|tax|ust/.test(lowered)) score -= 18;
      if (/rabatt|discount|coupon/.test(lowered)) score -= 16;
      if (/subtotal|zwischen/.test(lowered)) score -= 10;
      if (/cashback|change/.test(lowered)) score -= 12;
      score += Math.max(0, i - Math.floor(lines.length * 0.35));
      candidates.push({ value: parsed, token, score, index: i });
    }
  }
  return candidates;
};

const pickBestAmountFromCandidates = (candidates: OcrAmountCandidate[]) => {
  const ranked = rankAmountCandidates(candidates);
  return ranked[0]?.value ?? null;
};

const rankAmountCandidates = (candidates: OcrAmountCandidate[]): OcrRankedAmountCandidate[] => {
  if (candidates.length === 0) return [];
  const aggregated = new Map<string, { value: number; score: number; maxScore: number; count: number; lastIndex: number }>();
  for (const candidate of candidates) {
    const current = aggregated.get(candidate.token);
    if (!current) {
      aggregated.set(candidate.token, {
        value: candidate.value,
        score: candidate.score,
        maxScore: candidate.score,
        count: 1,
        lastIndex: candidate.index
      });
      continue;
    }
    current.score += candidate.score;
    current.maxScore = Math.max(current.maxScore, candidate.score);
    current.count += 1;
    current.lastIndex = Math.max(current.lastIndex, candidate.index);
  }
  return [...aggregated.entries()]
    .map(([token, value]) => ({
      token,
      value: value.value,
      totalScore: value.score,
      maxScore: value.maxScore,
      count: value.count,
      lastIndex: value.lastIndex
    }))
    .sort(
      (left, right) =>
        right.maxScore - left.maxScore ||
        right.totalScore - left.totalScore ||
        right.count - left.count ||
        right.lastIndex - left.lastIndex ||
        right.value - left.value
    );
};

const pickBestAmountFromCandidatesDetailed = (candidates: OcrAmountCandidate[]) => {
  const ranked = rankAmountCandidates(candidates);
  return {
    value: ranked[0]?.value ?? null,
    ranked
  };
};

const extractPriceFromOcrText = (text: string) => pickBestAmountFromCandidates(extractPriceCandidatesFromOcrText(text));

const extractPriceFromOcrPassesDetailed = (passes: OcrPassResult[]) =>
  pickBestAmountFromCandidatesDetailed(
    passes.flatMap((pass) =>
      extractPriceCandidatesFromOcrText(pass.text, {
        baseWeight:
          pass.source === "main"
            ? 14
            : pass.source === "numeric"
              ? 24
              : pass.source === "lowerNumeric"
                ? 30
                : pass.source === "opencvSparse"
                  ? 18
                  : pass.source === "detector"
                    ? 8
                    : 10,
        confidence: pass.meanConfidence,
        lowerRegion: pass.region === "lower",
        numericFocused: pass.numericFocused
      })
    )
  );

const extractProductFromOcrText = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2)
    .filter((line) => /[a-zA-ZäöüÄÖÜß]/.test(line))
    .filter((line) => !/\d{1,5}[.,]\d{2}/.test(line))
    .filter((line) => {
      const lowered = line.toLocaleLowerCase();
      return ![...OCR_BLOCKED_PRODUCT_WORDS].some((word) => lowered.includes(word));
    });

  if (lines.length === 0) return null;
  // On receipts the first meaningful alpha line is usually store/title and works better than random mid lines.
  return lines[0] ?? null;
};

const normalizeOcrText = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const buildUniqueLinesText = (...texts: string[]) => {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const chunk of texts) {
    for (const line of chunk.split(/\r?\n/)) {
      const normalized = line.replace(/\s+/g, " ").trim();
      if (!normalized) continue;
      const key = normalized.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(normalized);
    }
  }
  return merged.join("\n");
};

const classifyOcrBoxKind = (
  boxText: string | undefined,
  recognizedProduct: string | null,
  recognizedPrice: number | null
): OcrPreviewBox["kind"] => {
  const text = (boxText ?? "").trim();
  if (!text) return "other";

  const normalizedText = normalizeOcrText(text);
  const normalizedProduct = normalizeOcrText(recognizedProduct ?? "");
  const recognizedPriceToken = recognizedPrice !== null ? recognizedPrice.toFixed(2) : null;
  const boxPriceToken = normalizePriceToken(text);

  if (recognizedPriceToken && boxPriceToken === recognizedPriceToken) {
    return "price";
  }
  if (/\d{1,4}(?:[.,]\d{2})/.test(text)) {
    return "price";
  }
  if (normalizedProduct) {
    if (normalizedText.includes(normalizedProduct) || normalizedProduct.includes(normalizedText)) {
      return "product";
    }
  }
  return "other";
};

const boxFromBbox = (
  bbox: { x0: number; y0: number; x1: number; y1: number } | undefined,
  width: number,
  height: number,
  text?: string
) => {
  if (!bbox) return null;
  const widthPx = bbox.x1 - bbox.x0;
  const heightPx = bbox.y1 - bbox.y0;
  if (widthPx <= 1 || heightPx <= 1) return null;
  return {
    left: clamp01(bbox.x0 / width),
    top: clamp01(bbox.y0 / height),
    width: clamp01(widthPx / width),
    height: clamp01(heightPx / height),
    text: text?.trim() || undefined
  } as OcrPreviewBox;
};

const isDefined = <T,>(value: T | null | undefined): value is T => value !== null && value !== undefined;

const mergeUniqueBoxes = (...boxGroups: OcrPreviewBox[][]) => {
  const seen = new Set<string>();
  const merged: OcrPreviewBox[] = [];
  for (const group of boxGroups) {
    for (const box of group) {
      const key = `${box.left.toFixed(4)}:${box.top.toFixed(4)}:${box.width.toFixed(4)}:${box.height.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(box);
      if (merged.length >= OCR_MAX_PREVIEW_BOXES) return merged;
    }
  }
  return merged;
};

const extractBoxesFromTesseractResult = (
  result: Awaited<ReturnType<TesseractWorkerLike["recognize"]>>,
  width: number,
  height: number
) => {
  const words = (result.data.words ?? [])
    .map((entry) => boxFromBbox(entry.bbox, width, height, entry.text))
    .filter(isDefined);
  if (words.length >= 6) return words.slice(0, OCR_MAX_PREVIEW_BOXES);

  const lines = (result.data.lines ?? [])
    .map((entry) => boxFromBbox(entry.bbox, width, height, entry.text))
    .filter(isDefined);
  if (lines.length >= 6) return mergeUniqueBoxes(words, lines).slice(0, OCR_MAX_PREVIEW_BOXES);

  const blocks = (result.data.blocks ?? [])
    .flatMap((entry) => [
      boxFromBbox(entry.bbox, width, height, entry.text),
      ...(entry.lines ?? []).map((line) => boxFromBbox(line.bbox, width, height, line.text))
    ])
    .filter(isDefined);
  return mergeUniqueBoxes(words, lines, blocks).slice(0, OCR_MAX_PREVIEW_BOXES);
};

const runTextDetectorOcr = async (detectorCtor: TextDetectorConstructor, canvas: HTMLCanvasElement) => {
  const bitmap = await createImageBitmap(canvas);
  try {
    const detector = new detectorCtor({ languages: ["de", "en"] });
    const results = await detector.detect(bitmap);
    const lines = results
      .map((entry) => (entry.rawValue ?? entry.text ?? "").trim())
      .filter(Boolean);
    const boxes: OcrPreviewBox[] = [];
    for (const entry of results) {
      const text = (entry.rawValue ?? entry.text ?? "").trim();
      const box = entry.boundingBox;
      if (!box || typeof box.x !== "number" || typeof box.y !== "number" || typeof box.width !== "number" || typeof box.height !== "number") {
        continue;
      }
      if (box.width <= 1 || box.height <= 1) continue;
      boxes.push({
        left: clamp01(box.x / canvas.width),
        top: clamp01(box.y / canvas.height),
        width: clamp01(box.width / canvas.width),
        height: clamp01(box.height / canvas.height),
        text
      });
      if (boxes.length >= OCR_MAX_PREVIEW_BOXES) break;
    }
    return {
      text: lines.join("\n"),
      boxes
    };
  } finally {
    bitmap.close?.();
  }
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

export const FinancesPage = ({
  section = "overview",
  entries,
  entriesHasMore = false,
  entriesLoadingMore = false,
  onLoadMoreEntries,
  subscriptions,
  cashAuditRequests,
  householdEvents,
  household,
  currentMember,
  members,
  memberVacations,
  shoppingItems,
  userId,
  busy,
  mobileTabBarVisible = true,
  onAdd,
  onUpdateEntry,
  onDeleteEntry,
  onAddSubscription,
  onUpdateSubscription,
  onDeleteSubscription,
  onToggleShoppingItem,
  onUpdateHousehold,
  onUpdateMemberSettings,
  onUpdateMemberSettingsForUser,
  onRequestCashAudit
}: FinancesPageProps) => {
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
  const [ocrCandidate, setOcrCandidate] = useState<OcrCandidate | null>(null);
  const [ocrDebugOverlayEnabled, setOcrDebugOverlayEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(OCR_DEBUG_LOCALSTORAGE_KEY) === "1";
  });
  const [ocrPreviewImageUrl, setOcrPreviewImageUrl] = useState<string | null>(null);
  const [ocrTorchSupported, setOcrTorchSupported] = useState(false);
  const [ocrTorchEnabled, setOcrTorchEnabled] = useState(false);
  const [rentFormError, setRentFormError] = useState<string | null>(null);
  const [memberRentFormError, setMemberRentFormError] = useState<string | null>(null);
  const [overviewMemberRentFormError, setOverviewMemberRentFormError] = useState<string | null>(null);
  const [overviewEntrySearch, setOverviewEntrySearch] = useState("");
  const [savingOverviewMemberId, setSavingOverviewMemberId] = useState<string | null>(null);
  const [receiptUploadError, setReceiptUploadError] = useState<string | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [receiptPreviewTitle, setReceiptPreviewTitle] = useState<string | null>(null);
  const [previewDescription, setPreviewDescription] = useState("");
  const [previewAmountInput, setPreviewAmountInput] = useState("");
  const [selectedShoppingItemIds, setSelectedShoppingItemIds] = useState<string[]>([]);
  const excludeVacationFromFinances = household.vacation_finances_exclude_enabled ?? true;
  const getDefaultFinanceSelectionIds = useCallback(() => {
    if (!excludeVacationFromFinances) return members.map((member) => member.user_id);
    const nonVacationMemberIds = members
      .filter(
        (member) =>
          !member.vacation_mode && !isMemberOnVacationAt(member.user_id, memberVacations, new Date())
      )
      .map((member) => member.user_id);
    if (nonVacationMemberIds.length > 0) return nonVacationMemberIds;
    return members.map((member) => member.user_id);
  }, [excludeVacationFromFinances, memberVacations, members]);
  const [previewPayerIds, setPreviewPayerIds] = useState<string[]>(() => [userId]);
  const [previewBeneficiaryIds, setPreviewBeneficiaryIds] = useState<string[]>(() => getDefaultFinanceSelectionIds());
  const [addEntryCategoryTouched, setAddEntryCategoryTouched] = useState(false);
  const addEntryComposerContainerRef = useRef<HTMLDivElement | null>(null);
  const addEntryRowRef = useRef<HTMLDivElement | null>(null);
  const ocrVideoRef = useRef<HTMLVideoElement | null>(null);
  const ocrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ocrStreamRef = useRef<MediaStream | null>(null);
  const ocrTesseractWorkerRef = useRef<TesseractWorkerLike | null>(null);
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
  const [rentHistoryDialogOpen, setRentHistoryDialogOpen] = useState(false);
  const [rentHistoryContractsOnly, setRentHistoryContractsOnly] = useState(false);
  const [selectedRentHistoryItem, setSelectedRentHistoryItem] = useState<{
    id: string;
    at: string;
    title: string;
    meta: string | null;
    details: string[];
    event: HouseholdEvent;
  } | null>(null);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const locale = getDateLocale(i18n.resolvedLanguage ?? i18n.language);
  const showOverview = section === "overview";
  const showStats = section === "stats";
  const showArchive = section === "archive";
  const showSubscriptions = section === "subscriptions";
  const canEditApartment = currentMember?.role === "owner";
  const mobileOverviewListHeight = mobileTabBarVisible ? "calc(100dvh - 9rem)" : "calc(100dvh - 5rem)";
  const addEntryForm = useForm({
    defaultValues: {
      description: "",
      category: "general",
      amount: "",
      receiptImageUrl: "",
      entryDate: "",
      paidByUserIds: [userId],
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
      const selectedOpenShoppingItems = selectedShoppingItemIds
        .map((id) => shoppingItems.find((item) => item.id === id) ?? null)
        .filter((item): item is ShoppingItem => Boolean(item && !item.done));
      const selectedTitles = selectedOpenShoppingItems.map((item) => item.title.trim()).filter(Boolean);
      const manualDescription = value.description.trim();
      const resolvedDescription = [manualDescription, ...selectedTitles].filter(Boolean).join(", ");
      const parsedAmount = Number(value.amount);
      if (
        !resolvedDescription ||
        Number.isNaN(parsedAmount) ||
        parsedAmount < 0 ||
        value.paidByUserIds.length === 0 ||
        value.beneficiaryUserIds.length === 0
      ) {
        return;
      }

      await onAdd({
        description: resolvedDescription,
        amount: parsedAmount,
        category: value.category,
        receiptImageUrl: value.receiptImageUrl.trim() || null,
        paidByUserIds: value.paidByUserIds,
        beneficiaryUserIds: value.beneficiaryUserIds,
        entryDate: value.entryDate || null
      });
      if (selectedOpenShoppingItems.length > 0) {
        await Promise.all(selectedOpenShoppingItems.map((item) => onToggleShoppingItem(item)));
      }
      formApi.reset();
      setReceiptUploadError(null);
      setPreviewDescription("");
      setPreviewAmountInput("");
      setPreviewPayerIds([userId]);
      setPreviewBeneficiaryIds(getDefaultFinanceSelectionIds());
      setAddEntryCategoryTouched(false);
      setSelectedShoppingItemIds([]);
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
        utilitiesOnRoomSqmPercent: parsedUtilitiesOnRoomSqmPercent,
        taskLazinessEnabled: household.task_laziness_enabled ?? false,
        vacationTasksExcludeEnabled: household.vacation_tasks_exclude_enabled ?? true,
        vacationFinancesExcludeEnabled: household.vacation_finances_exclude_enabled ?? true,
        taskSkipEnabled: household.task_skip_enabled ?? true,
        featureBucketEnabled: household.feature_bucket_enabled ?? true,
        featureShoppingEnabled: household.feature_shopping_enabled ?? true,
        featureTasksEnabled: household.feature_tasks_enabled ?? true,
        featureOneOffTasksEnabled: household.feature_one_off_tasks_enabled ?? true,
        featureFinancesEnabled: household.feature_finances_enabled ?? true,
        oneOffClaimTimeoutHours: household.one_off_claim_timeout_hours ?? 72,
        oneOffClaimMaxPimpers: household.one_off_claim_max_pimpers ?? 500,
        themePrimaryColor: household.theme_primary_color ?? "#1f8a7f",
        themeAccentColor: household.theme_accent_color ?? "#14b8a6",
        themeFontFamily: household.theme_font_family ?? '"Space Grotesk", "Segoe UI", sans-serif',
        themeRadiusScale: household.theme_radius_scale ?? 1,
        translationOverrides: household.translation_overrides ?? []
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
    if (currentPayers.length === 0) {
      addEntryForm.setFieldValue("paidByUserIds", [userId]);
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
  const vacationMemberIds = useMemo(() => {
    const ids = new Set<string>();
    members.forEach((member) => {
      if (
        member.vacation_mode ||
        isMemberOnVacationAt(member.user_id, memberVacations, new Date())
      ) {
        ids.add(member.user_id);
      }
    });
    return ids;
  }, [memberVacations, members]);
  const resolveMemberColor = useMemo(
    () => (memberId: string) => normalizeUserColor(memberById.get(memberId)?.user_color) ?? fallbackColorFromUserId(memberId),
    [memberById]
  );
  const parseEventNumber = useCallback((value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const normalized = value.trim().replace(",", ".");
      if (!normalized) return null;
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }, []);
  const memberAvatarSrc = (memberId: string) => {
    const member = memberById.get(memberId);
    const avatarUrl = member?.avatar_url?.trim() ?? "";
    if (avatarUrl) return avatarUrl;
    const seed = getMemberAvatarSeed(memberId, member?.display_name);
    return createDiceBearAvatarDataUri(seed, member?.user_color);
  };
  const moneyLabel = useCallback((value: number) => formatMoney(value, locale), [locale]);
  const rentHistoryItems = useMemo(() => {
    const rentFields: Record<string, string> = {
      apartment_size_sqm: t("settings.householdSizeLabel"),
      cold_rent_monthly: t("settings.coldRentLabel"),
      utilities_monthly: t("settings.utilitiesLabel"),
      utilities_on_room_sqm_percent: t("settings.utilitiesOnRoomSqmPercentLabel")
    };
    const formatFieldValue = (field: string, value: number | null) => {
      if (value === null || !Number.isFinite(value)) return "-";
      if (field === "apartment_size_sqm") return `${value} m²`;
      if (field === "utilities_on_room_sqm_percent") return `${value}%`;
      return moneyLabel(value);
    };
    const formatMoneyOrDash = (value: number | null | undefined) =>
      typeof value === "number" && Number.isFinite(value) ? moneyLabel(value) : "-";
    return householdEvents
      .filter((event) =>
        [
          "rent_updated",
          "contract_created",
          "contract_updated",
          "contract_deleted",
          "member_joined",
          "member_left"
        ].includes(event.event_type)
      )
      .map((event) => {
        const payload = event.payload ?? {};
        const actorLabel = event.actor_user_id ? memberLabel(event.actor_user_id) : null;
        if (event.event_type === "rent_updated") {
          const rawChanges = Array.isArray(payload.changes) ? payload.changes : [];
          const changeLines = rawChanges
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const change = entry as { field?: string; before?: number | null; after?: number | null };
              if (!change.field) return null;
              const beforeValue = parseEventNumber(change.before);
              const afterValue = parseEventNumber(change.after);
              const label = rentFields[change.field] ?? change.field;
              const before = formatFieldValue(change.field, beforeValue);
              const after = formatFieldValue(change.field, afterValue);
              return `${label}: ${before} → ${after}`;
            })
            .filter((entry): entry is string => Boolean(entry));
          return {
            id: event.id,
            at: event.created_at,
            title: t("finances.rentHistoryRentUpdated"),
            meta: actorLabel ? t("finances.rentHistoryBy", { user: actorLabel }) : null,
            details: changeLines,
            event
          };
        }
        if (event.event_type === "contract_created") {
          const contractName = typeof payload.contractName === "string" ? payload.contractName.trim() : "";
          const amount = parseEventNumber(payload.amount);
          const details = [];
          if (contractName) details.push(contractName);
          if (amount !== null) {
            details.push(`${formatMoneyOrDash(null)} → ${formatMoneyOrDash(amount)}`);
          }
          return {
            id: event.id,
            at: event.created_at,
            title: t("finances.rentHistoryContractCreated"),
            meta: actorLabel ? t("finances.rentHistoryBy", { user: actorLabel }) : null,
            details: details.length > 0 ? [details.join(" · ")] : [],
            event
          };
        }
        if (event.event_type === "contract_updated") {
          const contractName = typeof payload.contractName === "string" ? payload.contractName.trim() : "";
          const amount = parseEventNumber(payload.amount);
          const previous = payload.previous as { amount?: number | string | null } | undefined;
          const lines: string[] = [];
          if (contractName) lines.push(contractName);
          const changeLine =
            amount !== null || previous?.amount != null
              ? `${formatMoneyOrDash(parseEventNumber(previous?.amount ?? null))} → ${formatMoneyOrDash(amount)}`
              : null;
          return {
            id: event.id,
            at: event.created_at,
            title: t("finances.rentHistoryContractUpdated"),
            meta: actorLabel ? t("finances.rentHistoryBy", { user: actorLabel }) : null,
            details: [...lines, changeLine].filter((entry): entry is string => Boolean(entry)),
            event
          };
        }
        if (event.event_type === "contract_deleted") {
          const contractName = typeof payload.contractName === "string" ? payload.contractName.trim() : "";
          const amount = parseEventNumber(payload.amount);
          const details = [];
          if (contractName) details.push(contractName);
          if (amount !== null) {
            details.push(`${formatMoneyOrDash(amount)} → ${formatMoneyOrDash(0)}`);
          }
          return {
            id: event.id,
            at: event.created_at,
            title: t("finances.rentHistoryContractDeleted"),
            meta: actorLabel ? t("finances.rentHistoryBy", { user: actorLabel }) : null,
            details: details.length > 0 ? [details.join(" · ")] : [],
            event
          };
        }
        if (event.event_type === "member_joined") {
          const userLabel = memberLabel(event.subject_user_id ?? event.actor_user_id ?? "");
          return {
            id: event.id,
            at: event.created_at,
            title: t("finances.rentHistoryMemberJoined", { user: userLabel }),
            meta: null,
            details: [],
            event
          };
        }
        const userLabel = memberLabel(event.subject_user_id ?? event.actor_user_id ?? "");
        return {
          id: event.id,
          at: event.created_at,
          title: t("finances.rentHistoryMemberLeft", { user: userLabel }),
          meta: null,
          details: [],
          event
        };
      })
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [householdEvents, memberLabel, moneyLabel, t]);

    const buildCostTableData = useCallback(
      (
        inputHousehold: Household,
        inputMembers: HouseholdMember[],
        inputSubscriptions: FinanceSubscription[],
      ) => {
        const apartmentSizeSqm = inputHousehold.apartment_size_sqm;
        const coldRentMonthly = inputHousehold.cold_rent_monthly;
        const utilitiesMonthly = inputHousehold.utilities_monthly;
        const utilitiesOnRoomFactor =
          (inputHousehold.utilities_on_room_sqm_percent ?? 0) / 100;
        const utilitiesOnRoomPool =
          utilitiesMonthly === null
            ? null
            : utilitiesMonthly * utilitiesOnRoomFactor;
        const totalRoomAreaSqmInner = inputMembers.reduce(
          (sum, member) => sum + (member.room_size_sqm ?? 0),
          0,
        );
        const coldPerApartmentSqm =
          apartmentSizeSqm !== null &&
          apartmentSizeSqm > 0 &&
          coldRentMonthly !== null
            ? coldRentMonthly / apartmentSizeSqm
            : null;
        const utilitiesPerRoomSqm =
          utilitiesOnRoomPool !== null && totalRoomAreaSqmInner > 0
            ? utilitiesOnRoomPool / totalRoomAreaSqmInner
            : null;
        const memberIds = inputMembers.map((member) => member.user_id);

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

        inputMembers.forEach((member) => {
          const roomSize = member.room_size_sqm ?? 0;
          const coldForRoom =
            coldPerApartmentSqm === null
              ? null
              : coldPerApartmentSqm * roomSize;
          const utilitiesForRoom =
            utilitiesPerRoomSqm === null
              ? null
              : utilitiesPerRoomSqm * roomSize;
          const roomSubtotal =
            coldForRoom === null || utilitiesForRoom === null
              ? null
              : coldForRoom + utilitiesForRoom;
          byMember.set(member.user_id, {
            coldForRoom,
            utilitiesForRoom,
            roomSubtotal,
            commonCostsShare: null,
            totalBeforeContracts: null,
            extraContracts: 0,
            grandTotal: null,
          });
        });

        const sharedAreaSqmRaw =
          apartmentSizeSqm === null
            ? null
            : apartmentSizeSqm - totalRoomAreaSqmInner;
        const sharedAreaColdCosts =
          coldPerApartmentSqm === null || sharedAreaSqmRaw === null
            ? null
            : coldPerApartmentSqm * sharedAreaSqmRaw;
        const sharedUtilitiesCosts =
          utilitiesMonthly === null || utilitiesOnRoomPool === null
            ? null
            : utilitiesMonthly - utilitiesOnRoomPool;
        const remainingApartmentCosts =
          sharedAreaColdCosts === null || sharedUtilitiesCosts === null
            ? null
            : sharedAreaColdCosts + sharedUtilitiesCosts;
        const totalCommonWeight = inputMembers.reduce(
          (sum, member) => sum + member.common_area_factor,
          0,
        );

        inputMembers.forEach((member) => {
          const entry = byMember.get(member.user_id);
          if (!entry) return;
          const commonCostsShare =
            remainingApartmentCosts === null || totalCommonWeight <= 0
              ? null
              : (remainingApartmentCosts * member.common_area_factor) /
                totalCommonWeight;
          const totalBeforeContracts =
            entry.roomSubtotal === null || commonCostsShare === null
              ? null
              : entry.roomSubtotal + commonCostsShare;
          entry.commonCostsShare = commonCostsShare;
          entry.totalBeforeContracts = totalBeforeContracts;
        });

        inputSubscriptions.forEach((subscription) => {
          const recurrence = cronPatternToFinanceRecurrence(
            subscription.cron_pattern,
          );
          const monthlyAmount =
            subscription.amount * financeRecurrenceToMonthlyFactor(recurrence);
          const beneficiaryIds = subscription.beneficiary_user_ids.filter(
            (memberId) => memberIds.includes(memberId),
          );
          const normalizedBeneficiaryIds =
            beneficiaryIds.length > 0 ? beneficiaryIds : memberIds;
          if (normalizedBeneficiaryIds.length === 0) return;
          const contractShareByMember = splitAmountEvenly(
            monthlyAmount,
            normalizedBeneficiaryIds,
          );
          inputMembers.forEach((member) => {
            const entry = byMember.get(member.user_id);
            if (!entry) return;
            entry.extraContracts +=
              contractShareByMember.get(member.user_id) ?? 0;
          });
        });

        inputMembers.forEach((member) => {
          const entry = byMember.get(member.user_id);
          if (!entry) return;
          entry.grandTotal =
            entry.totalBeforeContracts === null
              ? null
              : entry.totalBeforeContracts + entry.extraContracts;
        });

        return {
          byMember,
          remainingApartmentCosts,
          sharedAreaColdCosts,
          sharedUtilitiesCosts,
        };
      },
      [],
    );
  const rentHistoryDialogData = useMemo(() => {
    if (!selectedRentHistoryItem) return null;
    const { event } = selectedRentHistoryItem;
    const payload = event.payload ?? {};
    const subjectUserId = event.subject_user_id ?? event.actor_user_id ?? null;
    const subjectName = typeof payload.name === "string" ? payload.name.trim() : "";
    const makePlaceholderMember = (userId: string): HouseholdMember => ({
      household_id: household.id,
      user_id: userId,
      role: "member",
      display_name: subjectName || null,
      avatar_url: null,
      user_color: null,
      paypal_name: null,
      revolut_name: null,
      wero_name: null,
      room_size_sqm: null,
      common_area_factor: 1,
      task_laziness_factor: 1,
      vacation_mode: false,
      created_at: event.created_at
    });
    const resolveCronPattern = (value: unknown) => {
      if (value === "weekly" || value === "monthly" || value === "quarterly") {
        return financeRecurrenceToCronPattern(value);
      }
      if (typeof value === "string" && value.trim().length > 0) return value;
      return financeRecurrenceToCronPattern("monthly");
    };
    const buildSubscriptionFromPayload = (
      input: { subscriptionId?: string; contractName?: string; amount?: number | string; recurrence?: unknown },
      memberIds: string[]
    ): FinanceSubscription => ({
      id: input.subscriptionId ?? crypto.randomUUID(),
      household_id: household.id,
      name: input.contractName ?? t("finances.rentHistoryContract"),
      category: "general",
      amount: parseEventNumber(input.amount) ?? 0,
      paid_by_user_ids: memberIds,
      beneficiary_user_ids: memberIds,
      cron_pattern: resolveCronPattern(input.recurrence),
      created_by: event.actor_user_id ?? household.created_by,
      created_at: event.created_at,
      updated_at: event.created_at
    });
    const applyRentChanges = (stage: "before" | "after") => {
      if (event.event_type !== "rent_updated") return household;
      const changes = Array.isArray(payload.changes) ? payload.changes : [];
      const next = { ...household };
      changes.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const change = entry as { field?: string; before?: number | string | null; after?: number | string | null };
        if (!change.field) return;
        const value = parseEventNumber(stage === "before" ? change.before : change.after);
        if (value === null) return;
        (next as unknown as Record<string, number | null>)[change.field] = value;
      });
      return next;
    };
    const buildMembersForStage = (stage: "before" | "after") => {
      if (!subjectUserId) return members;
      const hasMember = members.some((member) => member.user_id === subjectUserId);
      const placeholder = hasMember ? null : makePlaceholderMember(subjectUserId);
      if (event.event_type === "member_joined") {
        if (stage === "before") {
          return members.filter((member) => member.user_id !== subjectUserId);
        }
        return hasMember ? members : [...members, placeholder].filter((entry): entry is HouseholdMember => Boolean(entry));
      }
      if (event.event_type === "member_left") {
        if (stage === "after") {
          return members.filter((member) => member.user_id !== subjectUserId);
        }
        return hasMember ? members : [...members, placeholder].filter((entry): entry is HouseholdMember => Boolean(entry));
      }
      return members;
    };
    const buildSubscriptionsForStage = (stage: "before" | "after", memberIds: string[]) => {
      if (!["contract_created", "contract_updated", "contract_deleted"].includes(event.event_type)) {
        return subscriptions;
      }
      const subscriptionId = typeof payload.subscriptionId === "string" ? payload.subscriptionId : null;
      const hasEventSubscription = subscriptionId
        ? subscriptions.some((subscription) => subscription.id === subscriptionId)
        : false;
      const existing = subscriptionId
        ? subscriptions.find((subscription) => subscription.id === subscriptionId) ?? null
        : null;
      const base =
        existing ?? buildSubscriptionFromPayload(payload as { subscriptionId?: string; contractName?: string; amount?: number | string; recurrence?: unknown }, memberIds);
      if (event.event_type === "contract_created") {
        if (stage === "before") {
          return hasEventSubscription
            ? subscriptions.filter((subscription) => subscription.id !== base.id)
            : subscriptions;
        }
        const withBase = subscriptions.some((subscription) => subscription.id === base.id)
          ? subscriptions
          : [...subscriptions, base];
        return withBase;
      }
      if (event.event_type === "contract_deleted") {
        if (stage === "after") {
          return hasEventSubscription
            ? subscriptions.filter((subscription) => subscription.id !== base.id)
            : subscriptions;
        }
        const withBase = subscriptions.some((subscription) => subscription.id === base.id)
          ? subscriptions
          : [...subscriptions, base];
        return withBase;
      }
      const previous = payload.previous as { amount?: number | string | null; recurrence?: unknown } | undefined;
      const resolvedAmount = stage === "before"
        ? parseEventNumber(previous?.amount ?? null) ?? base.amount
        : parseEventNumber(payload.amount) ?? base.amount;
      const resolvedRecurrence = stage === "before"
        ? previous?.recurrence ?? base.cron_pattern
        : payload.recurrence ?? base.cron_pattern;
      const updated = {
        ...base,
        amount: resolvedAmount,
        cron_pattern: resolveCronPattern(resolvedRecurrence),
        updated_at: event.created_at
      };
      if (subscriptions.some((subscription) => subscription.id === base.id)) {
        return subscriptions.map((subscription) => (subscription.id === base.id ? updated : subscription));
      }
      return [...subscriptions, updated];
    };

    const beforeMembers = buildMembersForStage("before");
    const afterMembers = buildMembersForStage("after");
    const beforeMemberIds = beforeMembers.map((member) => member.user_id);
    const afterMemberIds = afterMembers.map((member) => member.user_id);
    const beforeSubscriptions = buildSubscriptionsForStage("before", beforeMemberIds);
    const afterSubscriptions = buildSubscriptionsForStage("after", afterMemberIds);
    const beforeHousehold = applyRentChanges("before");
    const afterHousehold = applyRentChanges("after");
    const beforeCost = buildCostTableData(beforeHousehold, beforeMembers, beforeSubscriptions);
    const afterCost = buildCostTableData(afterHousehold, afterMembers, afterSubscriptions);
    const memberIds = [...new Set([...beforeMemberIds, ...afterMemberIds])];
    const memberNameOverrides = new Map<string, string>();
    if (subjectUserId && subjectName) {
      memberNameOverrides.set(subjectUserId, subjectName);
    }

    return {
      event,
      beforeCost,
      afterCost,
      beforeMembers,
      afterMembers,
      memberIds,
      memberNameOverrides
    };
  }, [buildCostTableData, household, members, selectedRentHistoryItem, subscriptions, t]);
  const formatHistoryValue = useCallback(
    (value: number | null) => (value === null ? "-" : moneyLabel(value)),
    [moneyLabel]
  );
  const formatHistoryDelta = useCallback(
    (before: number | null, after: number | null) => {
      if (before === null && after === null) return "-";
      if (before === null) return `+${moneyLabel(after ?? 0)}`;
      if (after === null) return `-${moneyLabel(before ?? 0)}`;
      const diff = after - before;
      if (Math.abs(diff) < 0.005) return moneyLabel(0);
      const sign = diff > 0 ? "+" : "-";
      return `${sign}${moneyLabel(Math.abs(diff))}`;
    },
    [moneyLabel]
  );
  const getHistoryDeltaValue = useCallback((before: number | null, after: number | null) => {
    if (before === null && after === null) return 0;
    if (before === null) return after ?? 0;
    if (after === null) return -before;
    const diff = after - before;
    return Math.abs(diff) < 0.005 ? 0 : diff;
  }, []);
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
    const andWord = t("common.and");
    const joinMemberNames = (names: string[]) => {
      if (names.length <= 1) return names[0] ?? "";
      if (names.length === 2) return `${names[0]} ${andWord} ${names[1]}`;
      const leading = names.slice(0, -1).join(", ");
      const trailing = names[names.length - 1];
      return `${leading} ${andWord} ${trailing}`;
    };
    const positiveEntries = reimbursementPreview.filter((entry) => entry.value > 0.004);
    if (positiveEntries.length === 0) return null;

    const memberIds = [...new Set(positiveEntries.map((entry) => entry.memberId))];
    const totalAmount = positiveEntries.reduce((sum, entry) => sum + entry.value, 0);
    const amountLabel = formatMoney(totalAmount, locale);

    if (memberIds.length === 1) {
      const memberId = memberIds[0];
      if (memberId === userId) {
        const previewAmount = Number(previewAmountInput);
        const paidShares = splitAmountEvenly(previewAmount, previewPayerIdsEffective);
        const consumedShares = splitAmountEvenly(previewAmount, previewBeneficiaryIdsEffective);
        const unionMemberIds = [...new Set([...previewPayerIdsEffective, ...previewBeneficiaryIdsEffective])];
        const debtorNames = unionMemberIds
          .map((memberIdInner) => ({
            memberId: memberIdInner,
            value: (paidShares.get(memberIdInner) ?? 0) - (consumedShares.get(memberIdInner) ?? 0)
          }))
          .filter((entry) => entry.value < -0.004)
          .map((entry) => memberLabel(entry.memberId, "dative"))
          .filter((name) => name.length > 0);
        const membersLabel = joinMemberNames(debtorNames);
        if (membersLabel) {
          return t("finances.reimbursementYouFrom", { amount: amountLabel, members: membersLabel });
        }
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
  }, [locale, memberLabel, previewAmountInput, previewBeneficiaryIdsEffective, previewPayerIdsEffective, reimbursementPreview, t, userId]);
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

  const costTableData = useMemo(
    () => buildCostTableData(household, members, subscriptions),
    [buildCostTableData, household, members, subscriptions]
  );
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
  const normalizedOverviewSearch = overviewEntrySearch.trim().toLowerCase();
  const filteredEntriesSinceLastAudit = useMemo(() => {
    if (!normalizedOverviewSearch) return entriesSinceLastAudit;
    return entriesSinceLastAudit.filter((entry) => {
      const haystack = `${entry.description} ${entry.category} ${paidByText(entry)}`.toLowerCase();
      return haystack.includes(normalizedOverviewSearch);
    });
  }, [entriesSinceLastAudit, normalizedOverviewSearch, paidByText]);
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
  const openShoppingItems = useMemo(
    () =>
      shoppingItems
        .filter((item) => !item.done)
        .sort((left, right) => right.created_at.localeCompare(left.created_at)),
    [shoppingItems]
  );
  const shoppingItemsById = useMemo(
    () => new Map(openShoppingItems.map((item) => [item.id, item])),
    [openShoppingItems]
  );
  const selectedShoppingItems = useMemo(
    () =>
      selectedShoppingItemIds
        .map((id) => shoppingItemsById.get(id) ?? null)
        .filter((item): item is ShoppingItem => Boolean(item)),
    [selectedShoppingItemIds, shoppingItemsById]
  );
  const shoppingSuggestionItems = useMemo(() => {
    const normalizedQuery = addEntryForm.state.values.description.trim().toLocaleLowerCase(language);
    const baseItems = openShoppingItems.filter((item) => !selectedShoppingItemIds.includes(item.id));
    if (!normalizedQuery) return baseItems.slice(0, 6);
    return baseItems
      .filter((item) => {
        const titleMatches = item.title.toLocaleLowerCase(language).includes(normalizedQuery);
        if (titleMatches) return true;
        return item.tags.some((tag) => tag.toLocaleLowerCase(language).includes(normalizedQuery));
      })
      .slice(0, 6);
  }, [addEntryForm.state.values.description, language, openShoppingItems, selectedShoppingItemIds]);
  const entryNameSuggestions = useMemo(() => financeEntrySuggestions.map((entry) => entry.title), [financeEntrySuggestions]);
  const addEntryNativeSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const values: string[] = [];
    const pushValue = (raw: string) => {
      const value = raw.trim();
      if (!value) return;
      const key = value.toLocaleLowerCase(language);
      if (seen.has(key)) return;
      seen.add(key);
      values.push(value);
    };
    openShoppingItems.forEach((item) => pushValue(item.title));
    entryNameSuggestions.forEach((name) => pushValue(name));
    return values;
  }, [entryNameSuggestions, language, openShoppingItems]);
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
  const applyCategorySuggestion = (descriptionValue: string, options?: { force?: boolean }) => {
    const currentCategory = (addEntryForm.state.values.category ?? "").trim();
    const shouldAutofillCategory =
      options?.force === true ||
      (!addEntryCategoryTouched &&
        (currentCategory.length === 0 || currentCategory.toLocaleLowerCase(language) === "general"));
    if (!shouldAutofillCategory) return;
    const suggestion = suggestCategoryLabel(descriptionValue, language);
    if (suggestion) {
      addEntryForm.setFieldValue("category", suggestion);
    }
  };
  const removeSelectedShoppingItem = useCallback((itemId: string) => {
    setSelectedShoppingItemIds((current) => current.filter((id) => id !== itemId));
  }, []);
  const toggleSelectedShoppingItem = useCallback((itemId: string) => {
    setSelectedShoppingItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
    );
  }, []);
  const tryAutofillNewEntryFromDescription = (
    descriptionValue: string,
    options?: { forceCategoryFromSuggestion?: boolean }
  ) => {
    const normalized = descriptionValue.trim().toLocaleLowerCase(language);
    if (!normalized) return;
    const matchedEntry = latestEntryByDescription.get(normalized);
    if (!matchedEntry) {
      applyCategorySuggestion(descriptionValue);
      return;
    }

    addEntryForm.setFieldValue("amount", String(matchedEntry.amount));
    setPreviewAmountInput(String(matchedEntry.amount));
    const currentCategory = (addEntryForm.state.values.category ?? "").trim();
    const shouldAutofillCategory =
      options?.forceCategoryFromSuggestion === true ||
      currentCategory.length === 0 ||
      currentCategory.toLocaleLowerCase(language) === "general";
    if (shouldAutofillCategory) {
      if (matchedEntry.category?.trim()) {
        addEntryForm.setFieldValue("category", matchedEntry.category);
      } else {
        applyCategorySuggestion(descriptionValue, { force: true });
      }
    }
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
  const handleEntryDescriptionKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (
        event.key === "Backspace" &&
        addEntryForm.state.values.description.length === 0 &&
        selectedShoppingItemIds.length > 0
      ) {
        event.preventDefault();
        setSelectedShoppingItemIds((current) => current.slice(0, -1));
        return;
      }
      onEntryDescriptionKeyDown(event);
    },
    [addEntryForm.state.values.description.length, onEntryDescriptionKeyDown, selectedShoppingItemIds.length]
  );
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
              vacationMemberIds={vacationMemberIds}
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
              vacationMemberIds={vacationMemberIds}
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
              vacationMemberIds={vacationMemberIds}
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
              vacationMemberIds={vacationMemberIds}
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
    <>
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
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-brand-100 bg-white px-2 py-1 text-xs text-brand-700 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-brand-300"
              onClick={() => {
                setReceiptPreviewUrl(field.state.value);
                setReceiptPreviewTitle(t("finances.receiptPreviewAlt"));
              }}
            >
              <img
                src={field.state.value}
                alt={t("finances.receiptPreviewAlt")}
                className="h-8 w-8 rounded object-cover"
              />
              <span>{t("finances.receiptPreviewLink")}</span>
            </button>
          ) : null}
          </div>
        )}
      />
      <ReceiptPreviewDialog
        open={Boolean(receiptPreviewUrl)}
        imageUrl={receiptPreviewUrl}
        title={receiptPreviewTitle}
        onOpenChange={(open) => {
          if (!open) {
            setReceiptPreviewUrl(null);
            setReceiptPreviewTitle(null);
          }
        }}
      />
    </>
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
    if (typeof window === "undefined") return;
    window.localStorage.setItem(OCR_DEBUG_LOCALSTORAGE_KEY, ocrDebugOverlayEnabled ? "1" : "0");
  }, [ocrDebugOverlayEnabled]);

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
    setOcrTorchSupported(false);
    setOcrTorchEnabled(false);
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
      const [videoTrack] = stream.getVideoTracks();
      const capabilities = (videoTrack?.getCapabilities?.() ?? {}) as { torch?: boolean };
      setOcrTorchSupported(Boolean(capabilities.torch));
      setOcrTorchEnabled(false);
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

  const toggleOcrTorch = useCallback(async () => {
    const [videoTrack] = ocrStreamRef.current?.getVideoTracks() ?? [];
    if (!videoTrack) return;
    const next = !ocrTorchEnabled;
    try {
      await videoTrack.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet]
      });
      setOcrTorchEnabled(next);
      setOcrError(null);
    } catch {
      setOcrError(t("finances.ocrTorchError"));
    }
  }, [ocrTorchEnabled, t]);

  const getOrCreateTesseractWorker = useCallback(async () => {
    if (ocrTesseractWorkerRef.current) return ocrTesseractWorkerRef.current;
    const tesseractModule = await import("tesseract.js");
    let worker: TesseractWorkerLike | undefined;
    try {
      worker = (await tesseractModule.createWorker(["deu", "eng"], tesseractModule.OEM.LSTM_ONLY, {
        logger: () => undefined,
        workerPath: LOCAL_TESSERACT_WORKER_PATH,
        corePath: LOCAL_TESSERACT_CORE_PATH,
        langPath: LOCAL_TESSERACT_LANG_PATH
      })) as unknown as TesseractWorkerLike;
    } catch {
      // Fallback to default remote paths if local assets are unavailable.
      worker = (await tesseractModule.createWorker(["deu", "eng"], tesseractModule.OEM.LSTM_ONLY, {
        logger: () => undefined
      })) as unknown as TesseractWorkerLike;
    }
    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300"
    });
    ocrTesseractWorkerRef.current = worker;
    return worker;
  }, []);

  useEffect(
    () => () => {
      const worker = ocrTesseractWorkerRef.current;
      if (!worker) return;
      ocrTesseractWorkerRef.current = null;
      void worker.terminate();
    },
    []
  );

  const captureAndAnalyzeOcr = useCallback(async () => {
    if (!ocrVideoRef.current || !ocrCanvasRef.current) return;
    if (ocrBusy) return;

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
    setOcrPreviewImageUrl(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) {
        setOcrError(t("finances.ocrCaptureError"));
        return;
      }

      const sourceBitmap = await createImageBitmap(blob);
      context.drawImage(sourceBitmap, 0, 0, width, height);
      sourceBitmap.close?.();
      const previewImageUrl = canvas.toDataURL("image/jpeg", 0.88);
      const sharpnessScore = estimateCanvasSharpness(canvas);
      if (sharpnessScore < OCR_MIN_SHARPNESS_SCORE) {
        setOcrError(t("finances.ocrTooBlurryError"));
        return;
      }
      const balancedCanvas = preprocessOcrCanvas(canvas, "balanced");
      const highContrastCanvas = preprocessOcrCanvas(canvas, "highContrast");
      const grayscaleCanvas = preprocessOcrCanvas(canvas, "grayscale");
      const openCvResult = await preprocessOcrCanvasWithOpenCv(canvas);
      const openCvCanvas = openCvResult.canvas;
      const effectiveSharpness = openCvResult.sharpness ?? sharpnessScore;
      if (effectiveSharpness < OCR_MIN_SHARPNESS_SCORE) {
        setOcrError(t("finances.ocrTooBlurryError"));
        return;
      }

      const detectorCtor = getTextDetectorConstructor();
      let detectorText = "";
      let detectorBoxes: OcrPreviewBox[] = [];
      if (detectorCtor) {
        try {
          const detected = await runTextDetectorOcr(detectorCtor, balancedCanvas);
          detectorText = detected.text;
          detectorBoxes = detected.boxes;
        } catch {
          detectorText = "";
          detectorBoxes = [];
        }
      }

      const worker = await getOrCreateTesseractWorker();
      const runTesseractPass = async ({
        source,
        params,
        rectangle,
        withBoxes,
        sourceName,
        region,
        numericFocused
      }: {
        source: HTMLCanvasElement;
        params: Record<string, string>;
        rectangle?: { left: number; top: number; width: number; height: number };
        withBoxes?: boolean;
        sourceName: OcrPassResult["source"];
        region: OcrPassResult["region"];
        numericFocused: boolean;
      }) => {
        await worker.setParameters(params);
        const result = await worker.recognize(source, rectangle ? { rectangle } : undefined, { text: true, blocks: true });
        const text = result.data.text.trim();
        const boxes = withBoxes ? extractBoxesFromTesseractResult(result, source.width, source.height) : [];
        const confidences = [...(result.data.words ?? []), ...(result.data.lines ?? [])]
          .map((entry) => Number(entry.confidence ?? 0))
          .filter((value) => Number.isFinite(value) && value > 0);
        const meanConfidence =
          confidences.length > 0 ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0;
        return { text, boxes, meanConfidence, source: sourceName, region, numericFocused } satisfies OcrPassResult;
      };

      const numericSourceCanvas = openCvCanvas ?? highContrastCanvas;
      const fullReceipt = {
        left: 0,
        top: 0,
        width: numericSourceCanvas.width,
        height: numericSourceCanvas.height
      };
      const lowerRegion = {
        left: 0,
        top: Math.floor(numericSourceCanvas.height * 0.45),
        width: numericSourceCanvas.width,
        height: Math.floor(numericSourceCanvas.height * 0.55)
      };

      const mainPass = await runTesseractPass({
        source: openCvCanvas ?? balancedCanvas,
        withBoxes: true,
        sourceName: "main",
        region: "full",
        numericFocused: false,
        params: {
          tessedit_pageseg_mode: "6",
          preserve_interword_spaces: "1",
          tessedit_char_whitelist: ""
        }
      });
      const sparsePass = await runTesseractPass({
        source: grayscaleCanvas,
        sourceName: "sparse",
        region: "full",
        numericFocused: false,
        params: {
          tessedit_pageseg_mode: "11",
          preserve_interword_spaces: "1",
          tessedit_char_whitelist: ""
        }
      });
      const numericPass = await runTesseractPass({
        source: numericSourceCanvas,
        rectangle: fullReceipt,
        sourceName: "numeric",
        region: "full",
        numericFocused: true,
        params: {
          tessedit_pageseg_mode: "6",
          preserve_interword_spaces: "1",
          tessedit_char_whitelist: "0123456789.,€EURSUMMETOTALGESAMTBETRAG"
        }
      });
      const lowerNumericPass = await runTesseractPass({
        source: numericSourceCanvas,
        rectangle: lowerRegion,
        sourceName: "lowerNumeric",
        region: "lower",
        numericFocused: true,
        params: {
          tessedit_pageseg_mode: "11",
          preserve_interword_spaces: "1",
          tessedit_char_whitelist: "0123456789.,€EURSUMMETOTALGESAMTBETRAG"
        }
      });
      const openCvSparsePass: OcrPassResult =
        openCvCanvas !== null
          ? await runTesseractPass({
              source: openCvCanvas,
              sourceName: "opencvSparse",
              region: "full",
              numericFocused: false,
              params: {
                tessedit_pageseg_mode: "11",
                preserve_interword_spaces: "1",
                tessedit_char_whitelist: ""
              }
            })
          : {
              text: "",
              boxes: [] as OcrPreviewBox[],
              meanConfidence: 0,
              source: "opencvSparse",
              region: "full",
              numericFocused: false
            };

      await worker.setParameters({
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1",
        tessedit_char_whitelist: "",
        user_defined_dpi: "300"
      });

      const detectorPass: OcrPassResult = {
        text: detectorText,
        boxes: detectorBoxes,
        meanConfidence: 55,
        source: "detector",
        region: "full",
        numericFocused: false
      };
      const passes: OcrPassResult[] = [detectorPass, mainPass, sparsePass, numericPass, lowerNumericPass, openCvSparsePass];
      const text = buildUniqueLinesText(
        detectorText,
        mainPass.text,
        sparsePass.text,
        numericPass.text,
        lowerNumericPass.text,
        openCvSparsePass.text
      );
      const boxes = mergeUniqueBoxes(detectorBoxes, mainPass.boxes);

      if (!text.trim()) {
        setOcrError(t("finances.ocrReadError"));
        return;
      }

      const hasEnoughText = text.replace(/\s/g, "").length >= OCR_MIN_USEFUL_TEXT_LENGTH;
      if (!hasEnoughText) {
        setOcrError(t("finances.ocrReadError"));
        return;
      }

      const amountFromPasses = extractPriceFromOcrPassesDetailed(passes);
      const recognizedPrice = amountFromPasses.value ?? extractPriceFromOcrText(text);
      const recognizedProduct = extractProductFromOcrText(text);
      const classifiedBoxes = boxes.map((box) => ({
        ...box,
        kind: classifyOcrBoxKind(box.text, recognizedProduct, recognizedPrice)
      }));
      const candidate: OcrCandidate = {
        description: recognizedProduct ?? "",
        amount: recognizedPrice !== null ? recognizedPrice.toFixed(2) : "",
        fullText: text,
        boxes: classifiedBoxes,
        debug: {
          sharpness: sharpnessScore,
          effectiveSharpness,
          passes: passes.map((pass) => ({
            source: pass.source,
            region: pass.region,
            numericFocused: pass.numericFocused,
            meanConfidence: pass.meanConfidence,
            textLength: pass.text.length
          })),
          topAmountCandidates: amountFromPasses.ranked.slice(0, 8)
        }
      };
      setOcrPreviewImageUrl(previewImageUrl);
      setOcrCandidate(candidate);
      setOcrConfirmDialogOpen(true);
      setOcrCameraDialogOpen(false);
    } catch {
      setOcrError(t("finances.ocrReadError"));
    } finally {
      setOcrBusy(false);
    }
  }, [getOrCreateTesseractWorker, ocrBusy, t]);

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
                    className={`relative flex items-stretch overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-slate-700 dark:bg-slate-900 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200 dark:focus-within:border-slate-500 dark:focus-within:ring-slate-600/40 ${
                      mobile ? "min-h-10" : "h-10"
                    }`}
                  >
                    <div
                      className={`flex min-w-0 flex-1 gap-1 px-2 ${
                        mobile ? "flex-wrap content-start py-1" : "items-center"
                      }`}
                    >
                      {selectedShoppingItems.map((item) => (
                        <span
                          key={item.id}
                          className="inline-flex h-6 max-w-40 items-center gap-1 rounded-md border border-brand-200 bg-brand-50/30 px-2 text-xs dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-200"
                        >
                          <span className="truncate">{item.title}</span>
                          <button
                            type="button"
                            onClick={() => removeSelectedShoppingItem(item.id)}
                            className="rounded-sm text-brand-700/80 transition hover:text-brand-900 dark:text-slate-200/80 dark:hover:text-slate-50"
                            aria-label={t("common.remove")}
                          >
                            ×
                          </button>
                        </span>
                      ))}
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
                        onKeyDown={handleEntryDescriptionKeyDown}
                        placeholder={t("finances.descriptionPlaceholder")}
                        list={
                          addEntryNativeSuggestions.length > 0
                            ? entryNameSuggestionsListId
                            : undefined
                        }
                        className={`min-w-0 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 ${
                          mobile ? "h-8 basis-full flex-none" : "h-full flex-1"
                        }`}
                      />
                    </div>
                    <addEntryForm.Field
                      name="amount"
                      children={(amountField: { state: { value: string }; handleChange: (value: string) => void }) => (
                        <div
                          className={`relative w-28 shrink-0 border-l border-brand-200 dark:border-slate-700 ${
                            mobile ? "self-stretch !h-auto min-h-10" : "h-full"
                          }`}
                        >
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
                        className={`w-10 shrink-0 rounded-none border-l border-brand-200 p-0 dark:border-slate-700 ${
                          mobile ? "self-stretch !h-auto min-h-10" : "h-full"
                        }`}
                        aria-label={t("finances.moreOptions")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    {useCameraInsteadOfAdd ? (
                      <Button
                        type="button"
                        disabled={busy}
                        className={`shrink-0 rounded-none border-l border-brand-200 px-3 dark:border-slate-700 ${
                          mobile ? "self-stretch !h-auto min-h-10" : "h-full"
                        }`}
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
                        className={`shrink-0 rounded-none border-l border-brand-200 px-3 dark:border-slate-700 ${
                          mobile ? "self-stretch !h-auto min-h-10" : "h-full"
                        }`}
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
                          onChange={(value) => {
                            setAddEntryCategoryTouched(true);
                            categoryField.handleChange(value);
                          }}
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
                          <TooltipProvider>
                            <RadixTooltip>
                              <TooltipTrigger asChild>
                                <Input
                                  type="date"
                                  lang={locale}
                                  value={dateField.state.value}
                                  onChange={(event) => dateField.handleChange(event.target.value)}
                                />
                              </TooltipTrigger>
                              <TooltipContent>{t("finances.entryDate")}</TooltipContent>
                            </RadixTooltip>
                          </TooltipProvider>
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
              {entryDescriptionFocused &&
              (entryDescriptionSuggestions.length > 0 || shoppingSuggestionItems.length > 0) ? (
                <div
                  className={`absolute left-0 right-0 z-50 rounded-xl border border-brand-100 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${
                    mobile ? "bottom-[calc(100%+0.65rem)]" : "top-[calc(100%+0.65rem)]"
                  } animate-in fade-in-0 zoom-in-95 duration-150`}
                >
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {shoppingSuggestionItems.length > 0 ? (
                      <>
                        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("finances.shoppingSuggestionsTitle")}
                        </p>
                        <ul>
                          {shoppingSuggestionItems.map((item) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-brand-50/80 dark:hover:bg-slate-800/70"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => toggleSelectedShoppingItem(item.id)}
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {item.title}
                                  </p>
                                  {item.tags.length > 0 ? (
                                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                      #{item.tags.join(" #")}
                                    </p>
                                  ) : null}
                                </div>
                                <Badge className="text-[10px]">{t("common.add")}</Badge>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {entryDescriptionSuggestions.length > 0 ? (
                      <>
                        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("finances.suggestionsTitle")}
                        </p>
                        <ul>
                          {entryDescriptionSuggestions.map((suggestion, index) => (
                            <li key={suggestion.key}>
                              <button
                                type="button"
                                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-brand-50/80 dark:hover:bg-slate-800/70 ${
                                  index === activeEntryDescriptionSuggestionIndex
                                    ? "bg-brand-100/20"
                                    : ""
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
                      </>
                    ) : null}
                  </div>
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
                  : "bottom-[calc(env(safe-area-inset-bottom)-0.75rem)]"
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
                        <MemberAvatar
                          src={memberAvatarSrc(entry.memberId)}
                          alt={memberLabel(entry.memberId)}
                          isVacation={vacationMemberIds.has(entry.memberId)}
                          className="h-7 w-7 rounded-full border border-brand-100 bg-brand-50 dark:border-slate-700 dark:bg-slate-800"
                        />
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
                  height={340}
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
                        <TooltipProvider>
                          <RadixTooltip>
                            <TooltipTrigger asChild>
                              <Input
                                type="date"
                                lang={locale}
                                value={field.state.value}
                                onChange={(event) =>
                                  field.handleChange(event.target.value)
                                }
                              />
                            </TooltipTrigger>
                            <TooltipContent>{t("finances.filterFrom")}</TooltipContent>
                          </RadixTooltip>
                        </TooltipProvider>
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
                        <TooltipProvider>
                          <RadixTooltip>
                            <TooltipTrigger asChild>
                              <Input
                                type="date"
                                lang={locale}
                                value={field.state.value}
                                onChange={(event) =>
                                  field.handleChange(event.target.value)
                                }
                              />
                            </TooltipTrigger>
                            <TooltipContent>{t("finances.filterTo")}</TooltipContent>
                          </RadixTooltip>
                        </TooltipProvider>
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
                          vacationMemberIds={vacationMemberIds}
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
              createdByTooltip={(entry: FinanceEntry) => `Erstellt von ${memberLabel(entry.created_by)}`}
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
          {entriesHasMore ? (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => onLoadMoreEntries?.()}
                disabled={entriesLoadingMore}
              >
                {t("common.loadMore")}
              </Button>
            </div>
          ) : null}
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
                              onChange={(event) => {
                                const raw = Number(event.target.value);
                                const snapped = raw >= 0.95 && raw <= 1.05 ? 1 : Math.round(raw * 100) / 100;
                                field.handleChange(String(snapped));
                              }}
                              className="common-factor-slider w-full"
                              style={sliderStyle}
                              aria-label={t("settings.commonFactorLabel")}
                            />
                            <div className="grid grid-cols-3 items-center text-xs">
                              <span className="text-left font-semibold text-rose-600 dark:text-rose-400">
                                0%
                              </span>
                              <span className="text-center font-semibold text-emerald-700 dark:text-emerald-400">
                                100%
                              </span>
                              <span className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                200%
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
                                {percentage}%
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
                          <div className="flex flex-wrap items-center gap-2">
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

          {!rentDetailsOpen ? (
            <SectionPanel className="mt-4">
              <>
                <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
                  {t("finances.rentHistoryTitle")}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("finances.rentHistoryDescription")}
                </p>
                {rentHistoryItems.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {t("finances.rentHistoryEmpty")}
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {rentHistoryItems.map((item) => (
                      <button
                        key={`rent-history-${item.id}`}
                        type="button"
                        onClick={() => {
                          setSelectedRentHistoryItem(item);
                          setRentHistoryContractsOnly(false);
                          setRentHistoryDialogOpen(true);
                        }}
                        className="w-full rounded-lg cursor-pointer border border-brand-100 bg-white/80 px-3 py-2 text-left transition hover:border-brand-200 hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-slate-600"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {item.title}
                            </p>
                            {item.meta ? (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {item.meta}
                              </p>
                            ) : null}
                            {item.details.length > 0 ? (
                              <div className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                                {item.details.map((detail, index) => (
                                  <p key={`${item.id}-detail-${index}`}>{detail}</p>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDateOnly(item.at, language, item.at)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
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
          {!isMobileAddEntryComposer ? (
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
              <CardContent>
                <div className="max-w-sm space-y-1">
                  <Label className="sr-only">
                    {t("finances.searchLabel")}
                  </Label>
                  <Input
                    value={overviewEntrySearch}
                    onChange={(event) => setOverviewEntrySearch(event.target.value)}
                    placeholder={t("finances.searchPlaceholder")}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}
          {entriesSinceLastAudit.length > 0 && filteredEntriesSinceLastAudit.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              {t("finances.emptyFiltered")}
            </p>
          ) : null}
          {filteredEntriesSinceLastAudit.length > 0 ? (
            <FinanceEntriesList
              header={
                isMobileAddEntryComposer ? (
                  <div className="rounded-xl border border-slate-300 bg-white/95 p-3 text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {t("finances.currentEntriesTitle")}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t("finances.currentEntriesDescription")}
                        </p>
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
                    <div className="mt-2 max-w-sm space-y-1">
                      <Label className="sr-only">
                        {t("finances.searchLabel")}
                      </Label>
                      <Input
                        value={overviewEntrySearch}
                        onChange={(event) => setOverviewEntrySearch(event.target.value)}
                        placeholder={t("finances.searchPlaceholder")}
                      />
                    </div>
                  </div>
                ) : undefined
              }
              entries={filteredEntriesSinceLastAudit}
              itemClassName="relative z-0 rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100"
              formatMoney={moneyLabel}
              paidByText={paidByText}
              entryDateText={entryDateText}
              createdByTooltip={(entry) => `Erstellt von ${memberLabel(entry.created_by)}`}
              receiptImageUrl={(entry) => entry.receipt_image_url}
              receiptLabel={t("finances.receiptLink")}
              entryChipText={personalEntryDeltaLabel}
              entryChipClassName={personalEntryDeltaChipClassName}
              amountClassName="text-xs text-slate-500 dark:text-slate-400"
              actionsLabel={t("finances.entryActions")}
              editLabel={t("finances.editEntry")}
              deleteLabel={t("finances.deleteEntry")}
              onEdit={onStartEditEntry}
              onDelete={(entry) => {
                void onDeleteEntry(entry);
              }}
              canEditEntry={canManageFinanceEntry}
              canDeleteEntry={canManageFinanceEntry}
              busy={busy}
              virtualized
              virtualHeight={isMobileAddEntryComposer ? mobileOverviewListHeight : 520}
            />
          ) : entriesSinceLastAudit.length === 0 ? (
            isMobileAddEntryComposer ? (
              <div className="mt-4 rounded-xl border border-slate-300 bg-white/95 p-3 text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t("finances.currentEntriesTitle")}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t("finances.currentEntriesDescription")}
                    </p>
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
                <div className="mt-2 max-w-sm space-y-1">
                  <Label className="sr-only">
                    {t("finances.searchLabel")}
                  </Label>
                  <Input
                    value={overviewEntrySearch}
                    onChange={(event) => setOverviewEntrySearch(event.target.value)}
                    placeholder={t("finances.searchPlaceholder")}
                  />
                </div>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {t("finances.empty")}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                {t("finances.empty")}
              </p>
            )
          ) : null}
        </>
      ) : null}

      <FullscreenDialog
        open={subscriptionDialogOpen}
        onOpenChange={setSubscriptionDialogOpen}
        title={t("finances.addSubscriptionAction")}
        description={t("finances.subscriptionsDescription")}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void subscriptionForm.handleSubmit();
        }}
        maxWidthClassName="sm:max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">{t("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {t("finances.addSubscriptionAction")}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">{renderSubscriptionFormFields(subscriptionForm)}</div>
      </FullscreenDialog>

      <FullscreenDialog
        open={editSubscriptionDialogOpen}
        onOpenChange={(open) => {
          setEditSubscriptionDialogOpen(open);
          if (!open) setSubscriptionBeingEdited(null);
        }}
        title={t("finances.editSubscriptionTitle")}
        description={t("finances.editSubscriptionDescription")}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void editSubscriptionForm.handleSubmit();
        }}
        maxWidthClassName="sm:max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">{t("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {t("finances.saveSubscriptionAction")}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">{renderSubscriptionFormFields(editSubscriptionForm)}</div>
      </FullscreenDialog>

      <FullscreenDialog
        open={editEntryDialogOpen}
        onOpenChange={(open) => {
          setEditEntryDialogOpen(open);
          if (!open) {
            setEntryBeingEdited(null);
            setReceiptUploadError(null);
          }
        }}
        title={t("finances.editEntryTitle")}
        description={t("finances.editEntryDescription")}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void editEntryForm.handleSubmit();
        }}
        maxWidthClassName="sm:max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">{t("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {t("finances.saveEntry")}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
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
                <TooltipProvider>
                  <RadixTooltip>
                    <TooltipTrigger asChild>
                      <Input
                        type="date"
                        lang={locale}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </TooltipTrigger>
                    <TooltipContent>{t("finances.entryDate")}</TooltipContent>
                  </RadixTooltip>
                </TooltipProvider>
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
        </div>
      </FullscreenDialog>
      <Dialog
        open={ocrCameraDialogOpen}
        onOpenChange={(open) => {
          setOcrCameraDialogOpen(open);
          if (!open) {
            setOcrError(null);
            setOcrPreviewImageUrl(null);
          }
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
            <div className="relative overflow-hidden rounded-xl border border-brand-100 bg-black dark:border-slate-700">
              <video
                ref={ocrVideoRef}
                className="h-64 w-full object-cover"
                autoPlay
                muted
                playsInline
              />
              {ocrTorchSupported ? (
                <button
                  type="button"
                  className={`absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 ${
                    ocrTorchEnabled
                      ? "border-amber-300 bg-amber-400 text-amber-950 hover:bg-amber-300"
                      : "border-white/40 bg-black/45 text-white hover:bg-black/60"
                  }`}
                  onClick={() => void toggleOcrTorch()}
                  aria-label={ocrTorchEnabled ? t("finances.ocrTorchOffButton") : t("finances.ocrTorchOnButton")}
                  title={ocrTorchEnabled ? t("finances.ocrTorchOffButton") : t("finances.ocrTorchOnButton")}
                >
                  {ocrTorchEnabled ? <ZapOff className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                </button>
              ) : null}
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
          if (!open) {
            setOcrCandidate(null);
            setOcrPreviewImageUrl(null);
          }
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
            {ocrPreviewImageUrl ? (
              <div className="overflow-hidden rounded-xl border border-brand-100 bg-slate-100 dark:border-slate-700 dark:bg-slate-900">
                <div className="relative mx-auto w-fit max-w-full">
                  <img
                    src={ocrPreviewImageUrl}
                    alt={t("finances.receiptPreviewAlt")}
                    className="block max-h-56 w-auto max-w-full"
                  />
                  {ocrCandidate?.boxes.map((box, index) => (
                    <div
                      key={`${box.left}-${box.top}-${box.width}-${box.height}-${index}`}
                      className={`pointer-events-none absolute border ${
                        box.kind === "price"
                          ? "border-emerald-400/85 bg-emerald-300/15"
                          : box.kind === "product"
                            ? "border-sky-400/85 bg-sky-300/15"
                            : "border-amber-400/85 bg-amber-300/15"
                      }`}
                      style={{
                        left: `${box.left * 100}%`,
                        top: `${box.top * 100}%`,
                        width: `${box.width * 100}%`,
                        height: `${box.height * 100}%`
                      }}
                      title={box.text}
                    />
                  ))}
                  <button
                    type="button"
                    className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-black/45 text-white transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
                    onClick={() => {
                      setOcrConfirmDialogOpen(false);
                      setOcrCandidate(null);
                      setOcrPreviewImageUrl(null);
                      setOcrError(null);
                      setOcrCameraDialogOpen(true);
                    }}
                    aria-label={t("finances.ocrRetryButton")}
                    title={t("finances.ocrRetryButton")}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}
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
            <div className="flex items-center justify-between rounded-lg border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {t("finances.ocrDebugOverlayToggle")}
              </span>
              <Switch
                checked={ocrDebugOverlayEnabled}
                onCheckedChange={(checked) => setOcrDebugOverlayEnabled(checked)}
                aria-label={t("finances.ocrDebugOverlayToggle")}
              />
            </div>
            {ocrDebugOverlayEnabled && ocrCandidate?.debug ? (
              <div className="space-y-2 rounded-lg border border-brand-100 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
                <p className="font-semibold text-slate-700 dark:text-slate-200">{t("finances.ocrDebugOverlayTitle")}</p>
                <p className="text-slate-600 dark:text-slate-300">
                  {t("finances.ocrDebugSharpness", {
                    raw: ocrCandidate.debug.sharpness.toFixed(1),
                    effective: ocrCandidate.debug.effectiveSharpness.toFixed(1)
                  })}
                </p>
                <details>
                  <summary className="cursor-pointer text-slate-600 dark:text-slate-300">
                    {t("finances.ocrDebugPasses")}
                  </summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[420px] border-collapse">
                      <thead>
                        <tr className="text-left text-slate-500 dark:text-slate-400">
                          <th className="px-1 py-1">{t("finances.ocrDebugPassSource")}</th>
                          <th className="px-1 py-1">{t("finances.ocrDebugPassRegion")}</th>
                          <th className="px-1 py-1">{t("finances.ocrDebugPassConfidence")}</th>
                          <th className="px-1 py-1">{t("finances.ocrDebugPassLength")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ocrCandidate.debug.passes.map((pass, index) => (
                          <tr key={`${pass.source}-${pass.region}-${index}`} className="border-t border-brand-100 dark:border-slate-800">
                            <td className="px-1 py-1">{pass.source}{pass.numericFocused ? " *" : ""}</td>
                            <td className="px-1 py-1">{pass.region}</td>
                            <td className="px-1 py-1">{pass.meanConfidence.toFixed(1)}</td>
                            <td className="px-1 py-1">{pass.textLength}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <details>
                  <summary className="cursor-pointer text-slate-600 dark:text-slate-300">
                    {t("finances.ocrDebugCandidates")}
                  </summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[420px] border-collapse">
                      <thead>
                        <tr className="text-left text-slate-500 dark:text-slate-400">
                          <th className="px-1 py-1">{t("finances.ocrDebugCandidateToken")}</th>
                          <th className="px-1 py-1">{t("finances.ocrDebugCandidateValue")}</th>
                          <th className="px-1 py-1">{t("finances.ocrDebugCandidateScore")}</th>
                          <th className="px-1 py-1">{t("finances.ocrDebugCandidateCount")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ocrCandidate.debug.topAmountCandidates.map((entry) => (
                          <tr key={entry.token} className="border-t border-brand-100 dark:border-slate-800">
                            <td className="px-1 py-1">{entry.token}</td>
                            <td className="px-1 py-1">{entry.value.toFixed(2)}</td>
                            <td className="px-1 py-1">{entry.maxScore.toFixed(1)} / {entry.totalScore.toFixed(1)}</td>
                            <td className="px-1 py-1">{entry.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
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
      <Dialog
        open={rentHistoryDialogOpen}
        onOpenChange={(open) => {
          setRentHistoryDialogOpen(open);
          if (!open) {
            setSelectedRentHistoryItem(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("finances.rentHistoryDialogTitle")}</DialogTitle>
            {selectedRentHistoryItem ? (
              <DialogDescription>
                {selectedRentHistoryItem.title} ·{" "}
                {formatDateOnly(selectedRentHistoryItem.at, language, selectedRentHistoryItem.at)}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("finances.rentHistoryDialogDescription")}
            </p>
            <div className="flex items-center gap-2">
              <Switch
                checked={rentHistoryContractsOnly}
                onCheckedChange={(checked) => setRentHistoryContractsOnly(checked)}
              />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {rentHistoryContractsOnly
                  ? t("finances.rentHistoryDialogModeContracts")
                  : t("finances.rentHistoryDialogModeTotal")}
              </span>
            </div>
          </div>

          {rentHistoryDialogData ? (
            <div className="mt-3 overflow-auto rounded-lg border border-brand-100 dark:border-slate-700">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-brand-50/50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900/70 dark:text-slate-200">
                  <tr>
                    <th className="px-3 py-2">{t("finances.rentHistoryTableMember")}</th>
                    <th className="px-3 py-2 text-right">{t("finances.rentHistoryTableBefore")}</th>
                    <th className="px-3 py-2 text-right">{t("finances.rentHistoryTableChange")}</th>
                    <th className="px-3 py-2 text-right">{t("finances.rentHistoryTableAfter")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rentHistoryDialogData.memberIds.map((memberId, index) => {
                    const labelOverride = rentHistoryDialogData.memberNameOverrides.get(memberId);
                    const label = labelOverride || memberLabel(memberId);
                    const beforeEntry = rentHistoryDialogData.beforeCost.byMember.get(memberId) ?? null;
                    const afterEntry = rentHistoryDialogData.afterCost.byMember.get(memberId) ?? null;
                    const beforeValue = rentHistoryContractsOnly
                      ? beforeEntry?.extraContracts ?? null
                      : beforeEntry?.grandTotal ?? null;
                    const afterValue = rentHistoryContractsOnly
                      ? afterEntry?.extraContracts ?? null
                      : afterEntry?.grandTotal ?? null;
                    const deltaValue = getHistoryDeltaValue(beforeValue, afterValue);
                    const deltaColor =
                      deltaValue > 0
                        ? "text-rose-600 dark:text-rose-300"
                        : deltaValue < 0
                          ? "text-emerald-600 dark:text-emerald-300"
                          : "text-slate-600 dark:text-slate-300";
                    return (
                      <tr
                        key={`rent-history-row-${memberId}`}
                        className={[
                          "border-t border-brand-100 dark:border-slate-700",
                          index % 2 === 0
                            ? "bg-white dark:bg-slate-900/60"
                            : "bg-brand-50/10"
                        ].join(" ")}
                      >
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{label}</td>
                        <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                          {formatHistoryValue(beforeValue)}
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold ${deltaColor}`}>
                          {formatHistoryDelta(beforeValue, afterValue)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                          {formatHistoryValue(afterValue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              {t("finances.rentHistoryDialogEmpty")}
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <DialogClose asChild>
              <Button variant="ghost">{t("common.close")}</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
      {/* {categorySuggestions.length > 0 ? (
        <datalist id={categorySuggestionsListId}>
          {categorySuggestions.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      ) : null}
      {addEntryNativeSuggestions.length > 0 ? (
        <datalist id={entryNameSuggestionsListId}>
          {addEntryNativeSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ) : null} */}
    </div>
  );
};
