import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import imageCompression from "browser-image-compression";
import { Camera, Check, Crown, Share2, UserMinus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import { isSupported } from "firebase/messaging";
import type {
  Household,
  HouseholdMember,
  HouseholdMemberVacation,
  HouseholdTranslationOverride,
  PushPreferences,
  TaskItem,
  UpdateHouseholdInput
} from "../../lib/types";
import { createDiceBearAvatarDataUri, getMemberAvatarSeed } from "../../lib/avatar";
import { createTrianglifyBannerBackground } from "../../lib/banner";
import { createMemberLabelGetter } from "../../lib/member-label";
import { isDueNow } from "../../lib/date";
import { getVacationStatus, isDateWithinRange, isMemberOnVacation } from "../../lib/vacation-utils";
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
import {
  getPushPreferences,
  pollNextcloudLoginFlow,
  setHouseholdStorageCredentials,
  startNextcloudLoginFlow,
  upsertHouseholdWhiteboard,
  upsertPushPreferences
} from "../../lib/api";
import { MemberAvatar } from "../../components/member-avatar";
import { getFirebaseRuntimeConfig } from "../../lib/firebase-config";

interface SettingsPageProps {
  section?: "me" | "household";
  household: Household;
  members: HouseholdMember[];
  currentMember: HouseholdMember | null;
  memberVacations: HouseholdMemberVacation[];
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
  onAddMemberVacation: (input: { startDate: string; endDate: string; note?: string }) => Promise<void>;
  onUpdateMemberVacation: (
    vacationId: string,
    input: { startDate?: string; endDate?: string; note?: string }
  ) => Promise<void>;
  onDeleteMemberVacation: (vacationId: string) => Promise<void>;
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
const MIN_ADDRESS_LENGTH_FOR_GEOCODE = 5;
const ADDRESS_GEOCODE_DEBOUNCE_MS = 650;

const openStreetMapSearchUrl = (query: string) =>
  `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
const openStreetMapPinUrl = (lat: number, lon: number) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;

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

const normalizeTranslationOverrides = (overrides: HouseholdTranslationOverride[]): HouseholdTranslationOverride[] => {
  const deduplicated = new Map<string, string>();
  for (const override of overrides) {
    const find = override.find.trim();
    if (!find) continue;
    deduplicated.set(find, override.replace.trim());
  }
  return [...deduplicated.entries()].map(([find, replace]) => ({ find, replace }));
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
  memberVacations,
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
  onAddMemberVacation,
  onUpdateMemberVacation,
  onDeleteMemberVacation,
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
  const [addressMapCenter, setAddressMapCenter] = useState<[number, number] | null>(null);
  const [addressMapLoading, setAddressMapLoading] = useState(false);
  const [addressMapError, setAddressMapError] = useState<string | null>(null);
  const [addressMapLabel, setAddressMapLabel] = useState<string | null>(null);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [vacationFormStart, setVacationFormStart] = useState(todayIso);
  const [vacationFormEnd, setVacationFormEnd] = useState(todayIso);
  const [vacationFormNote, setVacationFormNote] = useState("");
  const [vacationFormError, setVacationFormError] = useState<string | null>(null);
  const [editingVacationId, setEditingVacationId] = useState<string | null>(null);
  const [translationOverridesDraft, setTranslationOverridesDraft] = useState<HouseholdTranslationOverride[]>(
    () => household.translation_overrides ?? []
  );
  const [storageConnectBusy, setStorageConnectBusy] = useState(false);
  const [storageConnectStatus, setStorageConnectStatus] = useState<string | null>(null);
  const [selectedStorageProviderUi, setSelectedStorageProviderUi] = useState<"none" | "webdav" | "nextcloud">(
    household.storage_provider ?? "none"
  );
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
  const memberVacationsForUser = useMemo(
    () =>
      memberVacations
        .filter((vacation) => vacation.user_id === userId)
        .sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [memberVacations, userId]
  );
  const editingVacation = useMemo(
    () => memberVacationsForUser.find((vacation) => vacation.id === editingVacationId) ?? null,
    [editingVacationId, memberVacationsForUser]
  );
  const isEditingVacationLocked = useMemo(() => {
    if (!editingVacation) return false;
    return editingVacation.start_date <= todayIso;
  }, [editingVacation, todayIso]);
  const isEditingVacationEndLocked = useMemo(() => {
    if (!editingVacation) return false;
    return editingVacation.end_date < todayIso;
  }, [editingVacation, todayIso]);
  const plannedVacationTodayIds = useMemo(
    () =>
      memberVacationsForUser
        .filter((vacation) => isDateWithinRange(todayIso, vacation.start_date, vacation.end_date))
        .map((vacation) => vacation.id),
    [memberVacationsForUser, todayIso]
  );
  const isPlannedVacationToday = plannedVacationTodayIds.length > 0;
  const isVacationToggleActive = (currentMember?.vacation_mode ?? false) || isPlannedVacationToday;

  useEffect(() => {
    if (editingVacation) {
      setVacationFormStart(editingVacation.start_date);
      setVacationFormEnd(editingVacation.end_date);
      setVacationFormNote(editingVacation.note ?? "");
      setVacationFormError(null);
      return;
    }
    setVacationFormStart(todayIso);
    setVacationFormEnd(todayIso);
    setVacationFormNote("");
    setVacationFormError(null);
  }, [editingVacation, todayIso]);
  useEffect(() => {
    setTranslationOverridesDraft(household.translation_overrides ?? []);
  }, [household.id, household.translation_overrides]);
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
      vacationTasksExcludeEnabled: household.vacation_tasks_exclude_enabled ?? true,
      vacationFinancesExcludeEnabled: household.vacation_finances_exclude_enabled ?? true,
      taskSkipEnabled: household.task_skip_enabled ?? true,
      featureBucketEnabled: household.feature_bucket_enabled ?? true,
      featureShoppingEnabled: household.feature_shopping_enabled ?? true,
      featureTasksEnabled: household.feature_tasks_enabled ?? true,
      featureOneOffTasksEnabled: household.feature_one_off_tasks_enabled ?? true,
      featureFinancesEnabled: household.feature_finances_enabled ?? true,
      storageProvider: household.storage_provider ?? "none",
      storageUrl: household.storage_url ?? "",
      storageUsername: household.storage_username ?? "",
      storagePassword: "",
      storageBasePath: household.storage_base_path ?? "/domora",
      oneOffClaimTimeoutHours: String(household.one_off_claim_timeout_hours ?? 72),
      oneOffClaimMaxPimpers: String(household.one_off_claim_max_pimpers ?? 500),
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
        vacationTasksExcludeEnabled: boolean;
        vacationFinancesExcludeEnabled: boolean;
        taskSkipEnabled: boolean;
        featureBucketEnabled: boolean;
        featureShoppingEnabled: boolean;
        featureTasksEnabled: boolean;
        featureOneOffTasksEnabled: boolean;
        featureFinancesEnabled: boolean;
        storageProvider: "none" | "webdav" | "nextcloud";
        storageUrl: string;
        storageUsername: string;
        storagePassword: string;
        storageBasePath: string;
        oneOffClaimTimeoutHours: string;
        oneOffClaimMaxPimpers: string;
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
      const oneOffClaimTimeoutHours = Number(value.oneOffClaimTimeoutHours);
      const oneOffClaimMaxPimpers = Number(value.oneOffClaimMaxPimpers);
      if (!Number.isInteger(oneOffClaimTimeoutHours) || oneOffClaimTimeoutHours < 0 || oneOffClaimTimeoutHours > 336) {
        setFormError(t("settings.oneOffClaimTimeoutError"));
        return;
      }
      if (!Number.isInteger(oneOffClaimMaxPimpers) || oneOffClaimMaxPimpers < 1 || oneOffClaimMaxPimpers > 5000) {
        setFormError(t("settings.oneOffClaimMaxPimpersError"));
        return;
      }
      const normalizedStorageProvider = value.storageProvider;
      const normalizedStorageUrl = value.storageUrl.trim();
      const normalizedStorageUsername = value.storageUsername.trim();
      const normalizedStorageBasePath = value.storageBasePath.trim() || "/domora";
      if (normalizedStorageProvider === "webdav") {
        if (!normalizedStorageUrl) {
          setFormError("Storage URL fehlt.");
          return;
        }
        if (!normalizedStorageUsername) {
          setFormError("Storage Benutzername fehlt.");
          return;
        }
      }
      if (normalizedStorageProvider === "nextcloud" && !normalizedStorageUrl) {
        setFormError("Nextcloud URL fehlt.");
        return;
      }
      if (normalizedStorageProvider === "nextcloud" && !normalizedStorageUsername) {
        setFormError("Nextcloud Benutzername fehlt.");
        return;
      }
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
        vacationTasksExcludeEnabled: value.vacationTasksExcludeEnabled,
        vacationFinancesExcludeEnabled: value.vacationFinancesExcludeEnabled,
        taskSkipEnabled: value.taskSkipEnabled,
        featureBucketEnabled: value.featureBucketEnabled,
        featureShoppingEnabled: value.featureShoppingEnabled,
        featureTasksEnabled: value.featureTasksEnabled,
        featureOneOffTasksEnabled: value.featureOneOffTasksEnabled,
        featureFinancesEnabled: value.featureFinancesEnabled,
        storageProvider: normalizedStorageProvider,
        storageUrl: normalizedStorageUrl,
        storageUsername: normalizedStorageUsername,
        storageBasePath: normalizedStorageBasePath.startsWith("/")
          ? normalizedStorageBasePath
          : `/${normalizedStorageBasePath}`,
        oneOffClaimTimeoutHours,
        oneOffClaimMaxPimpers,
        themePrimaryColor: value.themePrimaryColor,
        themeAccentColor: value.themeAccentColor,
        themeFontFamily: value.themeFontFamily,
        themeRadiusScale: normalizeThemeRadiusScale(value.themeRadiusScale),
        translationOverrides: normalizeTranslationOverrides(translationOverridesDraft),
        householdMapMarkers: household.household_map_markers ?? []
      });
      if (normalizedStorageProvider === "webdav" && value.storagePassword.trim().length > 0) {
        await setHouseholdStorageCredentials({
          householdId: household.id,
          username: normalizedStorageUsername,
          password: value.storagePassword
        });
        householdForm.setFieldValue("storagePassword", "");
      }
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
    householdForm.setFieldValue("vacationTasksExcludeEnabled", household.vacation_tasks_exclude_enabled ?? true);
    householdForm.setFieldValue("vacationFinancesExcludeEnabled", household.vacation_finances_exclude_enabled ?? true);
    householdForm.setFieldValue("taskSkipEnabled", household.task_skip_enabled ?? true);
    householdForm.setFieldValue("featureBucketEnabled", household.feature_bucket_enabled ?? true);
    householdForm.setFieldValue("featureShoppingEnabled", household.feature_shopping_enabled ?? true);
    householdForm.setFieldValue("featureTasksEnabled", household.feature_tasks_enabled ?? true);
    householdForm.setFieldValue("featureOneOffTasksEnabled", household.feature_one_off_tasks_enabled ?? true);
    householdForm.setFieldValue("featureFinancesEnabled", household.feature_finances_enabled ?? true);
    householdForm.setFieldValue("storageProvider", household.storage_provider ?? "none");
    setSelectedStorageProviderUi(household.storage_provider ?? "none");
    householdForm.setFieldValue("storageUrl", household.storage_url ?? "");
    householdForm.setFieldValue("storageUsername", household.storage_username ?? "");
    householdForm.setFieldValue("storagePassword", "");
    householdForm.setFieldValue("storageBasePath", household.storage_base_path ?? "/domora");
    householdForm.setFieldValue("oneOffClaimTimeoutHours", String(household.one_off_claim_timeout_hours ?? 72));
    householdForm.setFieldValue("oneOffClaimMaxPimpers", String(household.one_off_claim_max_pimpers ?? 500));
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
    household.vacation_tasks_exclude_enabled,
    household.vacation_finances_exclude_enabled,
    household.task_skip_enabled,
    household.feature_bucket_enabled,
    household.feature_shopping_enabled,
    household.feature_tasks_enabled,
    household.feature_one_off_tasks_enabled,
    household.feature_finances_enabled,
    household.storage_provider,
    household.storage_url,
    household.storage_username,
    household.storage_base_path,
    household.one_off_claim_timeout_hours,
    household.one_off_claim_max_pimpers,
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
        vacationTasksExcludeEnabled: householdForm.state.values.vacationTasksExcludeEnabled,
        vacationFinancesExcludeEnabled: householdForm.state.values.vacationFinancesExcludeEnabled,
        taskSkipEnabled: householdForm.state.values.taskSkipEnabled,
        featureBucketEnabled: householdForm.state.values.featureBucketEnabled,
        featureShoppingEnabled: householdForm.state.values.featureShoppingEnabled,
        featureTasksEnabled: householdForm.state.values.featureTasksEnabled,
        featureOneOffTasksEnabled: householdForm.state.values.featureOneOffTasksEnabled,
        featureFinancesEnabled: householdForm.state.values.featureFinancesEnabled,
        storageProvider: householdForm.state.values.storageProvider,
        storageUrl: householdForm.state.values.storageUrl.trim(),
        storageUsername: householdForm.state.values.storageUsername.trim(),
        storageBasePath: householdForm.state.values.storageBasePath.trim() || "/domora",
        oneOffClaimTimeoutHours: Number(householdForm.state.values.oneOffClaimTimeoutHours),
        oneOffClaimMaxPimpers: Number(householdForm.state.values.oneOffClaimMaxPimpers),
        themePrimaryColor: householdForm.state.values.themePrimaryColor,
        themeAccentColor: householdForm.state.values.themeAccentColor,
        themeFontFamily: householdForm.state.values.themeFontFamily,
        themeRadiusScale: normalizeThemeRadiusScale(householdForm.state.values.themeRadiusScale),
        translationOverrides: normalizeTranslationOverrides(translationOverridesDraft),
        householdMapMarkers: household.household_map_markers ?? []
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
        vacationTasksExcludeEnabled: householdForm.state.values.vacationTasksExcludeEnabled,
        vacationFinancesExcludeEnabled: householdForm.state.values.vacationFinancesExcludeEnabled,
        taskSkipEnabled: householdForm.state.values.taskSkipEnabled,
        featureBucketEnabled: householdForm.state.values.featureBucketEnabled,
        featureShoppingEnabled: householdForm.state.values.featureShoppingEnabled,
        featureTasksEnabled: householdForm.state.values.featureTasksEnabled,
        featureOneOffTasksEnabled: householdForm.state.values.featureOneOffTasksEnabled,
        featureFinancesEnabled: householdForm.state.values.featureFinancesEnabled,
        storageProvider: householdForm.state.values.storageProvider,
        storageUrl: householdForm.state.values.storageUrl.trim(),
        storageUsername: householdForm.state.values.storageUsername.trim(),
        storageBasePath: householdForm.state.values.storageBasePath.trim() || "/domora",
        oneOffClaimTimeoutHours: Number(householdForm.state.values.oneOffClaimTimeoutHours),
        oneOffClaimMaxPimpers: Number(householdForm.state.values.oneOffClaimMaxPimpers),
        themePrimaryColor: householdForm.state.values.themePrimaryColor,
        themeAccentColor: householdForm.state.values.themeAccentColor,
        themeFontFamily: householdForm.state.values.themeFontFamily,
        themeRadiusScale: normalizeThemeRadiusScale(householdForm.state.values.themeRadiusScale),
        translationOverrides: normalizeTranslationOverrides(translationOverridesDraft),
        householdMapMarkers: household.household_map_markers ?? []
      });
      setHouseholdUploadError(null);
    } catch {
      setHouseholdUploadError(t("settings.householdUploadError"));
    }
  };

  const onAddTranslationOverride = () => {
    setTranslationOverridesDraft((current) => [...current, { find: "", replace: "" }]);
  };

  const onUpdateTranslationOverride = (
    index: number,
    key: "find" | "replace",
    nextValue: string
  ) => {
    setTranslationOverridesDraft((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, [key]: nextValue } : entry))
    );
  };

  const onRemoveTranslationOverride = (index: number) => {
    setTranslationOverridesDraft((current) => current.filter((_, entryIndex) => entryIndex !== index));
  };

  const onConnectNextcloud = async () => {
    if (!isOwner || busy || storageConnectBusy) return;

    const storageUrl = householdForm.state.values.storageUrl.trim();
    const storageUsername = householdForm.state.values.storageUsername.trim();
    const storageBasePath = householdForm.state.values.storageBasePath.trim() || "/domora";
    if (!storageUrl) {
      setFormError("Nextcloud URL fehlt.");
      return;
    }
    if (!storageUsername) {
      setFormError("Nextcloud Benutzername fehlt.");
      return;
    }

    setStorageConnectBusy(true);
    setStorageConnectStatus(null);
    setFormError(null);
    try {
      await onUpdateHousehold({
        name: householdForm.state.values.name.trim(),
        imageUrl: householdForm.state.values.imageUrl,
        address: householdForm.state.values.address,
        currency: normalizeCurrency(householdForm.state.values.currency),
        apartmentSizeSqm: household.apartment_size_sqm,
        coldRentMonthly: household.cold_rent_monthly,
        utilitiesMonthly: household.utilities_monthly,
        utilitiesOnRoomSqmPercent: household.utilities_on_room_sqm_percent,
        taskLazinessEnabled: householdForm.state.values.taskLazinessEnabled,
        vacationTasksExcludeEnabled: householdForm.state.values.vacationTasksExcludeEnabled,
        vacationFinancesExcludeEnabled: householdForm.state.values.vacationFinancesExcludeEnabled,
        taskSkipEnabled: householdForm.state.values.taskSkipEnabled,
        featureBucketEnabled: householdForm.state.values.featureBucketEnabled,
        featureShoppingEnabled: householdForm.state.values.featureShoppingEnabled,
        featureTasksEnabled: householdForm.state.values.featureTasksEnabled,
        featureOneOffTasksEnabled: householdForm.state.values.featureOneOffTasksEnabled,
        featureFinancesEnabled: householdForm.state.values.featureFinancesEnabled,
        storageProvider: "nextcloud",
        storageUrl,
        storageUsername,
        storageBasePath: storageBasePath.startsWith("/") ? storageBasePath : `/${storageBasePath}`,
        oneOffClaimTimeoutHours: Number(householdForm.state.values.oneOffClaimTimeoutHours),
        oneOffClaimMaxPimpers: Number(householdForm.state.values.oneOffClaimMaxPimpers),
        themePrimaryColor: householdForm.state.values.themePrimaryColor,
        themeAccentColor: householdForm.state.values.themeAccentColor,
        themeFontFamily: householdForm.state.values.themeFontFamily,
        themeRadiusScale: normalizeThemeRadiusScale(householdForm.state.values.themeRadiusScale),
        translationOverrides: normalizeTranslationOverrides(translationOverridesDraft),
        householdMapMarkers: household.household_map_markers ?? []
      });

      const started = await startNextcloudLoginFlow({
        householdId: household.id,
        storageUrl
      });
      window.open(started.loginUrl, "_blank", "noopener,noreferrer");

      const maxPollAttempts = 90;
      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const result = await pollNextcloudLoginFlow({
          householdId: household.id,
          flowId: started.flowId
        });
        if (result.status === "connected") {
          householdForm.setFieldValue("storageProvider", "nextcloud");
          householdForm.setFieldValue("storageUsername", result.username);
          householdForm.setFieldValue("storageUrl", result.server);
          setStorageConnectStatus(`Verbunden als ${result.username}`);
          return;
        }
      }

      setFormError("Nextcloud Login-Flow ist abgelaufen oder wurde nicht bestätigt.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("app.unknownError"));
    } finally {
      setStorageConnectBusy(false);
    }
  };

  const profileImageUrl = profileForm.state.values.profileImageUrl.trim();
  useEffect(() => {
    setStorageConnectStatus(null);
  }, [selectedStorageProviderUi]);
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
  const isTasksFeatureEnabled = household.feature_tasks_enabled ?? true;
  const isFinancesFeatureEnabled = household.feature_finances_enabled ?? true;
  const showOneOffClaimSettings =
    householdForm.state.values.featureTasksEnabled && householdForm.state.values.featureOneOffTasksEnabled;
  const isOneOffTimeoutDisabled = Number(householdForm.state.values.oneOffClaimTimeoutHours) === 0;
  const isVacationTaskExclusionEnabled = household.vacation_tasks_exclude_enabled ?? true;
  const isVacationFinanceExclusionEnabled = household.vacation_finances_exclude_enabled ?? true;
  const vacationModeDescription = useMemo(() => {
    if (!isTasksFeatureEnabled && !isFinancesFeatureEnabled) {
      return t("settings.vacationModeDescriptionNone");
    }
    if (isTasksFeatureEnabled && !isVacationTaskExclusionEnabled && !isFinancesFeatureEnabled) {
      return t("settings.vacationModeDescriptionTasksOff");
    }
    if (isFinancesFeatureEnabled && !isVacationFinanceExclusionEnabled && !isTasksFeatureEnabled) {
      return t("settings.vacationModeDescriptionFinancesOff");
    }
    if (isTasksFeatureEnabled && !isVacationTaskExclusionEnabled && isFinancesFeatureEnabled && isVacationFinanceExclusionEnabled) {
      return t("settings.vacationModeDescriptionTasksPartial");
    }
    if (isFinancesFeatureEnabled && !isVacationFinanceExclusionEnabled && isTasksFeatureEnabled && isVacationTaskExclusionEnabled) {
      return t("settings.vacationModeDescriptionFinancesPartial");
    }
    if (!isTasksFeatureEnabled && isFinancesFeatureEnabled && isVacationFinanceExclusionEnabled) {
      return t("settings.vacationModeDescriptionFinancesOnly");
    }
    if (!isFinancesFeatureEnabled && isTasksFeatureEnabled && isVacationTaskExclusionEnabled) {
      return t("settings.vacationModeDescriptionTasksOnly");
    }
    return t("settings.vacationModeDescription");
  }, [
    isTasksFeatureEnabled,
    isFinancesFeatureEnabled,
    isVacationTaskExclusionEnabled,
    isVacationFinanceExclusionEnabled,
    t
  ]);
  const vacationModeConfirmText = useMemo(() => {
    const enabling = Boolean(pendingVacationMode);
    if (!isTasksFeatureEnabled && !isFinancesFeatureEnabled) {
      return enabling
        ? t("settings.vacationModeConfirmEnableNone")
        : t("settings.vacationModeConfirmDisableNone");
    }
    if (isTasksFeatureEnabled && !isVacationTaskExclusionEnabled && !isFinancesFeatureEnabled) {
      return enabling
        ? t("settings.vacationModeConfirmEnableTasksOff")
        : t("settings.vacationModeConfirmDisableTasksOff");
    }
    if (isFinancesFeatureEnabled && !isVacationFinanceExclusionEnabled && !isTasksFeatureEnabled) {
      return enabling
        ? t("settings.vacationModeConfirmEnableFinancesOff")
        : t("settings.vacationModeConfirmDisableFinancesOff");
    }
    if (isTasksFeatureEnabled && !isVacationTaskExclusionEnabled && isFinancesFeatureEnabled && isVacationFinanceExclusionEnabled) {
      return enabling
        ? t("settings.vacationModeConfirmEnableTasksPartial")
        : t("settings.vacationModeConfirmDisableTasksPartial");
    }
    if (isFinancesFeatureEnabled && !isVacationFinanceExclusionEnabled && isTasksFeatureEnabled && isVacationTaskExclusionEnabled) {
      return enabling
        ? t("settings.vacationModeConfirmEnableFinancesPartial")
        : t("settings.vacationModeConfirmDisableFinancesPartial");
    }
    if (!isTasksFeatureEnabled && isFinancesFeatureEnabled && isVacationFinanceExclusionEnabled) {
      return enabling
        ? t("settings.vacationModeConfirmEnableFinancesOnly")
        : t("settings.vacationModeConfirmDisableFinancesOnly");
    }
    if (!isFinancesFeatureEnabled && isTasksFeatureEnabled && isVacationTaskExclusionEnabled) {
      return enabling
        ? t("settings.vacationModeConfirmEnableTasksOnly")
        : t("settings.vacationModeConfirmDisableTasksOnly");
    }
    return enabling ? t("settings.vacationModeConfirmEnable") : t("settings.vacationModeConfirmDisable");
  }, [
    isTasksFeatureEnabled,
    isFinancesFeatureEnabled,
    isVacationTaskExclusionEnabled,
    isVacationFinanceExclusionEnabled,
    pendingVacationMode,
    t
  ]);
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
      const runtimeConfig = await getFirebaseRuntimeConfig();
      if (!runtimeConfig) {
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
      { id: "member_joined", label: t("settings.pushUsedForMemberJoined") },
      { id: "member_left", label: t("settings.pushUsedForMemberLeft") },
      { id: "rent_updated", label: t("settings.pushUsedForRentUpdated") },
      { id: "contract_created", label: t("settings.pushUsedForContractCreated") },
      { id: "contract_updated", label: t("settings.pushUsedForContractUpdated") },
      { id: "contract_deleted", label: t("settings.pushUsedForContractDeleted") },
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

  const onSubmitVacationForm = async () => {
    if (!userId) return;
    if (!vacationFormStart || !vacationFormEnd) {
      setVacationFormError(t("settings.vacationPlanErrorMissing"));
      return;
    }
    if (vacationFormEnd < vacationFormStart) {
      setVacationFormError(t("settings.vacationPlanErrorRange"));
      return;
    }
    setVacationFormError(null);
    if (editingVacationId) {
      const updatePayload: { startDate?: string; endDate?: string; note?: string } = {
        note: vacationFormNote.trim()
      };
      if (!isEditingVacationLocked) {
        updatePayload.startDate = vacationFormStart;
      }
      if (!isEditingVacationEndLocked) {
        updatePayload.endDate = vacationFormEnd;
      }
      await onUpdateMemberVacation(editingVacationId, updatePayload);
      setEditingVacationId(null);
      return;
    }
    await onAddMemberVacation({
      startDate: vacationFormStart,
      endDate: vacationFormEnd,
      note: vacationFormNote.trim()
    });
    setVacationFormStart(todayIso);
    setVacationFormEnd(todayIso);
    setVacationFormNote("");
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
  const addressInput = householdForm.state.values.address.trim();
  const addressCoords = addressMapCenter;
  const mapLink = addressCoords
    ? openStreetMapPinUrl(addressCoords[0], addressCoords[1])
    : openStreetMapSearchUrl(addressInput);

  useEffect(() => {
    const query = addressInput.trim();
    if (query.length < MIN_ADDRESS_LENGTH_FOR_GEOCODE) {
      setAddressMapCenter(null);
      setAddressMapLabel(null);
      setAddressMapLoading(false);
      setAddressMapError(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setAddressMapLoading(true);
      setAddressMapError(null);
      void (async () => {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
          const response = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal
          });
          if (!response.ok) throw new Error("geocode_failed");
          const payload = (await response.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
          const first = payload[0];
          const lat = first?.lat ? Number(first.lat) : Number.NaN;
          const lon = first?.lon ? Number(first.lon) : Number.NaN;
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            throw new Error("no_result");
          }
          if (!active) return;
          setAddressMapCenter([lat, lon]);
          setAddressMapLabel(first?.display_name?.trim() || query);
          setAddressMapError(null);
        } catch (error) {
          if (!active || controller.signal.aborted) return;
          const message = error instanceof Error && error.message === "no_result"
            ? t("settings.householdAddressMapNoResult")
            : t("settings.householdAddressMapError");
          setAddressMapCenter(null);
          setAddressMapLabel(null);
          setAddressMapError(message);
        } finally {
          if (active) setAddressMapLoading(false);
        }
      })();
    }, ADDRESS_GEOCODE_DEBOUNCE_MS);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [addressInput, t]);

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
                            disabled={
                              busy || firebaseMessagingSupport !== "supported"
                            }
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

      {showMe ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.vacationCardTitle")}</CardTitle>
            <CardDescription>
              {t("settings.vacationPlanDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-100 bg-white/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {t("settings.vacationModeLabel")}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {vacationModeDescription}
                    </p>
                  </div>
                  <Switch
                    checked={isVacationToggleActive}
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
                        {vacationModeConfirmText}
                      </DialogDescription>
                    </DialogHeader>
                    {pendingVacationMode &&
                    isTasksFeatureEnabled &&
                    isVacationTaskExclusionEnabled &&
                    dueTasksAssignedCount > 0 ? (
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
                          onClick={async () => {
                            if (pendingVacationMode === null) return;
                            if (
                              !pendingVacationMode &&
                              plannedVacationTodayIds.length > 0
                            ) {
                              await Promise.all(
                                plannedVacationTodayIds.map((vacationId) =>
                                  onUpdateMemberVacation(vacationId, {
                                    endDate: todayIso,
                                  }),
                                ),
                              );
                            }
                            await onUpdateVacationMode(pendingVacationMode);
                          }}
                          disabled={busy || pendingVacationMode === null}
                        >
                          {t("common.confirm")}
                        </Button>
                      </DialogClose>
                    </div>
                  </DialogContent>
                </Dialog>

                <div className="rounded-lg border border-brand-100 bg-white/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/70">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {t("settings.vacationPlanTitle")}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("settings.vacationPlanDescription")}
                      </p>
                    </div>
                    {editingVacation ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        {t("settings.vacationPlanEditing")}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="vacation-start">
                        {t("settings.vacationPlanStart")}
                      </Label>
                      <Input
                        id="vacation-start"
                        type="date"
                        value={vacationFormStart}
                        disabled={busy || (editingVacationId !== null && isEditingVacationLocked)}
                        max={vacationFormEnd}
                        onChange={(event) =>
                          setVacationFormStart(event.target.value)
                        }
                      />
                      {editingVacationId !== null && isEditingVacationLocked ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t("settings.vacationPlanStartLocked")}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="vacation-end">
                        {t("settings.vacationPlanEnd")}
                      </Label>
                      <Input
                        id="vacation-end"
                        type="date"
                        value={vacationFormEnd}
                        disabled={busy || (editingVacationId !== null && isEditingVacationEndLocked)}
                        min={vacationFormStart}
                        onChange={(event) =>
                          setVacationFormEnd(event.target.value)
                        }
                      />
                      {editingVacationId !== null && isEditingVacationEndLocked ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t("settings.vacationPlanEndLocked")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Label htmlFor="vacation-note">
                      {t("settings.vacationPlanNote")}
                    </Label>
                    <Input
                      id="vacation-note"
                      value={vacationFormNote}
                      disabled={busy}
                      placeholder={t("settings.vacationPlanNotePlaceholder")}
                      onChange={(event) =>
                        setVacationFormNote(event.target.value)
                      }
                    />
                  </div>
                  {vacationFormError ? (
                    <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                      {vacationFormError}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {editingVacationId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setEditingVacationId(null)}
                      >
                        {t("common.cancel")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={onSubmitVacationForm}
                    >
                      {editingVacationId
                        ? t("common.save")
                        : t("settings.vacationPlanAdd")}
                    </Button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {memberVacationsForUser.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("settings.vacationPlanEmpty")}
                      </p>
                    ) : (
                      memberVacationsForUser.map((vacation) => {
                        const status = getVacationStatus(vacation, todayIso);
                        const statusLabel =
                          status === "active"
                            ? t("settings.vacationPlanStatusActive")
                            : status === "upcoming"
                              ? t("settings.vacationPlanStatusUpcoming")
                              : t("settings.vacationPlanStatusPast");
                        const statusClass =
                          status === "active"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : status === "upcoming"
                              ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                              : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
                        const isOngoingToday = isDateWithinRange(
                          todayIso,
                          vacation.start_date,
                          vacation.end_date,
                        );
                        return (
                          <div
                            key={vacation.id}
                            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                              editingVacationId === vacation.id
                                ? "border-brand-300 bg-brand-50/70 dark:!border-brand-700 dark:!bg-brand-900/35"
                                : "border-brand-100 bg-white/80 dark:!border-slate-700 dark:!bg-slate-900/85"
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}
                                >
                                  {statusLabel}
                                </span>
                                {isOngoingToday ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                    {t("settings.vacationPlanStatusToday")}
                                  </span>
                                ) : null}
                              </div>
                              <p className="font-semibold text-slate-800 dark:text-slate-100">
                                {vacation.start_date} – {vacation.end_date}
                              </p>
                              {vacation.note ? (
                                <p className="text-slate-500 dark:text-slate-300">
                                  {vacation.note}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  setEditingVacationId(vacation.id)
                                }
                              >
                                {t("common.edit")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="danger"
                                disabled={busy}
                                onClick={() =>
                                  void onDeleteMemberVacation(vacation.id)
                                }
                              >
                                {t("common.delete")}
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
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
                <div className="rounded-xl border border-brand-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {!addressInput
                        ? t("settings.householdAddressMapHint")
                        : addressMapLoading
                          ? t("settings.householdAddressMapLoading")
                          : addressMapError
                            ? addressMapError
                            : (addressMapLabel ?? t("settings.householdAddressMapReady"))}
                    </p>
                    {addressInput ? (
                      <a
                        href={mapLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-900 dark:text-brand-300 dark:hover:text-brand-200"
                      >
                        {t("settings.householdAddressMapOpen")}
                      </a>
                    ) : null}
                  </div>
                </div>
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
                  const isMemberOnVacationToday = isMemberOnVacation(
                    member.user_id,
                    memberVacations,
                    todayIso,
                    member.vacation_mode,
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
                          isVacation={isMemberOnVacationToday}
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

      {showHousehold ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.householdRulesTitle")}</CardTitle>
            <CardDescription>
              {t("settings.householdRulesDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t("settings.vacationExcludeTasksTitle")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("settings.vacationExcludeTasksDescription")}
                  </p>
                </div>
                <householdForm.Field
                  name="vacationTasksExcludeEnabled"
                  children={(field: {
                    state: { value: boolean };
                    handleChange: (value: boolean) => void;
                  }) => (
                    <Switch
                      checked={field.state.value}
                      disabled={busy || !isOwner}
                      onCheckedChange={field.handleChange}
                      aria-label={t("settings.vacationExcludeTasksTitle")}
                    />
                  )}
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t("settings.vacationExcludeFinancesTitle")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("settings.vacationExcludeFinancesDescription")}
                  </p>
                </div>
                <householdForm.Field
                  name="vacationFinancesExcludeEnabled"
                  children={(field: {
                    state: { value: boolean };
                    handleChange: (value: boolean) => void;
                  }) => (
                    <Switch
                      checked={field.state.value}
                      disabled={busy || !isOwner}
                      onCheckedChange={field.handleChange}
                      aria-label={t("settings.vacationExcludeFinancesTitle")}
                    />
                  )}
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t("settings.taskSkipTitle")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("settings.taskSkipDescription")}
                  </p>
                </div>
                <householdForm.Field
                  name="taskSkipEnabled"
                  children={(field: {
                    state: { value: boolean };
                    handleChange: (value: boolean) => void;
                  }) => (
                    <Switch
                      checked={field.state.value}
                      disabled={busy || !isOwner}
                      onCheckedChange={field.handleChange}
                      aria-label={t("settings.taskSkipTitle")}
                    />
                  )}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={busy || !isOwner}
                onClick={() => void householdForm.handleSubmit()}
              >
                {t("settings.householdSave")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showHousehold ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.householdFeaturesTitle")}</CardTitle>
            <CardDescription>
              {t("settings.householdFeaturesDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {t("settings.featureBucketTitle")}
                </p>
                <householdForm.Field
                  name="featureBucketEnabled"
                  children={(field: {
                    state: { value: boolean };
                    handleChange: (value: boolean) => void;
                  }) => (
                    <Switch
                      checked={field.state.value}
                      disabled={busy || !isOwner}
                      onCheckedChange={field.handleChange}
                      aria-label={t("settings.featureBucketTitle")}
                    />
                  )}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {t("settings.featureShoppingTitle")}
                </p>
                <householdForm.Field
                  name="featureShoppingEnabled"
                  children={(field: {
                    state: { value: boolean };
                    handleChange: (value: boolean) => void;
                  }) => (
                    <Switch
                      checked={field.state.value}
                      disabled={busy || !isOwner}
                      onCheckedChange={field.handleChange}
                      aria-label={t("settings.featureShoppingTitle")}
                    />
                  )}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {t("settings.featureTasksTitle")}
                </p>
                <householdForm.Field
                  name="featureTasksEnabled"
                  children={(field: {
                    state: { value: boolean };
                    handleChange: (value: boolean) => void;
                  }) => (
                    <Switch
                      checked={field.state.value}
                      disabled={busy || !isOwner}
                      onCheckedChange={field.handleChange}
                      aria-label={t("settings.featureTasksTitle")}
                    />
                  )}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {t("settings.featureOneOffTasksTitle")}
                </p>
                <householdForm.Field
                  name="featureOneOffTasksEnabled"
                  children={(field: {
                    state: { value: boolean };
                    handleChange: (value: boolean) => void;
                  }) => (
                    <Switch
                      checked={field.state.value}
                      disabled={busy || !isOwner}
                      onCheckedChange={field.handleChange}
                      aria-label={t("settings.featureOneOffTasksTitle")}
                    />
                  )}
                />
              </div>
              {showOneOffClaimSettings ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <householdForm.Field
                    name="oneOffClaimTimeoutHours"
                    children={(field: {
                      state: { value: string };
                      handleChange: (value: string) => void;
                    }) => (
                      <div className="space-y-1 rounded-xl border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                        <Label className="text-xs text-slate-600 dark:text-slate-300">
                          {isOneOffTimeoutDisabled
                            ? `${t("settings.oneOffClaimTimeoutHoursLabel")} (${t("common.disabledLabel")})`
                            : t("settings.oneOffClaimTimeoutHoursLabel")}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          max={336}
                          inputMode="numeric"
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          disabled={busy || !isOwner}
                        />
                      </div>
                    )}
                  />
                  <householdForm.Field
                    name="oneOffClaimMaxPimpers"
                    children={(field: {
                      state: { value: string };
                      handleChange: (value: string) => void;
                    }) => (
                      <div className="space-y-1 rounded-xl border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                        <Label className="text-xs text-slate-600 dark:text-slate-300">
                          {t("settings.oneOffClaimMaxPimpersLabel")}
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={5000}
                          inputMode="numeric"
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          disabled={busy || !isOwner}
                        />
                      </div>
                    )}
                  />
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {t("settings.featureFinancesTitle")}
                </p>
                <householdForm.Field
                  name="featureFinancesEnabled"
                  children={(field: {
                    state: { value: boolean };
                    handleChange: (value: boolean) => void;
                  }) => (
                    <Switch
                      checked={field.state.value}
                      disabled={busy || !isOwner}
                      onCheckedChange={field.handleChange}
                      aria-label={t("settings.featureFinancesTitle")}
                    />
                  )}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={busy || !isOwner}
                onClick={() => void householdForm.handleSubmit()}
              >
                {t("settings.householdSave")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showHousehold ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("settings.storageTitle", { defaultValue: "Storage" })}
            </CardTitle>
            <CardDescription>
              {t("settings.storageDescription", {
                defaultValue:
                  "WebDAV/Nextcloud für die WG-Dateiablage konfigurieren."
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-w-sm">
              <householdForm.Field
                name="storageProvider"
                children={(field: {
                  state: { value: "none" | "webdav" | "nextcloud" };
                  handleChange: (
                    value: "none" | "webdav" | "nextcloud"
                  ) => void;
                }) => (
                  <div className="space-y-1">
                    <Label>
                      {t("settings.storageProviderLabel", {
                        defaultValue: "Provider"
                      })}
                    </Label>
                    <Select
                      value={field.state.value}
                      onValueChange={(next) =>
                        (() => {
                          const normalized = next as "none" | "webdav" | "nextcloud";
                          field.handleChange(normalized);
                          setSelectedStorageProviderUi(normalized);
                        })()
                      }
                      disabled={busy || !isOwner}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Deaktiviert</SelectItem>
                        <SelectItem value="webdav">WebDAV</SelectItem>
                        <SelectItem value="nextcloud">Nextcloud</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              />
            </div>
            {selectedStorageProviderUi === "webdav" ? (
              <>
                <householdForm.Field
                  name="storageUrl"
                  children={(field: {
                    state: { value: string };
                    handleChange: (value: string) => void;
                  }) => (
                    <div className="space-y-1">
                      <Label>
                        {t("settings.storageWebdavUrlLabel", {
                          defaultValue: "WebDAV URL"
                        })}
                      </Label>
                      <Input
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        disabled={busy || !isOwner}
                        placeholder="https://cloud.example.com/remote.php/dav/files/USER"
                      />
                    </div>
                  )}
                />
                <householdForm.Field
                  name="storageBasePath"
                  children={(field: {
                    state: { value: string };
                    handleChange: (value: string) => void;
                  }) => (
                    <div className="space-y-1">
                      <Label>
                        {t("settings.storagePathLabel", {
                          defaultValue: "Basis-Pfad"
                        })}
                      </Label>
                      <Input
                        value={field.state.value}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        disabled={busy || !isOwner}
                        placeholder="/domora"
                      />
                    </div>
                  )}
                />
              </>
            ) : null}
            {selectedStorageProviderUi === "webdav" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <householdForm.Field
                  name="storageUsername"
                  children={(field: {
                    state: { value: string };
                    handleChange: (value: string) => void;
                  }) => (
                    <div className="space-y-1">
                      <Label>
                        {t("settings.storageUsernameLabel", {
                          defaultValue: "Benutzername"
                        })}
                      </Label>
                      <Input
                        value={field.state.value}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        disabled={busy || !isOwner}
                      />
                    </div>
                  )}
                />
                <householdForm.Field
                  name="storagePassword"
                  children={(field: {
                    state: { value: string };
                    handleChange: (value: string) => void;
                  }) => (
                    <div className="space-y-1">
                      <Label>
                        {t("settings.storagePasswordLabel", {
                          defaultValue: "Passwort / App-Token"
                        })}
                      </Label>
                      <Input
                        type="password"
                        value={field.state.value}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        disabled={busy || !isOwner}
                        placeholder={t("settings.storagePasswordPlaceholder", {
                          defaultValue:
                            "Leer lassen, um bestehendes Passwort zu behalten"
                        })}
                      />
                    </div>
                  )}
                />
              </div>
            ) : null}
            {selectedStorageProviderUi === "nextcloud" ? (
              <div className="space-y-2 rounded-xl border border-brand-100 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="grid gap-3 sm:grid-cols-2">
                  <householdForm.Field
                    name="storageUrl"
                    children={(field: {
                      state: { value: string };
                      handleChange: (value: string) => void;
                    }) => (
                      <div className="space-y-1">
                        <Label>
                          {t("settings.storageNextcloudUrlLabel", {
                            defaultValue: "Nextcloud URL"
                          })}
                        </Label>
                        <Input
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          disabled={busy || !isOwner}
                          placeholder="https://cloud.example.com"
                        />
                      </div>
                    )}
                  />
                  <householdForm.Field
                    name="storageUsername"
                    children={(field: {
                      state: { value: string };
                      handleChange: (value: string) => void;
                    }) => (
                      <div className="space-y-1">
                        <Label>
                          {t("settings.storageNextcloudUsernameLabel", {
                            defaultValue: "Nextcloud Benutzername"
                          })}
                        </Label>
                        <Input
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          disabled={busy || !isOwner || storageConnectBusy}
                        />
                      </div>
                    )}
                  />
                  <householdForm.Field
                    name="storageBasePath"
                    children={(field: {
                      state: { value: string };
                      handleChange: (value: string) => void;
                    }) => (
                      <div className="space-y-1 sm:col-span-2">
                        <Label>
                          {t("settings.storagePathLabel", {
                            defaultValue: "Basis-Pfad"
                          })}
                        </Label>
                        <Input
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          disabled={busy || !isOwner || storageConnectBusy}
                          placeholder="/domora"
                        />
                      </div>
                    )}
                  />
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {t("settings.storageNextcloudHint", {
                    defaultValue:
                      "Nextcloud verbindet per Login-Prompt und erstellt ein App-Passwort automatisch."
                  })}
                </p>
                {storageConnectStatus ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">{storageConnectStatus}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !isOwner || storageConnectBusy}
                    onClick={() => void onConnectNextcloud()}
                  >
                    {storageConnectBusy
                      ? t("common.loading")
                      : t("settings.storageNextcloudConnect", { defaultValue: "Mit Nextcloud verbinden" })}
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={busy || !isOwner || storageConnectBusy}
                onClick={() => void householdForm.handleSubmit()}
              >
                {t("settings.householdSave")}
              </Button>
            </div>
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
            <CardTitle>{t("settings.householdThemeTitle")}</CardTitle>
            <CardDescription>
              {t("settings.householdThemeDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="space-y-2">
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
            <div className="grid gap-3 sm:grid-cols-2">
              <householdForm.Field
                name="themePrimaryColor"
                children={(field: {
                  state: { value: string };
                  handleChange: (value: string) => void;
                }) => (
                  <div className="space-y-1">
                    <Label>{t("settings.householdThemePrimaryLabel")}</Label>
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
                        aria-label={t("settings.householdThemePrimaryLabel")}
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
                          fontFamily: '"Space Grotesk", "Segoe UI", sans-serif',
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
                          fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
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
                          fontFamily: '"Source Sans 3", "Segoe UI", sans-serif',
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
                          fontFamily: '"Playfair Display", "Georgia", serif',
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
            <div className="space-y-2 rounded-xl border border-brand-200 p-3 dark:border-slate-700">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t("settings.householdTranslationOverridesTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("settings.householdTranslationOverridesDescription")}
                </p>
              </div>
              <div className="space-y-2">
                {translationOverridesDraft.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("settings.householdTranslationOverridesEmpty")}
                  </p>
                ) : (
                  translationOverridesDraft.map((override, index) => (
                    <div key={`translation-override-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <Input
                        value={override.find}
                        disabled={busy || !isOwner}
                        onChange={(event) => {
                          onUpdateTranslationOverride(index, "find", event.target.value);
                        }}
                        placeholder={t("settings.householdTranslationOverridesFindPlaceholder")}
                      />
                      <Input
                        value={override.replace}
                        disabled={busy || !isOwner}
                        onChange={(event) => {
                          onUpdateTranslationOverride(index, "replace", event.target.value);
                        }}
                        placeholder={t("settings.householdTranslationOverridesReplacePlaceholder")}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy || !isOwner}
                        onClick={() => {
                          onRemoveTranslationOverride(index);
                        }}
                        aria-label={t("common.delete")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !isOwner}
                  onClick={onAddTranslationOverride}
                >
                  {t("settings.householdTranslationOverridesAdd")}
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={busy || !isOwner}
                onClick={() => void householdForm.handleSubmit()}
              >
                {t("settings.householdSave")}
              </Button>
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
