import { type CSSProperties, type RefObject, useRef, useState, useEffect, useMemo } from "react";
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
  Coffee,
  Flame,
  Frown,
  MoonStar,
  Medal,
  MoreHorizontal,
  Plus,
  Sparkles as SparklesIcon,
  X
} from "lucide-react";
import SparklesEffect from "react-sparkle";
import { Bar } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import type {
  HouseholdMember,
  HouseholdMemberPimpers,
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
import { PimpersIcon } from "../../components/pimpers-icon";
import { PersonSelect } from "../../components/person-select";
import { SectionPanel } from "../../components/ui/section-panel";
import { StarRating } from "../../components/ui/star-rating";
import { Switch } from "../../components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import { MemberAvatar } from "../../components/member-avatar";
import { useSmartSuggestions } from "../../hooks/use-smart-suggestions";
import { formatDateTime, formatShortDay, isDueNow } from "../../lib/date";
import { createDiceBearAvatarDataUri } from "../../lib/avatar";
import { createMemberLabelGetter } from "../../lib/member-label";
import { SortableRotationItem } from "./components/SortableRotationItem";
import { useTaskSuggestions, type TaskSuggestion } from "./hooks/use-task-suggestions";
import { buildCalendarEntriesByDay, buildCompletionSpansByDay, buildMonthGrid, dayKey, startOfMonth } from "./tasks-calendar";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ChartTooltip,
  Legend
);

interface TasksTabProps {
  section?: "overview" | "stats" | "history" | "settings";
  tasks: TaskItem[];
  completions: TaskCompletion[];
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
  onUpdateMemberTaskLaziness: (targetUserId: string, taskLazinessFactor: number) => Promise<void>;
  onResetHouseholdPimpers: () => Promise<void>;
  canManageTaskLaziness: boolean;
}

type PendingTaskAction = {
  kind: "skip" | "takeover" | "complete";
  task: TaskItem;
};

type TaskFormValues = {
  title: string;
  description: string;
  currentStateImageUrl: string;
  targetStateImageUrl: string;
  startDate: string;
  frequencyDays: string;
  effortPimpers: string;
  prioritizeLowPimpers: boolean;
  assigneeFairnessMode: "actual" | "projection";
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
  prioritizeLowPimpers: true,
  assigneeFairnessMode: "actual"
});

