import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import imageCompression from "browser-image-compression";
import { Camera, Check, Crown, Share2, UserMinus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import type { Household, HouseholdMember, UpdateHouseholdInput } from "../../lib/types";
import { createDiceBearAvatarDataUri } from "../../lib/avatar";
import { createMemberLabelGetter } from "../../lib/member-label";
import { ThemeLanguageControls } from "../../components/theme-language-controls";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../../components/ui/dialog";
import { FileUploadButton } from "../../components/ui/file-upload-button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

interface SettingsTabProps {
  section?: "me" | "household";
  household: Household;
  members: HouseholdMember[];
  currentMember: HouseholdMember | null;
  userId: string;
  userEmail: string | undefined;
  userAvatarUrl: string | null;
  userDisplayName: string | null;
  busy: boolean;
  onUpdateHousehold: (input: UpdateHouseholdInput) => Promise<void>;
  onUpdateUserAvatar: (avatarUrl: string) => Promise<void>;
  onUpdateUserDisplayName: (displayName: string) => Promise<void>;
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

export const SettingsTab = ({
  section = "me",
  household,
  members,
  currentMember,
  userId,
  userEmail,
  userAvatarUrl,
  userDisplayName,
  busy,
  onUpdateHousehold,
  onUpdateUserAvatar,
  onUpdateUserDisplayName,
  onSetMemberRole,
  onRemoveMember,
  onSignOut,
  onLeaveHousehold,
  onDissolveHousehold
}: SettingsTabProps) => {
  const { t } = useTranslation();
  const isOwner = currentMember?.role === "owner";

  const [formError, setFormError] = useState<string | null>(null);
  const [profileUploadError, setProfileUploadError] = useState<string | null>(null);
  const [householdUploadError, setHouseholdUploadError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const profileUploadInputRef = useRef<HTMLInputElement | null>(null);

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

  const householdForm = useForm({
    defaultValues: {
      name: household.name ?? "",
      imageUrl: household.image_url ?? "",
      address: household.address ?? "",
      currency: household.currency ?? "EUR"
    },
    onSubmit: async ({ value }: {
      value: {
        name: string;
        imageUrl: string;
        address: string;
        currency: string;
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
        utilitiesOnRoomSqmPercent: household.utilities_on_room_sqm_percent
      });
    }
  });


  useEffect(() => {
    householdForm.setFieldValue("name", household.name ?? "");
    householdForm.setFieldValue("imageUrl", household.image_url ?? "");
    householdForm.setFieldValue("address", household.address ?? "");
    householdForm.setFieldValue("currency", household.currency ?? "EUR");
  }, [
    household.address,
    household.currency,
    household.id,
    household.image_url,
    household.name,
    householdForm
  ]);

  useEffect(() => {
    profileForm.setFieldValue("profileImageUrl", userAvatarUrl ?? "");
  }, [profileForm, userAvatarUrl]);
  useEffect(() => {
    profileNameForm.setFieldValue("displayName", userDisplayName ?? "");
  }, [profileNameForm, userDisplayName]);

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
  const generatedProfileAvatarUrl = useMemo(() => createDiceBearAvatarDataUri(profileSeed), [profileSeed]);
  const profilePreviewImageUrl = profileImageUrl || generatedProfileAvatarUrl;
  const householdImageUrl = householdForm.state.values.imageUrl.trim();
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
        room_size_sqm: currentMember?.room_size_sqm ?? null,
        common_area_factor: currentMember?.common_area_factor ?? 1,
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
  const showMe = section === "me";
  const showHousehold = section === "household";

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
            <CardDescription>{t("settings.profileDescription")}</CardDescription>
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
              <Label htmlFor="profile-display-name">{t("settings.profileNameLabel")}</Label>
              <profileNameForm.Field
                name="displayName"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <div className="relative">
                    <Input
                      id="profile-display-name"
                      className="pr-11"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder={t("settings.profileNamePlaceholder")}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-md p-0"
                      disabled={busy}
                      aria-label={t("settings.profileNameSave")}
                      title={t("settings.profileNameSave")}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              />
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
              <div className="relative inline-block w-fit">
                <button
                  type="button"
                  className="relative inline-flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-brand-200 bg-brand-50 text-slate-600 transition hover:border-brand-300 hover:bg-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                  disabled={busy}
                  onClick={() => {
                    profileUploadInputRef.current?.click();
                  }}
                  aria-label={t("settings.profileImageUploadLabel")}
                  title={t("settings.profileImageUploadLabel")}
                >
                  <img
                    src={profilePreviewImageUrl}
                    alt={t("settings.profileImagePreviewAlt")}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-700 dark:bg-slate-900/90 dark:text-slate-200">
                    <Camera className="h-3.5 w-3.5" />
                  </span>
                </button>
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
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {userEmail ? t("settings.currentEmail", { value: userEmail }) : null}
              </p>
            </div>

            {profileUploadError ? (
              <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                {profileUploadError}
              </p>
            ) : null}

            </form>
          </CardContent>
        </Card>
      ) : null}

      {showHousehold ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.householdTitle")}</CardTitle>
            <CardDescription>{isOwner ? t("settings.householdDescription") : t("settings.householdOwnerOnlyHint")}</CardDescription>
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
              <Label htmlFor="household-name">{t("settings.householdNameLabel")}</Label>
              <householdForm.Field
                name="name"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <Input
                    id="household-name"
                    value={field.state.value}
                    disabled={busy || !isOwner}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("settings.householdNamePlaceholder")}
                  />
                )}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="household-image-upload">{t("settings.householdImageUploadLabel")}</Label>
              <FileUploadButton
                id="household-image-upload"
                disabled={busy || !isOwner}
                buttonLabel={t("settings.householdImageUploadLabel")}
                onFileSelect={(file) => {
                  void onHouseholdFileChange(file);
                }}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="household-address">{t("settings.householdAddressLabel")}</Label>
              <householdForm.Field
                name="address"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <Input
                    id="household-address"
                    value={field.state.value}
                    disabled={busy || !isOwner}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("settings.householdAddressPlaceholder")}
                  />
                )}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="household-currency">{t("settings.householdCurrencyLabel")}</Label>
              <householdForm.Field
                name="currency"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => {
                  const selected = findCurrencyOption(field.state.value);
                  return (
                  <Select value={field.state.value} onValueChange={field.handleChange} disabled={busy || !isOwner}>
                    <SelectTrigger id="household-currency" aria-label={t("settings.householdCurrencyLabel")}>
                      {field.state.value ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{selected?.icon ?? "💱"}</span>
                          <span>{field.state.value}</span>
                        </div>
                      ) : (
                        <SelectValue placeholder={t("settings.householdCurrencyPlaceholder")} />
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
                        <SelectItem key={currency.code} value={currency.code}>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{currency.icon}</span>
                            <span>{currency.code}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{currency.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  );
                }}
              />
            </div>

            {householdImageUrl ? (
              <div className="relative">
                <img
                  src={householdImageUrl}
                  alt={t("settings.householdImagePreviewAlt")}
                  className="h-20 w-full rounded-xl border border-brand-200 object-cover dark:border-slate-700"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  className="absolute right-2 top-2 h-6 w-6 rounded-full p-0"
                  disabled={busy || !isOwner}
                  onClick={() => householdForm.setFieldValue("imageUrl", "")}
                  aria-label={t("settings.removeImage")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : null}

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
              {isOwner ? t("settings.tenantsDescription") : t("settings.tenantsOwnerOnly")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {uniqueMembers.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("settings.tenantsNoMembers")}</p>
            ) : (
              <ul className="space-y-2">
                {uniqueMembers.map((member) => {
                const isSelf = member.user_id === userId;
                const isMemberOwner = member.role === "owner";
                const canDemoteLastOwner = isMemberOwner && ownerCount <= 1;
                const nextRole = isMemberOwner ? "member" : "owner";

                return (
                  <li
                    key={member.user_id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-brand-100 p-3 dark:border-slate-700"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {memberLabel(member.user_id)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {isMemberOwner ? t("settings.tenantsRoleOwner") : t("settings.tenantsRoleMember")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || !isOwner || canDemoteLastOwner}
                        onClick={() => {
                          void onSetMemberRole(member.user_id, nextRole);
                        }}
                      >
                        <Crown className="mr-1 h-3.5 w-3.5" />
                        {isMemberOwner ? t("settings.tenantsDemoteOwner") : t("settings.tenantsMakeOwner")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        disabled={busy || !isOwner || isSelf}
                        onClick={() => {
                          void onRemoveMember(member.user_id);
                        }}
                      >
                        <UserMinus className="mr-1 h-3.5 w-3.5" />
                        {t("settings.tenantsKick")}
                      </Button>
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
                    <DialogDescription>{t("settings.inviteDialogDescription")}</DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3">
                    <div className="mx-auto w-fit rounded-xl border border-brand-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                      <QRCode
                        value={inviteUrl}
                        size={192}
                        title={t("settings.inviteQrAlt")}
                        aria-label={t("settings.inviteQrAlt")}
                        bgColor="#ffffff"
                        fgColor="#111827"
                        className="h-48 w-48 rounded-md"
                      />
                    </div>

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
                      {inviteCopied ? t("settings.inviteCopied") : t("settings.inviteShareAction")}
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
                <Button type="button" variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300">
                  {t("settings.leaveAction")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("settings.leaveConfirmTitle")}</DialogTitle>
                  <DialogDescription>{t("settings.leaveConfirmDescription")}</DialogDescription>
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
                  <DialogTitle>{t("settings.dissolveConfirmTitle")}</DialogTitle>
                  <DialogDescription>{t("settings.dissolveConfirmDescription")}</DialogDescription>
                </DialogHeader>
                {!canDissolveHousehold ? (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t("settings.dissolveDisabledHint")}</p>
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
    </div>
  );
};
