import { useMemo, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { Camera, Check, Clock3, ImagePlus, MessageSquareMore, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip as ChartTooltip
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import type {
  Household,
  HouseholdMember,
  NewTaskTimeCorrectionProposalInput,
  NewTaskTimeEntryInput,
  TaskComment,
  TaskItem,
  TaskTimeCorrectionProposal,
  TaskTimeEntry
} from "../../lib/types";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { MemberAvatar } from "../../components/member-avatar";
import { StarRating } from "../../components/ui/star-rating";
import { createMemberLabelGetter } from "../../lib/member-label";
import { createDiceBearAvatarDataUri, getMemberAvatarSeed } from "../../lib/avatar";
import { getLastMonthRange } from "../../lib/date";

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTooltip, Legend);

interface TimeTasksPageProps {
  section?: "overview" | "stats" | "history" | "settings";
  household: Household;
  members: HouseholdMember[];
  tasks: TaskItem[];
  entries: TaskTimeEntry[];
  entriesHasMore?: boolean;
  entriesLoadingMore?: boolean;
  comments: TaskComment[];
  correctionProposals: TaskTimeCorrectionProposal[];
  userId: string;
  busy: boolean;
  onAddTaskTimeEntry: (input: NewTaskTimeEntryInput) => Promise<void>;
  onAddTaskComment: (input: { targetType: "task_time_entry"; targetId: string; message: string }) => Promise<void>;
  onDeleteTaskTimeEntry: (entry: TaskTimeEntry) => Promise<void>;
  onUpdateTaskTimeEntry: (entry: TaskTimeEntry, input: NewTaskTimeEntryInput) => Promise<void>;
  onRateTaskTimeEntry: (entryId: string, rating: number) => Promise<void>;
  onLoadMoreEntries?: () => void;
  canResetTaskTimeData?: boolean;
  onResetTaskTimeData?: () => Promise<void>;
  onCreateTaskTimeCorrectionProposal: (input: NewTaskTimeCorrectionProposalInput) => Promise<void>;
  onVoteTaskTimeCorrectionProposal: (proposalId: string, voteType: "approve" | "reject") => Promise<void>;
}

const standardSuggestions = [
  "Bad geputzt",
  "Kueche geputzt",
  "Muell entsorgt",
  "Einkauf verraeumt",
  "Flur gesaugt",
  "Reparatur erledigt",
  "Pflanzen gegossen",
  "WG-Orga"
];

const compressImageToDataUrl = async (file: File) => {
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.8,
    maxWidthOrHeight: 1600,
    useWebWorker: true
  });
  return await imageCompression.getDataUrlFromFile(compressed);
};

const formatHours = (value: number) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2
  }).format(value);

const normalizeJobName = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const effortHourOptions = Array.from({ length: 25 }, (_, index) => index);
const effortMinuteOptions = [0, 15, 30, 45];

const splitEffortValue = (value: string) => {
  const parsed = Number(value.replace(",", "."));
  const totalMinutes = Number.isFinite(parsed)
    ? Math.max(0, Math.min(24 * 60, Math.round((parsed * 60) / 15) * 15))
    : 60;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = hours >= 24 ? 0 : totalMinutes % 60;
  return {
    hours: String(hours),
    minutes: String(minutes)
  };
};

const composeEffortValue = (hoursValue: string, minutesValue: string) => {
  const nextHours = Math.max(0, Math.min(24, Number(hoursValue)));
  const nextMinutes = nextHours >= 24 ? 0 : Math.max(0, Math.min(45, Number(minutesValue)));
  return String((nextHours * 60 + nextMinutes) / 60);
};

