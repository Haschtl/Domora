import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import imageCompression from "browser-image-compression";
import { Camera, Check, Crown, Share2, UserMinus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import { isSupported } from "firebase/messaging";
import type { Household, HouseholdMember, PushPreferences, TaskItem, UpdateHouseholdInput } from "../../lib/types";
import { createDiceBearAvatarDataUri, getMemberAvatarSeed } from "../../lib/avatar";
import { createTrianglifyBannerBackground } from "../../lib/banner";
import { createMemberLabelGetter } from "../../lib/member-label";
import { isDueNow } from "../../lib/date";
import { ThemeLanguageControls } from "../../components/theme-language-controls";
import { PaymentBrandIcon } from "../../components/payment-brand-icon";
import { applyHouseholdTheme } from "../../lib/household-theme";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../../components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/accordion";
import { Input } from "../../components/ui/input";
import { InputWithSuffix } from "../../components/ui/input-with-suffix";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { getPushPreferences, upsertHouseholdWhiteboard, upsertPushPreferences } from "../../lib/api";
import { MemberAvatar } from "../../components/member-avatar";
import { isFirebaseConfigured } from "../../lib/firebase-config";

interface SettingsPageProps {
  section?: "me" | "household";
  household: Household;
  members: HouseholdMember[];
  currentMember: HouseholdMember | null;
  tasks: TaskItem[];
  userId: string;
  userEmail: string | undefined;
  userAvatarUrl: string | null;
  userDisplayName: string | null;
  userPaypalName: string | null;
  userRevolutName: string | null;
  userWeroName: string | null;
  busy: boolean;
  notificationPermission: NotificationPermission;
  onEnableNotifications: () => Promise<void>;
  onReregisterPushToken: () => Promise<void>;
  onUpdateHousehold: (input: UpdateHouseholdInput) => Promise<void>;
  onUpdateUserAvatar: (avatarUrl: string) => Promise<void>;
  onUpdateUserDisplayName: (displayName: string) => Promise<void>;
  onUpdateUserColor: (userColor: string) => Promise<void>;
  onUpdateUserPaymentHandles: (input: { paypalName: string; revolutName: string; weroName: string }) => Promise<void>;
  onUpdateVacationMode: (vacationMode: boolean) => Promise<void>;
  onSetMemberRole: (targetUserId: string, role: "owner" | "member") => Promise<void>;
  onRemoveMember: (targetUserId: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onLeaveHousehold: () => Promise<void>;
  onDissolveHousehold: () => Promise<void>;
}

const normalizeCurrency = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);

const CURRENCY_OPTIONS = [
  { code: "EUR", icon: "€", label: "Euro" },
  { code: "USD", icon: "$", label: "US Dollar" },
  { code: "CHF", icon: "₣", label: "Swiss Franc" },
  { code: "GBP", icon: "£", label: "British Pound" },
  { code: "SEK", icon: "kr", label: "Swedish Krona" },
  { code: "NOK", icon: "kr", label: "Norwegian Krone" },
  { code: "DKK", icon: "kr", label: "Danish Krone" },
  { code: "PLN", icon: "zł", label: "Polish Zloty" },
  { code: "CZK", icon: "Kč", label: "Czech Koruna" }
] as const;
const findCurrencyOption = (code: string) => CURRENCY_OPTIONS.find((entry) => entry.code === code);

const MAX_IMAGE_DIMENSION = 1600;
const MAX_IMAGE_SIZE_MB = 0.9;
const IMAGE_QUALITY = 0.78;

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
    maxSizeMB: MAX_IMAGE_SIZE_MB,
    maxWidthOrHeight: MAX_IMAGE_DIMENSION,
    useWebWorker: true,
    initialQuality: IMAGE_QUALITY
  });

  return imageCompression.getDataUrlFromFile(compressed);
};

const normalizeUserColor = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : "#4f46e5";
};

const serializePushPreferences = (prefs: PushPreferences) => {
  const topics = [...(prefs.topics ?? [])].sort();
  const quiet = prefs.quiet_hours ?? {};
  return JSON.stringify({
    enabled: prefs.enabled ?? true,
    topics,
    quiet_hours: {
      start: quiet.start ?? "",
      end: quiet.end ?? "",
      timezone: quiet.timezone ?? "",
      offsetMinutes: quiet.offsetMinutes ?? null
    }
  });
};