const MAX_TASK_IMAGE_DIMENSION = 1600;
const MAX_TASK_IMAGE_SIZE_MB = 0.9;
const TASK_IMAGE_QUALITY = 0.78;

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
  t: (key: string, options?: Record<string, unknown>) => string
) => {
  const dueAt = new Date(dueAtIso);
  if (Number.isNaN(dueAt.getTime())) return t("tasks.noDate");

  const diffMs = dueAt.getTime() - Date.now();
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

export const TasksTab = ({
  section = "overview",
  tasks,
  completions,
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
  onUpdateMemberTaskLaziness,
  onResetHouseholdPimpers,
  canManageTaskLaziness
}: TasksTabProps) => {
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
  const [isResetPimpersDialogOpen, setIsResetPimpersDialogOpen] = useState(false);
  const [lazinessDraftByUserId, setLazinessDraftByUserId] = useState<Record<string, number>>({});
  const [statsForecastTaskId, setStatsForecastTaskId] = useState<string>("");
  const [statsTaskFilterId, setStatsTaskFilterId] = useState<string>("all");
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => startOfMonth(new Date()));
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [openCalendarTooltipDay, setOpenCalendarTooltipDay] = useState<string | null>(null);
  const [skipChallengeAnswerInput, setSkipChallengeAnswerInput] = useState("");
  const addCurrentStateUploadInputRef = useRef<HTMLInputElement | null>(null);
  const addTargetStateUploadInputRef = useRef<HTMLInputElement | null>(null);
  const editCurrentStateUploadInputRef = useRef<HTMLInputElement | null>(null);
  const editTargetStateUploadInputRef = useRef<HTMLInputElement | null>(null);
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

      const input: NewTaskInput = {
        title: trimmedTitle,
        description: value.description.trim(),
        currentStateImageUrl: value.currentStateImageUrl.trim() || null,
        targetStateImageUrl: value.targetStateImageUrl.trim() || null,
        startDate: value.startDate,
        frequencyDays: Number.isFinite(parsedFrequencyDays) ? Math.max(1, Math.floor(parsedFrequencyDays)) : 7,
        effortPimpers: Number.isFinite(parsedEffort) ? Math.max(1, Math.floor(parsedEffort)) : 1,
        prioritizeLowPimpers: value.prioritizeLowPimpers,
        assigneeFairnessMode: value.assigneeFairnessMode,
        rotationUserIds
      };

      setFormError(null);
      setTaskImageUploadError(null);
      await onAdd(input);
      formApi.reset();
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

      const input: NewTaskInput = {
        title: trimmedTitle,
        description: value.description.trim(),
        currentStateImageUrl: value.currentStateImageUrl.trim() || null,
        targetStateImageUrl: value.targetStateImageUrl.trim() || null,
        startDate: value.startDate,
        frequencyDays: Number.isFinite(parsedFrequencyDays) ? Math.max(1, Math.floor(parsedFrequencyDays)) : 7,
        effortPimpers: Number.isFinite(parsedEffort) ? Math.max(1, Math.floor(parsedEffort)) : 1,
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

      if (validUserIds.has(userId)) return [userId];

      const firstMember = members[0]?.user_id;
      return firstMember ? [firstMember] : [];
    });
  }, [members, userId]);

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

  useEffect(() => {
    setLazinessDraftByUserId((current) => {
      const next: Record<string, number> = {};
      members.forEach((member) => {
        next[member.user_id] =
          typeof current[member.user_id] === "number"
            ? current[member.user_id]
            : Number.isFinite(member.task_laziness_factor)
              ? member.task_laziness_factor
              : 1;
      });
      return next;
    });
  }, [members]);

  const pimperByUserId = useMemo(() => {
    const map = new Map<string, number>();
    memberPimpers.forEach((entry) => map.set(entry.user_id, Number(entry.total_pimpers)));
    return map;
  }, [memberPimpers]);
  const memberById = useMemo(() => {
    const map = new Map<string, HouseholdMember>();
    members.forEach((member) => map.set(member.user_id, member));
    return map;
  }, [members]);
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

  const taskLazinessMeta = useMemo(
    () => [
      { max: 0.1, icon: MoonStar, label: t("tasks.lazinessLevel1"), className: "text-slate-500 dark:text-slate-300" },
      { max: 0.35, icon: MoonStar, label: t("tasks.lazinessLevel2"), className: "text-slate-500 dark:text-slate-300" },
      { max: 0.6, icon: Coffee, label: t("tasks.lazinessLevel3"), className: "text-amber-600 dark:text-amber-300" },
      { max: 0.85, icon: Coffee, label: t("tasks.lazinessLevel4"), className: "text-amber-600 dark:text-amber-300" },
      { max: 1.1, icon: SparklesIcon, label: t("tasks.lazinessLevel5"), className: "text-emerald-600 dark:text-emerald-300" },
      { max: 1.35, icon: SparklesIcon, label: t("tasks.lazinessLevel6"), className: "text-emerald-600 dark:text-emerald-300" },
      { max: 1.6, icon: SparklesIcon, label: t("tasks.lazinessLevel7"), className: "text-cyan-600 dark:text-cyan-300" },
      { max: 1.85, icon: Flame, label: t("tasks.lazinessLevel8"), className: "text-cyan-600 dark:text-cyan-300" },
      { max: 2.01, icon: Flame, label: t("tasks.lazinessLevel9"), className: "text-indigo-600 dark:text-indigo-300" }
    ],
    [t]
  );

  const getLazinessFactor = (member: HouseholdMember) =>
    Math.min(2, Math.max(0, Number.isFinite(member.task_laziness_factor) ? member.task_laziness_factor : 1));
  const getScaledPimpers = (rawPimpers: number, lazinessFactor: number) =>
    lazinessFactor <= 0 ? null : rawPimpers / lazinessFactor;
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
        const projectedTotalScaled =
          lazinessFactor <= 0 ? null : (currentPimpers + projectedUntilTurn) / Math.max(lazinessFactor, 0.0001);

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
  }, [activeForecastTasks, members, pimperByUserId, statsFilteredTasks]);
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
  }, [members, statsFilteredCompletions]);
  const sortedMemberRows = useMemo(
    () =>
      [...statsMemberRows].sort(
        (a, b) => (a.scaled_pimpers ?? 0) - (b.scaled_pimpers ?? 0) || a.user_id.localeCompare(b.user_id)
      ),
    [statsMemberRows]
  );
  const resolveLazinessMeta = (value: number) =>
    taskLazinessMeta.find((entry) => value <= entry.max) ?? taskLazinessMeta[taskLazinessMeta.length - 1];
  const onCommitTaskLaziness = async (targetUserId: string, value: number) => {
    const clamped = Math.min(2, Math.max(0, value));
    await onUpdateMemberTaskLaziness(targetUserId, Number(clamped.toFixed(1)));
  };
  const onConfirmResetHouseholdPimpers = async () => {
    await onResetHouseholdPimpers();
    setIsResetPimpersDialogOpen(false);
  };
  const formatScaledPimpers = (value: number | null | undefined) =>
    value === null || value === undefined ? "-" : Number(value.toFixed(2)).toString();
  const renderSparkleIcon = (Icon: (props: { className?: string }) => React.ReactNode) => {
    const icon = <Icon className="h-3.5 w-3.5" />;
    if (Icon !== SparklesIcon) return icon;
    return (
      <span className="relative inline-flex h-4 w-4 items-center justify-center">
        {icon}
          <SparklesEffect
            color="white"
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
          <div className="relative">
            <button
              type="button"
              className="relative inline-flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border border-brand-200 bg-brand-50 text-slate-600 transition hover:border-brand-300 hover:bg-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
              onClick={() => options.uploadInputRef.current?.click()}
              aria-label={options.label}
              title={options.label}
            >
              {field.state.value.trim().length > 0 ? (
                <span
                  aria-label={options.previewAlt}
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${field.state.value})` }}
                />
              ) : null}
              <span className="absolute inset-0 bg-gradient-to-r from-slate-900/25 via-slate-900/5 to-slate-900/30" />
              <span className="absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 dark:bg-slate-900/90 dark:text-slate-200">
                <Camera className="h-4 w-4" />
              </span>
            </button>
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
    items: allTaskSuggestions,
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
    completionRows.forEach((entry) => {
      const current = byUser.get(entry.user_id) ?? { totalDelay: 0, count: 0 };
      byUser.set(entry.user_id, {
        totalDelay: current.totalDelay + Math.max(0, entry.delay_minutes),
        count: current.count + 1
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

    return {
      dueTasksCount: dueTasks.length,
      overdueTasksCount: overdueTasks.length,
      overallDelayMinutes,
      memberRows
    };
  }, [members, statsFilteredCompletions, statsFilteredTasks]);
  const formatDelayLabel = (minutes: number) => {
    if (minutes < 60) return t("tasks.delayMinutesValue", { count: Math.round(minutes) });
    if (minutes < 24 * 60) return t("tasks.delayHoursValue", { count: Number((minutes / 60).toFixed(1)) });
    return t("tasks.delayDaysValue", { count: Number((minutes / (24 * 60)).toFixed(1)) });
  };

  const visibleTasks = useMemo(() => {
    const active: TaskItem[] = [];
    const inactive: TaskItem[] = [];

    tasks.forEach((task) => {
      if (task.is_active) active.push(task);
      else inactive.push(task);
    });

    return [...active, ...inactive];
  }, [tasks]);

  const lazinessCard = showSettings ? (
    <Card className="mb-4">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{t("tasks.lazinessTitle")}</CardTitle>
            <CardDescription>{t("tasks.lazinessDescription")}</CardDescription>
          </div>
          {canManageTaskLaziness ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setIsResetPimpersDialogOpen(true)}
            >
              {t("tasks.resetPimpers")}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {members.map((member) => {
            const draftValue = lazinessDraftByUserId[member.user_id];
            const sliderValue = Number.isFinite(draftValue) ? Math.min(2, Math.max(0, draftValue)) : getLazinessFactor(member);
            const rawPimpers = pimperByUserId.get(member.user_id) ?? 0;
            const scaledPimpers = getScaledPimpers(rawPimpers, sliderValue);
            const level = resolveLazinessMeta(sliderValue);
            const LevelIcon = level.icon;
            const hue = Math.round((sliderValue / 2) * 230);
            const sliderStyle = {
              "--slider-gradient": "linear-gradient(90deg, #64748b 0%, #f59e0b 28%, #22c55e 50%, #06b6d4 75%, #4f46e5 100%)",
              "--slider-thumb": `hsl(${hue} 78% 44%)`
            } as CSSProperties;
            const canEdit = canManageTaskLaziness || member.user_id === userId;

            return (
              <li
                key={`laziness-${member.user_id}`}
                className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 dark:border-slate-700 dark:bg-slate-800/60"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{userLabel(member.user_id)}</span>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {`${Math.round(sliderValue * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.01}
                  value={sliderValue}
                  disabled={!canEdit || busy}
                  onChange={(event) => {
                    const raw = Number(event.target.value);
                    const snapped = raw >= 0.95 && raw <= 1.05 ? 1 : Math.round(raw * 100) / 100;
                    setLazinessDraftByUserId((current) => ({ ...current, [member.user_id]: snapped }));
                  }}
                  onMouseUp={() => {
                    void onCommitTaskLaziness(member.user_id, sliderValue);
                  }}
                  onTouchEnd={() => {
                    void onCommitTaskLaziness(member.user_id, sliderValue);
                  }}
                  className="common-factor-slider w-full"
                  style={sliderStyle}
                  aria-label={t("tasks.lazinessTitle")}
                />
                <div className="mt-1 grid grid-cols-3 items-center text-[11px] font-semibold">
                  <span className="text-left text-slate-500 dark:text-slate-300">0%</span>
                  <span className="text-center text-emerald-700 dark:text-emerald-400">100%</span>
                  <span className="text-right text-indigo-600 dark:text-indigo-300">200%</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold ${level.className}`}>
                    {renderSparkleIcon(LevelIcon)}
                    {level.label}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {scaledPimpers === null
                      ? t("tasks.lazinessScaledPimpersHidden")
                      : t("tasks.lazinessScaledPimpersValue", { value: scaledPimpers.toFixed(2) })}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
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
    const lazinessByUserId = new Map(members.map((member) => [member.user_id, getLazinessFactor(member)]));
    const editedTaskId = taskBeingEdited?.id ?? "";
    const parsedFrequency = Number(editTaskForm.state.values.frequencyDays);
    const intervalDays = Number.isFinite(parsedFrequency) ? Math.max(1, Math.floor(parsedFrequency)) : Math.max(1, taskBeingEdited?.frequency_days ?? 7);
    const assigneeIndex = taskBeingEdited?.assignee_id ? theoretical.indexOf(taskBeingEdited.assignee_id) : -1;
    const currentIndex = assigneeIndex >= 0 ? assigneeIndex : 0;

    const projectedUntilTurnByUserId = new Map<string, number>();
    theoretical.forEach((rotationUserId, index) => {
      const turnsUntilTurn = index >= currentIndex ? index - currentIndex : theoretical.length - currentIndex + index;
      const horizonDays = turnsUntilTurn * intervalDays;
      const projectedUntilTurn = tasks.reduce((sum, otherTask) => {
        if (!otherTask.is_active || otherTask.id === editedTaskId) return sum;
        if (!otherTask.rotation_user_ids.includes(rotationUserId) || otherTask.rotation_user_ids.length === 0) return sum;

        const otherIntervalDays = Math.max(1, otherTask.frequency_days);
        const expectedOccurrences = Math.max(0, Math.floor(horizonDays / otherIntervalDays));
        const share = 1 / otherTask.rotation_user_ids.length;
        return sum + expectedOccurrences * Math.max(1, otherTask.effort_pimpers) * share;
      }, 0);

      projectedUntilTurnByUserId.set(rotationUserId, projectedUntilTurn);
    });

    const fairnessActual = [...theoretical].sort((left, right) => {
      const leftPimpers = pimperByUserId.get(left) ?? 0;
      const rightPimpers = pimperByUserId.get(right) ?? 0;
      const leftFactor = Math.max(lazinessByUserId.get(left) ?? 1, 0.0001);
      const rightFactor = Math.max(lazinessByUserId.get(right) ?? 1, 0.0001);
      const leftScore = leftPimpers / leftFactor;
      const rightScore = rightPimpers / rightFactor;
      if (leftScore !== rightScore) return leftScore - rightScore;
      return (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0);
    });

    const fairnessProjection = [...theoretical].sort((left, right) => {
      const leftPimpers = pimperByUserId.get(left) ?? 0;
      const rightPimpers = pimperByUserId.get(right) ?? 0;
      const leftProjected = projectedUntilTurnByUserId.get(left) ?? 0;
      const rightProjected = projectedUntilTurnByUserId.get(right) ?? 0;
      const leftFactor = Math.max(lazinessByUserId.get(left) ?? 1, 0.0001);
      const rightFactor = Math.max(lazinessByUserId.get(right) ?? 1, 0.0001);
      const leftScore = (leftPimpers + leftProjected) / leftFactor;
      const rightScore = (rightPimpers + rightProjected) / rightFactor;
      if (leftScore !== rightScore) return leftScore - rightScore;
      return (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0);
    });

    return {
      theoretical,
      fairnessActual,
      fairnessProjection
    };
  }, [editRotationUserIds, editTaskForm.state.values.frequencyDays, members, pimperByUserId, taskBeingEdited, tasks]);

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
          );
        return (
          <MemberAvatar
            key={`rotation-avatar-${memberId}-${index}`}
            src={avatarSrc}
            alt={displayName}
            isVacation={member?.vacation_mode ?? false}
            className={`h-7 w-7 rounded-full border-2 border-white bg-brand-100 text-[11px] font-semibold text-brand-800 dark:border-slate-900 dark:bg-brand-900 dark:text-brand-100 ${
              index > 0 ? "-ml-2" : ""
            }`}
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
    editTaskForm.setFieldValue("title", task.title);
    editTaskForm.setFieldValue("description", task.description ?? "");
    editTaskForm.setFieldValue("currentStateImageUrl", task.current_state_image_url ?? "");
    editTaskForm.setFieldValue("targetStateImageUrl", task.target_state_image_url ?? "");
    editTaskForm.setFieldValue("startDate", task.start_date);
    editTaskForm.setFieldValue("frequencyDays", String(task.frequency_days));
    editTaskForm.setFieldValue("effortPimpers", String(task.effort_pimpers));
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

  const onConfirmTaskAction = async () => {
    if (!pendingTaskAction) return;
    if (pendingTaskAction.kind === "skip" && !isSkipMathChallengeSolved) return;

    const { kind, task } = pendingTaskAction;
    if (kind === "skip") {
      await onSkip(task);
    } else if (kind === "takeover") {
      await onTakeover(task);
    } else {
      await onComplete(task);
    }

    setPendingTaskAction(null);
  };

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
                            const avatarSrc = avatarUrl || createDiceBearAvatarDataUri(member?.display_name?.trim() || displayName || span.userId);
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
                                : avatarUrl || createDiceBearAvatarDataUri(member?.display_name?.trim() || displayName || memberId);

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
                              <Label>{t("tasks.frequencyDays")}</Label>
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
                                  previewAlt: t("tasks.currentStateImagePreviewAlt"),
                                  uploadInputRef: addCurrentStateUploadInputRef,
                                  setError: setTaskImageUploadError,
                                })}
                                {renderTaskStateImageField(taskForm, {
                                  fieldName: "targetStateImageUrl",
                                  label: t("tasks.targetStateImageLabel"),
                                  previewAlt: t("tasks.targetStateImagePreviewAlt"),
                                  uploadInputRef: addTargetStateUploadInputRef,
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
                                    <Input
                                      type="date"
                                      lang={language}
                                      value={field.state.value}
                                      onChange={(event) =>
                                        field.handleChange(event.target.value)
                                      }
                                      title={t("tasks.startDate")}
                                      required
                                    />
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
                                  state: { value: "actual" | "projection" };
                                  handleChange: (value: "actual" | "projection") => void;
                                }) => (
                                  <div className="space-y-1">
                                    <Label>{t("tasks.assigneeFairnessModeLabel")}</Label>
                                    <select
                                      className="h-10 w-full rounded-xl border border-brand-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                      value={field.state.value}
                                      onChange={(event) =>
                                        field.handleChange(
                                          event.target.value as "actual" | "projection",
                                        )
                                      }
                                      disabled={
                                        !taskForm.state.values.prioritizeLowPimpers
                                      }
                                    >
                                      <option value="actual">
                                        {t("tasks.assigneeFairnessModeActual")}
                                      </option>
                                      <option value="projection">
                                        {t("tasks.assigneeFairnessModeProjection")}
                                      </option>
                                    </select>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      {t("tasks.assigneeFairnessModeHint")}
                                    </p>
                                  </div>
                                )}
                              />
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>

                      <SectionPanel className="bg-brand-50/40">
                        <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {t("tasks.rotationTitle")}
                        </p>
                        <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">
                          {t("tasks.rotationHint")}
                        </p>

                        {members.length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t("tasks.noMembers")}
                          </p>
                        ) : null}

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
                                (memberId) =>
                                  !rotationUserIds.includes(memberId),
                              ),
                            ];
                            setRotationUserIds(mergedOrder);
                          }}
                          currentUserId={userId}
                          youLabel={t("common.you")}
                          placeholder={t("tasks.rotationTitle")}
                        />

                        {rotationUserIds.length > 0 ? (
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
                              {rotationUserIds.map((rotationUserId) => {
                                const score =
                                  pimperByUserId.get(rotationUserId) ?? 0;
                                const member = memberById.get(rotationUserId);
                                const displayName = userLabel(rotationUserId);
                                const avatarUrl = member?.avatar_url?.trim() ?? "";
                                const avatarSrc =
                                  avatarUrl ||
                                  createDiceBearAvatarDataUri(
                                    member?.display_name?.trim() ||
                                      displayName ||
                                      rotationUserId,
                                  );
                                return (
                                  <SortableRotationItem
                                    key={rotationUserId}
                                    id={rotationUserId}
                                    label={userLabel(rotationUserId)}
                                    avatarSrc={avatarSrc}
                                    isVacation={member?.vacation_mode ?? false}
                                    pimperCount={score}
                                    dragHandleLabel={t("tasks.dragHandle")}
                                  />
                                );
                              })}
                              </SortableContext>
                            </DndContext>
                          </div>
                        ) : null}
                      </SectionPanel>

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
                const isDue =
                  task.is_active && !task.done && isDueNow(task.due_at);
                const isAssignedToCurrentUser = task.assignee_id === userId;
                const canComplete = isDue && isAssignedToCurrentUser && !busy;
                const canSkip = isDue && isAssignedToCurrentUser && !busy;
                const canTakeover =
                  isDue &&
                  task.assignee_id !== null &&
                  !isAssignedToCurrentUser &&
                  !busy;
                const primaryImageUrl = isDue
                  ? task.current_state_image_url
                  : task.target_state_image_url;
                const secondaryImageUrl = isDue
                  ? task.target_state_image_url
                  : null;
                const hasPrimaryImage = Boolean(primaryImageUrl);
                const hasSecondaryImage = Boolean(secondaryImageUrl);
                const dueChipText = relativeDueChipLabel(task.due_at, t);
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
                          className="absolute inset-0 bg-white/85 dark:bg-slate-900/80"
                        />
                      </>
                    ) : null}
                    <CardContent className="relative z-10">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <MemberAvatar
                              src={assigneeAvatarSrc}
                              alt={assigneeText}
                              isVacation={assigneeMember?.vacation_mode ?? false}
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
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {t("tasks.assignee", { value: assigneeText })}
                              </p>
                            </div>
                          </div>

                          {task.description ? (
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              {task.description}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                className={
                                  isDue
                                    ? "whitespace-nowrap bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100"
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
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center">
                          <div className="flex items-center -space-x-2 text-brand-600 dark:text-brand-300">
                            {Array.from({
                              length: Math.min(task.effort_pimpers, 6),
                            }).map((_, index) => (
                              <span
                                key={`${task.id}-pimper-${index}`}
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/70 bg-white/80 shadow-sm dark:border-slate-900/70 dark:bg-slate-900/70"
                              >
                                <PimpersIcon className="h-3 w-3" />
                              </span>
                            ))}
                          </div>
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
                            count={(3-rank)*6}
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
            </CardContent>
          </Card>
        ) : null}

        {lazinessCard}

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
              <CardTitle>{t("tasks.forecastTitle")}</CardTitle>
              <CardDescription>
                {t("tasks.forecastDescription")}
              </CardDescription>
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
                    <div className="mt-1 grid gap-1 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3">
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
                      <span>
                        {t("tasks.forecastProjectedScore", {
                          value:
                            row.projected_total_scaled === null
                              ? "-"
                              : Number(row.projected_total_scaled.toFixed(2)),
                        })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

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
                {completions.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t("tasks.historyEmpty")}
                  </p>
                ) : null}

                {completions.length > 0 ? (
                  <ul className="space-y-2">
                    {completions.map((entry) => (
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
                          {/* {entry.rating_count > 0 ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t("tasks.ratingSummary", {
                                average: Number(
                                  (entry.rating_average ?? 0).toFixed(1),
                                ),
                                count: entry.rating_count,
                              })}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t("tasks.ratingNoVotes")}
                            </p>
                          )} */}
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
                                          latestCompletionIdByTask.get(entry.task_id) === entry.id
                                        )
                                      }
                                      onChange={(rating) =>
                                        void onRateTaskCompletion(entry.id, rating)
                                      }
                                      getLabel={(rating) =>
                                        t("tasks.rateAction", { rating })
                                      }
                                    />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">
                                    {t("tasks.ratingTooltipCount", { count: entry.rating_count })}
                                  </p>
                                  <p className="text-xs">
                                    {t("tasks.ratingTooltipAverage", {
                                      average: Number((entry.rating_average ?? 0).toFixed(1))
                                    })}
                                  </p>
                                  <p className="text-xs">
                                    {t("tasks.ratingTooltipMine", {
                                      rating: entry.my_rating ?? "-"
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
                    ))}
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
            if (!open) setPendingTaskAction(null);
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="absolute right-3 top-3 h-8 w-8 p-0"
              onClick={() => setPendingTaskAction(null)}
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

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPendingTaskAction(null)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={
                  busy ||
                  (pendingTaskAction?.kind === "skip" &&
                    !isSkipMathChallengeSolved)
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
                {renderTaskStateImageField(editTaskForm, {
                  fieldName: "currentStateImageUrl",
                  label: t("tasks.currentStateImageLabel"),
                  previewAlt: t("tasks.currentStateImagePreviewAlt"),
                  uploadInputRef: editCurrentStateUploadInputRef,
                  setError: setEditTaskImageUploadError,
                })}
                {renderTaskStateImageField(editTaskForm, {
                  fieldName: "targetStateImageUrl",
                  label: t("tasks.targetStateImageLabel"),
                  previewAlt: t("tasks.targetStateImagePreviewAlt"),
                  uploadInputRef: editTargetStateUploadInputRef,
                  setError: setEditTaskImageUploadError,
                })}
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <editTaskForm.Field
                  name="startDate"
                  children={(field: {
                    state: { value: string };
                    handleChange: (value: string) => void;
                  }) => (
                    <div className="space-y-1">
                      <Label>{t("tasks.startDate")}</Label>
                      <Input
                        type="date"
                        lang={language}
                        value={field.state.value}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        title={t("tasks.startDate")}
                        required
                      />
                    </div>
                  )}
                />
                <editTaskForm.Field
                  name="frequencyDays"
                  children={(field: {
                    state: { value: string };
                    handleChange: (value: string) => void;
                  }) => (
                    <div className="space-y-1">
                      <Label>{t("tasks.frequencyDays")}</Label>
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
                  state: { value: "actual" | "projection" };
                  handleChange: (value: "actual" | "projection") => void;
                }) => (
                  <div className="space-y-1">
                    <Label>{t("tasks.assigneeFairnessModeLabel")}</Label>
                    <select
                      className="h-10 w-full rounded-xl border border-brand-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(
                          event.target.value as "actual" | "projection",
                        )
                      }
                      disabled={!editTaskForm.state.values.prioritizeLowPimpers}
                    >
                      <option value="actual">
                        {t("tasks.assigneeFairnessModeActual")}
                      </option>
                      <option value="projection">
                        {t("tasks.assigneeFairnessModeProjection")}
                      </option>
                    </select>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t("tasks.assigneeFairnessModeHint")}
                    </p>
                  </div>
                )}
              />

              <SectionPanel className="bg-brand-50/40">
                <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t("tasks.rotationTitle")}
                </p>
                <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">
                  {t("tasks.rotationHint")}
                </p>

                {members.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t("tasks.noMembers")}
                  </p>
                ) : null}

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
                  placeholder={t("tasks.rotationTitle")}
                />

                {editRotationUserIds.length > 0 ? (
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
                          const score = pimperByUserId.get(rotationUserId) ?? 0;
                          const member = memberById.get(rotationUserId);
                          const displayName = userLabel(rotationUserId);
                          const avatarUrl = member?.avatar_url?.trim() ?? "";
                          const avatarSrc =
                            avatarUrl ||
                            createDiceBearAvatarDataUri(
                              member?.display_name?.trim() ||
                                displayName ||
                                rotationUserId,
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
                ) : null}
              </SectionPanel>

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
              {editRotationUserIds.length > 0 ? (
                <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-2 dark:border-slate-700 dark:bg-slate-800/40">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("tasks.rotationTitle")}
                  </p>
                  {renderRotationAvatarStack(editRotationUserIds)}
                </div>
              ) : null}
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
                      {renderRotationAvatarStack(editRotationVariants.theoretical)}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {t("tasks.rotationOrderPreviewFairness")}:
                      </span>
                      {renderRotationAvatarStack(editRotationVariants.fairnessActual)}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {t("tasks.rotationOrderPreviewFairnessProjection")}:
                      </span>
                      {renderRotationAvatarStack(editRotationVariants.fairnessProjection)}
                    </div>
                  </div>
                </div>
              ) : null}
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