const EffortDurationInput = ({
  value,
  onChange,
  disabled,
  hourLabel,
  minuteLabel
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hourLabel: string;
  minuteLabel: string;
}) => {
  const parts = splitEffortValue(value);
  const hourValue = parts.hours;
  const minuteValue = hourValue === "24" ? "0" : parts.minutes;

  return (
    <div className="flex h-11 w-full max-w-[13rem] items-center gap-1 rounded-xl border border-brand-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <Clock3 className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
      <Select
        value={hourValue}
        onValueChange={(nextHours) => onChange(composeEffortValue(nextHours, minuteValue))}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 w-[4.5rem] rounded-md border-0 bg-transparent px-1 py-1 shadow-none focus:ring-0 dark:bg-transparent">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="item-aligned" className="max-h-72">
          {effortHourOptions.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {option} {hourLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-slate-300 dark:text-slate-600">:</span>
      <Select
        value={minuteValue}
        onValueChange={(nextMinutes) => onChange(composeEffortValue(hourValue, nextMinutes))}
        disabled={disabled || hourValue === "24"}
      >
        <SelectTrigger className="h-8 w-[5rem] rounded-md border-0 bg-transparent px-1 py-1 shadow-none focus:ring-0 dark:bg-transparent">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="item-aligned">
          {effortMinuteOptions.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {String(option).padStart(2, "0")} {minuteLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export const TimeTasksPage = ({
  section = "overview",
  // household,
  members,
  tasks,
  entries,
  entriesHasMore = false,
  entriesLoadingMore = false,
  comments,
  correctionProposals,
  userId,
  busy,
  onAddTaskTimeEntry,
  onAddTaskComment,
  onDeleteTaskTimeEntry,
  onUpdateTaskTimeEntry,
  onRateTaskTimeEntry,
  onLoadMoreEntries,
  canResetTaskTimeData = false,
  onResetTaskTimeData,
  onCreateTaskTimeCorrectionProposal,
  onVoteTaskTimeCorrectionProposal
}: TimeTasksPageProps) => {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const suggestionListId = "task-time-entry-suggestions";
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("1");
  const [details, setDetails] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [correctingEntryId, setCorrectingEntryId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editHours, setEditHours] = useState("1");
  const [editDetails, setEditDetails] = useState("");
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.user_id, member])),
    [members]
  );
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

  const suggestions = useMemo(() => {
    const values = new Set<string>();
    standardSuggestions.forEach((entry) => values.add(entry));
    tasks.forEach((task) => values.add(task.title));
    entries.forEach((entry) => {
      if (entry.source === "manual") values.add(entry.description);
    });
    return [...values].filter(Boolean).slice(0, 60);
  }, [entries, tasks]);

  const ranking = useMemo(() => {
    const totals = new Map<string, number>();
    members.forEach((member) => totals.set(member.user_id, 0));
    entries.forEach((entry) => {
      totals.set(entry.user_id, (totals.get(entry.user_id) ?? 0) + entry.hours);
    });
    return [...totals.entries()]
      .map(([memberId, totalHours]) => ({ memberId, totalHours }))
      .sort((a, b) => b.totalHours - a.totalHours || userLabel(a.memberId).localeCompare(userLabel(b.memberId)));
  }, [entries, members, userLabel]);

  const lastMonthRange = useMemo(() => getLastMonthRange(), []);
  const memberOfMonthLabel = useMemo(
    () => new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(lastMonthRange.start),
    [language, lastMonthRange]
  );
  const memberOfMonth = useMemo(() => {
    const start = lastMonthRange.start.getTime();
    const end = lastMonthRange.end.getTime();
    const totals = new Map<string, { hours: number; ratings: number; ratingSum: number; count: number }>();
    entries.forEach((entry) => {
      const ts = new Date(entry.entry_date).getTime();
      if (!Number.isFinite(ts) || ts < start || ts > end) return;
      const current = totals.get(entry.user_id) ?? { hours: 0, ratings: 0, ratingSum: 0, count: 0 };
      totals.set(entry.user_id, {
        hours: current.hours + entry.hours,
        ratings: current.ratings + (entry.rating_count ?? 0),
        ratingSum: current.ratingSum + ((entry.rating_average ?? 0) * (entry.rating_count ?? 0)),
        count: current.count + 1
      });
    });
    return [...totals.entries()]
      .map(([memberId, value]) => ({
        memberId,
        hours: value.hours,
        count: value.count,
        ratingAverage: value.ratings > 0 ? value.ratingSum / value.ratings : null
      }))
      .sort(
        (a, b) =>
          b.hours - a.hours ||
          (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0) ||
          userLabel(a.memberId).localeCompare(userLabel(b.memberId))
      )[0] ?? null;
  }, [entries, lastMonthRange, userLabel]);

  const ratingStats = useMemo(() => {
    let ratingCount = 0;
    let ratingSum = 0;
    entries.forEach((entry) => {
      if (entry.rating_count > 0 && entry.rating_average != null) {
        ratingCount += entry.rating_count;
        ratingSum += entry.rating_average * entry.rating_count;
      }
    });
    return {
      count: ratingCount,
      average: ratingCount > 0 ? ratingSum / ratingCount : null
    };
  }, [entries]);

  const entriesByDay = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((entry) => {
      map.set(entry.entry_date, (map.get(entry.entry_date) ?? 0) + entry.hours);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30);
  }, [entries]);

  const hoursChartData = useMemo(
    () => ({
      labels: entriesByDay.map(([day]) => new Date(day).toLocaleDateString(language, { day: "2-digit", month: "2-digit" })),
      datasets: [
        {
          label: t("tasks.timeHoursChartLabel"),
          data: entriesByDay.map(([, value]) => Number(value.toFixed(2))),
          backgroundColor: "#0f766e"
        }
      ]
    }),
    [entriesByDay, language, t]
  );

  const memberChartData = useMemo(
    () => ({
      labels: ranking.map((entry) => userLabel(entry.memberId)),
      datasets: [
        {
          label: t("tasks.timeRankingChartLabel"),
          data: ranking.map((entry) => Number(entry.totalHours.toFixed(2))),
          backgroundColor: "#14b8a6"
        }
      ]
    }),
    [ranking, t, userLabel]
  );

  const jobStats = useMemo(() => {
    const statsByJob = new Map<
      string,
      {
        name: string;
        count: number;
        totalHours: number;
        members: Map<string, { count: number; totalHours: number }>;
      }
    >();

    entries.forEach((entry) => {
      if (entry.source !== "manual") return;
      const normalizedName = normalizeJobName(entry.description);
      if (!normalizedName) return;
      const current = statsByJob.get(normalizedName) ?? {
        name: entry.description.trim(),
        count: 0,
        totalHours: 0,
        members: new Map<string, { count: number; totalHours: number }>()
      };
      const memberStats = current.members.get(entry.user_id) ?? { count: 0, totalHours: 0 };
      current.count += 1;
      current.totalHours += entry.hours;
      current.members.set(entry.user_id, {
        count: memberStats.count + 1,
        totalHours: memberStats.totalHours + entry.hours
      });
      statsByJob.set(normalizedName, current);
    });

    return [...statsByJob.values()]
      .map((job) => ({
        ...job,
        averageHours: job.count > 0 ? job.totalHours / job.count : 0,
        memberStats: [...job.members.entries()]
          .map(([memberId, value]) => ({
            memberId,
            count: value.count,
            totalHours: value.totalHours,
            averageHours: value.count > 0 ? value.totalHours / value.count : 0
          }))
          .sort(
            (a, b) =>
              b.count - a.count ||
              a.averageHours - b.averageHours ||
              userLabel(a.memberId).localeCompare(userLabel(b.memberId))
          )
      }))
      .sort((a, b) => b.count - a.count || b.totalHours - a.totalHours || a.name.localeCompare(b.name))
      .slice(0, 20);
  }, [entries, userLabel]);

  const satisfactionByMember = useMemo(() => {
    const stats = new Map<string, { ratingCount: number; ratingSum: number; entryCount: number }>();
    members.forEach((member) => stats.set(member.user_id, { ratingCount: 0, ratingSum: 0, entryCount: 0 }));
    entries.forEach((entry) => {
      if (entry.rating_count <= 0 || entry.rating_average == null) return;
      const current = stats.get(entry.user_id) ?? { ratingCount: 0, ratingSum: 0, entryCount: 0 };
      stats.set(entry.user_id, {
        ratingCount: current.ratingCount + entry.rating_count,
        ratingSum: current.ratingSum + entry.rating_average * entry.rating_count,
        entryCount: current.entryCount + 1
      });
    });
    return [...stats.entries()]
      .map(([memberId, value]) => ({
        memberId,
        ratingCount: value.ratingCount,
        entryCount: value.entryCount,
        average: value.ratingCount > 0 ? value.ratingSum / value.ratingCount : null
      }))
      .sort(
        (a, b) =>
          (b.average ?? -1) - (a.average ?? -1) ||
          b.ratingCount - a.ratingCount ||
          userLabel(a.memberId).localeCompare(userLabel(b.memberId))
      );
  }, [entries, members, userLabel]);

  const satisfactionByJob = useMemo(() => {
    const stats = new Map<string, { name: string; ratingCount: number; ratingSum: number; entryCount: number }>();
    entries.forEach((entry) => {
      if (entry.source !== "manual" || entry.rating_count <= 0 || entry.rating_average == null) return;
      const normalizedName = normalizeJobName(entry.description);
      if (!normalizedName) return;
      const current = stats.get(normalizedName) ?? {
        name: entry.description.trim(),
        ratingCount: 0,
        ratingSum: 0,
        entryCount: 0
      };
      stats.set(normalizedName, {
        name: current.name,
        ratingCount: current.ratingCount + entry.rating_count,
        ratingSum: current.ratingSum + entry.rating_average * entry.rating_count,
        entryCount: current.entryCount + 1
      });
    });
    return [...stats.values()]
      .map((value) => ({
        ...value,
        average: value.ratingCount > 0 ? value.ratingSum / value.ratingCount : null
      }))
      .sort(
        (a, b) =>
          (b.average ?? -1) - (a.average ?? -1) ||
          b.ratingCount - a.ratingCount ||
          a.name.localeCompare(b.name)
      )
      .slice(0, 20);
  }, [entries]);

  const myHours = ranking.find((entry) => entry.memberId === userId)?.totalHours ?? 0;
  // const manualEntries = entries.filter((entry) => entry.source === "manual");
  // const vacationCredits = entries.filter((entry) => entry.source === "vacation_credit");
  const visibleEntries = entries;
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const openCorrectionProposals = useMemo(
    () => correctionProposals.filter((proposal) => proposal.status === "open"),
    [correctionProposals]
  );
  const correctionEntry = correctingEntryId ? (entryById.get(correctingEntryId) ?? null) : null;
  const commentsByEntryId = useMemo(() => {
    const map = new Map<string, TaskComment[]>();
    comments
      .filter((comment) => comment.target_type === "task_time_entry" && comment.task_time_entry_id)
      .forEach((comment) => {
        const targetId = comment.task_time_entry_id!;
        map.set(targetId, [...(map.get(targetId) ?? []), comment]);
      });
    return map;
  }, [comments]);

  const handleImageFile = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setImageUrl(dataUrl);
      setUploadError(null);
    } catch {
      setUploadError(t("tasks.timeImageUploadError"));
    }
  };

  const submit = async () => {
    const normalizedDescription = description.trim();
    const parsedHours = Number(hours.replace(",", "."));
    if (!normalizedDescription) {
      setFormError(t("tasks.timeDescriptionError"));
      return;
    }
    if (!Number.isFinite(parsedHours) || parsedHours <= 0 || parsedHours > 24) {
      setFormError(t("tasks.timeHoursError"));
      return;
    }

    setFormError(null);
    await onAddTaskTimeEntry({
      description: normalizedDescription,
      hours: parsedHours,
      details,
      imageUrl
    });
    setDescription("");
    setHours("1");
    setDetails("");
    setImageUrl(null);
  };

  const beginEdit = (entry: TaskTimeEntry) => {
    setEditingEntryId(entry.id);
    setCorrectingEntryId(null);
    setEditDescription(entry.description);
    setEditHours(String(entry.hours));
    setEditDetails(entry.details);
    setEditImageUrl(entry.image_url);
    setCorrectionReason("");
    setEditError(null);
  };

  const beginCorrection = (entry: TaskTimeEntry) => {
    setCorrectingEntryId(entry.id);
    setEditingEntryId(null);
    setEditDescription(entry.description);
    setEditHours(String(entry.hours));
    setEditDetails(entry.details);
    setEditImageUrl(entry.image_url);
    setCorrectionReason("");
    setEditError(null);
  };

  const parseEditInput = () => {
    const normalizedDescription = editDescription.trim();
    const parsedHours = Number(editHours.replace(",", "."));
    if (!normalizedDescription) {
      setEditError(t("tasks.timeDescriptionError"));
      return null;
    }
    if (!Number.isFinite(parsedHours) || parsedHours <= 0 || parsedHours > 24) {
      setEditError(t("tasks.timeHoursError"));
      return null;
    }
    setEditError(null);
    return {
      description: normalizedDescription,
      hours: parsedHours,
      details: editDetails,
      imageUrl: editImageUrl
    };
  };

  const submitEdit = async (entry: TaskTimeEntry) => {
    const input = parseEditInput();
    if (!input) return;
    await onUpdateTaskTimeEntry(entry, input);
    setEditingEntryId(null);
  };

  const submitCorrection = async (entry: TaskTimeEntry) => {
    const input = parseEditInput();
    if (!input) return;
    await onCreateTaskTimeCorrectionProposal({
      taskTimeEntryId: entry.id,
      ...input,
      reason: correctionReason
    });
    setCorrectingEntryId(null);
    setCorrectionReason("");
    setEditError(null);
  };

  const renderEditFields = (entry: TaskTimeEntry) => (
    <div className="mt-3 space-y-3 rounded-lg border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/70">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1">
          <Label>{t("tasks.timeDescriptionLabel")}</Label>
          <Input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} disabled={busy} />
        </div>
        <div className="space-y-1">
          <Label>{t("tasks.timeHoursLabel")}</Label>
          <EffortDurationInput
            value={editHours}
            onChange={setEditHours}
            disabled={busy}
            hourLabel={t("tasks.timeHoursShort")}
            minuteLabel={t("tasks.timeMinutesShort")}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>{t("tasks.timeDetailsLabel")}</Label>
        <textarea
          value={editDetails}
          onChange={(event) => setEditDetails(event.target.value)}
          disabled={busy}
          className="min-h-20 w-full rounded-md border border-brand-100 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>
      {editError ? <p className="text-sm text-rose-600 dark:text-rose-300">{editError}</p> : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setEditingEntryId(null);
            setCorrectingEntryId(null);
          }}
        >
          <X className="mr-2 h-4 w-4" />
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={() => void submitEdit(entry)}
        >
          <Check className="mr-2 h-4 w-4" />
          {t("tasks.timeSaveEdit")}
        </Button>
      </div>
    </div>
  );

  const renderCorrectionProposal = (proposal: TaskTimeCorrectionProposal) => {
    const entry = entryById.get(proposal.task_time_entry_id);
    const approveCount = proposal.votes.filter((vote) => vote.vote_type === "approve").length;
    const rejectCount = proposal.votes.filter((vote) => vote.vote_type === "reject").length;
    const myVote = proposal.votes.find((vote) => vote.user_id === userId)?.vote_type ?? null;
    return (
      <div key={proposal.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("tasks.timeCorrectionProposalTitle", {
                title: entry?.description ?? proposal.proposed_description
              })}
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {t("tasks.timeCorrectionProposalMeta", {
                from: entry ? `${entry.description} (${formatHours(entry.hours)} h)` : "-",
                to: `${proposal.proposed_description} (${formatHours(proposal.proposed_hours)} h)`,
                user: userLabel(proposal.created_by)
              })}
            </p>
            {proposal.reason ? (
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{proposal.reason}</p>
            ) : null}
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t("tasks.timeCorrectionVotes", { approve: approveCount, reject: rejectCount })}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant={myVote === "approve" ? "default" : "outline"}
              disabled={busy}
              onClick={() => void onVoteTaskTimeCorrectionProposal(proposal.id, "approve")}
            >
              <Check className="mr-1 h-4 w-4" />
              {t("tasks.timeCorrectionApprove")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={myVote === "reject" ? "danger" : "outline"}
              disabled={busy}
              onClick={() => void onVoteTaskTimeCorrectionProposal(proposal.id, "reject")}
            >
              <X className="mr-1 h-4 w-4" />
              {t("tasks.timeCorrectionReject")}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const submitComment = async (entryId: string) => {
    const message = (commentDrafts[entryId] ?? "").trim();
    if (!message) return;
    setCommentDrafts((prev) => ({ ...prev, [entryId]: "" }));
    await onAddTaskComment({ targetType: "task_time_entry", targetId: entryId, message });
  };

  const renderComments = (entryId: string) => {
    const entryComments = commentsByEntryId.get(entryId) ?? [];
    return (
      <Accordion type="single" collapsible className="mt-3">
        <AccordionItem value="comments" className="border-none">
          <AccordionTrigger className="py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:no-underline dark:text-slate-400">
            {t("tasks.commentsTitle", { count: entryComments.length })}
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-1">
            <div className="space-y-2">
              {entryComments.length > 0 ? (
                entryComments.map((comment) => {
                  const own = comment.user_id === userId;
                  return (
                    <div key={comment.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                          own
                            ? "bg-brand-600 text-white"
                            : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                        }`}
                      >
                        <p className={`mb-1 text-xs ${own ? "text-brand-50" : "text-slate-500 dark:text-slate-400"}`}>
                          {userLabel(comment.user_id)} | {new Date(comment.created_at).toLocaleString(language)}
                        </p>
                        <p className="whitespace-pre-line break-words">{comment.message}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("tasks.commentsEmpty")}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={commentDrafts[entryId] ?? ""}
                onChange={(event) => setCommentDrafts((prev) => ({ ...prev, [entryId]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitComment(entryId);
                  }
                }}
                placeholder={t("tasks.commentPlaceholder")}
                disabled={busy}
              />
              <Button
                type="button"
                size="sm"
                disabled={busy || !(commentDrafts[entryId] ?? "").trim()}
                onClick={() => void submitComment(entryId)}
              >
                {t("tasks.commentSend")}
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  };

  const renderEntry = (entry: TaskTimeEntry) => {
    const member = memberById.get(entry.user_id);
    const hasImage = Boolean(entry.image_url);
    return (
      <div key={entry.id} className="relative overflow-hidden rounded-lg border border-brand-100 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
        {hasImage ? (
          <>
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${entry.image_url})` }}
            />
            <div aria-hidden="true" className="absolute inset-0 bg-white/60 backdrop-blur-[1px] dark:bg-slate-950/65" />
          </>
        ) : null}
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <MemberAvatar
              src={member?.avatar_url?.trim() || createDiceBearAvatarDataUri(getMemberAvatarSeed(entry.user_id, member?.display_name))}
              alt={userLabel(entry.user_id)}
              className="h-9 w-9 rounded-full"
            />
            <div className="min-w-0">
              <div className={hasImage ? "inline-flex max-w-full flex-col rounded-xl bg-white/75 px-2 py-1 backdrop-blur-md dark:bg-slate-900/70" : ""}>
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {entry.description}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {userLabel(entry.user_id)} | {new Date(entry.entry_date).toLocaleDateString()} | {formatHours(entry.hours)} h
                </p>
              </div>
              {entry.details ? (
                <p className={`mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300 ${
                  hasImage ? "rounded-lg bg-white/75 px-2 py-1 backdrop-blur-md dark:bg-slate-900/70" : ""
                }`}>{entry.details}</p>
              ) : null}
              {entry.source === "vacation_credit" ? (
                <p className={`mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 ${
                  hasImage ? "inline-flex rounded-lg bg-white/75 px-2 py-1 backdrop-blur-md dark:bg-slate-900/70" : ""
                }`}>
                  {t("tasks.timeVacationCredit")}
                </p>
              ) : null}
              <div className={`mt-2 flex flex-wrap items-center gap-2 ${
                hasImage ? "rounded-lg bg-white/75 px-2 py-1 backdrop-blur-md dark:bg-slate-900/70" : ""
              }`}>
                <StarRating
                  value={entry.my_rating ?? 0}
                  displayValue={entry.rating_average ?? 0}
                  disabled={busy || entry.user_id === userId}
                  onChange={(rating) => void onRateTaskTimeEntry(entry.id, rating)}
                  getLabel={(rating) => t("tasks.rateAction", { rating })}
                />
                {entry.rating_count > 0 ? (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t("tasks.ratingTooltipAverage", { average: Number((entry.rating_average ?? 0).toFixed(1)) })}
                    {" | "}
                    {t("tasks.ratingTooltipCount", { count: entry.rating_count })}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {entry.source === "manual" && entry.created_by === userId ? (
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => beginEdit(entry)}
                aria-label={t("tasks.timeEditEntry")}
                className="h-9 w-9 px-0"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void onDeleteTaskTimeEntry(entry)}
                aria-label={t("tasks.timeDeleteEntry")}
                className="h-9 w-9 px-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : entry.source === "manual" ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => beginCorrection(entry)}
              aria-label={t("tasks.timeSuggestCorrection")}
              className="h-9 w-9 px-0"
            >
              <MessageSquareMore className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        {renderComments(entry.id)}
        {editingEntryId === entry.id ? renderEditFields(entry) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {openCorrectionProposals.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("tasks.timeCorrectionProposalsTitle")}</CardTitle>
            <CardDescription>{t("tasks.timeCorrectionProposalsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {openCorrectionProposals.map(renderCorrectionProposal)}
          </CardContent>
        </Card>
      ) : null}

      {section === "overview" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("tasks.timeTitle")}</CardTitle>
            <CardDescription>{t("tasks.timeDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1">
                <Label>{t("tasks.timeDescriptionLabel")}</Label>
                <Input
                  value={description}
                  list={suggestionListId}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("tasks.timeDescriptionPlaceholder")}
                  disabled={busy}
                />
                <datalist id={suggestionListId}>
                  {suggestions.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label>{t("tasks.timeHoursLabel")}</Label>
                <EffortDurationInput
                  value={hours}
                  onChange={setHours}
                  disabled={busy}
                  hourLabel={t("tasks.timeHoursShort")}
                  minuteLabel={t("tasks.timeMinutesShort")}
                />
              </div>
            </div>

            <Accordion type="single" collapsible>
              <AccordionItem value="advanced" className="rounded-lg border border-brand-100 px-3 dark:border-slate-700">
                <AccordionTrigger className="py-2 text-sm font-semibold hover:no-underline">
                  {t("tasks.timeAdvanced")}
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-3">
                  <div className="space-y-1">
                    <Label>{t("tasks.timeDetailsLabel")}</Label>
                    <textarea
                      value={details}
                      onChange={(event) => setDetails(event.target.value)}
                      placeholder={t("tasks.timeDetailsPlaceholder")}
                      disabled={busy}
                      className="min-h-20 w-full rounded-md border border-brand-100 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => void handleImageFile(event.target.files?.[0] ?? null)} />
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void handleImageFile(event.target.files?.[0] ?? null)} />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                      <ImagePlus className="mr-2 h-4 w-4" />
                      {t("tasks.timeUploadImage")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()} disabled={busy}>
                      <Camera className="mr-2 h-4 w-4" />
                      {t("tasks.timeTakePhoto")}
                    </Button>
                    {imageUrl ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setImageUrl(null)} disabled={busy}>
                        {t("tasks.stateImageRemoveButton")}
                      </Button>
                    ) : null}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            {uploadError ? <p className="text-sm text-rose-600 dark:text-rose-300">{uploadError}</p> : null}
            {formError ? <p className="text-sm text-rose-600 dark:text-rose-300">{formError}</p> : null}

            <div className="flex justify-end">
              <Button type="button" onClick={() => void submit()} disabled={busy}>
                <Plus className="mr-2 h-4 w-4" />
                {t("tasks.timeAddEntry")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {section === "stats" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("tasks.timeRankingTitle")}</CardTitle>
            <CardDescription>
              {t("tasks.timeRankingDescription", { hours: formatHours(myHours) })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {ranking.map((entry, index) => {
              const member = memberById.get(entry.memberId);
              return (
                <div key={entry.memberId} className="flex items-center justify-between rounded-lg border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-sm font-semibold text-slate-500">#{index + 1}</span>
                    <MemberAvatar
                      src={member?.avatar_url?.trim() || createDiceBearAvatarDataUri(getMemberAvatarSeed(entry.memberId, member?.display_name))}
                      alt={userLabel(entry.memberId)}
                      className="h-9 w-9 rounded-full"
                    />
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{userLabel(entry.memberId)}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <Clock3 className="h-4 w-4 text-brand-600" />
                    {formatHours(entry.totalHours)} h
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {/* {section === "stats" || section === "settings" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("tasks.timeVacationTitle")}</CardTitle>
            <CardDescription>{t("tasks.timeVacationDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("tasks.timeManualEntries")}</p>
              <p className="text-lg font-semibold">{manualEntries.length}</p>
            </div>
            <div className="rounded-lg border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("tasks.timeVacationCredits")}</p>
              <p className="text-lg font-semibold">{vacationCredits.length}</p>
            </div>
            <div className="rounded-lg border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("tasks.timeModeLabel")}</p>
              <p className="text-lg font-semibold">{household.task_mode === "time" ? t("tasks.timeModeTime") : t("tasks.timeModeRotation")}</p>
            </div>
          </CardContent>
        </Card>
      ) : null} */}

      {section === "stats" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("tasks.memberOfMonthTitle")}</CardTitle>
            <CardDescription>{t("tasks.memberOfMonthHint", { month: memberOfMonthLabel })}</CardDescription>
          </CardHeader>
          <CardContent>
            {memberOfMonth ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-100 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex min-w-0 items-center gap-3">
                  <MemberAvatar
                    src={
                      memberById.get(memberOfMonth.memberId)?.avatar_url?.trim() ||
                      createDiceBearAvatarDataUri(getMemberAvatarSeed(memberOfMonth.memberId, memberById.get(memberOfMonth.memberId)?.display_name))
                    }
                    alt={userLabel(memberOfMonth.memberId)}
                    isMemberOfMonth
                    className="h-10 w-10 rounded-full"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                      {userLabel(memberOfMonth.memberId)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatHours(memberOfMonth.hours)} h | {memberOfMonth.count} {t("tasks.timeEntriesShort")}
                    </p>
                  </div>
                </div>
                {memberOfMonth.ratingAverage != null ? (
                  <StarRating
                    value={0}
                    displayValue={memberOfMonth.ratingAverage}
                    disabled
                    onChange={() => undefined}
                  />
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("tasks.memberOfMonthEmpty")}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {section === "stats" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("tasks.timeHoursChartTitle")}</CardTitle>
              <CardDescription>{t("tasks.timeHoursChartDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Bar data={hoursChartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("tasks.timeRankingChartTitle")}</CardTitle>
              <CardDescription>
                {ratingStats.average != null
                  ? t("tasks.timeAverageRating", { average: Number(ratingStats.average.toFixed(1)), count: ratingStats.count })
                  : t("tasks.timeNoRatings")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Bar data={memberChartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {section === "settings" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("tasks.timeSettingsTitle")}</CardTitle>
            <CardDescription>{t("tasks.timeSettingsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canResetTaskTimeData ? (
              <div className="flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 dark:border-rose-900/60 dark:bg-rose-950/30 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-rose-950 dark:text-rose-100">
                    {t("tasks.timeResetTitle")}
                  </p>
                  <p className="mt-1 text-sm text-rose-800 dark:text-rose-200">
                    {t("tasks.timeResetDescription")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  disabled={busy}
                  onClick={() => setResetDialogOpen(true)}
                  className="shrink-0"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("tasks.timeResetAction")}
                </Button>
              </div>
            ) : (
              <p className="rounded-lg border border-brand-100 bg-white px-3 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                {t("tasks.timeSettingsOwnerOnly")}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {section === "stats" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("tasks.timeJobStatsTitle")}</CardTitle>
            <CardDescription>{t("tasks.timeJobStatsDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {jobStats.length > 0 ? (
              <Accordion type="single" collapsible className="space-y-2">
                {jobStats.map((job) => (
                  <AccordionItem
                    key={normalizeJobName(job.name)}
                    value={normalizeJobName(job.name)}
                    className="rounded-lg border border-brand-100 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <div className="flex min-w-0 flex-1 flex-col gap-1 pr-3 text-left sm:flex-row sm:items-center sm:justify-between">
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {job.name}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                          {t("tasks.timeJobStatsSummary", {
                            count: job.count,
                            average: formatHours(job.averageHours),
                            total: formatHours(job.totalHours)
                          })}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="space-y-2">
                        <div className="grid grid-cols-[1fr_4rem_6rem] gap-2 border-b border-slate-100 pb-2 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <span>{t("tasks.timeJobStatsMember")}</span>
                          <span className="text-right">{t("tasks.timeJobStatsCount")}</span>
                          <span className="text-right">{t("tasks.timeJobStatsAverage")}</span>
                        </div>
                        {job.memberStats.map((memberStat) => {
                          const member = memberById.get(memberStat.memberId);
                          return (
                            <div key={memberStat.memberId} className="grid grid-cols-[1fr_4rem_6rem] items-center gap-2 text-sm">
                              <div className="flex min-w-0 items-center gap-2">
                                <MemberAvatar
                                  src={member?.avatar_url?.trim() || createDiceBearAvatarDataUri(getMemberAvatarSeed(memberStat.memberId, member?.display_name))}
                                  alt={userLabel(memberStat.memberId)}
                                  className="h-7 w-7 rounded-full"
                                />
                                <span className="truncate text-slate-900 dark:text-slate-100">
                                  {userLabel(memberStat.memberId)}
                                </span>
                              </div>
                              <span className="text-right font-medium text-slate-700 dark:text-slate-200">
                                {memberStat.count}
                              </span>
                              <span className="text-right font-medium text-slate-700 dark:text-slate-200">
                                {formatHours(memberStat.averageHours)} h
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("tasks.timeJobStatsEmpty")}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {section === "stats" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("tasks.timeMemberSatisfactionTitle")}</CardTitle>
              <CardDescription>{t("tasks.timeMemberSatisfactionDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {satisfactionByMember.some((entry) => entry.average != null) ? (
                satisfactionByMember
                  .filter((entry) => entry.average != null)
                  .map((entry) => {
                    const member = memberById.get(entry.memberId);
                    return (
                      <div key={entry.memberId} className="flex min-w-0 flex-col gap-2 rounded-lg border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                          <MemberAvatar
                            src={member?.avatar_url?.trim() || createDiceBearAvatarDataUri(getMemberAvatarSeed(entry.memberId, member?.display_name))}
                            alt={userLabel(entry.memberId)}
                            className="h-8 w-8 shrink-0 rounded-full"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {userLabel(entry.memberId)}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t("tasks.timeSatisfactionMeta", {
                                count: entry.ratingCount,
                                entries: entry.entryCount
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="max-w-full overflow-hidden sm:shrink-0">
                          <StarRating
                            value={0}
                            displayValue={entry.average ?? 0}
                            disabled
                            onChange={() => undefined}
                          />
                        </div>
                      </div>
                    );
                  })
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("tasks.timeSatisfactionEmpty")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("tasks.timeTaskSatisfactionTitle")}</CardTitle>
              <CardDescription>{t("tasks.timeTaskSatisfactionDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {satisfactionByJob.length > 0 ? (
                satisfactionByJob.map((entry) => (
                  <div key={normalizeJobName(entry.name)} className="flex min-w-0 flex-col gap-2 rounded-lg border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {entry.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("tasks.timeSatisfactionMeta", {
                          count: entry.ratingCount,
                          entries: entry.entryCount
                        })}
                      </p>
                    </div>
                    <div className="max-w-full overflow-hidden sm:shrink-0">
                      <StarRating
                        value={0}
                        displayValue={entry.average ?? 0}
                        disabled
                        onChange={() => undefined}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("tasks.timeSatisfactionEmpty")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {section === "overview" || section === "history" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("tasks.timeHistoryTitle")}</CardTitle>
            <CardDescription>{t("tasks.timeHistoryDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleEntries.length > 0 ? visibleEntries.map(renderEntry) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("tasks.timeHistoryEmpty")}</p>
            )}
            {entriesHasMore ? (
              <div className="flex justify-center pt-1">
                <Button
                  type="button"
                  variant="outline"
                  disabled={entriesLoadingMore}
                  onClick={() => onLoadMoreEntries?.()}
                >
                  {entriesLoadingMore ? t("common.loading") : t("tasks.timeHistoryLoadMore")}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={Boolean(correctionEntry)}
        onOpenChange={(open) => {
          if (!open) {
            setCorrectingEntryId(null);
            setCorrectionReason("");
            setEditError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("tasks.timeCreateCorrection")}</DialogTitle>
            <DialogDescription>
              {correctionEntry
                ? t("tasks.timeCorrectionDialogDescription", {
                    title: correctionEntry.description,
                    hours: formatHours(correctionEntry.hours)
                  })
                : t("tasks.timeCorrectionReasonPlaceholder")}
            </DialogDescription>
          </DialogHeader>

          {correctionEntry ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1">
                  <Label>{t("tasks.timeDescriptionLabel")}</Label>
                  <Input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} disabled={busy} />
                </div>
                <div className="space-y-1">
                  <Label>{t("tasks.timeHoursLabel")}</Label>
                  <EffortDurationInput
                    value={editHours}
                    onChange={setEditHours}
                    disabled={busy}
                    hourLabel={t("tasks.timeHoursShort")}
                    minuteLabel={t("tasks.timeMinutesShort")}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t("tasks.timeDetailsLabel")}</Label>
                <textarea
                  value={editDetails}
                  onChange={(event) => setEditDetails(event.target.value)}
                  disabled={busy}
                  className="min-h-20 w-full rounded-md border border-brand-100 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("tasks.timeCorrectionReasonLabel")}</Label>
                <Input
                  value={correctionReason}
                  onChange={(event) => setCorrectionReason(event.target.value)}
                  placeholder={t("tasks.timeCorrectionReasonPlaceholder")}
                  disabled={busy}
                />
              </div>
              {editError ? <p className="text-sm text-rose-600 dark:text-rose-300">{editError}</p> : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setCorrectingEntryId(null);
                    setCorrectionReason("");
                    setEditError(null);
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitCorrection(correctionEntry)}
                >
                  <Check className="mr-2 h-4 w-4" />
                  {t("tasks.timeCreateCorrection")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tasks.timeResetConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("tasks.timeResetConfirmDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setResetDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy || !onResetTaskTimeData}
              onClick={() => {
                setResetDialogOpen(false);
                void onResetTaskTimeData?.();
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("tasks.timeResetAction")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
