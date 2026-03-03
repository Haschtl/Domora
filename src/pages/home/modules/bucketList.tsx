import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  FormEvent,
} from "react";

import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { BucketItem } from "../../../lib/types";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Checkbox } from "../../../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { MultiDateCalendarSelect } from "../../../components/ui/multi-date-calendar-select";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { useWorkspace } from "../../../context/workspace-context";
import { useTranslation } from "react-i18next";
import { useMarkdownComponents } from "../../../features/components/markdown";

export function BucketList({ bucketItems }: { bucketItems: BucketItem[] }) {
  const {
    userId,
    busy,
    mobileTabBarVisible,
    onAddBucketItem,
    onToggleBucketItem,
    onUpdateBucketItem,
    onDeleteBucketItem,
    onToggleBucketDateVote,
  } = useWorkspace();

  const [isMobileBucketComposer, setIsMobileBucketComposer] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 639px)").matches
      : false,
  );
  const [bucketPopoverWidth, setBucketPopoverWidth] = useState(320);

  useEffect(() => {
    const updateWidth = () => {
      const next =
        bucketComposerContainerRef.current?.getBoundingClientRect().width ??
        bucketComposerRowRef.current?.getBoundingClientRect().width;
      if (!next || Number.isNaN(next)) return;
      setBucketPopoverWidth(Math.max(220, Math.round(next)));
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [isMobileBucketComposer]);
  const {t,i18n:{language}}=useTranslation()
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const onChange = (event: MediaQueryListEvent) =>
      setIsMobileBucketComposer(event.matches);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobileBucketComposer(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);
  const [bucketTitle, setBucketTitle] = useState("");
  const [bucketDescriptionMarkdown, setBucketDescriptionMarkdown] =
    useState("");
  const [bucketAddress, setBucketAddress] = useState("");
  const [bucketSuggestedDates, setBucketSuggestedDates] = useState<string[]>(
    [],
  );
  const [bucketItemBeingEdited, setBucketItemBeingEdited] =
    useState<BucketItem | null>(null);
  const [bucketEditTitle, setBucketEditTitle] = useState("");
  const [bucketEditDescriptionMarkdown, setBucketEditDescriptionMarkdown] =
    useState("");
  const [bucketEditAddress, setBucketEditAddress] = useState("");
  const [bucketEditSuggestedDates, setBucketEditSuggestedDates] = useState<
    string[]
  >([]);
  const [bucketItemPendingDelete, setBucketItemPendingDelete] =
    useState<BucketItem | null>(null);
  const [showCompletedBucketItems, setShowCompletedBucketItems] =
    useState(false);
  const bucketComposerContainerRef = useRef<HTMLDivElement | null>(null);
  const bucketComposerRowRef = useRef<HTMLDivElement | null>(null);

  const openBucketItemsCount = useMemo(
    () => bucketItems.filter((entry) => !entry.done).length,
    [bucketItems],
  );
  const doneBucketItemsCount = useMemo(
    () => bucketItems.filter((entry) => entry.done).length,
    [bucketItems],
  );
  const visibleBucketItems = useMemo(
    () =>
      showCompletedBucketItems
        ? bucketItems
        : bucketItems.filter((entry) => !entry.done),
    [bucketItems, showCompletedBucketItems],
  );
  const onSubmitBucketItem = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const nextTitle = bucketTitle.trim();
      if (!nextTitle) return;

      await onAddBucketItem({
        title: nextTitle,
        descriptionMarkdown: bucketDescriptionMarkdown.trim(),
        address: bucketAddress.trim(),
        suggestedDates: [...new Set(bucketSuggestedDates)].sort(),
      });
      setBucketTitle("");
      setBucketDescriptionMarkdown("");
      setBucketAddress("");
      setBucketSuggestedDates([]);
    },
    [
      bucketAddress,
      bucketDescriptionMarkdown,
      bucketSuggestedDates,
      bucketTitle,
      onAddBucketItem,
    ],
  );
  const onStartBucketEdit = useCallback((item: BucketItem) => {
    setBucketItemBeingEdited(item);
    setBucketEditTitle(item.title);
    setBucketEditDescriptionMarkdown(item.description_markdown);
    setBucketEditAddress(item.address ?? "");
    setBucketEditSuggestedDates(item.suggested_dates);
  }, []);
  const onSubmitBucketEdit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!bucketItemBeingEdited) return;

      const nextTitle = bucketEditTitle.trim();
      if (!nextTitle) return;

      await onUpdateBucketItem(bucketItemBeingEdited, {
        title: nextTitle,
        descriptionMarkdown: bucketEditDescriptionMarkdown.trim(),
        address: bucketEditAddress.trim(),
        suggestedDates: [...new Set(bucketEditSuggestedDates)].sort(),
      });

      setBucketItemBeingEdited(null);
      setBucketEditTitle("");
      setBucketEditDescriptionMarkdown("");
      setBucketEditAddress("");
      setBucketEditSuggestedDates([]);
    },
    [
      bucketEditAddress,
      bucketEditDescriptionMarkdown,
      bucketEditSuggestedDates,
      bucketEditTitle,
      bucketItemBeingEdited,
      onUpdateBucketItem,
    ],
  );
  const markdownComponents = useMarkdownComponents();

  const onConfirmDeleteBucketItem = useCallback(async () => {
    if (!bucketItemPendingDelete) return;
    await onDeleteBucketItem(bucketItemPendingDelete);
    setBucketItemPendingDelete(null);
  }, [bucketItemPendingDelete, onDeleteBucketItem]);


    const formatSuggestedDate = useMemo(
      () => (value: string) => {
        const parsed = new Date(`${value}T12:00:00`);
        if (Number.isNaN(parsed.getTime())) return value;
        return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(
          parsed,
        );
      },
      [language],
    );

  const renderBucketComposer = (mobile: boolean) => (
    <form
      className={mobile ? "space-y-0" : "space-y-2"}
      onSubmit={(event) => void onSubmitBucketItem(event)}
    >
      <div className="flex items-end">
        <div className="relative flex-1 space-y-1">
          <Label className={mobile ? "sr-only" : ""}>
            {t("home.bucketTitle")}
          </Label>
          <Popover>
            <PopoverAnchor asChild>
              <div
                ref={bucketComposerRowRef}
                className="flex h-10 items-stretch overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-slate-700 dark:bg-slate-900 focus-within:border-brand-500 focus-within:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.45)] dark:focus-within:border-slate-500 dark:focus-within:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]"
              >
                <Input
                  value={bucketTitle}
                  onChange={(event) => setBucketTitle(event.target.value)}
                  placeholder={t("home.bucketPlaceholder")}
                  maxLength={200}
                  disabled={busy}
                  className="h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-full w-10 shrink-0 rounded-none border-l border-brand-200 p-0 dark:border-slate-700"
                    aria-label={t("home.bucketMoreOptions")}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <Button
                  type="submit"
                  disabled={busy || bucketTitle.trim().length === 0}
                  className="h-full shrink-0 rounded-none border-l border-brand-200 px-3 dark:border-slate-700"
                  aria-label={t("home.bucketAddAction")}
                >
                  <Plus className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">
                    {t("home.bucketAddAction")}
                  </span>
                </Button>
              </div>
            </PopoverAnchor>
            <PopoverContent
              align="start"
              side={mobile ? "top" : "bottom"}
              sideOffset={12}
              className="w-auto space-y-3 -translate-x-1.5 rounded-xl border-brand-100 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 dark:border-slate-700"
              style={{ width: `${bucketPopoverWidth}px` }}
            >
              <div className="space-y-1">
                <Label>{t("home.bucketDescriptionPlaceholder")}</Label>
                <textarea
                  value={bucketDescriptionMarkdown}
                  onChange={(event) =>
                    setBucketDescriptionMarkdown(event.target.value)
                  }
                  placeholder={t("home.bucketDescriptionPlaceholder")}
                  maxLength={20000}
                  disabled={busy}
                  rows={4}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("home.bucketAddressLabel")}</Label>
                <Input
                  value={bucketAddress}
                  onChange={(event) => setBucketAddress(event.target.value)}
                  placeholder={t("home.bucketAddressPlaceholder")}
                  maxLength={300}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {t("home.bucketDatesLabel")}
                </p>
                <MultiDateCalendarSelect
                  value={bucketSuggestedDates}
                  onChange={setBucketSuggestedDates}
                  disabled={busy}
                  locale={language}
                  placeholder={t("home.bucketDatePickerPlaceholder")}
                  clearLabel={t("home.bucketDatePickerClear")}
                  doneLabel={t("home.bucketDatePickerDone")}
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </form>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("home.bucketTitle")}</CardTitle>
          <CardDescription>{t("home.bucketDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isMobileBucketComposer ? renderBucketComposer(false) : null}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("home.bucketProgress", {
              open: openBucketItemsCount,
              done: doneBucketItemsCount,
            })}
          </p>
          {doneBucketItemsCount > 0 ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() =>
                  setShowCompletedBucketItems((current) => !current)
                }
                disabled={busy}
              >
                {showCompletedBucketItems
                  ? t("home.bucketHideCompleted")
                  : t("home.bucketShowCompleted", {
                      count: doneBucketItemsCount,
                    })}
              </Button>
            </div>
          ) : null}
          {visibleBucketItems.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("home.bucketEmpty")}
            </p>
          ) : null}
        </CardContent>
      </Card>
      {visibleBucketItems.length > 0 ? (
        <div className={`space-y-3 ${isMobileBucketComposer ? "pb-40" : ""}`}>
          {visibleBucketItems.map((item) => (
            <Card
              className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4"
              key={item.id}
            >
              <CardContent className="space-y-2 pt-0">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={item.done}
                      onCheckedChange={() => {
                        void onToggleBucketItem(item);
                      }}
                      aria-label={
                        item.done
                          ? t("home.bucketMarkOpen")
                          : t("home.bucketMarkDone")
                      }
                      disabled={busy}
                    />
                    <span
                      className={`truncate text-sm ${
                        item.done
                          ? "text-slate-400 line-through dark:text-slate-500"
                          : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {item.title}
                    </span>
                  </label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 px-0"
                        disabled={busy}
                        aria-label={t("home.bucketItemActions")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => onStartBucketEdit(item)}
                        disabled={busy}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        {t("home.bucketEdit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setBucketItemPendingDelete(item)}
                        disabled={busy}
                        className="text-rose-600 dark:text-rose-300"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("home.bucketDelete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {item.description_markdown.trim().length > 0 ? (
                  <div className="prose prose-slate max-w-none text-sm dark:prose-invert [&_*]:break-words">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {item.description_markdown}
                    </ReactMarkdown>
                  </div>
                ) : null}
                {(item.address ?? "").trim().length > 0 ? (
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {(item.address ?? "").trim()}
                  </p>
                ) : null}

                {item.suggested_dates.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {t("home.bucketSuggestedDatesTitle")}
                    </p>
                    <ul className="space-y-1">
                      {item.suggested_dates.map((dateValue) => {
                        const voters = item.votes_by_date[dateValue] ?? [];
                        const hasVoted = userId!=null&&voters.includes(userId);
                        return (
                          <li
                            key={`${item.id}-${dateValue}`}
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800/60"
                          >
                            <span className="text-xs text-slate-700 dark:text-slate-300">
                              {formatSuggestedDate(dateValue)}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {t("home.bucketVotes", {
                                  count: voters.length,
                                })}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant={hasVoted ? "default" : "outline"}
                                className="h-7 px-2 text-[11px]"
                                disabled={busy}
                                onClick={() => {
                                  void onToggleBucketDateVote(
                                    item,
                                    dateValue,
                                    !hasVoted,
                                  );
                                }}
                              >
                                {hasVoted
                                  ? t("home.bucketVotedAction")
                                  : t("home.bucketVoteAction")}
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      <Dialog
        open={bucketItemBeingEdited !== null}
        onOpenChange={(open) => {
          if (open) return;
          setBucketItemBeingEdited(null);
          setBucketEditTitle("");
          setBucketEditDescriptionMarkdown("");
          setBucketEditAddress("");
          setBucketEditSuggestedDates([]);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("home.bucketEditTitle")}</DialogTitle>
            <DialogDescription>
              {t("home.bucketEditDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => void onSubmitBucketEdit(event)}
          >
            <div className="space-y-1">
              <Label>{t("home.bucketTitle")}</Label>
              <Input
                value={bucketEditTitle}
                onChange={(event) => setBucketEditTitle(event.target.value)}
                placeholder={t("home.bucketPlaceholder")}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>{t("home.bucketDescriptionPlaceholder")}</Label>
              <textarea
                value={bucketEditDescriptionMarkdown}
                onChange={(event) =>
                  setBucketEditDescriptionMarkdown(event.target.value)
                }
                placeholder={t("home.bucketDescriptionPlaceholder")}
                className="min-h-[96px] w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("home.bucketAddressLabel")}</Label>
              <Input
                value={bucketEditAddress}
                onChange={(event) => setBucketEditAddress(event.target.value)}
                placeholder={t("home.bucketAddressPlaceholder")}
                maxLength={300}
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {t("home.bucketDatesLabel")}
              </p>
              <MultiDateCalendarSelect
                value={bucketEditSuggestedDates}
                onChange={setBucketEditSuggestedDates}
                locale={language}
                placeholder={t("home.bucketDatePickerPlaceholder")}
                clearLabel={t("home.bucketDatePickerClear")}
                doneLabel={t("home.bucketDatePickerDone")}
                disabled={busy}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setBucketItemBeingEdited(null);
                  setBucketEditTitle("");
                  setBucketEditDescriptionMarkdown("");
                  setBucketEditAddress("");
                  setBucketEditSuggestedDates([]);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={busy || bucketEditTitle.trim().length === 0}
              >
                {t("home.bucketEditSave")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={bucketItemPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setBucketItemPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("home.bucketDeleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("home.bucketDeleteConfirmDescription", {
                title: bucketItemPendingDelete?.title ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setBucketItemPendingDelete(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void onConfirmDeleteBucketItem();
              }}
            >
              {t("home.bucketDeleteConfirmAction")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {isMobileBucketComposer ? (
        <div
          className={`fixed inset-x-0 z-40 px-3 sm:hidden ${
            mobileTabBarVisible
              ? "bottom-[calc(env(safe-area-inset-bottom)+3.75rem)]"
              : "bottom-[calc(env(safe-area-inset-bottom)+0.2rem)]"
          }`}
        >
          <div
            ref={bucketComposerContainerRef}
            className="rounded-2xl border border-brand-200/70 bg-white/75 p-1.5 shadow-xl backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/75"
          >
            {renderBucketComposer(true)}
          </div>
        </div>
      ) : null}
    </>
  );
}