export const SettingsPage = ({
  section = "me",
  household,
  members,
  currentMember,
  tasks,
  userId,
  userEmail,
  userAvatarUrl,
  userDisplayName,
  userPaypalName,
  userRevolutName,
  userWeroName,
  busy,
  notificationPermission,
  onEnableNotifications,
  onReregisterPushToken,
  onUpdateHousehold,
  onUpdateUserAvatar,
  onUpdateUserDisplayName,
  onUpdateUserColor,
  onUpdateUserPaymentHandles,
  onUpdateVacationMode,
  onSetMemberRole,
  onRemoveMember,
  onSignOut,
  onLeaveHousehold,
  onDissolveHousehold
}: SettingsPageProps) => {
  const { t } = useTranslation();
  const appVersion = __APP_VERSION__;
  const isOwner = currentMember?.role === "owner";

  const [formError, setFormError] = useState<string | null>(null);
  const [profileUploadError, setProfileUploadError] = useState<string | null>(null);
  const [householdUploadError, setHouseholdUploadError] = useState<string | null>(null);
  const [whiteboardResetStatus, setWhiteboardResetStatus] = useState<string | null>(null);
  const [whiteboardResetError, setWhiteboardResetError] = useState<string | null>(null);
  const [whiteboardResetBusy, setWhiteboardResetBusy] = useState(false);
  const [whiteboardResetOpen, setWhiteboardResetOpen] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [vacationDialogOpen, setVacationDialogOpen] = useState(false);
  const [pendingVacationMode, setPendingVacationMode] = useState<boolean | null>(null);
  const dueTasksAssignedToYou = useMemo(() => {
    if (!userId) return [];
    return tasks.filter(
      (task) =>
        task.is_active &&
        !task.done &&
        task.assignee_id === userId &&
        isDueNow(task.due_at, task.grace_minutes)
    );
  }, [tasks, userId]);
  const dueTasksAssignedCount = dueTasksAssignedToYou.length;
  const [pushPreferences, setPushPreferences] = useState<PushPreferences | null>(null);
  const [pushPreferencesSnapshot, setPushPreferencesSnapshot] = useState<string | null>(null);
  const [pushPreferencesBusy, setPushPreferencesBusy] = useState(false);
  const [pushPreferencesError, setPushPreferencesError] = useState<string | null>(null);
  const profileUploadInputRef = useRef<HTMLInputElement | null>(null);
  const profileCameraInputRef = useRef<HTMLInputElement | null>(null);
  const householdUploadInputRef = useRef<HTMLInputElement | null>(null);
  const householdCameraInputRef = useRef<HTMLInputElement | null>(null);

  const profileForm = useForm({
    defaultValues: {
      profileImageUrl: userAvatarUrl ?? ""
    },
    onSubmit: async ({ value }: { value: { profileImageUrl: string } }) => {
      await onUpdateUserAvatar(value.profileImageUrl);
    }
  });
  const profileNameForm = useForm({
    defaultValues: {
      displayName: userDisplayName ?? ""
    },
    onSubmit: async ({ value }: { value: { displayName: string } }) => {
      await onUpdateUserDisplayName(value.displayName);
    }
  });
  const profileColorForm = useForm({
    defaultValues: {
      userColor: normalizeUserColor(currentMember?.user_color ?? "")
    },
    onSubmit: async ({ value }: { value: { userColor: string } }) => {
      await onUpdateUserColor(normalizeUserColor(value.userColor));
    }
  });
  const profilePaymentsForm = useForm({
    defaultValues: {
      paypalName: userPaypalName ?? "",
      revolutName: userRevolutName ?? "",
      weroName: userWeroName ?? ""
    },
    onSubmit: async ({ value }: { value: { paypalName: string; revolutName: string; weroName: string } }) => {
      await onUpdateUserPaymentHandles(value);
    }
  });
  const normalizeThemeRadiusScale = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(1.5, Math.max(0.5, parsed));
  };
  const themePresets = useMemo(
    () => [
      {
        id: "domora",
        label: t("settings.householdThemePresetDefault"),
        primary: "#1f8a7f",
        accent: "#14b8a6",
        font: '"Space Grotesk", "Segoe UI", sans-serif',
        radius: "1"
      },
      {
        id: "sunset",
        label: t("settings.householdThemePresetSunset"),
        primary: "#f97316",
        accent: "#f43f5e",
        font: '"Plus Jakarta Sans", "Segoe UI", sans-serif',
        radius: "1.1"
      },
      {
        id: "ocean",
        label: t("settings.householdThemePresetOcean"),
        primary: "#0ea5e9",
        accent: "#22c55e",
        font: '"IBM Plex Sans", "Segoe UI", sans-serif',
        radius: "0.9"
      },
      {
        id: "mono",
        label: t("settings.householdThemePresetMono"),
        primary: "#334155",
        accent: "#64748b",
        font: '"Source Sans 3", "Segoe UI", sans-serif',
        radius: "0.8"
      }
    ],
    [t]
  );
  const householdForm = useForm({
    defaultValues: {
      name: household.name ?? "",
      imageUrl: household.image_url ?? "",
      address: household.address ?? "",
      currency: household.currency ?? "EUR",
      taskLazinessEnabled: household.task_laziness_enabled ?? false,
      themePrimaryColor: household.theme_primary_color ?? "#1f8a7f",
      themeAccentColor: household.theme_accent_color ?? "#14b8a6",
      themeFontFamily: household.theme_font_family ?? '"Space Grotesk", "Segoe UI", sans-serif',
      themeRadiusScale: String(household.theme_radius_scale ?? 1)
    },
    onSubmit: async ({ value }: {
      value: {
        name: string;
        imageUrl: string;
        address: string;
        currency: string;
        taskLazinessEnabled: boolean;
        themePrimaryColor: string;
        themeAccentColor: string;
        themeFontFamily: string;
        themeRadiusScale: string;
      };
    }) => {
      if (!isOwner) {
        setFormError(t("settings.householdOwnerOnlyHint"));
        return;
      }

      const normalizedName = value.name.trim();
      if (!normalizedName) {
        setFormError(t("settings.householdNameError"));
        return;
      }

      const normalized = normalizeCurrency(value.currency);
      if (normalized.length !== 3) {
        setFormError(t("settings.currencyError"));
        return;
      }

      setFormError(null);
      await onUpdateHousehold({
        name: normalizedName,
        imageUrl: value.imageUrl,
        address: value.address,
        currency: normalized,
        apartmentSizeSqm: household.apartment_size_sqm,
        coldRentMonthly: household.cold_rent_monthly,
        utilitiesMonthly: household.utilities_monthly,
        utilitiesOnRoomSqmPercent: household.utilities_on_room_sqm_percent,
        taskLazinessEnabled: value.taskLazinessEnabled,
        themePrimaryColor: value.themePrimaryColor,
        themeAccentColor: value.themeAccentColor,
        themeFontFamily: value.themeFontFamily,
        themeRadiusScale: normalizeThemeRadiusScale(value.themeRadiusScale)
      });
    }
  });

  const applyThemePreview = useCallback(
    (next?: Partial<{
      themePrimaryColor: string;
      themeAccentColor: string;
      themeFontFamily: string;
      themeRadiusScale: string;
    }>) => {
      const values = {
        themePrimaryColor: householdForm.state.values.themePrimaryColor,
        themeAccentColor: householdForm.state.values.themeAccentColor,
        themeFontFamily: householdForm.state.values.themeFontFamily,
        themeRadiusScale: householdForm.state.values.themeRadiusScale,
        ...next
      };
      applyHouseholdTheme({
        primaryColor: values.themePrimaryColor,
        accentColor: values.themeAccentColor,
        fontFamily: values.themeFontFamily,
        radiusScale: normalizeThemeRadiusScale(values.themeRadiusScale)
      });
    },
    [householdForm.state.values, normalizeThemeRadiusScale]
  );


  useEffect(() => {
    householdForm.setFieldValue("name", household.name ?? "");
    householdForm.setFieldValue("imageUrl", household.image_url ?? "");
    householdForm.setFieldValue("address", household.address ?? "");
    householdForm.setFieldValue("currency", household.currency ?? "EUR");
    householdForm.setFieldValue("taskLazinessEnabled", household.task_laziness_enabled ?? false);
    householdForm.setFieldValue("themePrimaryColor", household.theme_primary_color ?? "#1f8a7f");
    householdForm.setFieldValue("themeAccentColor", household.theme_accent_color ?? "#14b8a6");
    householdForm.setFieldValue(
      "themeFontFamily",
      household.theme_font_family ?? '"Space Grotesk", "Segoe UI", sans-serif'
    );
    householdForm.setFieldValue("themeRadiusScale", String(household.theme_radius_scale ?? 1));
  }, [
    household.address,
    household.currency,
    household.id,
    household.image_url,
    household.name,
    household.task_laziness_enabled,
    household.theme_primary_color,
    household.theme_accent_color,
    household.theme_font_family,
    household.theme_radius_scale,
    householdForm
  ]);

  useEffect(() => {
    profileForm.setFieldValue("profileImageUrl", userAvatarUrl ?? "");
  }, [profileForm, userAvatarUrl]);
  useEffect(() => {
    profileNameForm.setFieldValue("displayName", userDisplayName ?? "");
  }, [profileNameForm, userDisplayName]);
  useEffect(() => {
    profileColorForm.setFieldValue("userColor", normalizeUserColor(currentMember?.user_color ?? ""));
  }, [currentMember?.user_color, profileColorForm]);
  useEffect(() => {
    profilePaymentsForm.setFieldValue("paypalName", userPaypalName ?? "");
    profilePaymentsForm.setFieldValue("revolutName", userRevolutName ?? "");
    profilePaymentsForm.setFieldValue("weroName", userWeroName ?? "");
  }, [profilePaymentsForm, userPaypalName, userRevolutName, userWeroName]);
  useEffect(() => {
    if (!household?.id || !userId) return;
    let isActive = true;
    setPushPreferencesError(null);
    void (async () => {
      try {
        const prefs = await getPushPreferences(household.id, userId);
        if (isActive) {
          setPushPreferences(prefs);
          setPushPreferencesSnapshot(serializePushPreferences(prefs));
        }
      } catch (error) {
        if (isActive) {
          const message = error instanceof Error ? error.message : t("app.unknownError");
          setPushPreferencesError(message);
        }
      }
    })();
    return () => {
      isActive = false;
    };
  }, [household.id, t, userId]);

  const onProfileFileChange = async (file: File) => {
    try {
      const dataUrl = await compressImageToDataUrl(file);
      profileForm.setFieldValue("profileImageUrl", dataUrl);
      await onUpdateUserAvatar(dataUrl);
      setProfileUploadError(null);
    } catch {
      setProfileUploadError(t("settings.profileUploadError"));
    }
  };

  const onRemoveProfileImage = async () => {
    try {
      profileForm.setFieldValue("profileImageUrl", "");
      await onUpdateUserAvatar("");
      setProfileUploadError(null);
    } catch {
      setProfileUploadError(t("settings.profileUploadError"));
    }
  };

  const onHouseholdFileChange = async (file: File) => {
    if (!isOwner) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      householdForm.setFieldValue("imageUrl", dataUrl);
      await onUpdateHousehold({
        name: householdForm.state.values.name.trim(),
        imageUrl: dataUrl,
        address: householdForm.state.values.address,
        currency: normalizeCurrency(householdForm.state.values.currency),
        apartmentSizeSqm: household.apartment_size_sqm,
        coldRentMonthly: household.cold_rent_monthly,
        utilitiesMonthly: household.utilities_monthly,
        utilitiesOnRoomSqmPercent: household.utilities_on_room_sqm_percent,
        taskLazinessEnabled: householdForm.state.values.taskLazinessEnabled,
        themePrimaryColor: householdForm.state.values.themePrimaryColor,
        themeAccentColor: householdForm.state.values.themeAccentColor,
        themeFontFamily: householdForm.state.values.themeFontFamily,
        themeRadiusScale: normalizeThemeRadiusScale(householdForm.state.values.themeRadiusScale)
      });
      setHouseholdUploadError(null);
    } catch {
      setHouseholdUploadError(t("settings.householdUploadError"));
    }
  };

  const onRemoveHouseholdImage = async () => {
    if (!isOwner) return;
    try {
      householdForm.setFieldValue("imageUrl", "");
      await onUpdateHousehold({
        name: householdForm.state.values.name.trim(),
        imageUrl: "",
        address: householdForm.state.values.address,
        currency: normalizeCurrency(householdForm.state.values.currency),
        apartmentSizeSqm: household.apartment_size_sqm,
        coldRentMonthly: household.cold_rent_monthly,
        utilitiesMonthly: household.utilities_monthly,
        utilitiesOnRoomSqmPercent: household.utilities_on_room_sqm_percent,
        taskLazinessEnabled: householdForm.state.values.taskLazinessEnabled,
        themePrimaryColor: householdForm.state.values.themePrimaryColor,
        themeAccentColor: householdForm.state.values.themeAccentColor,
        themeFontFamily: householdForm.state.values.themeFontFamily,
        themeRadiusScale: normalizeThemeRadiusScale(householdForm.state.values.themeRadiusScale)
      });
      setHouseholdUploadError(null);
    } catch {
      setHouseholdUploadError(t("settings.householdUploadError"));
    }
  };

  const profileImageUrl = profileForm.state.values.profileImageUrl.trim();
  const profileSeed = useMemo(() => {
    const displayName = profileNameForm.state.values.displayName.trim();
    if (displayName) return displayName;
    if (userEmail) return userEmail;
    return userId;
  }, [profileNameForm.state.values.displayName, userEmail, userId]);
  const generatedProfileAvatarUrl = useMemo(
    () => createDiceBearAvatarDataUri(profileSeed, profileColorForm.state.values.userColor),
    [profileColorForm.state.values.userColor, profileSeed]
  );
  const profilePreviewImageUrl = profileImageUrl || generatedProfileAvatarUrl;
  const householdImageUrl = householdForm.state.values.imageUrl.trim();
  const generatedHouseholdBannerUrl = useMemo(
    () => createTrianglifyBannerBackground(householdForm.state.values.name.trim() || household.id),
    [household.id, householdForm.state.values.name]
  );
  const householdPreviewBackgroundImage = householdImageUrl ? `url("${householdImageUrl}")` : generatedHouseholdBannerUrl;
  const ownerCount = useMemo(() => members.filter((member) => member.role === "owner").length, [members]);
  const uniqueMembers = useMemo(() => {
    const map = new Map<string, HouseholdMember>();
    members.forEach((member) => map.set(member.user_id, member));
    if (!map.has(userId)) {
      map.set(userId, {
        household_id: household.id,
        user_id: userId,
        role: currentMember?.role ?? "member",
        display_name: currentMember?.display_name ?? null,
        avatar_url: currentMember?.avatar_url ?? null,
        user_color: currentMember?.user_color ?? null,
        vacation_mode: currentMember?.vacation_mode ?? false,
        room_size_sqm: currentMember?.room_size_sqm ?? null,
        common_area_factor: currentMember?.common_area_factor ?? 1,
        task_laziness_factor: currentMember?.task_laziness_factor ?? 1,
        created_at: currentMember?.created_at ?? new Date(0).toISOString()
      });
    }
    return [...map.values()];
  }, [currentMember, household.id, members, userId]);
  const memberLabel = useMemo(
    () =>
      createMemberLabelGetter({
        members: uniqueMembers,
        currentUserId: userId,
        youLabel: t("common.you"),
        youLabels: {
          nominative: t("common.youNominative"),
          dative: t("common.youDative"),
          accusative: t("common.youAccusative")
        },
        fallbackLabel: t("common.memberFallback")
      }),
    [t, uniqueMembers, userId]
  );
  const canDissolveHousehold = isOwner && uniqueMembers.length === 1 && uniqueMembers[0]?.user_id === userId;
  const pushEnabled = notificationPermission === "granted";
  const [firebaseMessagingSupport, setFirebaseMessagingSupport] = useState<
    "checking" | "supported" | "unsupported" | "missing_config"
  >("checking");

  useEffect(() => {
    let active = true;
    const checkSupport = async () => {
      if (!isFirebaseConfigured) {
        if (active) setFirebaseMessagingSupport("missing_config");
        return;
      }
      if (typeof window === "undefined") {
        if (active) setFirebaseMessagingSupport("unsupported");
        return;
      }
      try {
        const supported = await isSupported();
        if (active) setFirebaseMessagingSupport(supported ? "supported" : "unsupported");
      } catch {
        if (active) setFirebaseMessagingSupport("unsupported");
      }
    };
    void checkSupport();
    return () => {
      active = false;
    };
  }, []);
  const pushPermissionLabel = t(`settings.pushStatus.${notificationPermission}`);
  const pushSupportLabel = t(`settings.pushSupport.${firebaseMessagingSupport}`);
  const pushTopics = useMemo(
    () => [
      { id: "task_due", label: t("settings.pushUsedForTaskDue") },
      { id: "task_reminder", label: t("settings.pushUsedForTaskReminder") },
      { id: "task_completed", label: t("settings.pushUsedForTaskCompleted") },
      { id: "task_skipped", label: t("settings.pushUsedForTaskSkipped") },
      { id: "task_taken_over", label: t("settings.pushUsedForTaskTakenOver") },
      { id: "task_rated", label: t("settings.pushUsedForTaskRated") },
      { id: "vacation_mode", label: t("settings.pushUsedForVacationMode") },
      { id: "member_of_month", label: t("settings.pushUsedForMemberOfMonth") },
      { id: "finance_created", label: t("settings.pushUsedForFinanceCreated") },
      { id: "shopping_added", label: t("settings.pushUsedForShoppingAdded") },
      { id: "shopping_completed", label: t("settings.pushUsedForShoppingCompleted") },
      { id: "bucket_added", label: t("settings.pushUsedForBucketAdded") },
      { id: "cash_audit_requested", label: t("settings.pushUsedForCashAudit") }
    ],
    [t]
  );
  const isPushPreferencesReady = Boolean(pushPreferences);
  const pushPreferencesDirty = Boolean(
    pushPreferences && pushPreferencesSnapshot && serializePushPreferences(pushPreferences) !== pushPreferencesSnapshot
  );
  const quietHoursStart = pushPreferences?.quiet_hours?.start ?? "";
  const quietHoursEnd = pushPreferences?.quiet_hours?.end ?? "";
  const quietHoursPartial = Boolean(quietHoursStart) !== Boolean(quietHoursEnd);
  const quietHoursInvalid =
    quietHoursPartial || Boolean(quietHoursStart && quietHoursEnd && quietHoursStart === quietHoursEnd);
  const pushPreferencesControlsDisabled = pushPreferencesBusy || !(pushPreferences?.enabled ?? true);
  const pushPreferencesSaveDisabled = pushPreferencesBusy || !pushPreferencesDirty || quietHoursInvalid;
  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return `/?invite=${encodeURIComponent(household.invite_code)}`;
    return `${window.location.origin}/?invite=${encodeURIComponent(household.invite_code)}`;
  }, [household.invite_code]);
  const onShareInvite = async () => {
    const shareTitle = t("settings.inviteDialogTitle");
    const shareText = t("settings.inviteShareText", { code: household.invite_code });

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: inviteUrl
        });
        return;
      } catch {
        // fall through to clipboard fallback when share was cancelled/failed.
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      return;
    }
  };

  const updatePushPreferences = (updater: (current: PushPreferences) => PushPreferences) => {
    setPushPreferences((current) => (current ? updater(current) : current));
  };

  const savePushPreferences = async () => {
    if (!pushPreferences) return;
    setPushPreferencesBusy(true);
    setPushPreferencesError(null);
    try {
      const updated = await upsertPushPreferences({
        householdId: pushPreferences.household_id,
        userId: pushPreferences.user_id,
        enabled: pushPreferences.enabled,
        quietHours: pushPreferences.quiet_hours ?? {},
        topics: pushPreferences.topics ?? []
      });
      setPushPreferences(updated);
      setPushPreferencesSnapshot(serializePushPreferences(updated));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("app.unknownError");
      setPushPreferencesError(message);
    } finally {
      setPushPreferencesBusy(false);
    }
  };
  const showMe = section === "me";
  const showHousehold = section === "household";
  const handleClearWhiteboard = useCallback(async () => {
    if (!isOwner || !household?.id || !userId) return;
    setWhiteboardResetBusy(true);
    setWhiteboardResetError(null);
    setWhiteboardResetStatus(null);
    try {
      await upsertHouseholdWhiteboard(household.id, userId, "");
      setWhiteboardResetStatus(t("settings.whiteboardClearSuccess"));
      setWhiteboardResetOpen(false);
    } catch {
      setWhiteboardResetError(t("settings.whiteboardClearError"));
    } finally {
      setWhiteboardResetBusy(false);
    }
  }, [household.id, isOwner, t, userId]);

  useEffect(() => {
    if (!showHousehold || !isOwner) return;
    applyHouseholdTheme({
      primaryColor: householdForm.state.values.themePrimaryColor,
      accentColor: householdForm.state.values.themeAccentColor,
      fontFamily: householdForm.state.values.themeFontFamily,
      radiusScale: normalizeThemeRadiusScale(householdForm.state.values.themeRadiusScale)
    });
    return () => {
      applyHouseholdTheme({
        primaryColor: household.theme_primary_color,
        accentColor: household.theme_accent_color,
        fontFamily: household.theme_font_family,
        radiusScale: household.theme_radius_scale
      });
    };
  }, [
    household.theme_accent_color,
    household.theme_font_family,
    household.theme_primary_color,
    household.theme_radius_scale,
    householdForm.state.values.themeAccentColor,
    householdForm.state.values.themeFontFamily,
    householdForm.state.values.themePrimaryColor,
    householdForm.state.values.themeRadiusScale,
    isOwner,
    showHousehold
  ]);

  return (
    <div className="space-y-4">
      {showMe ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.clientTitle")}</CardTitle>
            <CardDescription>{t("settings.clientDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeLanguageControls surface="default" />
          </CardContent>
        </Card>
      ) : null}

      {showMe ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.profileTitle")}</CardTitle>
            <CardDescription>
              {t("settings.profileDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void profileNameForm.handleSubmit();
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="profile-display-name">
                  {t("settings.profileNameLabel")}
                </Label>
                <profileNameForm.Field
                  name="displayName"
                  children={(field: {
                    state: { value: string };
                    handleChange: (value: string) => void;
                  }) => (
                    <div className="relative">
                      <Input
                        id="profile-display-name"
                        className="pr-11"
                        value={field.state.value}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        placeholder={t("settings.profileNamePlaceholder")}
                      />
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="submit"
                              size="sm"
                              variant="outline"
                              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-md p-0"
                              disabled={busy}
                              aria-label={t("settings.profileNameSave")}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.profileNameSave")}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                />

                {userEmail ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("settings.currentEmail", { value: userEmail })}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor="profile-color">
                    {t("settings.profileColorLabel")}
                  </Label>
                  <div className="relative flex items-center overflow-hidden rounded-xl border border-brand-200 bg-white focus-within:border-brand-500 focus-within:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.45)] dark:border-slate-700 dark:bg-slate-900 dark:focus-within:border-slate-500 dark:focus-within:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]">
                    <profileColorForm.Field
                      name="userColor"
                      children={(field: {
                        state: { value: string };
                        handleChange: (value: string) => void;
                      }) => (
                        <>
                          <Input
                            id="profile-color"
                            type="color"
                            className="h-10 w-14 m-1 rounded-l-[8px] rounded-r-[8px] border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                            value={normalizeUserColor(field.state.value)}
                            onChange={(event) =>
                              field.handleChange(
                                normalizeUserColor(event.target.value),
                              )
                            }
                          />
                          <Input
                            className="h-10 flex-1 border-0 bg-transparent px-3 pr-11 shadow-none focus-visible:ring-0"
                            value={normalizeUserColor(field.state.value)}
                            onChange={(event) =>
                              field.handleChange(
                                normalizeUserColor(event.target.value),
                              )
                            }
                            placeholder="#4f46e5"
                          />
                        </>
                      )}
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-md p-0"
                            disabled={busy}
                            aria-label={t("settings.profileColorSave")}
                            onClick={() => {
                              void profileColorForm.handleSubmit();
                            }}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("settings.profileColorSave")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                <div className="space-y-1">
                  <input
                    ref={profileUploadInputRef}
                    id="profile-image-upload"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void onProfileFileChange(file);
                      event.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={profileCameraInputRef}
                    id="profile-image-camera"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void onProfileFileChange(file);
                      event.currentTarget.value = "";
                    }}
                  />
                  <div className="relative inline-block w-fit">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            role="button"
                            tabIndex={0}
                            className="relative inline-flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-brand-200 bg-brand-50 text-slate-600 transition hover:border-brand-300 hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                            onClick={() => {
                              if (!busy) profileUploadInputRef.current?.click();
                            }}
                            onKeyDown={(event) => {
                              if (busy) return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                profileUploadInputRef.current?.click();
                              }
                            }}
                            aria-label={t("settings.profileImageUploadLabel")}
                          >
                            <img
                              src={profilePreviewImageUrl}
                              alt={t("settings.profileImagePreviewAlt")}
                              className="h-full w-full object-cover"
                            />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="absolute bottom-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-700 dark:bg-slate-900/90 dark:text-slate-200"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    profileCameraInputRef.current?.click();
                                  }}
                                  aria-label={t("tasks.stateImageCameraButton")}
                                >
                                  <Camera className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t("tasks.stateImageCameraButton")}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("settings.profileImageUploadLabel")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {profileImageUrl ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        className="absolute -right-1 -top-1 h-6 w-6 rounded-full p-0"
                        disabled={busy}
                        onClick={() => {
                          void onRemoveProfileImage();
                        }}
                        aria-label={t("settings.removeImage")}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              {profileUploadError ? (
                <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                  {profileUploadError}
                </p>
              ) : null}

              <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t("settings.vacationModeLabel")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("settings.vacationModeDescription")}
                  </p>
                </div>
                <Switch
                  checked={currentMember?.vacation_mode ?? false}
                  disabled={busy || !currentMember}
                  onCheckedChange={(checked) => {
                    setPendingVacationMode(checked);
                    setVacationDialogOpen(true);
                  }}
                  aria-label={t("settings.vacationModeLabel")}
                />
              </div>
              <Dialog
                open={vacationDialogOpen}
                onOpenChange={(open) => {
                  setVacationDialogOpen(open);
                  if (!open) {
                    setPendingVacationMode(null);
                  }
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {t("settings.vacationModeConfirmTitle")}
                    </DialogTitle>
                    <DialogDescription>
                      {pendingVacationMode
                        ? t("settings.vacationModeConfirmEnable")
                        : t("settings.vacationModeConfirmDisable")}
                    </DialogDescription>
                  </DialogHeader>
                  {pendingVacationMode && dueTasksAssignedCount > 0 ? (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
                      {t("settings.vacationModeOpenTasksWarning", {
                        count: dueTasksAssignedCount,
                      })}
                    </p>
                  ) : null}
                  <div className="mt-4 flex justify-end gap-2">
                    <DialogClose asChild>
                      <Button variant="ghost">{t("common.cancel")}</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button
                        type="button"
                        onClick={() => {
                          if (pendingVacationMode === null) return;
                          void onUpdateVacationMode(pendingVacationMode);
                        }}
                        disabled={busy || pendingVacationMode === null}
                      >
                        {t("common.confirm")}
                      </Button>
                    </DialogClose>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="rounded-xl border border-brand-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {t("settings.pushTitle")}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t("settings.pushDescription")}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {t("settings.pushStatusLabel", {
                        status: pushPermissionLabel,
                      })}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {t("settings.pushSupportLabel", {
                        status: pushSupportLabel,
                      })}
                    </p>
                  </div>
                  <Switch
                    checked={pushEnabled}
                    onCheckedChange={() => {
                      if (!pushEnabled) {
                        void onEnableNotifications();
                      }
                    }}
                    disabled={busy || pushEnabled}
                    aria-label={t("settings.pushEnableAction")}
                  />
                </div>
                <Accordion
                  type="single"
                  collapsible
                  className="mt-2 rounded-xl border border-brand-100 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <AccordionItem value="push-more" className="border-none">
                    <AccordionTrigger className="py-2 text-xs font-semibold">
                      {t("settings.pushUsedForTitle")}
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="space-y-3 text-slate-600 dark:text-slate-300">
                        <ul className="list-disc space-y-0.5 pl-4">
                          <li>{t("settings.pushUsedForTaskDue")}</li>
                          <li>{t("settings.pushUsedForTaskCompleted")}</li>
                          <li>{t("settings.pushUsedForTaskSkipped")}</li>
                          <li>{t("settings.pushUsedForTaskTakenOver")}</li>
                          <li>{t("settings.pushUsedForTaskRated")}</li>
                          <li>{t("settings.pushUsedForVacationMode")}</li>
                          <li>{t("settings.pushUsedForMemberOfMonth")}</li>
                          <li>{t("settings.pushUsedForFinanceCreated")}</li>
                          <li>{t("settings.pushUsedForShoppingAdded")}</li>
                          <li>{t("settings.pushUsedForShoppingCompleted")}</li>
                          <li>{t("settings.pushUsedForBucketAdded")}</li>
                          <li>{t("settings.pushUsedForCashAudit")}</li>
                        </ul>

                        <div className="space-y-3 border-t border-brand-100 pt-3 dark:border-slate-700">
                          {!pushEnabled ? (
                            <p className="text-slate-500 dark:text-slate-400">
                              {t("settings.pushPreferencesHint")}
                            </p>
                          ) : !isPushPreferencesReady ? (
                            <p className="text-slate-500 dark:text-slate-400">
                                  {t("settings.pushPreferencesLoading")}
                                </p>
                              ) : (
                                <>
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {t("settings.pushPreferencesTitle")}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {t("settings.pushPreferencesDescription")}
                                  </p>
                                </div>
                                <Switch
                                  checked={pushPreferences?.enabled ?? true}
                                  onCheckedChange={(checked) => {
                                    updatePushPreferences((current) => ({
                                      ...current,
                                      enabled: checked,
                                    }));
                                  }}
                                  disabled={pushPreferencesBusy}
                                  aria-label={t(
                                    "settings.pushPreferencesTitle",
                                  )}
                                />
                              </div>
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                  {t("settings.pushPreferencesTopics")}
                                </p>
                                <div
                                  className={`grid gap-2 sm:grid-cols-2 ${pushPreferencesControlsDisabled ? "opacity-60" : ""}`}
                                >
                                  {pushTopics.map((topic) => {
                                    const isChecked = (
                                      pushPreferences?.topics ?? []
                                    ).includes(topic.id);
                                    return (
                                      <label
                                        key={topic.id}
                                        className="flex items-center gap-2"
                                      >
                                        <Checkbox
                                          checked={isChecked}
                                          onCheckedChange={(checked) => {
                                            updatePushPreferences((current) => {
                                              const nextTopics = new Set(
                                                current.topics ?? [],
                                              );
                                              if (checked) {
                                                nextTopics.add(topic.id);
                                              } else {
                                                nextTopics.delete(topic.id);
                                              }
                                              return {
                                                ...current,
                                                topics: Array.from(nextTopics),
                                              };
                                            });
                                          }}
                                          disabled={
                                            pushPreferencesControlsDisabled
                                          }
                                        />
                                        <span className="text-xs text-slate-700 dark:text-slate-200">
                                          {topic.label}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                  {t("settings.pushQuietHoursTitle")}
                                </p>
                                <div
                                  className={`grid gap-2 sm:grid-cols-2 ${pushPreferencesControlsDisabled ? "opacity-60" : ""}`}
                                >
                                  <div className="space-y-1">
                                    <Label className="text-xs">
                                      {t("settings.pushQuietHoursStart")}
                                    </Label>
                                    <Input
                                      type="time"
                                      value={
                                        pushPreferences?.quiet_hours?.start ??
                                        ""
                                      }
                                      onChange={(event) => {
                                        const start = event.target.value;
                                        updatePushPreferences((current) => ({
                                          ...current,
                                          quiet_hours: {
                                            ...current.quiet_hours,
                                            start,
                                            timezone:
                                              Intl.DateTimeFormat().resolvedOptions()
                                                .timeZone,
                                            offsetMinutes:
                                              -new Date().getTimezoneOffset(),
                                          },
                                        }));
                                      }}
                                      disabled={pushPreferencesControlsDisabled}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">
                                      {t("settings.pushQuietHoursEnd")}
                                    </Label>
                                    <Input
                                      type="time"
                                      value={
                                        pushPreferences?.quiet_hours?.end ?? ""
                                      }
                                      onChange={(event) => {
                                        const end = event.target.value;
                                        updatePushPreferences((current) => ({
                                          ...current,
                                          quiet_hours: {
                                            ...current.quiet_hours,
                                            end,
                                            timezone:
                                              Intl.DateTimeFormat().resolvedOptions()
                                                .timeZone,
                                            offsetMinutes:
                                              -new Date().getTimezoneOffset(),
                                          },
                                        }));
                                      }}
                                      disabled={pushPreferencesControlsDisabled}
                                    />
                                  </div>
                                </div>
                                {quietHoursInvalid ? (
                                  <p className="text-xs text-amber-600 dark:text-amber-300">
                                    {t("settings.pushQuietHoursInvalid")}
                                  </p>
                                ) : null}
                              </div>
                              {pushPreferencesError ? (
                                <p className="text-xs text-rose-600 dark:text-rose-300">
                                  {pushPreferencesError}
                                </p>
                              ) : null}
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void savePushPreferences()}
                                  disabled={pushPreferencesSaveDisabled}
                                >
                                  {t("settings.pushPreferencesSave")}
                                </Button>
                              </div>
                                </>
                              )}
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-brand-100 pt-3 dark:border-slate-700">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t("settings.pushReregisterAction")}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void onReregisterPushToken();
                            }}
                            disabled={busy || firebaseMessagingSupport !== "supported"}
                          >
                            {t("settings.pushReregisterAction")}
                          </Button>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </form>
            <form
              className="mt-4 space-y-3 border-t border-brand-100 pt-4 dark:border-slate-700"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void profilePaymentsForm.handleSubmit();
              }}
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("settings.paymentHandlesTitle")}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("settings.paymentHandlesDescription")}
              </p>
              <profilePaymentsForm.Field
                name="paypalName"
                children={(field: {
                  state: { value: string };
                  handleChange: (value: string) => void;
                }) => (
                  <div className="space-y-1">
                    <Label
                      htmlFor="paypal-name"
                      className="inline-flex items-center gap-1.5"
                    >
                      <PaymentBrandIcon brand="paypal" className="h-4 w-4" />
                      <span>{t("settings.paypalNameLabel")}</span>
                    </Label>
                    <Input
                      id="paypal-name"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder={t("settings.paypalNamePlaceholder")}
                    />
                  </div>
                )}
              />
              <profilePaymentsForm.Field
                name="revolutName"
                children={(field: {
                  state: { value: string };
                  handleChange: (value: string) => void;
                }) => (
                  <div className="space-y-1">
                    <Label
                      htmlFor="revolut-name"
                      className="inline-flex items-center gap-1.5"
                    >
                      <PaymentBrandIcon brand="revolut" className="h-4 w-4" />
                      <span>{t("settings.revolutNameLabel")}</span>
                    </Label>
                    <Input
                      id="revolut-name"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder={t("settings.revolutNamePlaceholder")}
                    />
                  </div>
                )}
              />
              <profilePaymentsForm.Field
                name="weroName"
                children={(field: {
                  state: { value: string };
                  handleChange: (value: string) => void;
                }) => (
                  <div className="space-y-1">
                    <Label
                      htmlFor="wero-name"
                      className="inline-flex items-center gap-1.5"
                    >
                      <PaymentBrandIcon brand="wero" className="h-4 w-4" />
                      <span>{t("settings.weroNameLabel")}</span>
                    </Label>
                    <Input
                      id="wero-name"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder={t("settings.weroNamePlaceholder")}
                    />
                  </div>
                )}
              />
              <Button type="submit" disabled={busy}>
                {t("settings.paymentSave")}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {showHousehold ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.householdTitle")}</CardTitle>
            <CardDescription>
              {isOwner
                ? t("settings.householdDescription")
                : t("settings.householdOwnerOnlyHint")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void householdForm.handleSubmit();
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="household-name">
                  {t("settings.householdNameLabel")}
                </Label>
                <householdForm.Field
                  name="name"
                  children={(field: {
                    state: { value: string };
                    handleChange: (value: string) => void;
                  }) => (
                    <Input
                      id="household-name"
                      value={field.state.value}
                      disabled={busy || !isOwner}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder={t("settings.householdNamePlaceholder")}
                    />
                  )}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="household-image-upload">
                  {t("settings.householdImageUploadLabel")}
                </Label>
                <input
                  ref={householdUploadInputRef}
                  id="household-image-upload"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void onHouseholdFileChange(file);
                    event.currentTarget.value = "";
                  }}
                />
                <input
                  ref={householdCameraInputRef}
                  id="household-image-camera"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void onHouseholdFileChange(file);
                    event.currentTarget.value = "";
                  }}
                />
                <div className="relative">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          role="button"
                          tabIndex={0}
                          className="relative inline-flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border border-brand-200 bg-brand-50 text-slate-600 transition hover:border-brand-300 hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                          onClick={() => {
                            if (busy || !isOwner) return;
                            householdUploadInputRef.current?.click();
                          }}
                          onKeyDown={(event) => {
                            if (busy || !isOwner) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              householdUploadInputRef.current?.click();
                            }
                          }}
                          aria-label={t("settings.householdImageUploadLabel")}
                        >
                          <span
                            aria-label={t("settings.householdImagePreviewAlt")}
                            className="absolute inset-0 bg-cover bg-center"
                            style={{
                              backgroundImage: householdPreviewBackgroundImage,
                            }}
                          />
                          <span className="absolute inset-0 bg-gradient-to-r from-slate-900/30 via-slate-900/10 to-slate-900/35" />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 dark:bg-slate-900/90 dark:text-slate-200"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  householdCameraInputRef.current?.click();
                                }}
                                aria-label={t("tasks.stateImageCameraButton")}
                              >
                                <Camera className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t("tasks.stateImageCameraButton")}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("settings.householdImageUploadLabel")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {householdImageUrl ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      className="absolute -right-1 -top-1 h-6 w-6 rounded-full p-0"
                      disabled={busy || !isOwner}
                      onClick={() => {
                        void onRemoveHouseholdImage();
                      }}
                      aria-label={t("settings.removeImage")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="household-address">
                  {t("settings.householdAddressLabel")}
                </Label>
                <householdForm.Field
                  name="address"
                  children={(field: {
                    state: { value: string };
                    handleChange: (value: string) => void;
                  }) => (
                    <Input
                      id="household-address"
                      value={field.state.value}
                      disabled={busy || !isOwner}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder={t("settings.householdAddressPlaceholder")}
                    />
                  )}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="household-currency">
                  {t("settings.householdCurrencyLabel")}
                </Label>
                <householdForm.Field
                  name="currency"
                  children={(field: {
                    state: { value: string };
                    handleChange: (value: string) => void;
                  }) => {
                    const selected = findCurrencyOption(field.state.value);
                    return (
                      <Select
                        value={field.state.value}
                        onValueChange={field.handleChange}
                        disabled={busy || !isOwner}
                      >
                        <SelectTrigger
                          id="household-currency"
                          aria-label={t("settings.householdCurrencyLabel")}
                        >
                          {field.state.value ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">
                                {selected?.icon ?? "💱"}
                              </span>
                              <span>{field.state.value}</span>
                            </div>
                          ) : (
                            <SelectValue
                              placeholder={t(
                                "settings.householdCurrencyPlaceholder",
                              )}
                            />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {findCurrencyOption(field.state.value) ? null : (
                            <SelectItem value={field.state.value}>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">💱</span>
                                <span>{field.state.value}</span>
                              </div>
                            </SelectItem>
                          )}
                          {CURRENCY_OPTIONS.map((currency) => (
                            <SelectItem
                              key={currency.code}
                              value={currency.code}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">
                                  {currency.icon}
                                </span>
                                <span>{currency.code}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  {currency.label}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  }}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t("settings.householdLazinessTitle")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("settings.householdLazinessDescription")}
                  </p>
                </div>
                <householdForm.Field
                  name="taskLazinessEnabled"
                  children={(field: {
                    state: { value: boolean };
                    handleChange: (value: boolean) => void;
                  }) => (
                    <Switch
                      checked={field.state.value}
                      disabled={busy || !isOwner}
                      onCheckedChange={field.handleChange}
                      aria-label={t("settings.householdLazinessTitle")}
                    />
                  )}
                />
              </div>

              <div className="rounded-xl border border-brand-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t("settings.householdThemeTitle")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("settings.householdThemeDescription")}
                  </p>
                </div>
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("settings.householdThemePresets")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {themePresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-brand-50/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        onClick={() => {
                          if (!isOwner || busy) return;
                          householdForm.setFieldValue(
                            "themePrimaryColor",
                            preset.primary,
                          );
                          householdForm.setFieldValue(
                            "themeAccentColor",
                            preset.accent,
                          );
                          householdForm.setFieldValue(
                            "themeFontFamily",
                            preset.font,
                          );
                          householdForm.setFieldValue(
                            "themeRadiusScale",
                            preset.radius,
                          );
                          applyThemePreview({
                            themePrimaryColor: preset.primary,
                            themeAccentColor: preset.accent,
                            themeFontFamily: preset.font,
                            themeRadiusScale: preset.radius,
                          });
                        }}
                        disabled={!isOwner || busy}
                      >
                        <span
                          className="h-3 w-3 rounded-full border border-slate-300 dark:border-slate-600"
                          style={{ backgroundColor: preset.primary }}
                        />
                        <span
                          className="h-3 w-3 rounded-full border border-slate-300 dark:border-slate-600"
                          style={{ backgroundColor: preset.accent }}
                        />
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <householdForm.Field
                    name="themePrimaryColor"
                    children={(field: {
                      state: { value: string };
                      handleChange: (value: string) => void;
                    }) => (
                      <div className="space-y-1">
                        <Label>
                          {t("settings.householdThemePrimaryLabel")}
                        </Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={field.state.value}
                            disabled={busy || !isOwner}
                            onChange={(event) => {
                              field.handleChange(event.target.value);
                              applyThemePreview({
                                themePrimaryColor: event.target.value,
                              });
                            }}
                            className="h-9 w-10 cursor-pointer rounded border border-brand-200 bg-white p-0 dark:border-slate-700 dark:bg-slate-900"
                            aria-label={t(
                              "settings.householdThemePrimaryLabel",
                            )}
                          />
                          <Input
                            value={field.state.value}
                            disabled={busy || !isOwner}
                            onChange={(event) => {
                              field.handleChange(event.target.value);
                              applyThemePreview({
                                themePrimaryColor: event.target.value,
                              });
                            }}
                            placeholder="#1f8a7f"
                          />
                        </div>
                      </div>
                    )}
                  />
                  <householdForm.Field
                    name="themeAccentColor"
                    children={(field: {
                      state: { value: string };
                      handleChange: (value: string) => void;
                    }) => (
                      <div className="space-y-1">
                        <Label>{t("settings.householdThemeAccentLabel")}</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={field.state.value}
                            disabled={busy || !isOwner}
                            onChange={(event) => {
                              field.handleChange(event.target.value);
                              applyThemePreview({
                                themeAccentColor: event.target.value,
                              });
                            }}
                            className="h-9 w-10 cursor-pointer rounded border border-brand-200 bg-white p-0 dark:border-slate-700 dark:bg-slate-900"
                            aria-label={t("settings.householdThemeAccentLabel")}
                          />
                          <Input
                            value={field.state.value}
                            disabled={busy || !isOwner}
                            onChange={(event) => {
                              field.handleChange(event.target.value);
                              applyThemePreview({
                                themeAccentColor: event.target.value,
                              });
                            }}
                            placeholder="#14b8a6"
                          />
                        </div>
                      </div>
                    )}
                  />
                  <householdForm.Field
                    name="themeFontFamily"
                    children={(field: {
                      state: { value: string };
                      handleChange: (value: string) => void;
                    }) => (
                      <div className="space-y-1">
                        <Label>{t("settings.householdThemeFontLabel")}</Label>
                        <select
                          className="h-10 w-full rounded-xl border border-brand-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          style={{ fontFamily: field.state.value }}
                          value={field.state.value}
                          onChange={(event) => {
                            field.handleChange(event.target.value);
                            applyThemePreview({
                              themeFontFamily: event.target.value,
                            });
                          }}
                          disabled={busy || !isOwner}
                        >
                          <option
                            value='"Space Grotesk", "Segoe UI", sans-serif'
                            style={{
                              fontFamily:
                                '"Space Grotesk", "Segoe UI", sans-serif',
                            }}
                          >
                            Space Grotesk
                          </option>
                          <option
                            value='"Inter", "Segoe UI", sans-serif'
                            style={{
                              fontFamily: '"Inter", "Segoe UI", sans-serif',
                            }}
                          >
                            Inter
                          </option>
                          <option
                            value='"Manrope", "Segoe UI", sans-serif'
                            style={{
                              fontFamily: '"Manrope", "Segoe UI", sans-serif',
                            }}
                          >
                            Manrope
                          </option>
                          <option
                            value='"Sora", "Segoe UI", sans-serif'
                            style={{
                              fontFamily: '"Sora", "Segoe UI", sans-serif',
                            }}
                          >
                            Sora
                          </option>
                          <option
                            value='"Plus Jakarta Sans", "Segoe UI", sans-serif'
                            style={{
                              fontFamily:
                                '"Plus Jakarta Sans", "Segoe UI", sans-serif',
                            }}
                          >
                            Plus Jakarta Sans
                          </option>
                          <option
                            value='"IBM Plex Sans", "Segoe UI", sans-serif'
                            style={{
                              fontFamily:
                                '"IBM Plex Sans", "Segoe UI", sans-serif',
                            }}
                          >
                            IBM Plex Sans
                          </option>
                          <option
                            value='"Fira Sans", "Segoe UI", sans-serif'
                            style={{
                              fontFamily: '"Fira Sans", "Segoe UI", sans-serif',
                            }}
                          >
                            Fira Sans
                          </option>
                          <option
                            value='"Rubik", "Segoe UI", sans-serif'
                            style={{
                              fontFamily: '"Rubik", "Segoe UI", sans-serif',
                            }}
                          >
                            Rubik
                          </option>
                          <option
                            value='"Nunito", "Segoe UI", sans-serif'
                            style={{
                              fontFamily: '"Nunito", "Segoe UI", sans-serif',
                            }}
                          >
                            Nunito
                          </option>
                          <option
                            value='"Source Sans 3", "Segoe UI", sans-serif'
                            style={{
                              fontFamily:
                                '"Source Sans 3", "Segoe UI", sans-serif',
                            }}
                          >
                            Source Sans 3
                          </option>
                          <option
                            value='"Merriweather", "Georgia", serif'
                            style={{
                              fontFamily: '"Merriweather", "Georgia", serif',
                            }}
                          >
                            Merriweather
                          </option>
                          <option
                            value='"Lora", "Georgia", serif'
                            style={{ fontFamily: '"Lora", "Georgia", serif' }}
                          >
                            Lora
                          </option>
                          <option
                            value='"Playfair Display", "Georgia", serif'
                            style={{
                              fontFamily:
                                '"Playfair Display", "Georgia", serif',
                            }}
                          >
                            Playfair Display
                          </option>
                        </select>
                      </div>
                    )}
                  />
                  <householdForm.Field
                    name="themeRadiusScale"
                    children={(field: {
                      state: { value: string };
                      handleChange: (value: string) => void;
                    }) => (
                      <div className="space-y-1">
                        <Label>{t("settings.householdThemeRadiusLabel")}</Label>
                        <InputWithSuffix
                          suffix="×"
                          type="number"
                          min="0.5"
                          max="1.5"
                          step="0.1"
                          inputMode="decimal"
                          value={field.state.value}
                          onChange={(event) => {
                            field.handleChange(event.target.value);
                            applyThemePreview({
                              themeRadiusScale: event.target.value,
                            });
                          }}
                          placeholder="1.0"
                          disabled={busy || !isOwner}
                        />
                      </div>
                    )}
                  />
                </div>
              </div>

              {householdUploadError ? (
                <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                  {householdUploadError}
                </p>
              ) : null}

              {formError ? (
                <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                  {formError}
                </p>
              ) : null}

              <Button type="submit" disabled={busy || !isOwner}>
                {t("settings.householdSave")}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {showHousehold ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.whiteboardTitle")}</CardTitle>
            <CardDescription>
              {isOwner
                ? t("settings.whiteboardDescription")
                : t("settings.householdOwnerOnlyHint")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t("settings.whiteboardClearWarning")}
            </p>
            {whiteboardResetStatus ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                {whiteboardResetStatus}
              </p>
            ) : null}
            {whiteboardResetError ? (
              <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                {whiteboardResetError}
              </p>
            ) : null}
            <Dialog
              open={whiteboardResetOpen}
              onOpenChange={setWhiteboardResetOpen}
            >
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="danger"
                  disabled={!isOwner || whiteboardResetBusy}
                >
                  {t("settings.whiteboardClearButton")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {t("settings.whiteboardClearConfirmTitle")}
                  </DialogTitle>
                  <DialogDescription>
                    {t("settings.whiteboardClearConfirmBody")}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-wrap gap-2">
                  <DialogClose asChild>
                    <Button type="button" variant="ghost">
                      {t("common.cancel")}
                    </Button>
                  </DialogClose>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={whiteboardResetBusy}
                    onClick={() => void handleClearWhiteboard()}
                  >
                    {t("settings.whiteboardClearConfirmAction")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      ) : null}

      {showHousehold ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.tenantsTitle")}</CardTitle>
            <CardDescription>
              {isOwner
                ? t("settings.tenantsDescription")
                : t("settings.tenantsOwnerOnly")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {uniqueMembers.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("settings.tenantsNoMembers")}
              </p>
            ) : (
              <ul className="space-y-2">
                {uniqueMembers.map((member) => {
                  const isSelf = member.user_id === userId;
                  const isMemberOwner = member.role === "owner";
                  const canDemoteLastOwner = isMemberOwner && ownerCount <= 1;
                  const nextRole = isMemberOwner ? "member" : "owner";
                  const roleLabel = isMemberOwner
                    ? t("settings.tenantsDemoteOwner")
                    : t("settings.tenantsMakeOwner");
                  const displayLabel = memberLabel(member.user_id);
                  const commonAreaLabel =
                    member.common_area_factor != null
                      ? `${Math.round(member.common_area_factor * 100)}%`
                      : "—";
                  const avatarUrl =
                    member.avatar_url?.trim() ||
                    createDiceBearAvatarDataUri(
                      getMemberAvatarSeed(member.user_id, member.display_name),
                      member.user_color,
                    );

                  return (
                    <li
                      key={member.user_id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-brand-100 p-3 dark:border-slate-700"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <MemberAvatar
                          src={avatarUrl}
                          alt={displayLabel}
                          isVacation={member.vacation_mode}
                          className="h-9 w-9 shrink-0 rounded-full border border-brand-100 dark:border-slate-700"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            {displayLabel}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {isMemberOwner
                              ? t("settings.tenantsRoleOwner")
                              : t("settings.tenantsRoleMember")}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {commonAreaLabel} {t("settings.tenantsCommonShort")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className={
                                  isMemberOwner
                                    ? "border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
                                    : undefined
                                }
                                disabled={
                                  busy || !isOwner || canDemoteLastOwner
                                }
                                onClick={() => {
                                  void onSetMemberRole(
                                    member.user_id,
                                    nextRole,
                                  );
                                }}
                                aria-label={roleLabel}
                              >
                                <Crown className="h-3.5 w-3.5 sm:mr-1" />
                                <span className="hidden sm:inline">
                                  {roleLabel}
                                </span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{roleLabel}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                variant="danger"
                                disabled={busy || !isOwner || isSelf}
                                onClick={() => {
                                  void onRemoveMember(member.user_id);
                                }}
                                aria-label={t("settings.tenantsKick")}
                              >
                                <UserMinus className="h-3.5 w-3.5 sm:mr-1" />
                                <span className="hidden sm:inline">
                                  {t("settings.tenantsKick")}
                                </span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t("settings.tenantsKick")}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-4 border-t border-brand-100 pt-4 dark:border-slate-700">
              <Dialog
                onOpenChange={(open) => {
                  if (!open) setInviteCopied(false);
                }}
              >
                <DialogTrigger asChild>
                  <Button type="button" disabled={busy || !isOwner}>
                    {t("settings.inviteAction")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("settings.inviteDialogTitle")}</DialogTitle>
                    <DialogDescription>
                      {t("settings.inviteDialogDescription")}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="mx-auto w-fit rounded-xl border border-brand-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-900"
                            aria-label={t("settings.inviteQrAlt")}
                          >
                            <QRCode
                              value={inviteUrl}
                              size={192}
                              aria-label={t("settings.inviteQrAlt")}
                              bgColor="#ffffff"
                              fgColor="#111827"
                              className="h-48 w-48 rounded-md"
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("settings.inviteQrAlt")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <div className="space-y-1">
                      <Label>{t("settings.inviteCodeLabel")}</Label>
                      <p className="rounded-lg border border-brand-100 bg-brand-50/70 px-3 py-2 text-sm font-semibold tracking-wide dark:border-slate-700 dark:bg-slate-800">
                        {household.invite_code}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <Label>{t("settings.inviteLinkLabel")}</Label>
                      <p className="break-all rounded-lg border border-brand-100 bg-white/90 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {inviteUrl}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <DialogClose asChild>
                      <Button variant="ghost">{t("common.cancel")}</Button>
                    </DialogClose>
                    <Button
                      type="button"
                      onClick={() => {
                        void onShareInvite();
                      }}
                    >
                      <Share2 className="mr-1 h-4 w-4" />
                      {inviteCopied
                        ? t("settings.inviteCopied")
                        : t("settings.inviteShareAction")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showMe ? (
        <Card className="border-rose-200 dark:border-rose-900">
          <CardHeader>
            <CardTitle>{t("settings.leaveTitle")}</CardTitle>
            <CardDescription>{t("settings.leaveDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  void onSignOut();
                }}
              >
                {t("common.logout")}
              </Button>

              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300"
                  >
                    {t("settings.leaveAction")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("settings.leaveConfirmTitle")}</DialogTitle>
                    <DialogDescription>
                      {t("settings.leaveConfirmDescription")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="mt-4 flex justify-end gap-2">
                    <DialogClose asChild>
                      <Button variant="ghost">{t("common.cancel")}</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button
                        variant="outline"
                        className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300"
                        onClick={onLeaveHousehold}
                        disabled={busy}
                      >
                        {t("settings.leaveConfirmAction")}
                      </Button>
                    </DialogClose>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy || !canDissolveHousehold}
                  >
                    {t("settings.dissolveAction")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {t("settings.dissolveConfirmTitle")}
                    </DialogTitle>
                    <DialogDescription>
                      {t("settings.dissolveConfirmDescription")}
                    </DialogDescription>
                  </DialogHeader>
                  {!canDissolveHousehold ? (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      {t("settings.dissolveDisabledHint")}
                    </p>
                  ) : null}
                  <div className="mt-4 flex justify-end gap-2">
                    <DialogClose asChild>
                      <Button variant="ghost">{t("common.cancel")}</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button
                        variant="danger"
                        onClick={onDissolveHousehold}
                        disabled={busy || !canDissolveHousehold}
                      >
                        {t("settings.dissolveConfirmAction")}
                      </Button>
                    </DialogClose>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showMe ? (
        <span className="text-xs font-semibold w-full text-center flex justify-center text-slate-900/50 dark:text-slate-100/50">
          {appVersion}
        </span>
      ) : null}
    </div>
  );
};
