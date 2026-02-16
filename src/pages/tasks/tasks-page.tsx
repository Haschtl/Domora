import { type RefObject, useCallback, useRef, useState, useEffect, useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import imageCompression from "browser-image-compression";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip as ChartTooltip
} from "chart.js";
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Info,
  Frown,
  Medal,
  MoreHorizontal,
  Plus,
  X
} from "lucide-react";
import SparklesEffect from "react-sparkle";
import { Bar } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import type { CaptchaType } from "recaptz";
import type {
  Household,
  HouseholdMember,
  HouseholdMemberPimpers,
  HouseholdEvent,
  NewTaskInput,
  TaskCompletion,
  TaskItem
} from "../../lib/types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/accordion";
import { Input } from "../../components/ui/input";
import { InputWithSuffix } from "../../components/ui/input-with-suffix";
import { Label } from "../../components/ui/label";
import { MobileSubpageDialog } from "../../components/ui/mobile-subpage-dialog";
import { PimpersStack } from "../../components/pimpers-stack";
import { PersonSelect } from "../../components/person-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { StarRating } from "../../components/ui/star-rating";
import { Switch } from "../../components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import { MemberAvatar } from "../../components/member-avatar";
import { RecaptzCaptcha } from "../../components/recaptz-captcha";
import { useSmartSuggestions } from "../../hooks/use-smart-suggestions";
import { formatDateTime, formatShortDay, getLastMonthRange } from "../../lib/date";
import { createDiceBearAvatarDataUri, getMemberAvatarSeed } from "../../lib/avatar";
import { createMemberLabelGetter } from "../../lib/member-label";
import { getMemberOfMonth } from "../../lib/task-leaderboard";
import { supabase } from "../../lib/supabase";
import { buildCalendarEntriesByDay, buildCompletionSpansByDay, buildMonthGrid, dayKey, startOfMonth } from "../../features/tasks-calendar";
import { TaskSuggestion, useTaskSuggestions } from "../../features/hooks/use-task-suggestions";
import { SortableRotationItem } from "../../features/components/SortableRotationItem";
import { PimpersIcon } from "../../components/pimpers-icon";
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ChartTooltip,
  Legend
);

interface TasksPageProps {
  section?: "overview" | "stats" | "history" | "settings";
  household: Household;
  tasks: TaskItem[];
  completions: TaskCompletion[];
  householdEvents: HouseholdEvent[];
  members: HouseholdMember[];
  memberPimpers: HouseholdMemberPimpers[];
  userId: string;
  busy: boolean;
  onAdd: (input: NewTaskInput) => Promise<void>;
  onComplete: (task: TaskItem) => Promise<void>;
  onSkip: (task: TaskItem) => Promise<void>;
  onTakeover: (task: TaskItem) => Promise<void>;
  onToggleActive: (task: TaskItem) => Promise<void>;
  onUpdate: (task: TaskItem, input: NewTaskInput) => Promise<void>;
  onDelete: (task: TaskItem) => Promise<void>;
  onRateTaskCompletion: (taskCompletionId: string, rating: number) => Promise<void>;
  onResetHouseholdPimpers: () => Promise<void>;
  onUpdateMemberTaskLaziness: (targetUserId: string, taskLazinessFactor: number) => Promise<void>;
}

type PendingTaskAction = {
  kind: "skip" | "takeover" | "complete";
  task: TaskItem;
};

type TaskHistoryItem =
  | { type: "completion"; entry: TaskCompletion }
  | { type: "skipped"; id: string; taskTitle: string; userId: string | null; createdAt: string };

type TaskFormValues = {
  title: string;
  description: string;
  currentStateImageUrl: string;
  targetStateImageUrl: string;
  startDate: string;
  frequencyDays: string;
  effortPimpers: string;
  graceDays: string;
  delayPenaltyPerDay: string;
  prioritizeLowPimpers: boolean;
  assigneeFairnessMode: "actual" | "projection" | "expected";
};

type SkipMathChallenge = {
  expression: string;
  answer: number;
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const createDefaultTaskFormValues = (): TaskFormValues => ({
  title: "",
  description: "",
  currentStateImageUrl: "",
  targetStateImageUrl: "",
  startDate: toDateInputValue(new Date()),
  frequencyDays: "7",
  effortPimpers: "1",
  graceDays: "1",
  delayPenaltyPerDay: "0.25",
  prioritizeLowPimpers: true,
  assigneeFairnessMode: "expected"
});

const MAX_TASK_IMAGE_DIMENSION = 1600;
const MAX_TASK_IMAGE_SIZE_MB = 0.9;
const TASK_IMAGE_QUALITY = 0.78;
const DEFAULT_WEEKDAY = new Date().getDay();
const WEEKDAY_OPTIONS = [
  { value: 1, label: "Mo" },
  { value: 2, label: "Di" },
  { value: 3, label: "Mi" },
  { value: 4, label: "Do" },
  { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
  { value: 0, label: "So" }
];

type ComplexFrequency = {
  type: "weekly" | "monthly";
  weekdays: number[];
  intervalWeeks: number;
  monthDay: number;
  intervalMonths: number;
};

const createDefaultComplexFrequency = (): ComplexFrequency => ({
  type: "weekly",
  weekdays: [DEFAULT_WEEKDAY],
  intervalWeeks: 1,
  monthDay: 1,
  intervalMonths: 1
});

const clampNumber = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;

const buildCronPatternFromComplex = (config: ComplexFrequency) => {
  if (config.type === "monthly") {
    const day = clampNumber(Math.floor(config.monthDay), 1, 31);
    const monthPart = config.intervalMonths > 1 ? `*/${config.intervalMonths}` : "*";
    return `0 9 ${day} ${monthPart} *`;
  }

  const weekdays = config.weekdays.length > 0 ? [...new Set(config.weekdays)] : [DEFAULT_WEEKDAY];
  if (config.intervalWeeks <= 1) {
    return `0 9 * * ${weekdays.sort((a, b) => a - b).join(",")}`;
  }
  const intervalDays = Math.max(1, Math.floor(config.intervalWeeks) * 7);
  return `0 9 */${intervalDays} * *`;
};

const deriveFrequencyDaysFromComplex = (config: ComplexFrequency) => {
  if (config.type === "monthly") {
    return Math.max(1, Math.floor(config.intervalMonths) * 30);
  }
  return Math.max(1, Math.floor(config.intervalWeeks) * 7);
};

const parseComplexFromCron = (pattern: string): { mode: "days" | "cron"; config: ComplexFrequency } => {
  const fallback = createDefaultComplexFrequency();
  if (!pattern) return { mode: "days", config: fallback };
  const parts = pattern.trim().split(/\s+/);
  if (parts.length < 5) return { mode: "days", config: fallback };
  const dayPart = parts[2] ?? "";
  const monthPart = parts[3] ?? "";
  const weekPart = parts[4] ?? "";

  if (dayPart.startsWith("*/")) {
    return { mode: "days", config: fallback };
  }

  if (weekPart !== "*") {
    const weekdays = weekPart
      .split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    return {
      mode: "cron",
      config: {
        type: "weekly",
        weekdays: weekdays.length > 0 ? weekdays : [DEFAULT_WEEKDAY],
        intervalWeeks: 1,
        monthDay: 1,
        intervalMonths: 1
      }
    };
  }

  if (dayPart !== "*" && dayPart !== "?") {
    const day = Number(dayPart);
    const intervalMonths = monthPart.startsWith("*/") ? Number(monthPart.slice(2)) : 1;
    return {
      mode: "cron",
      config: {
        type: "monthly",
        weekdays: [DEFAULT_WEEKDAY],
        intervalWeeks: 1,
        monthDay: Number.isFinite(day) ? day : 1,
        intervalMonths: Number.isFinite(intervalMonths) && intervalMonths > 0 ? intervalMonths : 1
      }
    };
  }

  return { mode: "days", config: fallback };
};

const formatComplexFrequencyPreview = (config: ComplexFrequency, t: (key: string, options?: Record<string, unknown>) => string) => {
  if (config.type === "monthly") {
    if (config.intervalMonths > 1) {
      return t("tasks.frequencyPreviewMonthlyInterval", {
        count: config.intervalMonths,
        day: clampNumber(config.monthDay, 1, 31)
      });
    }
    return t("tasks.frequencyPreviewMonthly", {
      day: clampNumber(config.monthDay, 1, 31)
    });
  }

  const weekdays = [...new Set(config.weekdays.length > 0 ? config.weekdays : [DEFAULT_WEEKDAY])]
    .sort((a, b) => a - b)
    .map((weekday) => t(`tasks.weekdayShort.${weekday}` as const));

  if (config.intervalWeeks > 1) {
    return t("tasks.frequencyPreviewWeeklyInterval", {
      count: config.intervalWeeks,
      days: weekdays.join(", ")
    });
  }
  return t("tasks.frequencyPreviewWeekly", { days: weekdays.join(", ") });
};

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
    maxSizeMB: MAX_TASK_IMAGE_SIZE_MB,
    maxWidthOrHeight: MAX_TASK_IMAGE_DIMENSION,
    useWebWorker: true,
    initialQuality: TASK_IMAGE_QUALITY
  });

  return imageCompression.getDataUrlFromFile(compressed);
};

const normalizeUserColor = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
};

const fallbackColorFromUserId = (userId: string) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 48%)`;
};

const relativeDueChipLabel = (
  dueAtIso: string,
  graceMinutes: number | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
) => {
  const dueAt = new Date(dueAtIso);
  if (Number.isNaN(dueAt.getTime())) return t("tasks.noDate");
  const graceMs = Math.max(0, graceMinutes ?? 0) * 60 * 1000;
  const nowMs = Date.now();
  const dueAtMs = dueAt.getTime();
  const effectiveDueMs = dueAtMs + graceMs;

  if (nowMs >= dueAtMs && nowMs <= effectiveDueMs) {
    return t("tasks.dueNow");
  }

  const diffMs = (nowMs < dueAtMs ? dueAtMs : effectiveDueMs) - nowMs;
  const isFuture = diffMs >= 0;
  const absMs = Math.abs(diffMs);

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;

  const toCount = (unitMs: number) => {
    if (isFuture) return Math.max(1, Math.ceil(absMs / unitMs));
    return Math.max(1, Math.floor(absMs / unitMs));
  };

  let valueLabel: string;
  if (absMs < hourMs) {
    valueLabel = t("tasks.relativeMinutes", { count: toCount(minuteMs) });
  } else if (absMs < dayMs) {
    valueLabel = t("tasks.relativeHours", { count: toCount(hourMs) });
  } else if (absMs < weekMs) {
    valueLabel = t("tasks.relativeDays", { count: toCount(dayMs) });
  } else {
    valueLabel = t("tasks.relativeWeeks", { count: toCount(weekMs) });
  }

  return isFuture ? t("tasks.dueIn", { value: valueLabel }) : t("tasks.dueSince", { value: valueLabel });
};

const reminderLateLabel = (
  dueAtIso: string,
  graceMinutes: number | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
) => {
  const dueAt = new Date(dueAtIso);
  if (Number.isNaN(dueAt.getTime())) return t("tasks.reminderLateNow");
  const graceMs = Math.max(0, graceMinutes ?? 0) * 60 * 1000;
  const diffMs = Date.now() - (dueAt.getTime() + graceMs);
  if (diffMs <= 0) return t("tasks.reminderLateNow");

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;

  const toCount = (unitMs: number) => Math.max(1, Math.floor(diffMs / unitMs));

  let valueLabel: string;
  if (diffMs < hourMs) {
    valueLabel = t("tasks.relativeMinutes", { count: toCount(minuteMs) });
  } else if (diffMs < dayMs) {
    valueLabel = t("tasks.relativeHours", { count: toCount(hourMs) });
  } else if (diffMs < weekMs) {
    valueLabel = t("tasks.relativeDays", { count: toCount(dayMs) });
  } else {
    valueLabel = t("tasks.relativeWeeks", { count: toCount(weekMs) });
  }

  return t("tasks.reminderLateBy", { value: valueLabel });
};

const interpolateTemplate = (template: string, values: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");

const hashStringToUint32 = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const getCurrentHourSeedKey = () => {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  const hour = `${now.getHours()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}-${hour}`;
};

const buildSkipMathChallenge = (seedSource: string): SkipMathChallenge => {
  const random = seededRandom(hashStringToUint32(seedSource));
  const pickInt = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;
  const operation = pickInt(0, 2);

  if (operation === 0) {
    const left = pickInt(18, 89);
    const right = pickInt(17, 76);
    return {
      expression: `${left} + ${right}`,
      answer: left + right
    };
  }

  if (operation === 1) {
    const right = pickInt(14, 68);
    const left = right + pickInt(25, 99);
    return {
      expression: `${left} - ${right}`,
      answer: left - right
    };
  }

  const left = pickInt(7, 16);
  const right = pickInt(6, 14);
  return {
    expression: `${left} × ${right}`,
    answer: left * right
  };
};

export const TasksPage = ({
  section = "overview",
  household,
  tasks,
  completions,
  householdEvents,
  members,
  memberPimpers,
  userId,
  busy,
  onAdd,
  onComplete,
  onSkip,
  onTakeover,
  onToggleActive,
  onUpdate,
  onDelete,
  onRateTaskCompletion,
  onResetHouseholdPimpers,
  onUpdateMemberTaskLaziness
}: TasksPageProps) => {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;

  const [rotationUserIds, setRotationUserIds] = useState<string[]>([userId]);
  const [editRotationUserIds, setEditRotationUserIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [taskBeingEdited, setTaskBeingEdited] = useState<TaskItem | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [taskPendingDelete, setTaskPendingDelete] = useState<TaskItem | null>(null);
  const [taskPendingToggleActive, setTaskPendingToggleActive] = useState<TaskItem | null>(null);
  const [pendingTaskAction, setPendingTaskAction] = useState<PendingTaskAction | null>(null);
  const [taskImageUploadError, setTaskImageUploadError] = useState<string | null>(null);
  const [editTaskImageUploadError, setEditTaskImageUploadError] = useState<string | null>(null);
  const [taskDetailsOpen, setTaskDetailsOpen] = useState(false);
  const [taskDetailsTask, setTaskDetailsTask] = useState<TaskItem | null>(null);
  const [frequencyMode, setFrequencyMode] = useState<"days" | "cron">("days");
  const [editFrequencyMode, setEditFrequencyMode] = useState<"days" | "cron">("days");
  const [complexFrequency, setComplexFrequency] = useState<ComplexFrequency>(() => createDefaultComplexFrequency());
  const [editComplexFrequency, setEditComplexFrequency] = useState<ComplexFrequency>(() => createDefaultComplexFrequency());
  const [isResetPimpersDialogOpen, setIsResetPimpersDialogOpen] = useState(false);
  const [statsForecastTaskId, setStatsForecastTaskId] = useState<string>("");
  const [statsTaskFilterId, setStatsTaskFilterId] = useState<string>("all");
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => startOfMonth(new Date()));
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [openCalendarTooltipDay, setOpenCalendarTooltipDay] = useState<string | null>(null);
  const [skipChallengeAnswerInput, setSkipChallengeAnswerInput] = useState("");
  const [skipCaptchaQueue, setSkipCaptchaQueue] = useState<CaptchaType[]>([]);
  const [skipCaptchaIndex, setSkipCaptchaIndex] = useState(0);
  const [skipCaptchaValid, setSkipCaptchaValid] = useState(false);
  const [skipCaptchaAutoConfirm, setSkipCaptchaAutoConfirm] = useState(false);
  const [skipCaptchaUiState, setSkipCaptchaUiState] = useState<"ready" | "loading" | "error">("ready");
  const [skipCaptchaError, setSkipCaptchaError] = useState<string | null>(null);
  const [lazinessInputs, setLazinessInputs] = useState<Record<string, string>>({});
  const [skipCaptchaKey, setSkipCaptchaKey] = useState(0);
  const [isSkipFinalDialogOpen, setIsSkipFinalDialogOpen] = useState(false);
  const [skipFinalConfirmPresses, setSkipFinalConfirmPresses] = useState(0);
  const skipCaptchaTimerRef = useRef<number | null>(null);
  const addCurrentStateUploadInputRef = useRef<HTMLInputElement | null>(null);
  const addTargetStateUploadInputRef = useRef<HTMLInputElement | null>(null);
  const editCurrentStateUploadInputRef = useRef<HTMLInputElement | null>(null);
  const editTargetStateUploadInputRef = useRef<HTMLInputElement | null>(null);
  const addCurrentStateCameraInputRef = useRef<HTMLInputElement | null>(null);
  const addTargetStateCameraInputRef = useRef<HTMLInputElement | null>(null);
  const editCurrentStateCameraInputRef = useRef<HTMLInputElement | null>(null);
  const editTargetStateCameraInputRef = useRef<HTMLInputElement | null>(null);
  const shuffleMembers = useCallback((ids: string[]) => {
    const next = [...ids];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }, []);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 }
    })
  );

  const taskForm = useForm({
    defaultValues: createDefaultTaskFormValues(),
    onSubmit: async ({
      value,
      formApi
    }: {
      value: TaskFormValues;
      formApi: { reset: () => void };
    }) => {
      const trimmedTitle = value.title.trim();
      if (!trimmedTitle) return;

      if (!value.startDate) {
        setFormError(t("tasks.noStartDate"));
        return;
      }

      if (rotationUserIds.length === 0) {
        setFormError(t("tasks.noAssigneesError"));
        return;
      }

      const parsedFrequencyDays = Number(value.frequencyDays);
      const parsedEffort = Number(value.effortPimpers);
      const parsedGraceDays = Number(value.graceDays);
      const parsedPenaltyPerDay = Number(value.delayPenaltyPerDay);
      const graceMinutes = Number.isFinite(parsedGraceDays)
        ? Math.max(0, Math.round(parsedGraceDays * 24 * 60))
        : 1440;
      const effectiveFrequencyDays =
        frequencyMode === "cron"
          ? deriveFrequencyDaysFromComplex(complexFrequency)
          : Number.isFinite(parsedFrequencyDays)
            ? Math.max(1, Math.floor(parsedFrequencyDays))
            : 7;
      const cronPattern =
        frequencyMode === "cron"
          ? buildCronPatternFromComplex(complexFrequency)
          : `0 9 */${Math.max(1, Math.floor(effectiveFrequencyDays))} * *`;

      const input: NewTaskInput = {
        title: trimmedTitle,
        description: value.description.trim(),
        currentStateImageUrl: value.currentStateImageUrl.trim() || null,
        targetStateImageUrl: value.targetStateImageUrl.trim() || null,
        startDate: value.startDate,
        frequencyDays: effectiveFrequencyDays,
        cronPattern,
        effortPimpers: Number.isFinite(parsedEffort) ? Math.max(1, Math.floor(parsedEffort)) : 1,
        delayPenaltyPerDay: Number.isFinite(parsedPenaltyPerDay) ? Math.max(0, parsedPenaltyPerDay) : 0.25,
        graceMinutes,
        prioritizeLowPimpers: value.prioritizeLowPimpers,
        assigneeFairnessMode: value.assigneeFairnessMode,
        rotationUserIds
      };

      setFormError(null);
      setTaskImageUploadError(null);
      await onAdd(input);
      formApi.reset();
      setFrequencyMode("days");
      setComplexFrequency(createDefaultComplexFrequency());
      setIsCreateDialogOpen(false);
    }
  });

  const editTaskForm = useForm({
    defaultValues: createDefaultTaskFormValues(),
    onSubmit: async ({
      value
    }: {
      value: TaskFormValues;
    }) => {
      if (!taskBeingEdited) return;

      const trimmedTitle = value.title.trim();
      if (!trimmedTitle) return;

      if (!value.startDate) {
        setEditFormError(t("tasks.noStartDate"));
        return;
      }

      if (editRotationUserIds.length === 0) {
        setEditFormError(t("tasks.noAssigneesError"));
        return;
      }

      const parsedFrequencyDays = Number(value.frequencyDays);
      const parsedEffort = Number(value.effortPimpers);
      const parsedGraceDays = Number(value.graceDays);
      const parsedPenaltyPerDay = Number(value.delayPenaltyPerDay);
      const graceMinutes = Number.isFinite(parsedGraceDays)
        ? Math.max(0, Math.round(parsedGraceDays * 24 * 60))
        : 1440;
      const effectiveFrequencyDays =
        editFrequencyMode === "cron"
          ? deriveFrequencyDaysFromComplex(editComplexFrequency)
          : Number.isFinite(parsedFrequencyDays)
            ? Math.max(1, Math.floor(parsedFrequencyDays))
            : 7;
      const cronPattern =
        editFrequencyMode === "cron"
          ? buildCronPatternFromComplex(editComplexFrequency)
          : `0 9 */${Math.max(1, Math.floor(effectiveFrequencyDays))} * *`;

      const input: NewTaskInput = {
        title: trimmedTitle,
        description: value.description.trim(),
        currentStateImageUrl: value.currentStateImageUrl.trim() || null,
        targetStateImageUrl: value.targetStateImageUrl.trim() || null,
        startDate: value.startDate,
        frequencyDays: effectiveFrequencyDays,
        cronPattern,
        effortPimpers: Number.isFinite(parsedEffort) ? Math.max(1, Math.floor(parsedEffort)) : 1,
        delayPenaltyPerDay: Number.isFinite(parsedPenaltyPerDay) ? Math.max(0, parsedPenaltyPerDay) : 0.25,
        graceMinutes,
        prioritizeLowPimpers: value.prioritizeLowPimpers,
        assigneeFairnessMode: value.assigneeFairnessMode,
        rotationUserIds: editRotationUserIds
      };

      setEditFormError(null);
      setEditTaskImageUploadError(null);
      await onUpdate(taskBeingEdited, input);
      setTaskBeingEdited(null);
      setIsEditDialogOpen(false);
    }
  });

  useEffect(() => {
    const validUserIds = new Set(members.map((entry) => entry.user_id));

    setRotationUserIds((current) => {
      const filtered = current.filter((entry) => validUserIds.has(entry));
      if (filtered.length > 0) return filtered;
      return shuffleMembers(members.map((entry) => entry.user_id));
    });
  }, [members, shuffleMembers, userId]);

  useEffect(() => {
    if (!isCreateDialogOpen) return;
    const allMemberIds = members.map((entry) => entry.user_id);
    if (allMemberIds.length === 0) return;
    setRotationUserIds(shuffleMembers(allMemberIds));
  }, [isCreateDialogOpen, members, shuffleMembers]);

  useEffect(() => {
    if (!taskBeingEdited) return;
    const validUserIds = new Set(members.map((entry) => entry.user_id));
    setEditRotationUserIds((current) => {
      const filtered = current.filter((entry) => validUserIds.has(entry));
      if (filtered.length > 0) return filtered;
      if (taskBeingEdited.assignee_id && validUserIds.has(taskBeingEdited.assignee_id)) {
        return [taskBeingEdited.assignee_id];
      }
      if (validUserIds.has(userId)) return [userId];
      const firstMember = members[0]?.user_id;
      return firstMember ? [firstMember] : [];
    });
  }, [members, taskBeingEdited, userId]);

  const pimperByUserId = useMemo(() => {
    const map = new Map<string, number>();
    memberPimpers.forEach((entry) => map.set(entry.user_id, Number(entry.total_pimpers)));
    return map;
  }, [memberPimpers]);
  const averageDelayByUserId = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();
    completions.forEach((entry) => {
      const current = totals.get(entry.user_id) ?? { total: 0, count: 0 };
      totals.set(entry.user_id, {
        total: current.total + Math.max(0, entry.delay_minutes ?? 0),
        count: current.count + 1
      });
    });
    const map = new Map<string, number>();
    totals.forEach((stats, memberId) => {
      map.set(memberId, stats.count > 0 ? stats.total / stats.count : 0);
    });
    return map;
  }, [completions]);
  const lastMonthRange = useMemo(() => getLastMonthRange(), []);
  const memberOfMonth = useMemo(
    () => getMemberOfMonth(completions, lastMonthRange),
    [completions, lastMonthRange]
  );
  const memberOfMonthLabel = useMemo(
    () => new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(lastMonthRange.start),
    [language, lastMonthRange]
  );
  const memberById = useMemo(() => {
    const map = new Map<string, HouseholdMember>();
    members.forEach((member) => map.set(member.user_id, member));
    return map;
  }, [members]);
  const onTimeStreaks = useMemo(() => {
    const actionByUser = new Map<string, Array<{ at: number; type: "completion" | "skipped"; delay: number; id: string }>>();
    completions.forEach((entry) => {
      const current = actionByUser.get(entry.user_id) ?? [];
      current.push({
        at: new Date(entry.completed_at).getTime(),
        type: "completion",
        delay: Math.max(0, entry.delay_minutes ?? 0),
        id: entry.id
      });
      actionByUser.set(entry.user_id, current);
    });
    householdEvents
      .filter((event) => event.event_type === "task_skipped")
      .forEach((event) => {
        if (!event.actor_user_id) return;
        const current = actionByUser.get(event.actor_user_id) ?? [];
        current.push({
          at: new Date(event.created_at).getTime(),
          type: "skipped",
          delay: 1,
          id: event.id
        });
        actionByUser.set(event.actor_user_id, current);
      });

    const rows = members.map((member) => {
      const actions = (actionByUser.get(member.user_id) ?? []).slice().sort((a, b) => {
        return b.at - a.at || a.id.localeCompare(b.id);
      });
      let streak = 0;
      for (const action of actions) {
        if (action.type !== "completion" || action.delay > 0) break;
        streak += 1;
      }
      return { userId: member.user_id, streak };
    });

    return rows.sort((a, b) => b.streak - a.streak || a.userId.localeCompare(b.userId));
  }, [completions, householdEvents, members]);

  const historyItems = useMemo<TaskHistoryItem[]>(() => {
    const completionItems: TaskHistoryItem[] = completions.map((entry) => ({
      type: "completion",
      entry
    }));
    const skippedItems: TaskHistoryItem[] = householdEvents
      .filter((event) => event.event_type === "task_skipped")
      .map((event) => ({
        type: "skipped",
        id: event.id,
        taskTitle: String(event.payload?.title ?? t("tasks.fallbackTitle")),
        userId: event.actor_user_id,
        createdAt: event.created_at
      }));

    return [...completionItems, ...skippedItems].sort((a, b) => {
      const left =
        a.type === "completion"
          ? new Date(a.entry.completed_at).getTime()
          : new Date(a.createdAt).getTime();
      const right =
        b.type === "completion"
          ? new Date(b.entry.completed_at).getTime()
          : new Date(b.createdAt).getTime();
      return right - left;
    });
  }, [completions, householdEvents, t]);
  const reminderTemplates = useMemo(() => {
    const titlesRaw = t("tasks.reminderTitles", { returnObjects: true }) as unknown;
    const bodiesRaw = t("tasks.reminderBodies", { returnObjects: true }) as unknown;
    return {
      titles: Array.isArray(titlesRaw) ? titlesRaw : [],
      bodies: Array.isArray(bodiesRaw) ? bodiesRaw : []
    };
  }, [t]);
  const resolveMemberColor = useMemo(
    () => (memberId: string) => normalizeUserColor(memberById.get(memberId)?.user_color) ?? fallbackColorFromUserId(memberId),
    [memberById]
  );
  const skipMathChallenge = useMemo(() => {
    if (pendingTaskAction?.kind !== "skip") return null;
    const userNameSeed = memberById.get(userId)?.display_name?.trim() || userId;
    return buildSkipMathChallenge(`${getCurrentHourSeedKey()}::${userNameSeed.toLowerCase()}`);
  }, [memberById, pendingTaskAction?.kind, userId]);
  const isSkipMathChallengeSolved = useMemo(() => {
    if (!skipMathChallenge) return true;
    const parsed = Number(skipChallengeAnswerInput.trim());
    return Number.isFinite(parsed) && parsed === skipMathChallenge.answer;
  }, [skipChallengeAnswerInput, skipMathChallenge]);
  const skipCaptchaTypes = useMemo<CaptchaType[]>(
    () => ["numbers", "letters", "mixed", "slider", "math", "pattern"],
    []
  );
  const skipCaptchaCurrent =
    pendingTaskAction?.kind === "skip" ? skipCaptchaQueue[skipCaptchaIndex] : undefined;
  const isSkipCaptchaComplete =
    pendingTaskAction?.kind === "skip" &&
    skipCaptchaQueue.length > 0 &&
    skipCaptchaIndex >= skipCaptchaQueue.length;
  const resetSkipCaptchaState = useCallback(() => {
    setSkipCaptchaQueue([]);
    setSkipCaptchaIndex(0);
    setSkipCaptchaValid(false);
    setSkipCaptchaAutoConfirm(false);
    setSkipCaptchaUiState("ready");
    setSkipCaptchaError(null);
    setSkipCaptchaKey(0);
    setIsSkipFinalDialogOpen(false);
    setSkipFinalConfirmPresses(0);
    if (skipCaptchaTimerRef.current !== null) {
      window.clearTimeout(skipCaptchaTimerRef.current);
      skipCaptchaTimerRef.current = null;
    }
  }, []);
  const retrySkipCaptcha = useCallback(() => {
    setSkipCaptchaUiState("ready");
    setSkipCaptchaError(null);
    setSkipCaptchaValid(false);
    setSkipCaptchaKey((value) => value + 1);
    if (skipCaptchaTimerRef.current !== null) {
      window.clearTimeout(skipCaptchaTimerRef.current);
      skipCaptchaTimerRef.current = null;
    }
  }, []);
  const sendTaskReminder = useCallback(
    async (task: TaskItem, assigneeName: string) => {
      if (!task.assignee_id) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        toast.error(t("tasks.reminderError"));
        return;
      }
      const late = reminderLateLabel(task.due_at, task.grace_minutes, t);
      const taskTitle = task.title || t("tasks.confirmCompleteTitle");
      const fallbackTitle = `Erinnerung: ${taskTitle}`;
      const fallbackBody = `${late}. ${taskTitle}`;
      const pick = (list: string[], fallback: string) =>
        list.length > 0 ? list[Math.floor(Math.random() * list.length)] : fallback;
      const values = { title: taskTitle, late, member: assigneeName };
      const rawTitle = pick(reminderTemplates.titles, fallbackTitle);
      const rawBody = pick(reminderTemplates.bodies, fallbackBody);
      const title = interpolateTemplate(rawTitle, values);
      const body = interpolateTemplate(rawBody, values);

      const { error } = await supabase.functions.invoke("send-task-reminder", {
        body: { taskId: task.id, title, body, accessToken },
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (error) {
        toast.error(t("tasks.reminderError"));
        return;
      }
      toast.success(t("tasks.reminderSent", { member: assigneeName }));
    },
    [reminderTemplates.bodies, reminderTemplates.titles, t]
  );
  const onConfirmTaskAction = useCallback(async () => {
    if (!pendingTaskAction) return;
    if (
      pendingTaskAction.kind === "skip" &&
      (!isSkipMathChallengeSolved || !isSkipCaptchaComplete)
    ) {
      return;
    }

    const { kind, task } = pendingTaskAction;
    if (kind === "skip") {
      await onSkip(task);
    } else if (kind === "takeover") {
      await onTakeover(task);
    } else {
      await onComplete(task);
    }

    setPendingTaskAction(null);
  }, [
    isSkipCaptchaComplete,
    isSkipMathChallengeSolved,
    onComplete,
    onSkip,
    onTakeover,
    pendingTaskAction
  ]);

  useEffect(() => {
    if (pendingTaskAction?.kind !== "skip") {
      resetSkipCaptchaState();
      setSkipCaptchaAutoConfirm(false);
      return;
    }

    const count = 3 + Math.floor(Math.random() * 3);
    const queue = Array.from({ length: count }, () => {
      const pick = skipCaptchaTypes[Math.floor(Math.random() * skipCaptchaTypes.length)];
      return pick;
    });
    setSkipCaptchaQueue(queue);
    setSkipCaptchaIndex(0);
    setSkipCaptchaValid(false);
    setSkipCaptchaAutoConfirm(false);
    setSkipCaptchaUiState("ready");
    setSkipCaptchaError(null);
  }, [pendingTaskAction?.kind, resetSkipCaptchaState, skipCaptchaTypes]);

  useEffect(() => {
    if (!skipCaptchaAutoConfirm) return;
    if (pendingTaskAction?.kind !== "skip") {
      setSkipCaptchaAutoConfirm(false);
      return;
    }
    if (!isSkipCaptchaComplete || !isSkipMathChallengeSolved) return;
    setSkipCaptchaAutoConfirm(false);
    setIsSkipFinalDialogOpen(true);
    setSkipFinalConfirmPresses(0);
  }, [isSkipCaptchaComplete, isSkipMathChallengeSolved, pendingTaskAction?.kind, skipCaptchaAutoConfirm]);

  useEffect(() => {
    if (statsTaskFilterId === "all") return;
    if (tasks.some((task) => task.id === statsTaskFilterId)) return;
    setStatsTaskFilterId("all");
  }, [statsTaskFilterId, tasks]);

  const statsFilteredTaskIds = useMemo(() => {
    if (statsTaskFilterId === "all") {
      return new Set(tasks.map((task) => task.id));
    }
    return new Set([statsTaskFilterId]);
  }, [statsTaskFilterId, tasks]);

  const statsFilteredTasks = useMemo(() => {
    if (statsTaskFilterId === "all") return tasks;
    return tasks.filter((task) => task.id === statsTaskFilterId);
  }, [statsTaskFilterId, tasks]);

  const statsFilteredCompletions = useMemo(
    () => completions.filter((entry) => statsFilteredTaskIds.has(entry.task_id)),
    [completions, statsFilteredTaskIds]
  );

  const isLazinessEnabled = household.task_laziness_enabled ?? false;
  const isOwner = useMemo(
    () => members.some((member) => member.user_id === userId && member.role === "owner"),
    [members, userId]
  );
  const getLazinessFactor = (member: HouseholdMember) => {
    if (!isLazinessEnabled) return 1;
    const value = member.task_laziness_factor ?? 1;
    if (!Number.isFinite(value)) return 1;
    return Math.min(2, Math.max(0, value));
  };
  const getScaledPimpers = (rawPimpers: number, lazinessFactor: number) => {
    if (!isLazinessEnabled) return rawPimpers;
    const safeFactor = lazinessFactor <= 0 ? 0.0001 : lazinessFactor;
    return rawPimpers / safeFactor;
  };
  useEffect(() => {
    if (!isLazinessEnabled) return;
    const next: Record<string, string> = {};
    members.forEach((member) => {
      next[member.user_id] = String(getLazinessFactor(member));
    });
    setLazinessInputs(next);
  }, [isLazinessEnabled, members]);
  const activeForecastTasks = useMemo(
    () => statsFilteredTasks.filter((task) => task.is_active && task.rotation_user_ids.length > 0),
    [statsFilteredTasks]
  );
  useEffect(() => {
    if (activeForecastTasks.length === 0) {
      setStatsForecastTaskId("");
      return;
    }
    if (activeForecastTasks.some((task) => task.id === statsForecastTaskId)) return;
    setStatsForecastTaskId(activeForecastTasks[0]?.id ?? "");
  }, [activeForecastTasks, statsForecastTaskId]);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setIsCoarsePointer(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    setOpenCalendarTooltipDay(null);
  }, [calendarMonthDate]);
  useEffect(() => {
    if (pendingTaskAction?.kind !== "skip") return;
    setSkipChallengeAnswerInput("");
  }, [pendingTaskAction?.kind, pendingTaskAction?.task.id]);
  const projectionByTaskId = useMemo(() => {
    const lazinessByUserId = new Map<string, number>();
    members.forEach((member) => lazinessByUserId.set(member.user_id, getLazinessFactor(member)));

    const projectedByTask = new Map<
      string,
      Array<{
        user_id: string;
        current_pimpers: number;
        projected_until_turn: number;
        projected_total_scaled: number | null;
      }>
    >();

    activeForecastTasks.forEach((task) => {
      const rotation = task.rotation_user_ids.filter((userIdInRotation) =>
        members.some((member) => member.user_id === userIdInRotation)
      );
      if (rotation.length === 0) {
        projectedByTask.set(task.id, []);
        return;
      }

      const intervalDays = Math.max(1, task.frequency_days);
      const assigneeIndex = task.assignee_id ? rotation.indexOf(task.assignee_id) : -1;
      const currentIndex = assigneeIndex >= 0 ? assigneeIndex : 0;

      const rows = rotation.map((rotationUserId, index) => {
        const turnsUntilTurn = index >= currentIndex ? index - currentIndex : rotation.length - currentIndex + index;
        const horizonDays = turnsUntilTurn * intervalDays;
        const projectedUntilTurn = statsFilteredTasks.reduce((sum, otherTask) => {
          if (!otherTask.is_active || otherTask.id === task.id) return sum;
          if (!otherTask.rotation_user_ids.includes(rotationUserId) || otherTask.rotation_user_ids.length === 0) return sum;

          const otherIntervalDays = Math.max(1, otherTask.frequency_days);
          const expectedOccurrences = Math.max(0, Math.floor(horizonDays / otherIntervalDays));
          const share = 1 / otherTask.rotation_user_ids.length;
          return sum + expectedOccurrences * Math.max(1, otherTask.effort_pimpers) * share;
        }, 0);

        const currentPimpers = pimperByUserId.get(rotationUserId) ?? 0;
        const lazinessFactor = lazinessByUserId.get(rotationUserId) ?? 1;
        const projectedTotalScaled = getScaledPimpers(currentPimpers + projectedUntilTurn, lazinessFactor);

        return {
          user_id: rotationUserId,
          current_pimpers: currentPimpers,
          projected_until_turn: projectedUntilTurn,
          projected_total_scaled: projectedTotalScaled
        };
      });

      projectedByTask.set(task.id, rows);
    });

    return projectedByTask;
  }, [activeForecastTasks, isLazinessEnabled, members, pimperByUserId, statsFilteredTasks]);
  const selectedForecastTask = useMemo(
    () => activeForecastTasks.find((task) => task.id === statsForecastTaskId) ?? null,
    [activeForecastTasks, statsForecastTaskId]
  );
  const selectedForecastRows = useMemo(
    () => (selectedForecastTask ? projectionByTaskId.get(selectedForecastTask.id) ?? [] : []),
    [projectionByTaskId, selectedForecastTask]
  );
  const statsMemberRows = useMemo(() => {
    const filteredPimpersByUserId = new Map<string, number>();
    statsFilteredCompletions.forEach((entry) => {
      filteredPimpersByUserId.set(
        entry.user_id,
        (filteredPimpersByUserId.get(entry.user_id) ?? 0) + Math.max(0, entry.pimpers_earned)
      );
    });

    return members
      .map((entry) => {
        const totalPimpers = filteredPimpersByUserId.get(entry.user_id) ?? 0;
        const lazinessFactor = getLazinessFactor(entry);
        return {
          ...entry,
          total_pimpers: totalPimpers,
          task_laziness_factor: lazinessFactor,
          scaled_pimpers: getScaledPimpers(totalPimpers, lazinessFactor)
        };
      })
      .filter((entry) => entry.scaled_pimpers !== null);
  }, [isLazinessEnabled, members, statsFilteredCompletions]);

  const taskDetailsCompletions = useMemo(() => {
    if (!taskDetailsTask) return [];
    return completions
      .filter((entry) => entry.task_id === taskDetailsTask.id)
      .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  }, [completions, taskDetailsTask]);
  const taskDetailsStats = useMemo(() => {
    if (!taskDetailsTask) return null;
    const total = taskDetailsCompletions.length;
    if (total === 0) {
      return {
        total,
        avgDelayMinutes: 0,
        onTimeRate: 0,
        ratingCount: 0,
        ratingAverage: null as number | null
      };
    }
    let delaySum = 0;
    let onTimeCount = 0;
    let ratingCount = 0;
    let ratingSum = 0;
    taskDetailsCompletions.forEach((entry) => {
      const delay = Math.max(0, entry.delay_minutes ?? 0);
      delaySum += delay;
      if (delay <= 0) onTimeCount += 1;
      if (entry.rating_count && entry.rating_average != null) {
        ratingCount += entry.rating_count;
        ratingSum += entry.rating_average * entry.rating_count;
      }
    });
    return {
      total,
      avgDelayMinutes: delaySum / total,
      onTimeRate: onTimeCount / total,
      ratingCount,
      ratingAverage: ratingCount > 0 ? ratingSum / ratingCount : null
    };
  }, [taskDetailsCompletions, taskDetailsTask]);
  const taskDetailsUserStats = useMemo(() => {
    if (!taskDetailsTask) return [];
    const byUser = new Map<
      string,
      {
        userId: string;
        totalPimpers: number;
        totalCompletions: number;
        onTimeCount: number;
        delaySum: number;
      }
    >();
    taskDetailsCompletions.forEach((entry) => {
      const current =
        byUser.get(entry.user_id) ??
        {
          userId: entry.user_id,
          totalPimpers: 0,
          totalCompletions: 0,
          onTimeCount: 0,
          delaySum: 0
        };
      const delay = Math.max(0, entry.delay_minutes ?? 0);
      current.totalCompletions += 1;
      current.totalPimpers += Math.max(0, entry.pimpers_earned ?? 0);
      current.delaySum += delay;
      if (delay <= 0) current.onTimeCount += 1;
      byUser.set(entry.user_id, current);
    });
    return [...byUser.values()].map((entry) => ({
      ...entry,
      onTimeRate: entry.totalCompletions > 0 ? entry.onTimeCount / entry.totalCompletions : 0,
      avgDelayMinutes: entry.totalCompletions > 0 ? entry.delaySum / entry.totalCompletions : 0
    }));
  }, [taskDetailsCompletions, taskDetailsTask]);
  const taskDetailsKing = useMemo(() => {
    if (taskDetailsUserStats.length === 0) return null;
    return [...taskDetailsUserStats].sort((a, b) => {
      if (b.totalPimpers !== a.totalPimpers) return b.totalPimpers - a.totalPimpers;
      return a.avgDelayMinutes - b.avgDelayMinutes;
    })[0];
  }, [taskDetailsUserStats]);
  const taskDetailsLoop = useMemo(() => {
    if (!taskDetailsTask) return [];
    const rotation = taskDetailsTask.rotation_user_ids ?? [];
    if (rotation.length === 0) return [];
    const intervalDays = Math.max(1, taskDetailsTask.frequency_days);
    const startIndex = taskDetailsTask.assignee_id
      ? rotation.indexOf(taskDetailsTask.assignee_id)
      : 0;
    const baseDue = new Date(taskDetailsTask.due_at);
    const base = Number.isNaN(baseDue.getTime()) ? new Date() : baseDue;
    return rotation.map((_, offset) => {
      const index = startIndex >= 0 ? (startIndex + offset) % rotation.length : offset % rotation.length;
      const memberId = rotation[index];
      const date = new Date(base.getTime() + offset * intervalDays * 24 * 60 * 60 * 1000);
      return { memberId, date };
    });
  }, [taskDetailsTask]);
  const sortedMemberRows = useMemo(
    () =>
      [...statsMemberRows].sort(
        (a, b) => (a.scaled_pimpers ?? 0) - (b.scaled_pimpers ?? 0) || a.user_id.localeCompare(b.user_id)
      ),
    [statsMemberRows]
  );
  const onConfirmResetHouseholdPimpers = async () => {
    await onResetHouseholdPimpers();
    setIsResetPimpersDialogOpen(false);
  };
  const formatScaledPimpers = (value: number | null | undefined) =>
    value === null || value === undefined ? "-" : Number(value.toFixed(2)).toString();
  const getLazinessLevelLabel = (value: number) => {
    const normalized = Math.min(2, Math.max(0, value));
    const levelIndex = Math.round((normalized / 2) * 8) + 1;
    return t(`tasks.lazinessLevel${levelIndex}`);
  };
  const commitLazinessInput = async (member: HouseholdMember, rawValue: string) => {
    if (!isLazinessEnabled || !isOwner) return;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      setLazinessInputs((prev) => ({
        ...prev,
        [member.user_id]: String(getLazinessFactor(member))
      }));
      return;
    }
    const clamped = Math.min(2, Math.max(0, parsed));
    setLazinessInputs((prev) => ({
      ...prev,
      [member.user_id]: String(clamped)
    }));
    if (clamped !== getLazinessFactor(member)) {
      await onUpdateMemberTaskLaziness(member.user_id, clamped);
    }
  };
  const podiumRows = useMemo(
    () =>
      [...sortedMemberRows]
        .sort((a, b) => (b.scaled_pimpers ?? 0) - (a.scaled_pimpers ?? 0) || a.user_id.localeCompare(b.user_id))
        .slice(0, 3),
    [sortedMemberRows]
  );

  const showOverview = section === "overview";
  const showStats = section === "stats";
  const showHistory = section === "history";
  const showSettings = section === "settings";
  const taskTitleQuery = taskForm.state.values.title.trim();
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

  const allTaskSuggestions = useTaskSuggestions(tasks, completions, language);
  const existingTaskTitleSet = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((task) => {
      const normalized = task.title.trim().toLocaleLowerCase(language);
      if (normalized) set.add(normalized);
    });
    return set;
  }, [language, tasks]);
  const availableTaskSuggestions = useMemo(
    () =>
      allTaskSuggestions.filter(
        (entry) => !existingTaskTitleSet.has(entry.title.trim().toLocaleLowerCase(language))
      ),
    [allTaskSuggestions, existingTaskTitleSet, language]
  );

  const applyTaskSuggestion = (suggestion: TaskSuggestion) => {
    taskForm.setFieldValue("title", suggestion.title);
    if (!taskForm.state.values.description.trim() && suggestion.description) {
      taskForm.setFieldValue("description", suggestion.description);
    }
    taskForm.setFieldValue("frequencyDays", String(suggestion.frequencyDays));
    taskForm.setFieldValue("effortPimpers", String(suggestion.effortPimpers));
  };

  const handleTaskImageFileSelect = async (
    file: File,
    setError: (message: string | null) => void
  ) => {
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setError(null);
      return dataUrl;
    } catch {
      setError(t("tasks.stateImageUploadError"));
      return null;
    }
  };

  const renderTaskStateImageField = (
    form: typeof taskForm | typeof editTaskForm,
    options: {
      fieldName: "currentStateImageUrl" | "targetStateImageUrl";
      label: string;
      previewAlt: string;
      uploadInputRef: RefObject<HTMLInputElement | null>;
      cameraInputRef: RefObject<HTMLInputElement | null>;
      setError: (message: string | null) => void;
    }
  ) => (
    <form.Field
      name={options.fieldName}
      children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
        <div className="space-y-2">
          <Label>{options.label}</Label>
          <input
            ref={options.uploadInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void handleTaskImageFileSelect(file, options.setError).then((dataUrl) => {
                if (dataUrl) field.handleChange(dataUrl);
              });
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={options.cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void handleTaskImageFileSelect(file, options.setError).then((dataUrl) => {
                if (dataUrl) field.handleChange(dataUrl);
              });
              event.currentTarget.value = "";
            }}
          />
          <div className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
              role="button"
              tabIndex={0}
              className="relative inline-flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border border-brand-200 bg-slate-100 text-slate-600 transition hover:border-brand-300 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900"
              onClick={() => options.uploadInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  options.uploadInputRef.current?.click();
                }
              }}
              aria-label={options.label}
            >
              {field.state.value.trim().length > 0 ? (
                <span
                  aria-label={options.previewAlt}
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${field.state.value})` }}
                />
              ) : null}
              <span className="absolute inset-0 bg-gradient-to-r from-slate-900/25 via-slate-900/5 to-slate-900/30 dark:from-slate-950/80 dark:via-slate-950/40 dark:to-slate-950/80" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 dark:bg-slate-900/90 dark:text-slate-200"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      options.cameraInputRef.current?.click();
                    }}
                    aria-label={t("tasks.stateImageCameraButton")}
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("tasks.stateImageCameraButton")}</TooltipContent>
              </Tooltip>
            </div>
              </TooltipTrigger>
              <TooltipContent>{options.label}</TooltipContent>
            </Tooltip>
            {field.state.value.trim().length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="danger"
                className="absolute -right-1 -top-1 h-6 w-6 rounded-full p-0"
                onClick={() => field.handleChange("")}
                aria-label={t("tasks.stateImageRemoveButton")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      )}
    />
  );
  const {
    suggestions: taskSuggestions,
    focused: titleFocused,
    activeSuggestionIndex,
    onFocus: onTitleFocus,
    onBlur: onTitleBlur,
    onKeyDown: onTitleKeyDown,
    applySuggestion: onSelectTaskSuggestion
  } = useSmartSuggestions<TaskSuggestion>({
    items: availableTaskSuggestions,
    query: taskTitleQuery,
    getLabel: (entry) => entry.title,
    onApply: applyTaskSuggestion,
    fuseOptions: {
      keys: [
        { name: "title", weight: 0.8 },
        { name: "description", weight: 0.15 },
        { name: "tags", weight: 0.05 }
      ],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 2
    }
  });

  const completionSeries = useMemo(() => {
    const byDayByUser = new Map<string, Map<string, number>>();
    completions.forEach((entry) => {
      const day = entry.completed_at.slice(0, 10);
      const byUser = byDayByUser.get(day) ?? new Map<string, number>();
      byUser.set(entry.user_id, (byUser.get(entry.user_id) ?? 0) + 1);
      byDayByUser.set(day, byUser);
    });

    const dayKeys = [...byDayByUser.keys()].sort();
    const userIds = [...new Set(completions.map((entry) => entry.user_id))]
      .sort((left, right) => userLabel(left).localeCompare(userLabel(right), language));

    const datasets = userIds.map((memberId) => ({
      label: userLabel(memberId),
      data: dayKeys.map((day) => byDayByUser.get(day)?.get(memberId) ?? 0),
      backgroundColor: resolveMemberColor(memberId),
      borderColor: "transparent",
      borderWidth: 0
    }));

    return {
      labels: dayKeys.map((day) => formatShortDay(day, language, day)),
      datasets
    };
  }, [completions, language, resolveMemberColor, userLabel]);
  const actualFrequencyDaysByTaskId = useMemo(() => {
    const byTask = new Map<string, number[]>();
    completions.forEach((entry) => {
      const completedAt = new Date(entry.completed_at).getTime();
      if (Number.isNaN(completedAt)) return;
      const list = byTask.get(entry.task_id) ?? [];
      list.push(completedAt);
      byTask.set(entry.task_id, list);
    });

    const averages = new Map<string, number | null>();
    byTask.forEach((timestamps, taskId) => {
      if (timestamps.length < 2) {
        averages.set(taskId, null);
        return;
      }
      timestamps.sort((a, b) => a - b);
      let totalDiffMs = 0;
      for (let i = 1; i < timestamps.length; i += 1) {
        totalDiffMs += timestamps[i] - timestamps[i - 1];
      }
      const avgMs = totalDiffMs / (timestamps.length - 1);
      const avgDays = avgMs / (24 * 60 * 60 * 1000);
      averages.set(taskId, avgDays);
    });

    return averages;
  }, [completions]);
  const backlogAndDelayStats = useMemo(() => {
    const nowMs = Date.now();
    const dueTasks = statsFilteredTasks.filter(
      (task) => task.is_active && !task.done && !Number.isNaN(new Date(task.due_at).getTime())
    );
    const overdueTasks = dueTasks.filter((task) => new Date(task.due_at).getTime() <= nowMs);

    const completionRows = statsFilteredCompletions.filter((entry) => Number.isFinite(entry.delay_minutes));
    const overallDelayMinutes =
      completionRows.length > 0
        ? completionRows.reduce((sum, entry) => sum + Math.max(0, entry.delay_minutes), 0) / completionRows.length
        : 0;

    const byUser = new Map<string, { totalDelay: number; count: number }>();
    const byTask = new Map<string, { totalDelay: number; count: number }>();
    completionRows.forEach((entry) => {
      const current = byUser.get(entry.user_id) ?? { totalDelay: 0, count: 0 };
      byUser.set(entry.user_id, {
        totalDelay: current.totalDelay + Math.max(0, entry.delay_minutes),
        count: current.count + 1
      });
      const taskStats = byTask.get(entry.task_id) ?? { totalDelay: 0, count: 0 };
      byTask.set(entry.task_id, {
        totalDelay: taskStats.totalDelay + Math.max(0, entry.delay_minutes),
        count: taskStats.count + 1
      });
    });

    const memberRows = members
      .map((member) => {
        const stats = byUser.get(member.user_id) ?? { totalDelay: 0, count: 0 };
        return {
          userId: member.user_id,
          count: stats.count,
          averageDelayMinutes: stats.count > 0 ? stats.totalDelay / stats.count : 0
        };
      })
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.averageDelayMinutes - a.averageDelayMinutes);

    const taskLabelById = new Map<string, string>();
    statsFilteredTasks.forEach((task) => {
      taskLabelById.set(task.id, task.title?.trim() || t("tasks.fallbackTitle"));
    });
    statsFilteredCompletions.forEach((entry) => {
      if (taskLabelById.has(entry.task_id)) return;
      taskLabelById.set(entry.task_id, entry.task_title_snapshot?.trim() || t("tasks.fallbackTitle"));
    });
    const taskRows = [...byTask.entries()]
      .map(([taskId, stats]) => ({
        taskId,
        title: taskLabelById.get(taskId) ?? t("tasks.fallbackTitle"),
        count: stats.count,
        averageDelayMinutes: stats.count > 0 ? stats.totalDelay / stats.count : 0
      }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.averageDelayMinutes - a.averageDelayMinutes);

    return {
      dueTasksCount: dueTasks.length,
      overdueTasksCount: overdueTasks.length,
      overallDelayMinutes,
      memberRows,
      taskRows
    };
  }, [members, statsFilteredCompletions, statsFilteredTasks, t]);
  const formatDelayLabel = (minutes: number) => {
    if (minutes < 60) return t("tasks.delayMinutesValue", { count: Math.round(minutes) });
    if (minutes < 24 * 60) return t("tasks.delayHoursValue", { count: Number((minutes / 60).toFixed(1)) });
    return t("tasks.delayDaysValue", { count: Number((minutes / (24 * 60)).toFixed(1)) });
  };
  const reliabilityRows = useMemo(() => {
    const rows = [...backlogAndDelayStats.memberRows].sort(
      (a, b) => a.averageDelayMinutes - b.averageDelayMinutes
    );
    const maxDelay = rows.reduce((max, row) => Math.max(max, row.averageDelayMinutes), 0);
    return rows.map((row, index) => ({
      ...row,
      rank: index + 1,
      score: maxDelay > 0 ? Math.round(100 * (1 - row.averageDelayMinutes / maxDelay)) : 100
    }));
  }, [backlogAndDelayStats.memberRows]);

  const visibleTasks = useMemo(() => {
    const active: TaskItem[] = [];
    const inactive: TaskItem[] = [];

    tasks.forEach((task) => {
      if (task.is_active) active.push(task);
      else inactive.push(task);
    });

    return [...active, ...inactive];
  }, [tasks]);

  const resetPimpersStatsCard = showStats && isOwner ? (
    <Card className="mt-6 border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/30">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-rose-800 dark:text-rose-100">
              {t("tasks.resetPimpers")}
            </CardTitle>
            <CardDescription className="text-rose-700/90 dark:text-rose-200/80">
              {t("tasks.resetPimpersConfirmDescription")}
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/40"
            disabled={busy}
            onClick={() => setIsResetPimpersDialogOpen(true)}
          >
            {t("tasks.resetPimpers")}
          </Button>
        </div>
      </CardHeader>
    </Card>
  ) : null;
  const lazinessSettingsCard = showSettings && isLazinessEnabled ? (
    <Card className="mb-4">
      <CardHeader className="gap-2">
        <CardTitle>{t("tasks.lazinessTitle")}</CardTitle>
        <CardDescription>{t("tasks.lazinessDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {members
          .slice()
          .sort((a, b) => userLabel(a.user_id).localeCompare(userLabel(b.user_id), language))
          .map((member) => {
            const inputValue = lazinessInputs[member.user_id] ?? String(getLazinessFactor(member));
            const labelValue = Number.isFinite(Number(inputValue)) ? Number(inputValue) : getLazinessFactor(member);

            return (
              <div
                key={`laziness-${member.user_id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-brand-100 bg-white/90 p-2 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-center gap-2">
                  <MemberAvatar
                    src={
                      member.avatar_url?.trim() ||
                      createDiceBearAvatarDataUri(userLabel(member.user_id), member.user_color)
                    }
                    alt={userLabel(member.user_id)}
                    isVacation={member.vacation_mode ?? false}
                    className="h-8 w-8 rounded-full border border-brand-200 dark:border-slate-700"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {userLabel(member.user_id)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {getLazinessLevelLabel(labelValue)}
                    </p>
                  </div>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  inputMode="decimal"
                  className="w-20 text-right"
                  value={inputValue}
                  disabled={busy || !isOwner}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setLazinessInputs((prev) => ({ ...prev, [member.user_id]: nextValue }));
                  }}
                  onBlur={(event) => {
                    void commitLazinessInput(member, event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                  aria-label={t("tasks.lazinessTitle")}
                />
              </div>
            );
          })}
      </CardContent>
    </Card>
  ) : null;

  const pimpersByUserSeries = useMemo(() => {
    const rows = [...sortedMemberRows].sort(
      (a, b) => (b.scaled_pimpers ?? 0) - (a.scaled_pimpers ?? 0) || a.user_id.localeCompare(b.user_id)
    );
    const userIds = rows.map((entry) => entry.user_id);

    const taskTitleById = new Map<string, string>();
    statsFilteredTasks.forEach((task) => {
      taskTitleById.set(task.id, task.title?.trim() || t("tasks.fallbackTitle"));
    });
    statsFilteredCompletions.forEach((entry) => {
      if (taskTitleById.has(entry.task_id)) return;
      taskTitleById.set(entry.task_id, entry.task_title_snapshot?.trim() || t("tasks.fallbackTitle"));
    });

    const taskIds = [...new Set(statsFilteredCompletions.map((entry) => entry.task_id))].sort((left, right) =>
      (taskTitleById.get(left) ?? t("tasks.fallbackTitle")).localeCompare(
        taskTitleById.get(right) ?? t("tasks.fallbackTitle"),
        language
      )
    );

    const pimpersByUserTaskKey = new Map<string, number>();
    statsFilteredCompletions.forEach((entry) => {
      const key = `${entry.user_id}::${entry.task_id}`;
      pimpersByUserTaskKey.set(key, (pimpersByUserTaskKey.get(key) ?? 0) + Math.max(0, entry.pimpers_earned));
    });

    return {
      userIds,
      labels: rows.map((entry) => userLabel(entry.user_id)),
      datasets: taskIds.map((taskId) => ({
        label: taskTitleById.get(taskId) ?? t("tasks.fallbackTitle"),
        data: userIds.map((memberId) => Number((pimpersByUserTaskKey.get(`${memberId}::${taskId}`) ?? 0).toFixed(2))),
        backgroundColor: fallbackColorFromUserId(`task:${taskId}`),
        borderColor: "transparent",
        borderWidth: 0
      }))
    };
  }, [language, sortedMemberRows, statsFilteredCompletions, statsFilteredTasks, t, userLabel]);

  const editRotationVariants = useMemo(() => {
    if (editRotationUserIds.length === 0) return null;

    const theoretical = [...editRotationUserIds];
    const orderIndex = new Map(theoretical.map((memberId, index) => [memberId, index]));
    const editedTaskId = taskBeingEdited?.id ?? "";
    const parsedFrequency = Number(editTaskForm.state.values.frequencyDays);
    const intervalDays = Number.isFinite(parsedFrequency) ? Math.max(1, Math.floor(parsedFrequency)) : Math.max(1, taskBeingEdited?.frequency_days ?? 7);
    const assigneeIndex = taskBeingEdited?.assignee_id ? theoretical.indexOf(taskBeingEdited.assignee_id) : -1;
    const currentIndex = assigneeIndex >= 0 ? assigneeIndex : 0;

    const projectedUntilTurnByUserId = new Map<string, number>();
    const expectedProjectedUntilTurnByUserId = new Map<string, number>();
    theoretical.forEach((rotationUserId, index) => {
      const turnsUntilTurn = index >= currentIndex ? index - currentIndex : theoretical.length - currentIndex + index;
      const horizonDays = turnsUntilTurn * intervalDays;
      const avgDelayMinutes = averageDelayByUserId.get(rotationUserId) ?? 0;
      const expectedHorizonDays = Math.max(0, horizonDays - avgDelayMinutes / (60 * 24));
      const projectedUntilTurn = tasks.reduce((sum, otherTask) => {
        if (!otherTask.is_active || otherTask.id === editedTaskId) return sum;
        if (!otherTask.rotation_user_ids.includes(rotationUserId) || otherTask.rotation_user_ids.length === 0) return sum;

        const otherIntervalDays = Math.max(1, otherTask.frequency_days);
        const expectedOccurrences = Math.max(0, Math.floor(horizonDays / otherIntervalDays));
        const share = 1 / otherTask.rotation_user_ids.length;
        return sum + expectedOccurrences * Math.max(1, otherTask.effort_pimpers) * share;
      }, 0);
      const expectedProjectedUntilTurn = tasks.reduce((sum, otherTask) => {
        if (!otherTask.is_active || otherTask.id === editedTaskId) return sum;
        if (!otherTask.rotation_user_ids.includes(rotationUserId) || otherTask.rotation_user_ids.length === 0) return sum;

        const otherIntervalDays = Math.max(1, otherTask.frequency_days);
        const expectedOccurrences = Math.max(0, Math.floor(expectedHorizonDays / otherIntervalDays));
        const share = 1 / otherTask.rotation_user_ids.length;
        return sum + expectedOccurrences * Math.max(1, otherTask.effort_pimpers) * share;
      }, 0);

      projectedUntilTurnByUserId.set(rotationUserId, projectedUntilTurn);
      expectedProjectedUntilTurnByUserId.set(rotationUserId, expectedProjectedUntilTurn);
    });

    const fairnessActual = [...theoretical].sort((left, right) => {
      const leftPimpers = pimperByUserId.get(left) ?? 0;
      const rightPimpers = pimperByUserId.get(right) ?? 0;
      const leftScore = leftPimpers;
      const rightScore = rightPimpers;
      if (leftScore !== rightScore) return leftScore - rightScore;
      return (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0);
    });

    const fairnessProjection = [...theoretical].sort((left, right) => {
      const leftPimpers = pimperByUserId.get(left) ?? 0;
      const rightPimpers = pimperByUserId.get(right) ?? 0;
      const leftProjected = projectedUntilTurnByUserId.get(left) ?? 0;
      const rightProjected = projectedUntilTurnByUserId.get(right) ?? 0;
      const leftScore = leftPimpers + leftProjected;
      const rightScore = rightPimpers + rightProjected;
      if (leftScore !== rightScore) return leftScore - rightScore;
      return (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0);
    });
    const fairnessExpected = [...theoretical].sort((left, right) => {
      const leftPimpers = pimperByUserId.get(left) ?? 0;
      const rightPimpers = pimperByUserId.get(right) ?? 0;
      const leftProjected = expectedProjectedUntilTurnByUserId.get(left) ?? 0;
      const rightProjected = expectedProjectedUntilTurnByUserId.get(right) ?? 0;
      const leftScore = leftPimpers + leftProjected;
      const rightScore = rightPimpers + rightProjected;
      if (leftScore !== rightScore) return leftScore - rightScore;
      return (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0);
    });

    return {
      theoretical,
      fairnessActual,
      fairnessProjection,
      fairnessExpected
    };
  }, [averageDelayByUserId, editRotationUserIds, editTaskForm.state.values.frequencyDays, pimperByUserId, taskBeingEdited, tasks]);
  const editRotationCandidates = useMemo(() => {
    const active = editRotationUserIds.filter((memberId) => !(memberById.get(memberId)?.vacation_mode ?? false));
    return active.length > 0 ? active : editRotationUserIds;
  }, [editRotationUserIds, memberById]);
  const editRotationForecast = useMemo(() => {
    if (!taskBeingEdited || editRotationCandidates.length === 0) {
      return null;
    }
    const currentAssignee = taskBeingEdited.assignee_id;
    const currentIndex = currentAssignee ? editRotationCandidates.indexOf(currentAssignee) : -1;
    const nextIndex =
      currentIndex >= 0
        ? (currentIndex + 1) % editRotationCandidates.length
        : 0;
    const nextAssigneeId = editRotationCandidates[nextIndex] ?? null;
    const yourIndex = editRotationCandidates.indexOf(userId);
    const turnsUntilYou =
      yourIndex < 0
        ? null
        : currentIndex >= 0
          ? yourIndex >= currentIndex
            ? yourIndex - currentIndex
            : editRotationCandidates.length - currentIndex + yourIndex
          : yourIndex;
    const intervalDays = Math.max(
      1,
      Math.floor(Number(editTaskForm.state.values.frequencyDays) || 1)
    );
    return { nextAssigneeId, turnsUntilYou, intervalDays };
  }, [editRotationCandidates, editTaskForm.state.values.frequencyDays, taskBeingEdited, userId]);
  const renderRotationAvatarStack = (memberIds: string[], maxCount = 8) => (
    <div className="flex items-center">
      {memberIds.slice(0, maxCount).map((memberId, index) => {
        const member = memberById.get(memberId);
        const displayName = userLabel(memberId);
        const avatarUrl = member?.avatar_url?.trim() ?? "";
        const avatarSrc =
          avatarUrl ||
          createDiceBearAvatarDataUri(
            member?.display_name?.trim() || displayName || memberId,
            member?.user_color
          );
        return (
          <MemberAvatar
            key={`rotation-avatar-${memberId}-${index}`}
            src={avatarSrc}
            alt={displayName}
            isVacation={member?.vacation_mode ?? false}
            className={`h-7 w-7 rounded-full border-2 border-white bg-brand-100 text-[11px] font-semibold text-brand-800 dark:border-slate-900 dark:bg-brand-900 dark:text-brand-100 ${
              index > 0 ? "-ml-2" : ""
            } ${member?.vacation_mode ? "opacity-50" : ""}`}
          />
        );
      })}
      {memberIds.length > maxCount ? (
        <div className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-semibold text-slate-700 dark:border-slate-900 dark:bg-slate-700 dark:text-slate-100">
          +{memberIds.length - maxCount}
        </div>
      ) : null}
    </div>
  );
  const adjustPreviewOrder = useCallback(
    (order: string[]) => {
      if (!taskBeingEdited?.assignee_id) return order;
      const totalCandidates = order.length;
      if (totalCandidates <= 1) return order;
      const activeCandidates = order.filter((memberId) => !(memberById.get(memberId)?.vacation_mode ?? false)).length;
      if (activeCandidates <= 1) return order;
      if (order[0] !== taskBeingEdited.assignee_id) return order;
      return [...order.slice(1), order[0]];
    },
    [memberById, taskBeingEdited?.assignee_id]
  );

  const onRotationDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setRotationUserIds((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  const onEditRotationDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setEditRotationUserIds((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  const onStartEditTask = (task: TaskItem) => {
    setTaskBeingEdited(task);
    setEditTaskImageUploadError(null);
    const parsedCron = parseComplexFromCron(task.cron_pattern);
    setEditFrequencyMode(parsedCron.mode);
    setEditComplexFrequency(parsedCron.config);
    editTaskForm.setFieldValue("title", task.title);
    editTaskForm.setFieldValue("description", task.description ?? "");
    editTaskForm.setFieldValue("currentStateImageUrl", task.current_state_image_url ?? "");
    editTaskForm.setFieldValue("targetStateImageUrl", task.target_state_image_url ?? "");
    editTaskForm.setFieldValue("startDate", task.start_date);
    editTaskForm.setFieldValue("frequencyDays", String(task.frequency_days));
    editTaskForm.setFieldValue("effortPimpers", String(task.effort_pimpers));
    editTaskForm.setFieldValue("delayPenaltyPerDay", String(task.delay_penalty_per_day ?? 0.25));
    editTaskForm.setFieldValue(
      "graceDays",
      String(Number(((task.grace_minutes ?? 1440) / 1440).toFixed(2)))
    );
    editTaskForm.setFieldValue("prioritizeLowPimpers", task.prioritize_low_pimpers);
    editTaskForm.setFieldValue("assigneeFairnessMode", task.assignee_fairness_mode);

    const nextRotation = task.rotation_user_ids.length > 0
      ? task.rotation_user_ids
      : task.assignee_id
        ? [task.assignee_id]
        : [];
    setEditRotationUserIds(nextRotation);
    setEditFormError(null);
    setIsEditDialogOpen(true);
  };

  const renderComplexFrequencyBuilder = (
    mode: "days" | "cron",
    config: ComplexFrequency,
    onConfigChange: (next: ComplexFrequency) => void
  ) => {
    if (mode !== "cron") return null;

    return (
      <div className="space-y-3 rounded-xl border border-brand-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={config.type === "weekly" ? "default" : "outline"}
            onClick={() => onConfigChange({ ...config, type: "weekly" })}
          >
            {t("tasks.frequencyWeekly")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={config.type === "monthly" ? "default" : "outline"}
            onClick={() => onConfigChange({ ...config, type: "monthly" })}
          >
            {t("tasks.frequencyMonthly")}
          </Button>
        </div>

        {config.type === "weekly" ? (
          <>
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("tasks.frequencyWeekdaysLabel")}
              </p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map((day) => {
                  const selected = config.weekdays.includes(day.value);
                  return (
                    <Button
                      key={`weekday-${day.value}`}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      onClick={() => {
                        const next = selected
                          ? config.weekdays.filter((value) => value !== day.value)
                          : [...config.weekdays, day.value];
                        onConfigChange({
                          ...config,
                          weekdays: next.length > 0 ? next : [day.value]
                        });
                      }}
                    >
                      {day.label}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("tasks.frequencyIntervalLabel")}
              </span>
              <Select
                value={String(config.intervalWeeks)}
                onValueChange={(value) =>
                  onConfigChange({ ...config, intervalWeeks: Math.max(1, Number(value)) })
                }
              >
                <SelectTrigger className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{t("tasks.frequencyEveryWeek")}</SelectItem>
                  <SelectItem value="2">{t("tasks.frequencyEveryWeeks", { count: 2 })}</SelectItem>
                  <SelectItem value="3">{t("tasks.frequencyEveryWeeks", { count: 3 })}</SelectItem>
                  <SelectItem value="4">{t("tasks.frequencyEveryWeeks", { count: 4 })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("tasks.frequencyMonthDayLabel")}
              </span>
              <Input
                type="number"
                min="1"
                max="31"
                inputMode="numeric"
                className="h-8 w-24"
                value={String(config.monthDay)}
                onChange={(event) =>
                  onConfigChange({
                    ...config,
                    monthDay: clampNumber(Number(event.target.value), 1, 31)
                  })
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("tasks.frequencyIntervalLabel")}
              </span>
              <Select
                value={String(config.intervalMonths)}
                onValueChange={(value) =>
                  onConfigChange({ ...config, intervalMonths: Math.max(1, Number(value)) })
                }
              >
                <SelectTrigger className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{t("tasks.frequencyEveryMonth")}</SelectItem>
                  <SelectItem value="2">{t("tasks.frequencyEveryMonths", { count: 2 })}</SelectItem>
                  <SelectItem value="3">{t("tasks.frequencyEveryMonths", { count: 3 })}</SelectItem>
                  <SelectItem value="6">{t("tasks.frequencyEveryMonths", { count: 6 })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {formatComplexFrequencyPreview(config, t)}
        </p>
      </div>
    );
  };

  const onStartDeleteTask = (task: TaskItem) => {
    setTaskPendingDelete(task);
    setIsDeleteDialogOpen(true);
  };

  const onConfirmDeleteTask = async () => {
    if (!taskPendingDelete) return;
    await onDelete(taskPendingDelete);
    setTaskPendingDelete(null);
    setIsDeleteDialogOpen(false);
  };

  const onConfirmToggleActiveTask = async () => {
    if (!taskPendingToggleActive) return;
    await onToggleActive(taskPendingToggleActive);
    setTaskPendingToggleActive(null);
  };

  // moved above to avoid TDZ in effects

  const weekdayLabels = useMemo(() => {
    const monday = new Date(Date.UTC(2026, 0, 5));
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(language, { weekday: "short" }).format(new Date(monday.getTime() + index * 24 * 60 * 60 * 1000))
    );
  }, [language]);

  const monthCells = useMemo(() => buildMonthGrid(calendarMonthDate), [calendarMonthDate]);
  const calendarTitle = useMemo(
    () => new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(calendarMonthDate),
    [calendarMonthDate, language]
  );
  const calendarEntriesByDay = useMemo(
    () => buildCalendarEntriesByDay(statsFilteredTasks, statsFilteredCompletions),
    [statsFilteredCompletions, statsFilteredTasks]
  );

  const visibleCalendarRange = useMemo(() => {
    const firstDate = monthCells[0]?.date;
    const lastDate = monthCells[monthCells.length - 1]?.date;
    if (!firstDate || !lastDate) return null;
    return {
      start: new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate()),
      end: new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate())
    };
  }, [monthCells]);
  const visibleCalendarDayKeys = useMemo(() => new Set(monthCells.map((cell) => dayKey(cell.date))), [monthCells]);
  const completionSpansByDay = useMemo(
    () => buildCompletionSpansByDay(statsFilteredCompletions, visibleCalendarDayKeys, visibleCalendarRange),
    [statsFilteredCompletions, visibleCalendarDayKeys, visibleCalendarRange]
  );
  const latestCompletionIdByTask = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of completions) {
      if (!map.has(entry.task_id)) {
        map.set(entry.task_id, entry.id);
      }
    }
    return map;
  }, [completions]);

  const calendarCard = showStats ? (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{t("tasks.calendarTitle")}</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => {
                setCalendarMonthDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
              }}
              aria-label={t("tasks.calendarPrevMonth")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="min-w-[130px] text-center text-sm font-medium capitalize text-slate-700 dark:text-slate-200">
              {calendarTitle}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => {
                setCalendarMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
              }}
              aria-label={t("tasks.calendarNextMonth")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1">
          {weekdayLabels.map((label) => (
            <p
              key={label}
              className="px-1 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              {label}
            </p>
          ))}
        </div>

        <TooltipProvider>
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((cell) => {
              const cellDayKey = dayKey(cell.date);
              const isToday = cellDayKey === dayKey(new Date());
              const entry = calendarEntriesByDay.get(cellDayKey);
              const dueTasks = entry?.dueTasks ?? [];
              const completedTasks = entry?.completedTasks ?? [];
              const completionSpans = completionSpansByDay.get(dayKey(cell.date)) ?? [];
              const memberIds = entry?.memberIds ?? [];
              const visibleMemberIds = memberIds.slice(0, 4);
              const overflowCount = Math.max(0, memberIds.length - visibleMemberIds.length);

              return (
                <Tooltip
                  key={cellDayKey}
                  open={isCoarsePointer ? openCalendarTooltipDay === cellDayKey : undefined}
                  onOpenChange={(open) => {
                    if (!isCoarsePointer) return;
                    setOpenCalendarTooltipDay(open ? cellDayKey : null);
                  }}
                >
                  <TooltipTrigger asChild>
                    <div
                      onClick={() => {
                        if (!isCoarsePointer) return;
                        setOpenCalendarTooltipDay((current) => (current === cellDayKey ? null : cellDayKey));
                      }}
                      className={`min-h-[70px] rounded-lg border px-1.5 py-1 ${
                        cell.inCurrentMonth
                          ? "border-brand-100 bg-white/90 dark:border-slate-700 dark:bg-slate-900"
                          : "border-brand-50 bg-white/40 opacity-65 dark:border-slate-800 dark:bg-slate-900/40"
                      }`}
                    >
                      <p
                        className={`text-xs font-medium ${
                          isToday
                            ? "text-brand-700 dark:text-brand-300"
                            : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {cell.date.getDate()}
                      </p>
                      {completionSpans.length > 0 ? (
                        <div className="mt-1 space-y-0.5">
                          {completionSpans.map((span) => {
                            const member = memberById.get(span.userId);
                            const displayName = userLabel(span.userId);
                            const avatarUrl = member?.avatar_url?.trim() ?? "";
                            const avatarSrc =
                              avatarUrl ||
                              createDiceBearAvatarDataUri(
                                member?.display_name?.trim() || displayName || span.userId,
                                member?.user_color
                              );
                            const segmentClassName =
                              span.kind === "single"
                                ? "mx-0 rounded-full"
                                : span.kind === "start"
                                  ? "-mr-2 rounded-l-full"
                                  : span.kind === "end"
                                    ? "-ml-2 rounded-r-full"
                                    : "-mx-2";

                            return (
                              <div
                                key={`${dayKey(cell.date)}-span-${span.id}-${span.kind}`}
                                className={`relative z-10 h-1.5 ${segmentClassName}`}
                                style={{ backgroundColor: resolveMemberColor(span.userId) }}
                              >
                                {(span.kind === "end" || span.kind === "single") && avatarSrc ? (
                                  <MemberAvatar
                                    src={avatarSrc}
                                    alt={displayName}
                                    isVacation={memberById.get(span.userId)?.vacation_mode ?? false}
                                    className="absolute -right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white bg-white dark:border-slate-900 dark:bg-slate-900"
                                  />
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {memberIds.length > 0 ? (
                        <div className="mt-1 flex items-center">
                          {visibleMemberIds.map((memberId, index) => {
                            const member = memberById.get(memberId);
                            const displayName = memberId === "__unassigned__" ? t("tasks.unassigned") : userLabel(memberId);
                            const avatarUrl = member?.avatar_url?.trim() ?? "";
                            const avatarSrc =
                              memberId === "__unassigned__"
                                ? null
                                : avatarUrl ||
                                  createDiceBearAvatarDataUri(
                                    member?.display_name?.trim() || displayName || memberId,
                                    member?.user_color
                                  );

                            return (
                              <MemberAvatar
                                key={`${dayKey(cell.date)}-${memberId}`}
                                src={avatarSrc}
                                alt={displayName}
                                isVacation={member?.vacation_mode ?? false}
                                className={`h-6 w-6 rounded-full border-2 border-white bg-brand-100 text-[10px] font-semibold text-brand-800 dark:border-slate-900 dark:bg-brand-900 dark:text-brand-100 ${
                                  index > 0 ? "-ml-2" : ""
                                }`}
                                fallback={
                                  memberId === "__unassigned__" ? (
                                    <div className="flex h-full w-full items-center justify-center">
                                      <CircleUserRound className="h-3.5 w-3.5" />
                                    </div>
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center">
                                      {displayName.slice(0, 1).toUpperCase()}
                                    </div>
                                  )
                                }
                              />
                            );
                          })}
                          {overflowCount > 0 ? (
                            <div className="-ml-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-semibold text-slate-700 dark:border-slate-900 dark:bg-slate-700 dark:text-slate-100">
                              +{overflowCount}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[320px] border border-slate-200 bg-white text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50">
                    <p className="mb-2 font-semibold">
                      {t("tasks.calendarTooltipTitle", {
                        date: formatShortDay(dayKey(cell.date), language, dayKey(cell.date))
                      })}
                    </p>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("tasks.calendarShouldHappen")}
                        </p>
                        {dueTasks.length > 0 ? (
                          <ul className="mt-1 space-y-1">
                            {dueTasks.map((task) => (
                              <li key={`${dayKey(cell.date)}-due-${task.id}`} className="text-xs">
                                <span className="font-medium">{t("tasks.statusDue")}:</span>{" "}
                                {task.title} · {task.assignee_id ? userLabel(task.assignee_id) : t("tasks.unassigned")}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("tasks.calendarNoEvents")}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("tasks.calendarHappened")}
                        </p>
                        {completedTasks.length > 0 ? (
                          <ul className="mt-1 space-y-1">
                            {completedTasks.map((completion) => (
                              <li key={`${dayKey(cell.date)}-done-${completion.id}`} className="text-xs">
                                <span className="font-medium">{t("tasks.statusCompleted")}:</span>{" "}
                                {(completion.task_title_snapshot || t("tasks.fallbackTitle"))} · {userLabel(completion.user_id)}
                                {completion.delay_minutes > 0 ? (
                                  <>
                                    {" "}
                                    · <span className="font-medium">{t("tasks.calendarDelay", { value: formatDelayLabel(completion.delay_minutes) })}</span>
                                  </>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("tasks.calendarNoEvents")}</p>
                        )}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  ) : null;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {showOverview ? (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle>{t("tasks.title")}</CardTitle>
                    <CardDescription>{t("tasks.description")}</CardDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    aria-label={t("tasks.createTask")}
                    onClick={() => {
                      setTaskImageUploadError(null);
                      setIsCreateDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                <div className="flex items-center justify-end gap-2">
                  <MobileSubpageDialog
                    open={isCreateDialogOpen}
                    onOpenChange={(open) => {
                      setIsCreateDialogOpen(open);
                      if (!open) {
                        setTaskImageUploadError(null);
                      }
                    }}
                    title={t("tasks.createTask")}
                    description={t("tasks.description")}
                    trigger={<span className="hidden" aria-hidden="true" />}
                  >
                    <form
                      className="space-y-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void taskForm.handleSubmit();
                      }}
                    >
                      <taskForm.Field
                        name="title"
                        children={(field: {
                          state: { value: string };
                          handleChange: (value: string) => void;
                        }) => (
                          <div className="relative space-y-1">
                            <Label>{t("tasks.titleLabel")}</Label>
                            <Input
                              value={field.state.value}
                              onChange={(event) =>
                                field.handleChange(event.target.value)
                              }
                              onFocus={onTitleFocus}
                              onBlur={onTitleBlur}
                              onKeyDown={onTitleKeyDown}
                              placeholder={t("tasks.placeholder")}
                              autoComplete="off"
                              required
                            />
                            {titleFocused && taskSuggestions.length > 0 ? (
                              <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 rounded-xl border border-brand-100 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  {t("tasks.suggestionsTitle")}
                                </p>
                                <ul className="max-h-56 overflow-y-auto">
                                  {taskSuggestions.map((suggestion, index) => (
                                    <li key={suggestion.key}>
                                      <button
                                        type="button"
                                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-brand-50 dark:hover:bg-slate-800 ${
                                          index === activeSuggestionIndex
                                            ? "bg-brand-50 dark:bg-slate-800"
                                            : ""
                                        }`}
                                        onMouseDown={(event) =>
                                          event.preventDefault()
                                        }
                                        onClick={() => {
                                          onSelectTaskSuggestion(suggestion);
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
                                        <Badge className="text-[10px]">
                                          {suggestion.source === "history"
                                            ? t("tasks.suggestionUsedCount", {
                                                count: suggestion.count,
                                              })
                                            : t("tasks.suggestionLibraryBadge")}
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

                      <taskForm.Field
                        name="description"
                        children={(field: {
                          state: { value: string };
                          handleChange: (value: string) => void;
                        }) => (
                          <div className="space-y-1">
                            <Label>{t("tasks.descriptionLabel")}</Label>
                            <textarea
                              className="min-h-[90px] w-full rounded-xl border border-brand-200 bg-white p-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
                              placeholder={t("tasks.descriptionPlaceholder")}
                              value={field.state.value}
                              onChange={(event) =>
                                field.handleChange(event.target.value)
                              }
                            />
                          </div>
                        )}
                      />

                      <div className="grid gap-2 sm:grid-cols-3">
                        <taskForm.Field
                          name="frequencyDays"
                          children={(field: {
                            state: { value: string };
                            handleChange: (value: string) => void;
                          }) => (
                            <div className="space-y-1">
                              <Label className="sr-only">
                                {t("tasks.frequencyDays")}
                              </Label>
                              <Select
                                value={frequencyMode}
                                onValueChange={(value) => {
                                  const nextMode =
                                    value === "cron" ? "cron" : "days";
                                  setFrequencyMode(nextMode);
                                  if (nextMode === "days") {
                                    field.handleChange(
                                      String(
                                        deriveFrequencyDaysFromComplex(
                                          complexFrequency,
                                        ),
                                      ),
                                    );
                                  }
                                }}
                              >
                                <SelectTrigger className="h-auto justify-start border-none p-0 text-sm font-medium text-slate-900 shadow-none hover:bg-transparent dark:text-slate-100">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="days">
                                    {t("tasks.frequencyModeDays")}
                                  </SelectItem>
                                  <SelectItem value="cron">
                                    {t("tasks.frequencyModeCron")}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              {frequencyMode === "days" ? (
                                <InputWithSuffix
                                  suffix="d"
                                  type="number"
                                  min="1"
                                  inputMode="numeric"
                                  value={field.state.value}
                                  onChange={(event) =>
                                    field.handleChange(event.target.value)
                                  }
                                  placeholder={t("tasks.frequencyDays")}
                                />
                              ) : (
                                renderComplexFrequencyBuilder(
                                  frequencyMode,
                                  complexFrequency,
                                  setComplexFrequency,
                                )
                              )}
                            </div>
                          )}
                        />
                        <taskForm.Field
                          name="effortPimpers"
                          children={(field: {
                            state: { value: string };
                            handleChange: (value: string) => void;
                          }) => (
                            <div className="space-y-1">
                              <Label>{t("tasks.effortPimpers")}</Label>
                              <InputWithSuffix
                                suffix={<PimpersIcon />}
                                type="number"
                                min="1"
                                inputMode="numeric"
                                value={field.state.value}
                                onChange={(event) =>
                                  field.handleChange(event.target.value)
                                }
                                placeholder={t("tasks.effortPimpers")}
                              />
                            </div>
                          )}
                        />
                      </div>
                      <Label>{t("tasks.rotationSelectionTitle")}</Label>
                      <PersonSelect
                        mode="multiple"
                        members={members}
                        value={rotationUserIds}
                        onChange={(nextSelection) => {
                          const nextSet = new Set(nextSelection);
                          const mergedOrder = [
                            ...rotationUserIds.filter((memberId) =>
                              nextSet.has(memberId),
                            ),
                            ...nextSelection.filter(
                              (memberId) => !rotationUserIds.includes(memberId),
                            ),
                          ];
                          setRotationUserIds(mergedOrder);
                        }}
                        currentUserId={userId}
                        youLabel={t("common.you")}
                        placeholder={t("tasks.rotationTitle")}
                      />

                      {members.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {t("tasks.noMembers")}
                        </p>
                      ) : null}

                      <Accordion
                        type="single"
                        collapsible
                        className="rounded-xl border border-brand-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <AccordionItem value="more" className="border-none">
                          <AccordionTrigger className="py-2">
                            {t("tasks.moreOptions")}
                          </AccordionTrigger>
                          <AccordionContent className="pb-3">
                            <div className="space-y-3">
                              <div className="grid gap-2 sm:grid-cols-2">
                                {renderTaskStateImageField(taskForm, {
                                  fieldName: "currentStateImageUrl",
                                  label: t("tasks.currentStateImageLabel"),
                                  previewAlt: t(
                                    "tasks.currentStateImagePreviewAlt",
                                  ),
                                  uploadInputRef: addCurrentStateUploadInputRef,
                                  cameraInputRef: addCurrentStateCameraInputRef,
                                  setError: setTaskImageUploadError,
                                })}
                                {renderTaskStateImageField(taskForm, {
                                  fieldName: "targetStateImageUrl",
                                  label: t("tasks.targetStateImageLabel"),
                                  previewAlt: t(
                                    "tasks.targetStateImagePreviewAlt",
                                  ),
                                  uploadInputRef: addTargetStateUploadInputRef,
                                  cameraInputRef: addTargetStateCameraInputRef,
                                  setError: setTaskImageUploadError,
                                })}
                              </div>

                              <taskForm.Field
                                name="startDate"
                                children={(field: {
                                  state: { value: string };
                                  handleChange: (value: string) => void;
                                }) => (
                                  <div className="space-y-1">
                                    <Label>{t("tasks.startDate")}</Label>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Input
                                          type="date"
                                          lang={language}
                                          value={field.state.value}
                                          onChange={(event) =>
                                            field.handleChange(
                                              event.target.value,
                                            )
                                          }
                                          required
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {t("tasks.startDate")}
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                )}
                              />

                              <taskForm.Field
                                name="graceDays"
                                children={(field: {
                                  state: { value: string };
                                  handleChange: (value: string) => void;
                                }) => (
                                  <div className="space-y-1">
                                    <Label>{t("tasks.gracePeriodLabel")}</Label>
                                    <InputWithSuffix
                                      suffix={t("tasks.gracePeriodUnit")}
                                      type="number"
                                      min="0"
                                      step="0.1"
                                      inputMode="decimal"
                                      value={field.state.value}
                                      onChange={(event) =>
                                        field.handleChange(event.target.value)
                                      }
                                      placeholder={t(
                                        "tasks.gracePeriodPlaceholder",
                                      )}
                                    />
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      {t("tasks.gracePeriodHint")}
                                    </p>
                                  </div>
                                )}
                              />

                              <taskForm.Field
                                name="delayPenaltyPerDay"
                                children={(field: {
                                  state: { value: string };
                                  handleChange: (value: string) => void;
                                }) => (
                                  <div className="space-y-1">
                                    <Label>
                                      {t("tasks.delayPenaltyLabel")}
                                    </Label>
                                    <InputWithSuffix
                                      suffix={t("tasks.delayPenaltyUnit")}
                                      type="number"
                                      min="0"
                                      step="0.05"
                                      inputMode="decimal"
                                      value={field.state.value}
                                      onChange={(event) =>
                                        field.handleChange(event.target.value)
                                      }
                                      placeholder={t(
                                        "tasks.delayPenaltyPlaceholder",
                                      )}
                                    />
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      {t("tasks.delayPenaltyHint")}
                                    </p>
                                  </div>
                                )}
                              />

                              <taskForm.Field
                                name="prioritizeLowPimpers"
                                children={(field: {
                                  state: { value: boolean };
                                  handleChange: (value: boolean) => void;
                                }) => (
                                  <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                                    <div>
                                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                        {t("tasks.prioritizeLowPimpers")}
                                      </p>
                                      <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {t("tasks.prioritizeLowPimpersHint")}
                                      </p>
                                    </div>
                                    <Switch
                                      checked={field.state.value}
                                      onCheckedChange={field.handleChange}
                                    />
                                  </div>
                                )}
                              />

                              <taskForm.Field
                                name="assigneeFairnessMode"
                                children={(field: {
                                  state: {
                                    value: "actual" | "projection" | "expected";
                                  };
                                  handleChange: (
                                    value: "actual" | "projection" | "expected",
                                  ) => void;
                                }) => (
                                  <div className="space-y-1">
                                    <Label>
                                      {t("tasks.assigneeFairnessModeLabel")}
                                    </Label>
                                    <select
                                      className="h-10 w-full rounded-xl border border-brand-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                      value={field.state.value}
                                      onChange={(event) =>
                                        field.handleChange(
                                          event.target.value as
                                            | "actual"
                                            | "projection"
                                            | "expected",
                                        )
                                      }
                                      disabled={
                                        !taskForm.state.values
                                          .prioritizeLowPimpers
                                      }
                                    >
                                      <option value="actual">
                                        {t("tasks.assigneeFairnessModeActual")}
                                      </option>
                                      <option value="projection">
                                        {t(
                                          "tasks.assigneeFairnessModeProjection",
                                        )}
                                      </option>
                                      <option value="expected">
                                        {t(
                                          "tasks.assigneeFairnessModeExpected",
                                        )}
                                      </option>
                                    </select>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      {t("tasks.assigneeFairnessModeHint")}
                                    </p>
                                  </div>
                                )}
                              />

                              {rotationUserIds.length > 0 ? (
                                <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {t("tasks.rotationTitle")}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                    {t("tasks.rotationHint")}
                                  </p>
                                  <div className="mt-3 space-y-2">
                                    <DndContext
                                      sensors={sensors}
                                      collisionDetection={closestCenter}
                                      onDragEnd={onRotationDragEnd}
                                    >
                                      <SortableContext
                                        items={rotationUserIds}
                                        strategy={verticalListSortingStrategy}
                                      >
                                        {rotationUserIds.map(
                                          (rotationUserId) => {
                                            const score =
                                              pimperByUserId.get(
                                                rotationUserId,
                                              ) ?? 0;
                                            const member =
                                              memberById.get(rotationUserId);
                                            const displayName =
                                              userLabel(rotationUserId);
                                            const avatarUrl =
                                              member?.avatar_url?.trim() ?? "";
                                            const avatarSrc =
                                              avatarUrl ||
                                              createDiceBearAvatarDataUri(
                                                member?.display_name?.trim() ||
                                                  displayName ||
                                                  rotationUserId,
                                                member?.user_color,
                                              );
                                            return (
                                              <SortableRotationItem
                                                key={rotationUserId}
                                                id={rotationUserId}
                                                label={userLabel(
                                                  rotationUserId,
                                                )}
                                                avatarSrc={avatarSrc}
                                                isVacation={
                                                  member?.vacation_mode ?? false
                                                }
                                                pimperCount={score}
                                                dragHandleLabel={t(
                                                  "tasks.dragHandle",
                                                )}
                                              />
                                            );
                                          },
                                        )}
                                      </SortableContext>
                                    </DndContext>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>

                      {formError ? (
                        <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                          {formError}
                        </p>
                      ) : null}
                      {taskImageUploadError ? (
                        <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                          {taskImageUploadError}
                        </p>
                      ) : null}

                      <div className="flex justify-end">
                        <Button type="submit" disabled={busy}>
                          {t("tasks.createTask")}
                        </Button>
                      </div>
                    </form>
                  </MobileSubpageDialog>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {visibleTasks.map((task) => {
                const nowMs = Date.now();
                const dueAtMs = new Date(task.due_at).getTime();
                const graceMs = Math.max(0, task.grace_minutes ?? 0) * 60 * 1000;
                const isWithinGrace =
                  Number.isFinite(dueAtMs) && nowMs >= dueAtMs && nowMs <= dueAtMs + graceMs;
                const isOverdue =
                  Number.isFinite(dueAtMs) && nowMs > dueAtMs + graceMs;
                const isDue =
                  task.is_active &&
                  !task.done &&
                  (isWithinGrace || isOverdue);
                const isAssignedToCurrentUser = task.assignee_id === userId;
                const canCompleteEarly =
                  task.is_active &&
                  !task.done &&
                  isAssignedToCurrentUser &&
                  Number.isFinite(dueAtMs) &&
                  dueAtMs - Date.now() <= 24 * 60 * 60 * 1000;
                const canComplete = canCompleteEarly && !busy;
                const canSkip = isDue && isAssignedToCurrentUser && !busy;
                const canTakeover =
                  isDue &&
                  task.assignee_id !== null &&
                  !isAssignedToCurrentUser &&
                  !busy;
                const canRemind = isDue && task.assignee_id !== null && !busy;
                const primaryImageUrl = isDue
                  ? task.current_state_image_url
                  : task.target_state_image_url;
                const secondaryImageUrl = isDue
                  ? task.target_state_image_url
                  : null;
                const hasPrimaryImage = Boolean(primaryImageUrl);
                const hasSecondaryImage = Boolean(secondaryImageUrl);
                const dueChipText = relativeDueChipLabel(task.due_at, task.grace_minutes, t);
                const assigneeText = task.assignee_id
                  ? userLabel(task.assignee_id)
                  : t("tasks.unassigned");
                const assigneeMember = task.assignee_id
                  ? memberById.get(task.assignee_id)
                  : null;
                const assigneeAvatarSrc =
                  task.assignee_id && assigneeText
                    ? assigneeMember?.avatar_url?.trim() ||
                      createDiceBearAvatarDataUri(
                        assigneeMember?.display_name?.trim() ||
                          assigneeText ||
                          task.assignee_id,
                        assigneeMember?.user_color,
                      )
                    : null;

                return (
                  <Card
                    key={task.id}
                    className={`group relative overflow-hidden rounded-xl border border-slate-300 bg-white/88 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4 ${
                      !task.is_active ? "opacity-60 grayscale-[0.35]" : ""
                    }`}
                  >
                    {hasPrimaryImage ? (
                      <>
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
                          style={{ backgroundImage: `url(${primaryImageUrl})` }}
                        />
                        {hasSecondaryImage ? (
                          <div
                            aria-hidden="true"
                            className="absolute inset-0 bg-cover bg-center opacity-0 transition-opacity duration-700 group-hover:opacity-100"
                            style={{
                              backgroundImage: `url(${secondaryImageUrl})`,
                            }}
                          />
                        ) : null}
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 bg-white/50 dark:bg-slate-900/50"
                        />
                      </>
                    ) : null}
                    <CardContent className="relative z-10">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="inline-flex max-w-full items-center gap-2 rounded-xl bg-white/70 px-2 py-1 backdrop-blur-md dark:bg-slate-900/60">
                            <MemberAvatar
                              src={assigneeAvatarSrc}
                              alt={assigneeText}
                              isVacation={
                                assigneeMember?.vacation_mode ?? false
                              }
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-200 bg-brand-50 dark:border-slate-700 dark:bg-slate-800"
                              fallback={
                                <div className="flex h-full w-full items-center justify-center text-slate-500 dark:text-slate-300">
                                  <CircleUserRound className="h-4 w-4" />
                                </div>
                              }
                            />
                            <div className="min-w-0">
                              <p
                                className={
                                  task.done
                                    ? "line-through text-slate-400"
                                    : "text-slate-900 dark:text-slate-100"
                                }
                              >
                                {task.title}
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-300">
                                {t("tasks.assignee", { value: assigneeText })}
                              </p>
                            </div>
                          </div>

                          {task.description ? (
                            <p className="rounded-lg bg-white/70 px-2 py-1 text-sm text-slate-700 backdrop-blur-md dark:bg-slate-900/60 dark:text-slate-200">
                              {task.description}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                className={
                                  isOverdue
                                    ? "whitespace-nowrap bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100"
                                    : isWithinGrace
                                      ? "whitespace-nowrap bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100"
                                      : "whitespace-nowrap bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                }
                              >
                                {dueChipText}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {t("tasks.frequencyValue", {
                                  count: task.frequency_days,
                                })}
                              </p>
                              <p>
                                {t("tasks.frequencyActualValue", {
                                  count: (() => {
                                    const actual =
                                      actualFrequencyDaysByTaskId.get(task.id);
                                    if (actual == null)
                                      return task.frequency_days;
                                    return Number(actual.toFixed(1));
                                  })(),
                                })}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center">
                          {(() => {
                            const nowMs = Date.now();
                            const dueAt = new Date(task.due_at).getTime();
                            const graceMs =
                              Math.max(0, task.grace_minutes) * 60_000;
                            const delayMinutes = Math.max(
                              0,
                              Math.floor((nowMs - (dueAt + graceMs)) / 60_000),
                            );
                            const penaltyPerDay = Math.max(
                              0,
                              task.delay_penalty_per_day ?? 0,
                            );
                            const penalty =
                              penaltyPerDay * (delayMinutes / 1440);
                            const earned = Math.max(
                              task.effort_pimpers - penalty,
                              0,
                            );
                            const iconCount = Math.min(task.effort_pimpers, 6);
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <PimpersStack
                                    count={iconCount}
                                    earned={earned}
                                  />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">
                                    {t("tasks.delayPenaltyTooltipCurrent", {
                                      earned: earned.toFixed(2),
                                      total: Number(
                                        task.effort_pimpers,
                                      ).toFixed(2),
                                    })}
                                  </p>
                                  <p className="text-xs">
                                    {t("tasks.delayPenaltyTooltipDelay", {
                                      days: (delayMinutes / 1440).toFixed(1),
                                    })}
                                  </p>
                                  <p className="text-xs">
                                    {t("tasks.delayPenaltyTooltipPenalty", {
                                      penalty: penalty.toFixed(2),
                                    })}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
                          {task.effort_pimpers > 6 ? (
                            <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                              +{task.effort_pimpers - 6}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          {canTakeover ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setPendingTaskAction({ kind: "takeover", task })
                              }
                            >
                              {t("tasks.takeOver")}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canSkip}
                            onClick={() =>
                              setPendingTaskAction({ kind: "skip", task })
                            }
                          >
                            {t("tasks.skip")}
                          </Button>
                          {!canTakeover ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={!canComplete}
                              onClick={() =>
                                setPendingTaskAction({ kind: "complete", task })
                              }
                            >
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                              {t("tasks.complete")}
                            </Button>
                          ) : null}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                aria-label={t("tasks.taskActions")}
                                disabled={busy}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canRemind ? (
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (!task.assignee_id) return;
                                    void sendTaskReminder(task, assigneeText);
                                  }}
                                >
                                  {t("tasks.reminderAction")}
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                onClick={() => {
                                  if (!task.is_active) {
                                    void onToggleActive(task);
                                    return;
                                  }
                                  setTaskPendingToggleActive(task);
                                }}
                              >
                                {task.is_active
                                  ? t("tasks.deactivate")
                                  : t("tasks.activate")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onStartEditTask(task)}
                              >
                                {t("tasks.editTask")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setTaskDetailsTask(task);
                                  setTaskDetailsOpen(true);
                                }}
                              >
                                {t("tasks.details")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onStartDeleteTask(task)}
                                className="text-rose-600 dark:text-rose-300"
                              >
                                {t("tasks.deleteTask")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {visibleTasks.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("tasks.empty")}
              </p>
            ) : null}
          </>
        ) : null}

        {showStats ? (
          <Card className="mb-4">
            <CardContent>
              <div className="space-y-1">
                <Label>{t("tasks.statsTaskFilterLabel")}</Label>
                <select
                  className="h-10 w-full rounded-xl border border-brand-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={statsTaskFilterId}
                  onChange={(event) => setStatsTaskFilterId(event.target.value)}
                >
                  <option value="all">{t("tasks.statsTaskFilterAll")}</option>
                  {visibleTasks.map((task) => (
                    <option
                      key={`stats-filter-task-${task.id}`}
                      value={task.id}
                    >
                      {task.title}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {showStats && sortedMemberRows.length > 0 ? (
          <Card className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4">
            <CardHeader>
              <CardTitle>{t("tasks.scoreboardTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {podiumRows.length > 0 ? (
                <div className="mb-4 rounded-xl border border-brand-100 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="grid grid-cols-3 items-end gap-2">
                    {[1, 0, 2].map((index) => {
                      const member = podiumRows[index];
                      if (!member) return <div key={`podium-empty-${index}`} />;

                      const rank = index + 1;
                      const isGold = rank === 1;
                      const isSilver = rank === 2;
                      const pillarHeight = isGold
                        ? "h-24"
                        : isSilver
                          ? "h-20"
                          : "h-16";
                      const pillarColor = isGold
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                        : isSilver
                          ? "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                          : "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200";
                      const medalColor = isGold
                        ? "text-amber-500"
                        : isSilver
                          ? "text-slate-400"
                          : "text-orange-500";
                      const rankLabel = isGold
                        ? t("tasks.podiumGold")
                        : isSilver
                          ? t("tasks.podiumSilver")
                          : t("tasks.podiumBronze");

                      return (
                        <div
                          key={member.user_id}
                          className="relative flex flex-col items-center"
                        >
                          <SparklesEffect
                            color="currentColor"
                            count={(3 - rank) * 6}
                            minSize={2}
                            maxSize={4}
                            overflowPx={4}
                            fadeOutSpeed={8}
                            flicker={false}
                          />
                          <MemberAvatar
                            src={
                              member.avatar_url?.trim() ||
                              createDiceBearAvatarDataUri(
                                userLabel(member.user_id),
                                member.user_color,
                              )
                            }
                            alt={userLabel(member.user_id)}
                            isVacation={member.vacation_mode ?? false}
                            className="h-8 w-8 rounded-full border border-brand-200 dark:border-slate-700"
                          />
                          <p className="mt-1 max-w-[90px] truncate text-center text-[11px] text-slate-600 dark:text-slate-300">
                            {userLabel(member.user_id)}
                          </p>
                          <div
                            className={`mt-2 flex w-full flex-col items-center justify-end rounded-t-lg ${pillarHeight} ${pillarColor}`}
                          >
                            <Medal className={`mb-1 h-4 w-4 ${medalColor}`} />
                            <p className="text-[10px] font-semibold">
                              {rankLabel}
                            </p>
                            <p className="mb-2 inline-flex items-center gap-1 text-xs font-bold">
                              <span>
                                {formatScaledPimpers(member.scaled_pimpers)}
                              </span>
                              <PimpersIcon />
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <ul className="space-y-1 text-sm">
                {sortedMemberRows.map((member) => (
                  <li
                    key={member.user_id}
                    className="flex justify-between gap-2"
                  >
                    <span
                      className={
                        member.user_id === userId
                          ? "font-medium"
                          : "text-slate-600 dark:text-slate-300"
                      }
                    >
                      {userLabel(member.user_id)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span>{formatScaledPimpers(member.scaled_pimpers)}</span>
                      <PimpersIcon />
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {showStats ? (
          <Card className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4">
            <CardHeader>
              <CardTitle>{t("tasks.memberOfMonthTitle")}</CardTitle>
              <CardDescription>
                {t("tasks.memberOfMonthHint", { month: memberOfMonthLabel })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                {t("tasks.memberOfMonthInfo")}
              </p>
              {memberOfMonth ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-100 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex min-w-0 items-center gap-3">
                    <MemberAvatar
                      src={
                        memberById
                          .get(memberOfMonth.userId)
                          ?.avatar_url?.trim() ||
                        createDiceBearAvatarDataUri(
                          userLabel(memberOfMonth.userId),
                        )
                      }
                      alt={userLabel(memberOfMonth.userId)}
                      isVacation={
                        memberById.get(memberOfMonth.userId)?.vacation_mode ??
                        false
                      }
                      isMemberOfMonth
                      className="h-9 w-9 rounded-full border border-brand-200 dark:border-slate-700"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                        {userLabel(memberOfMonth.userId)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("tasks.pimpersValue", {
                          count: memberOfMonth.totalPimpers,
                        })}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("tasks.memberOfMonthDelay", {
                      days: Number((memberOfMonth.averageDelayMinutes / 1440).toFixed(1)),
                    })}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("tasks.memberOfMonthEmpty")}
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {showStats ? (
          <Card className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4">
            <CardHeader>
              <CardTitle>{t("tasks.reliabilityTitle")}</CardTitle>
              <CardDescription>
                {t("tasks.reliabilityDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {reliabilityRows.length > 0 ? (
                <ul className="space-y-1">
                  {reliabilityRows.map((row) => (
                    <li
                      key={`reliability-${row.userId}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-brand-100 bg-white/90 p-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-6 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          #{row.rank}
                        </span>
                        <MemberAvatar
                          src={
                            memberById.get(row.userId)?.avatar_url?.trim() ||
                            createDiceBearAvatarDataUri(
                              userLabel(row.userId),
                              memberById.get(row.userId)?.user_color,
                            )
                          }
                          alt={userLabel(row.userId)}
                          isVacation={
                            memberById.get(row.userId)?.vacation_mode ?? false
                          }
                          className="h-7 w-7 rounded-full border border-brand-200 dark:border-slate-700"
                        />
                        <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                          {userLabel(row.userId)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-right text-xs">
                        <span className="text-slate-500 dark:text-slate-400">
                          {t("tasks.reliabilityAverageDelay", {
                            value: formatDelayLabel(row.averageDelayMinutes),
                          })}
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                          {t("tasks.reliabilityScore", { value: row.score })}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("tasks.reliabilityNoData")}
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}
        {showStats ? (
          <Card className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4">
            <CardHeader>
              <CardTitle>{t("tasks.onTimeStreakTitle")}</CardTitle>
              <CardDescription>{t("tasks.onTimeStreakHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              {onTimeStreaks.some((row) => row.streak > 0) ? (
                <ul className="space-y-1 text-sm">
                  {onTimeStreaks.map((row) => (
                    <li
                      key={`streak-${row.userId}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-slate-700 dark:text-slate-300">
                        {userLabel(row.userId)}
                      </span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {t("tasks.onTimeStreakValue", { count: row.streak })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("tasks.onTimeStreakEmpty")}
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {showStats && sortedMemberRows.length > 0 ? (
          <Card className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4">
            <CardHeader>
              <CardTitle>{t("tasks.backlogTitle")}</CardTitle>
              <CardDescription>{t("tasks.backlogDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-brand-100 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("tasks.backlogDueNow")}
                  </p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {backlogAndDelayStats.overdueTasksCount}
                  </p>
                </div>
                <div className="rounded-lg border border-brand-100 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("tasks.backlogOpen")}
                  </p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {backlogAndDelayStats.dueTasksCount}
                  </p>
                </div>
                <div className="rounded-lg border border-brand-100 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("tasks.averageDelayOverall")}
                  </p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {formatDelayLabel(backlogAndDelayStats.overallDelayMinutes)}
                  </p>
                </div>
              </div>
              {backlogAndDelayStats.memberRows.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("tasks.averageDelayByMember")}
                  </p>
                  <ul className="space-y-1">
                    {backlogAndDelayStats.memberRows.map((row) => (
                      <li
                        key={`delay-${row.userId}`}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-slate-700 dark:text-slate-300">
                          {userLabel(row.userId)}
                        </span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {formatDelayLabel(row.averageDelayMinutes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {backlogAndDelayStats.taskRows.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("tasks.averageDelayByTask")}
                  </p>
                  <ul className="space-y-1">
                    {backlogAndDelayStats.taskRows.map((row) => (
                      <li
                        key={`delay-task-${row.taskId}`}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-slate-700 dark:text-slate-300">
                          {row.title}
                        </span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {formatDelayLabel(row.averageDelayMinutes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {lazinessSettingsCard}

        {showStats &&
        pimpersByUserSeries.labels.length > 0 &&
        pimpersByUserSeries.datasets.length > 0 ? (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>{t("tasks.historyChartPimpers")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-white p-2 dark:bg-slate-900">
                <Bar
                  data={{
                    labels: pimpersByUserSeries.labels,
                    datasets: pimpersByUserSeries.datasets,
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
                            return `${context.dataset.label ?? t("tasks.fallbackTitle")}: ${value}`;
                          },
                          footer: (items) => {
                            const total = items.reduce(
                              (sum, item) => sum + Number(item.parsed.y ?? 0),
                              0,
                            );
                            return t("tasks.chartStackTotal", { value: total });
                          },
                        },
                      },
                    },
                    scales: {
                      x: { stacked: true },
                      y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: { precision: 0 },
                      },
                    },
                  }}
                  height={280}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {showStats && selectedForecastTask ? (
          <Card className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>{t("tasks.forecastTitle")}</CardTitle>
                  <CardDescription>
                    {t("tasks.forecastDescription")}
                  </CardDescription>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                        aria-label={t("tasks.forecastTooltipTitle")}
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[320px] border border-slate-200 bg-white text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50">
                      <div className="space-y-2 text-xs leading-relaxed">
                        <p className="font-semibold">
                          {t("tasks.forecastTooltipTitle")}
                        </p>
                        <p>{t("tasks.forecastTooltipBody")}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>{t("tasks.forecastSelectLabel")}</Label>
                <select
                  className="h-10 w-full rounded-xl border border-brand-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={statsForecastTaskId}
                  onChange={(event) =>
                    setStatsForecastTaskId(event.target.value)
                  }
                >
                  {activeForecastTasks.map((task) => (
                    <option key={`forecast-task-${task.id}`} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              </div>
              <ul className="space-y-2">
                {selectedForecastRows.map((row) => (
                  <li
                    key={`forecast-row-${selectedForecastTask.id}-${row.user_id}`}
                    className="rounded-lg border border-brand-100 bg-white/90 p-2 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {userLabel(row.user_id)}
                    </p>
                    <div
                      className={`mt-1 grid gap-1 text-xs text-slate-600 dark:text-slate-300 ${
                        isLazinessEnabled ? "sm:grid-cols-3" : "sm:grid-cols-2"
                      }`}
                    >
                      <span>
                        {t("tasks.forecastCurrentPimpers", {
                          value: row.current_pimpers,
                        })}
                      </span>
                      <span>
                        {t("tasks.forecastProjectedUntilTurn", {
                          value: Number(row.projected_until_turn.toFixed(2)),
                        })}
                      </span>
                      {isLazinessEnabled ? (
                        <span>
                          {t("tasks.forecastProjectedScore", {
                            value:
                              row.projected_total_scaled === null
                                ? "-"
                                : Number(row.projected_total_scaled.toFixed(2)),
                          })}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {resetPimpersStatsCard}

        {showHistory ? (
          <>
            {completionSeries.labels.length > 0 ? (
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>{t("tasks.historyChartCompletions")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg bg-white p-2 dark:bg-slate-900">
                    <Bar
                      data={{
                        labels: completionSeries.labels,
                        datasets: completionSeries.datasets,
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
                              title: (items) => {
                                const first = items[0];
                                if (!first) return "";
                                const label =
                                  completionSeries.labels[first.dataIndex];
                                return formatShortDay(label, language, label);
                              },
                              label: (context) => {
                                const value = Number(context.parsed.y ?? 0);
                                return `${context.dataset.label ?? t("tasks.fallbackTitle")}: ${value}`;
                              },
                              footer: (items) => {
                                const total = items.reduce(
                                  (sum, item) =>
                                    sum + Number(item.parsed.y ?? 0),
                                  0,
                                );
                                return t("tasks.chartStackTotal", {
                                  value: total,
                                });
                              },
                            },
                          },
                        },
                        scales: {
                          x: { stacked: true },
                          y: {
                            stacked: true,
                            beginAtZero: true,
                            ticks: { precision: 0 },
                          },
                        },
                      }}
                      height={230}
                    />
                  </div>
                </CardContent>
              </Card>
            ) : null}
            <Card className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4">
              <CardHeader>
                <CardTitle>{t("tasks.historyTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                {historyItems.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t("tasks.historyEmpty")}
                  </p>
                ) : null}

                {historyItems.length > 0 ? (
                  <ul className="space-y-2">
                    {historyItems.map((item) => {
                      if (item.type === "skipped") {
                        return (
                          <li
                            key={`skip-${item.id}`}
                            className="rounded-lg border border-brand-100 bg-white/90 p-2 dark:border-slate-700 dark:bg-slate-900"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {item.taskTitle}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {formatDateTime(item.createdAt, language)}
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {t("tasks.historySkippedLine", {
                                user: item.userId
                                  ? userLabel(item.userId)
                                  : t("common.memberFallback"),
                              })}
                            </p>
                          </li>
                        );
                      }

                      const entry = item.entry;
                      return (
                        <li
                          key={entry.id}
                          className="rounded-lg border border-brand-100 bg-white/90 p-2 dark:border-slate-700 dark:bg-slate-900"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {entry.task_title_snapshot ||
                                t("tasks.fallbackTitle")}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {formatDateTime(entry.completed_at, language)}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {t("tasks.historyLine", {
                              user: userLabel(entry.user_id),
                              pimpers: `${entry.pimpers_earned}`,
                            })}
                            <span className="ml-1 inline-flex align-middle">
                              <PimpersIcon />
                            </span>
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <div className="ml-auto">
                              {entry.rating_count > 0 || entry.my_rating ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div>
                                      <StarRating
                                        value={entry.my_rating ?? 0}
                                        displayValue={entry.rating_average ?? 0}
                                        disabled={
                                          busy ||
                                          !(
                                            entry.user_id !== userId &&
                                            latestCompletionIdByTask.get(
                                              entry.task_id,
                                            ) === entry.id
                                          )
                                        }
                                        onChange={(rating) =>
                                          void onRateTaskCompletion(
                                            entry.id,
                                            rating,
                                          )
                                        }
                                        getLabel={(rating) =>
                                          t("tasks.rateAction", { rating })
                                        }
                                      />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">
                                      {t("tasks.ratingTooltipCount", {
                                        count: entry.rating_count,
                                      })}
                                    </p>
                                    <p className="text-xs">
                                      {t("tasks.ratingTooltipAverage", {
                                        average: Number(
                                          (entry.rating_average ?? 0).toFixed(
                                            1,
                                          ),
                                        ),
                                      })}
                                    </p>
                                    <p className="text-xs">
                                      {t("tasks.ratingTooltipMine", {
                                        rating: entry.my_rating ?? "-",
                                      })}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {t("tasks.ratingNoVotes")}
                                </p>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          </>
        ) : null}

        <Dialog
          open={isResetPimpersDialogOpen}
          onOpenChange={setIsResetPimpersDialogOpen}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("tasks.resetPimpersConfirmTitle")}</DialogTitle>
              <DialogDescription>
                {t("tasks.resetPimpersConfirmDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsResetPimpersDialogOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={busy}
                className="bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
                onClick={() => void onConfirmResetHouseholdPimpers()}
              >
                {t("tasks.resetPimpersConfirmAction")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={pendingTaskAction !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingTaskAction(null);
              resetSkipCaptchaState();
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="absolute right-3 top-3 h-8 w-8 p-0"
              onClick={() => {
                setPendingTaskAction(null);
                resetSkipCaptchaState();
              }}
              aria-label={t("common.cancel")}
            >
              <X className="h-4 w-4" />
            </Button>
            <DialogHeader>
              <DialogTitle>
                {pendingTaskAction?.kind === "skip"
                  ? t("tasks.confirmSkipTitle")
                  : pendingTaskAction?.kind === "takeover"
                    ? t("tasks.confirmTakeOverTitle")
                    : t("tasks.confirmCompleteTitle")}
              </DialogTitle>
              <DialogDescription>
                {pendingTaskAction?.kind === "skip"
                  ? t("tasks.confirmSkipDescription", {
                      title:
                        pendingTaskAction?.task.title ??
                        t("tasks.fallbackTitle"),
                    })
                  : pendingTaskAction?.kind === "takeover"
                    ? t("tasks.confirmTakeOverDescription", {
                        title:
                          pendingTaskAction?.task.title ??
                          t("tasks.fallbackTitle"),
                      })
                    : t("tasks.confirmCompleteDescription", {
                        title:
                          pendingTaskAction?.task.title ??
                          t("tasks.fallbackTitle"),
                      })}
              </DialogDescription>
            </DialogHeader>

            {pendingTaskAction?.kind === "skip" ? (
              <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-5 text-center dark:border-rose-800 dark:bg-rose-950/40">
                <Frown className="mx-auto h-14 w-14 text-rose-600 dark:text-rose-300" />
                <p className="mt-3 text-sm font-semibold text-rose-800 dark:text-rose-200">
                  {t("tasks.confirmSkipWarning")}
                </p>
                {skipMathChallenge ? (
                  <div className="mt-4 rounded-lg border border-rose-200 bg-white p-3 text-left dark:border-rose-800 dark:bg-slate-900/60">
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                      {t("tasks.skipChallengeTitle")}
                    </p>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      {t("tasks.skipChallengePrompt", {
                        expression: skipMathChallenge.expression,
                      })}
                    </p>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={skipChallengeAnswerInput}
                      onChange={(event) =>
                        setSkipChallengeAnswerInput(event.target.value)
                      }
                      placeholder={t("tasks.skipChallengePlaceholder")}
                      className="mt-2"
                    />
                    {skipChallengeAnswerInput.trim().length > 0 &&
                    !isSkipMathChallengeSolved ? (
                      <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">
                        {t("tasks.skipChallengeIncorrect")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {pendingTaskAction &&
            (pendingTaskAction.kind === "complete" ||
              pendingTaskAction.kind === "takeover") &&
            pendingTaskAction.task.target_state_image_url ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  {t("tasks.confirmTargetStateTitle")}
                </p>
                <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
                  {t("tasks.confirmTargetStatePrompt")}
                </p>
                <div className="mt-3 overflow-hidden rounded-lg border border-emerald-200 bg-white dark:border-emerald-900/60 dark:bg-slate-900">
                  <img
                    src={pendingTaskAction.task.target_state_image_url}
                    alt={t("tasks.targetStateImageAlt")}
                    className="h-48 w-full object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
            ) : null}

            <div className="flex justify-end mt-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPendingTaskAction(null);
                  resetSkipCaptchaState();
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={
                  busy ||
                  (pendingTaskAction?.kind === "skip" &&
                    (!isSkipMathChallengeSolved || !isSkipCaptchaComplete))
                }
                className={
                  pendingTaskAction?.kind === "skip"
                    ? "bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
                    : undefined
                }
                onClick={() => void onConfirmTaskAction()}
              >
                {pendingTaskAction?.kind === "skip"
                  ? t("tasks.confirmSkipAction")
                  : pendingTaskAction?.kind === "takeover"
                    ? t("tasks.confirmTakeOverAction")
                    : t("tasks.confirmCompleteAction")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={
            pendingTaskAction?.kind === "skip" &&
            isSkipMathChallengeSolved &&
            !isSkipCaptchaComplete &&
            Boolean(skipCaptchaCurrent)
          }
          onOpenChange={(open) => {
            if (!open) {
              setPendingTaskAction(null);
              resetSkipCaptchaState();
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("tasks.skipCaptchaPopupTitle")}</DialogTitle>
              <DialogDescription>
                {t("tasks.skipCaptchaPopupHint")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="relative min-h-[220px] overflow-hidden rounded-xl">
                {skipCaptchaCurrent ? (
                  <RecaptzCaptcha
                    key={`skip-captcha-${skipCaptchaIndex}-${skipCaptchaCurrent}-${skipCaptchaKey}`}
                    type={skipCaptchaCurrent}
                    onReload={retrySkipCaptcha}
                    reloadLabel={t("tasks.skipCaptchaPopupReload")}
                    onValidate={(isValid) => {
                      setSkipCaptchaValid(isValid);
                      if (isValid && skipCaptchaUiState !== "ready") {
                        setSkipCaptchaUiState("ready");
                        setSkipCaptchaError(null);
                      }
                    }}
                  />
                ) : null}
                {skipCaptchaUiState !== "ready" ? (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-white/85 p-4 text-center text-xs text-slate-700 backdrop-blur-sm dark:bg-slate-900/85 dark:text-slate-200">
                    <div className="mb-3 flex flex-col items-center gap-3">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500 dark:border-slate-600 dark:border-t-brand-300" />
                      <div className="w-44 space-y-2">
                        <div className="h-2 w-full animate-pulse rounded-full bg-slate-200/80 dark:bg-slate-700/80" />
                        <div className="h-2 w-5/6 animate-pulse rounded-full bg-slate-200/70 dark:bg-slate-700/70" />
                      </div>
                    </div>
                    <p className="font-semibold">
                      {skipCaptchaUiState === "loading"
                        ? t("tasks.skipCaptchaPopupLoading")
                        : (skipCaptchaError ??
                          t("tasks.skipCaptchaPopupError"))}
                    </p>
                    {skipCaptchaUiState === "error" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={retrySkipCaptcha}
                      >
                        {t("tasks.skipCaptchaPopupRetry")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPendingTaskAction(null);
                    resetSkipCaptchaState();
                  }}
                >
                  {t("common.cancel")}
                </Button>
                {skipCaptchaUiState === "error" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={retrySkipCaptcha}
                  >
                    {t("tasks.skipCaptchaPopupRetry")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  disabled={
                    !skipCaptchaValid ||
                    skipCaptchaUiState === "loading" ||
                    skipCaptchaUiState === "error"
                  }
                  onClick={() => {
                    setSkipCaptchaUiState("loading");
                    setSkipCaptchaError(null);
                    if (skipCaptchaTimerRef.current !== null) {
                      window.clearTimeout(skipCaptchaTimerRef.current);
                    }
                    const delay = 400 + Math.floor(Math.random() * 2400);
                    skipCaptchaTimerRef.current = window.setTimeout(() => {
                      const shouldFail = Math.random() < 0.45;
                      if (shouldFail) {
                        const errorText =
                          Math.random() < 0.5
                            ? t("tasks.skipCaptchaPopupError")
                            : t("tasks.skipCaptchaPopupConnectionError");
                        setSkipCaptchaError(errorText);
                        setSkipCaptchaUiState("error");
                        setSkipCaptchaValid(false);
                        return;
                      }
                      setSkipCaptchaUiState("ready");
                      setSkipCaptchaValid(false);
                      if (skipCaptchaIndex + 1 >= skipCaptchaQueue.length) {
                        setSkipCaptchaIndex(skipCaptchaQueue.length);
                        setSkipCaptchaAutoConfirm(true);
                        return;
                      }
                      setSkipCaptchaIndex((current) => current + 1);
                    }, delay);
                  }}
                >
                  {skipCaptchaIndex + 1 >= skipCaptchaQueue.length
                    ? t("tasks.skipCaptchaPopupDone")
                    : t("tasks.skipCaptchaPopupNext")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={pendingTaskAction?.kind === "skip" && isSkipFinalDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setPendingTaskAction(null);
              resetSkipCaptchaState();
              return;
            }
            setIsSkipFinalDialogOpen(true);
          }}
        >
          <DialogContent className="sm:max-w-sm overflow-hidden border border-rose-900/60 bg-slate-950/95 p-6 text-rose-100 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <div className="relative flex min-h-[240px] flex-col items-center justify-center text-center">
              <DialogHeader>
                <DialogTitle className="text-2xl font-semibold text-rose-200">
                  Skippen?
                </DialogTitle>
                <DialogDescription className="text-rose-300/80">
                  Wirklich sicher? Dann druck zehnmal.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-8 flex w-full items-center justify-center">
                <Button
                  type="button"
                  size="sm"
                  className="h-6 w-10 rounded-full bg-rose-600 text-[10px] font-semibold uppercase tracking-wide text-white shadow-[0_0_18px_rgba(244,63,94,0.55)] transition-transform"
                  style={{
                    transform: `scale(${1 + skipFinalConfirmPresses * 0.45})`,
                  }}
                  onClick={() => {
                    setSkipFinalConfirmPresses((current) => {
                      const next = current + 1;
                      if (next >= 10) {
                        setIsSkipFinalDialogOpen(false);
                        setSkipFinalConfirmPresses(0);
                        void onConfirmTaskAction();
                        return 0;
                      }
                      return next;
                    });
                  }}
                >
                  Ja
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) {
              setTaskBeingEdited(null);
              setEditTaskImageUploadError(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("tasks.editTaskTitle")}</DialogTitle>
              <DialogDescription>
                {t("tasks.editTaskDescription")}
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void editTaskForm.handleSubmit();
              }}
            >
              {editRotationForecast ? (
                <div className="rounded-xl border border-brand-100 bg-brand-50/20 p-3 text-sm text-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("tasks.rotationForecastTitle")}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-brand-100 bg-white/80 p-2 dark:border-slate-700 dark:bg-slate-900/70">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("tasks.rotationForecastNext")}
                      </p>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {editRotationForecast.nextAssigneeId
                          ? userLabel(editRotationForecast.nextAssigneeId)
                          : t("common.memberFallback")}
                      </p>
                    </div>
                    <div className="rounded-lg border border-brand-100 bg-white/80 p-2 dark:border-slate-700 dark:bg-slate-900/70">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("tasks.rotationForecastYou")}
                      </p>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {editRotationForecast.turnsUntilYou === null
                          ? t("tasks.rotationForecastYouMissing")
                          : editRotationForecast.turnsUntilYou === 0
                            ? t("tasks.rotationForecastYouNow")
                            : t("tasks.rotationForecastYouDays", {
                                days:
                                  editRotationForecast.turnsUntilYou *
                                  editRotationForecast.intervalDays,
                              })}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <editTaskForm.Field
                name="title"
                children={(field: {
                  state: { value: string };
                  handleChange: (value: string) => void;
                }) => (
                  <div className="space-y-1">
                    <Label>{t("tasks.titleLabel")}</Label>
                    <Input
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder={t("tasks.placeholder")}
                      required
                    />
                  </div>
                )}
              />

              <editTaskForm.Field
                name="description"
                children={(field: {
                  state: { value: string };
                  handleChange: (value: string) => void;
                }) => (
                  <div className="space-y-1">
                    <Label>{t("tasks.descriptionLabel")}</Label>
                    <textarea
                      className="min-h-[90px] w-full rounded-xl border border-brand-200 bg-white p-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
                      placeholder={t("tasks.descriptionPlaceholder")}
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  </div>
                )}
              />

              <div className="grid gap-2 sm:grid-cols-2">
                <editTaskForm.Field
                  name="frequencyDays"
                  children={(field: {
                    state: { value: string };
                    handleChange: (value: string) => void;
                  }) => (
                    <div className="space-y-1">
                      <Label className="sr-only">
                        {t("tasks.frequencyDays")}
                      </Label>
                      <Select
                        value={editFrequencyMode}
                        onValueChange={(value) => {
                          const nextMode = value === "cron" ? "cron" : "days";
                          setEditFrequencyMode(nextMode);
                          if (nextMode === "days") {
                            field.handleChange(
                              String(
                                deriveFrequencyDaysFromComplex(
                                  editComplexFrequency,
                                ),
                              ),
                            );
                          }
                        }}
                      >
                        <SelectTrigger className="h-auto justify-start border-none p-0 text-sm font-medium text-slate-900 shadow-none hover:bg-transparent dark:text-slate-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="days">
                            {t("tasks.frequencyModeDays")}
                          </SelectItem>
                          <SelectItem value="cron">
                            {t("tasks.frequencyModeCron")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {editFrequencyMode === "days" ? (
                        <InputWithSuffix
                          suffix="d"
                          type="number"
                          min="1"
                          inputMode="numeric"
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          placeholder={t("tasks.frequencyDays")}
                        />
                      ) : (
                        renderComplexFrequencyBuilder(
                          editFrequencyMode,
                          editComplexFrequency,
                          setEditComplexFrequency,
                        )
                      )}
                    </div>
                  )}
                />
                <editTaskForm.Field
                  name="effortPimpers"
                  children={(field: {
                    state: { value: string };
                    handleChange: (value: string) => void;
                  }) => (
                    <div className="space-y-1">
                      <Label>{t("tasks.effortPimpers")}</Label>
                      <InputWithSuffix
                        suffix={<PimpersIcon />}
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={field.state.value}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        placeholder={t("tasks.effortPimpers")}
                      />
                    </div>
                  )}
                />
              </div>
              <Label>{t("tasks.rotationSelectionTitle")}</Label>
              <PersonSelect
                mode="multiple"
                members={members}
                value={editRotationUserIds}
                onChange={(nextSelection) => {
                  const nextSet = new Set(nextSelection);
                  const mergedOrder = [
                    ...editRotationUserIds.filter((memberId) =>
                      nextSet.has(memberId),
                    ),
                    ...nextSelection.filter(
                      (memberId) => !editRotationUserIds.includes(memberId),
                    ),
                  ];
                  setEditRotationUserIds(mergedOrder);
                }}
                currentUserId={userId}
                youLabel={t("common.you")}
                placeholder={t("tasks.rotationSelectionTitle")}
              />

              <Accordion
                type="single"
                collapsible
                className="rounded-xl border border-brand-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
              >
                <AccordionItem value="more" className="border-none">
                  <AccordionTrigger className="py-2">
                    {t("tasks.moreOptions")}
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="space-y-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {renderTaskStateImageField(editTaskForm, {
                          fieldName: "currentStateImageUrl",
                          label: t("tasks.currentStateImageLabel"),
                          previewAlt: t("tasks.currentStateImagePreviewAlt"),
                          uploadInputRef: editCurrentStateUploadInputRef,
                          cameraInputRef: editCurrentStateCameraInputRef,
                          setError: setEditTaskImageUploadError,
                        })}
                        {renderTaskStateImageField(editTaskForm, {
                          fieldName: "targetStateImageUrl",
                          label: t("tasks.targetStateImageLabel"),
                          previewAlt: t("tasks.targetStateImagePreviewAlt"),
                          uploadInputRef: editTargetStateUploadInputRef,
                          cameraInputRef: editTargetStateCameraInputRef,
                          setError: setEditTaskImageUploadError,
                        })}
                      </div>

                      <editTaskForm.Field
                        name="startDate"
                        children={(field: {
                          state: { value: string };
                          handleChange: (value: string) => void;
                        }) => (
                          <div className="space-y-1">
                            <Label>{t("tasks.startDate")}</Label>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Input
                                  type="date"
                                  lang={language}
                                  value={field.state.value}
                                  onChange={(event) =>
                                    field.handleChange(event.target.value)
                                  }
                                  required
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                {t("tasks.startDate")}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      />

                      <editTaskForm.Field
                        name="graceDays"
                        children={(field: {
                          state: { value: string };
                          handleChange: (value: string) => void;
                        }) => (
                          <div className="space-y-1">
                            <Label>{t("tasks.gracePeriodLabel")}</Label>
                            <InputWithSuffix
                              suffix={t("tasks.gracePeriodUnit")}
                              type="number"
                              min="0"
                              step="0.1"
                              inputMode="decimal"
                              value={field.state.value}
                              onChange={(event) =>
                                field.handleChange(event.target.value)
                              }
                              placeholder={t("tasks.gracePeriodPlaceholder")}
                            />
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t("tasks.gracePeriodHint")}
                            </p>
                          </div>
                        )}
                      />

                      <editTaskForm.Field
                        name="delayPenaltyPerDay"
                        children={(field: {
                          state: { value: string };
                          handleChange: (value: string) => void;
                        }) => (
                          <div className="space-y-1">
                            <Label>{t("tasks.delayPenaltyLabel")}</Label>
                            <InputWithSuffix
                              suffix={t("tasks.delayPenaltyUnit")}
                              type="number"
                              min="0"
                              step="0.05"
                              inputMode="decimal"
                              value={field.state.value}
                              onChange={(event) =>
                                field.handleChange(event.target.value)
                              }
                              placeholder={t("tasks.delayPenaltyPlaceholder")}
                            />
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t("tasks.delayPenaltyHint")}
                            </p>
                          </div>
                        )}
                      />

                      <editTaskForm.Field
                        name="prioritizeLowPimpers"
                        children={(field: {
                          state: { value: boolean };
                          handleChange: (value: boolean) => void;
                        }) => (
                          <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {t("tasks.prioritizeLowPimpers")}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {t("tasks.prioritizeLowPimpersHint")}
                              </p>
                            </div>
                            <Switch
                              checked={field.state.value}
                              onCheckedChange={field.handleChange}
                            />
                          </div>
                        )}
                      />

                      <editTaskForm.Field
                        name="assigneeFairnessMode"
                        children={(field: {
                          state: {
                            value: "actual" | "projection" | "expected";
                          };
                          handleChange: (
                            value: "actual" | "projection" | "expected",
                          ) => void;
                        }) => (
                          <div className="space-y-1">
                            <Label>
                              {t("tasks.assigneeFairnessModeLabel")}
                            </Label>
                            <select
                              className="h-10 w-full rounded-xl border border-brand-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                              value={field.state.value}
                              onChange={(event) =>
                                field.handleChange(
                                  event.target.value as "actual" | "projection",
                                )
                              }
                              disabled={
                                !editTaskForm.state.values.prioritizeLowPimpers
                              }
                            >
                              <option value="actual">
                                {t("tasks.assigneeFairnessModeActual")}
                              </option>
                              <option value="projection">
                                {t("tasks.assigneeFairnessModeProjection")}
                              </option>
                              <option value="expected">
                                {t("tasks.assigneeFairnessModeExpected")}
                              </option>
                            </select>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t("tasks.assigneeFairnessModeHint")}
                            </p>
                          </div>
                        )}
                      />

                      {editRotationUserIds.length > 0 ? (
                        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t("tasks.rotationTitle")}
                          </p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            {t("tasks.rotationHint")}
                          </p>
                          <div className="mt-3 space-y-2">
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={onEditRotationDragEnd}
                            >
                              <SortableContext
                                items={editRotationUserIds}
                                strategy={verticalListSortingStrategy}
                              >
                                {editRotationUserIds.map((rotationUserId) => {
                                  const score =
                                    pimperByUserId.get(rotationUserId) ?? 0;
                                  const member = memberById.get(rotationUserId);
                                  const displayName = userLabel(rotationUserId);
                                  const avatarUrl =
                                    member?.avatar_url?.trim() ?? "";
                                  const avatarSrc =
                                    avatarUrl ||
                                    createDiceBearAvatarDataUri(
                                      member?.display_name?.trim() ||
                                        displayName ||
                                        rotationUserId,
                                      member?.user_color,
                                    );
                                  return (
                                    <SortableRotationItem
                                      key={`edit-row-${rotationUserId}`}
                                      id={rotationUserId}
                                      label={userLabel(rotationUserId)}
                                      avatarSrc={avatarSrc}
                                      pimperCount={score}
                                      dragHandleLabel={t("tasks.dragHandle")}
                                    />
                                  );
                                })}
                              </SortableContext>
                            </DndContext>
                          </div>
                        </div>
                      ) : null}
                      {/* {editRotationUserIds.length > 0 ? (
                        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-2 dark:border-slate-700 dark:bg-slate-800/40">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t("tasks.rotationTitle")}
                          </p>
                          {renderRotationAvatarStack(editRotationUserIds)}
                        </div>
                      ) : null} */}
                      {editRotationVariants ? (
                        <div className="rounded-xl border border-brand-100 bg-white/80 p-2 dark:border-slate-700 dark:bg-slate-900/70">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t("tasks.rotationOrderPreviewTitle")}
                          </p>
                          <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">
                                {t("tasks.rotationOrderPreviewTheoretical")}:
                              </span>
                              {renderRotationAvatarStack(
                                adjustPreviewOrder(
                                  editRotationVariants.theoretical,
                                ),
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">
                                {t("tasks.rotationOrderPreviewFairness")}:
                              </span>
                              {renderRotationAvatarStack(
                                adjustPreviewOrder(
                                  editRotationVariants.fairnessActual,
                                ),
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">
                                {t(
                                  "tasks.rotationOrderPreviewFairnessProjection",
                                )}
                                :
                              </span>
                              {renderRotationAvatarStack(
                                adjustPreviewOrder(
                                  editRotationVariants.fairnessProjection,
                                ),
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">
                                {t(
                                  "tasks.rotationOrderPreviewFairnessExpected",
                                
                                )}
                                :
                              </span>
                              {renderRotationAvatarStack(
                                adjustPreviewOrder(
                                  editRotationVariants.fairnessExpected,
                                ),
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {editFormError ? (
                <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                  {editFormError}
                </p>
              ) : null}
              {editTaskImageUploadError ? (
                <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                  {editTaskImageUploadError}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setTaskBeingEdited(null);
                    setEditFormError(null);
                    setEditRotationUserIds([]);
                  }}
                >
                  {t("tasks.discardChanges")}
                </Button>
                <Button type="submit" disabled={busy}>
                  {t("tasks.saveTask")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isDeleteDialogOpen}
          onOpenChange={(open) => {
            setIsDeleteDialogOpen(open);
            if (!open) setTaskPendingDelete(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("tasks.deleteTaskConfirmTitle")}</DialogTitle>
              <DialogDescription>
                {t("tasks.deleteTaskConfirmDescription", {
                  title: taskPendingDelete?.title ?? t("tasks.fallbackTitle"),
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setTaskPendingDelete(null);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={busy}
                className="bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
                onClick={() => void onConfirmDeleteTask()}
              >
                {t("tasks.deleteTask")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={taskDetailsOpen}
          onOpenChange={(open) => {
            setTaskDetailsOpen(open);
            if (!open) setTaskDetailsTask(null);
          }}
        >
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {t("tasks.detailsTitle", {
                  title: taskDetailsTask?.title ?? t("tasks.fallbackTitle")
                })}
              </DialogTitle>
              <DialogDescription>{t("tasks.detailsDescription")}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-xl border border-brand-100 bg-white/90 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("tasks.detailsNextLoop")}
                </p>
                {taskDetailsLoop.length > 0 ? (
                  <ul className="space-y-1">
                    {taskDetailsLoop.map((entry) => (
                      <li key={`loop-${entry.memberId}-${entry.date.toISOString()}`} className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <MemberAvatar
                            src={
                              memberById.get(entry.memberId)?.avatar_url?.trim() ||
                              createDiceBearAvatarDataUri(
                                getMemberAvatarSeed(
                                  entry.memberId,
                                  memberById.get(entry.memberId)?.display_name
                                ),
                                memberById.get(entry.memberId)?.user_color
                              )
                            }
                            alt={userLabel(entry.memberId)}
                            isVacation={memberById.get(entry.memberId)?.vacation_mode ?? false}
                            className="h-6 w-6 rounded-full border border-brand-200 dark:border-slate-700"
                          />
                          <span className="truncate text-slate-900 dark:text-slate-100">
                            {userLabel(entry.memberId)}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {formatShortDay(entry.date.toISOString().slice(0, 10), language, entry.date.toISOString().slice(0, 10))}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("tasks.detailsLoopEmpty")}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-brand-100 bg-white/90 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("tasks.detailsStats")}
                </p>
                {taskDetailsStats ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-100 bg-white p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {t("tasks.detailsStatsTotal")}
                      </p>
                      <p>{taskDetailsStats.total}</p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-white p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {t("tasks.detailsStatsOnTime")}
                      </p>
                      <p>{Math.round(taskDetailsStats.onTimeRate * 100)}%</p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-white p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {t("tasks.detailsStatsDelay")}
                      </p>
                      <p>{formatDelayLabel(taskDetailsStats.avgDelayMinutes)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-white p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {t("tasks.detailsStatsRating")}
                      </p>
                      <p>
                        {taskDetailsStats.ratingAverage != null
                          ? `${taskDetailsStats.ratingAverage.toFixed(2)} (${taskDetailsStats.ratingCount})`
                          : "—"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("tasks.detailsStatsEmpty")}</p>
                )}
              </div>

              <div className="rounded-xl border border-brand-100 bg-white/90 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("tasks.detailsHistory")}
                </p>
                {taskDetailsCompletions.length > 0 ? (
                  <ul className="space-y-1">
                    {taskDetailsCompletions.slice(0, 8).map((entry) => (
                      <li key={`history-${entry.id}`} className="flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <p className="truncate text-slate-900 dark:text-slate-100">
                            {userLabel(entry.user_id)}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {formatDateTime(entry.completed_at, language, entry.completed_at)}
                          </p>
                        </div>
                        <div className="shrink-0">
                          <StarRating
                            value={entry.my_rating ?? 0}
                            displayValue={entry.rating_average ?? 0}
                            disabled={
                              busy ||
                              !(
                                entry.user_id !== userId &&
                                taskDetailsCompletions[0]?.id === entry.id
                              )
                            }
                            onChange={(rating) =>
                              void onRateTaskCompletion(entry.id, rating)
                            }
                            getLabel={(rating) => t("tasks.rateAction", { rating })}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("tasks.detailsHistoryEmpty")}</p>
                )}
              </div>

              <div className="rounded-xl border border-brand-100 bg-white/90 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("tasks.detailsKingTitle")}
                </p>
                {taskDetailsKing ? (
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex min-w-0 items-center gap-2">
                      <MemberAvatar
                        src={
                          memberById.get(taskDetailsKing.userId)?.avatar_url?.trim() ||
                          createDiceBearAvatarDataUri(
                            getMemberAvatarSeed(
                              taskDetailsKing.userId,
                              memberById.get(taskDetailsKing.userId)?.display_name
                            ),
                            memberById.get(taskDetailsKing.userId)?.user_color
                          )
                        }
                        alt={userLabel(taskDetailsKing.userId)}
                        isVacation={memberById.get(taskDetailsKing.userId)?.vacation_mode ?? false}
                        className="h-6 w-6 rounded-full border border-brand-200 dark:border-slate-700"
                      />
                      <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                        {userLabel(taskDetailsKing.userId)}
                      </span>
                    </div>
                    <span>
                      {t("tasks.pimpersValue", { count: Number(taskDetailsKing.totalPimpers.toFixed(2)) })}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("tasks.detailsKingEmpty")}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-brand-100 bg-white/90 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("tasks.detailsReliabilityTitle")}
                </p>
                {taskDetailsUserStats.length > 0 ? (
                  <ul className="space-y-1 text-xs">
                    {[...taskDetailsUserStats]
                      .sort((a, b) => b.onTimeRate - a.onTimeRate || a.avgDelayMinutes - b.avgDelayMinutes)
                      .map((entry) => (
                        <li key={`reliability-${entry.userId}`} className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <MemberAvatar
                              src={
                                memberById.get(entry.userId)?.avatar_url?.trim() ||
                                createDiceBearAvatarDataUri(
                                  getMemberAvatarSeed(
                                    entry.userId,
                                    memberById.get(entry.userId)?.display_name
                                  ),
                                  memberById.get(entry.userId)?.user_color
                                )
                              }
                              alt={userLabel(entry.userId)}
                              isVacation={memberById.get(entry.userId)?.vacation_mode ?? false}
                              className="h-5 w-5 rounded-full border border-brand-200 dark:border-slate-700"
                            />
                            <span className="truncate text-slate-900 dark:text-slate-100">
                              {userLabel(entry.userId)}
                            </span>
                          </div>
                          <span className="text-slate-500 dark:text-slate-400">
                            {t("tasks.detailsReliabilityRate", {
                              rate: Math.round(entry.onTimeRate * 100)
                            })}{" "}
                            · {t("tasks.detailsReliabilityDelay", { value: formatDelayLabel(entry.avgDelayMinutes) })}
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("tasks.detailsReliabilityEmpty")}
                  </p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={taskPendingToggleActive !== null}
          onOpenChange={(open) => {
            if (!open) setTaskPendingToggleActive(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("tasks.confirmDeactivateTitle")}</DialogTitle>
              <DialogDescription>
                {t("tasks.confirmDeactivateDescription", {
                  title:
                    taskPendingToggleActive?.title ?? t("tasks.fallbackTitle"),
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTaskPendingToggleActive(null)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={busy}
                className="bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
                onClick={() => void onConfirmToggleActiveTask()}
              >
                {t("tasks.confirmDeactivateAction")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {calendarCard}
      </div>
    </TooltipProvider>
  );
};
