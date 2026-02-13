import { type ChangeEvent, useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { CircleHelp } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Household, HouseholdMember } from "../../lib/types";
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
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";

interface SettingsTabProps {
  household: Household;
  currentMember: HouseholdMember | null;
  userEmail: string | undefined;
  userAvatarUrl: string | null;
  busy: boolean;
  onUpdateHousehold: (input: {
    imageUrl: string;
    address: string;
    currency: string;
    apartmentSizeSqm: number | null;
    warmRentMonthly: number | null;
  }) => Promise<void>;
  onUpdateMemberSettings: (input: { roomSizeSqm: number | null; commonAreaFactor: number }) => Promise<void>;
  onUpdateUserAvatar: (avatarUrl: string) => Promise<void>;
  onLeaveHousehold: () => Promise<void>;
}

const normalizeCurrency = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);

const toNumericInputValue = (value: number | null) => (value === null ? "" : String(value));
const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });

export const SettingsTab = ({
  household,
  currentMember,
  userEmail,
  userAvatarUrl,
  busy,
  onUpdateHousehold,
  onUpdateMemberSettings,
  onUpdateUserAvatar,
  onLeaveHousehold
}: SettingsTabProps) => {
  const { t } = useTranslation();

  const [formError, setFormError] = useState<string | null>(null);
  const [memberFormError, setMemberFormError] = useState<string | null>(null);
  const [profileUploadError, setProfileUploadError] = useState<string | null>(null);
  const [householdUploadError, setHouseholdUploadError] = useState<string | null>(null);

  const profileForm = useForm({
    defaultValues: {
      profileImageUrl: userAvatarUrl ?? ""
    },
    onSubmit: async ({ value }: { value: { profileImageUrl: string } }) => {
      await onUpdateUserAvatar(value.profileImageUrl);
    }
  });

  const householdForm = useForm({
    defaultValues: {
      imageUrl: household.image_url ?? "",
      address: household.address ?? "",
      currency: household.currency ?? "EUR",
      apartmentSizeSqm: toNumericInputValue(household.apartment_size_sqm),
      warmRentMonthly: toNumericInputValue(household.warm_rent_monthly)
    },
    onSubmit: async ({ value }: {
      value: {
        imageUrl: string;
        address: string;
        currency: string;
        apartmentSizeSqm: string;
        warmRentMonthly: string;
      };
    }) => {
      const normalized = normalizeCurrency(value.currency);
      if (normalized.length !== 3) {
        setFormError(t("settings.currencyError"));
        return;
      }

      const parsedHouseholdSize = parseOptionalNumber(value.apartmentSizeSqm);
      if (Number.isNaN(parsedHouseholdSize) || (parsedHouseholdSize !== null && parsedHouseholdSize <= 0)) {
        setFormError(t("settings.householdSizeError"));
        return;
      }

      const parsedWarmRent = parseOptionalNumber(value.warmRentMonthly);
      if (Number.isNaN(parsedWarmRent) || (parsedWarmRent !== null && parsedWarmRent < 0)) {
        setFormError(t("settings.warmRentError"));
        return;
      }

      setFormError(null);
      await onUpdateHousehold({
        imageUrl: value.imageUrl,
        address: value.address,
        currency: normalized,
        apartmentSizeSqm: parsedHouseholdSize,
        warmRentMonthly: parsedWarmRent
      });
    }
  });

  const memberForm = useForm({
    defaultValues: {
      roomSizeSqm: toNumericInputValue(currentMember?.room_size_sqm ?? null),
      commonAreaFactor: currentMember ? String(currentMember.common_area_factor) : "1"
    },
    onSubmit: async ({ value }: { value: { roomSizeSqm: string; commonAreaFactor: string } }) => {
      const parsedRoomSize = parseOptionalNumber(value.roomSizeSqm);
      if (Number.isNaN(parsedRoomSize) || (parsedRoomSize !== null && parsedRoomSize <= 0)) {
        setMemberFormError(t("settings.roomSizeError"));
        return;
      }

      const parsedFactor = Number(value.commonAreaFactor);
      if (!Number.isFinite(parsedFactor) || parsedFactor <= 0) {
        setMemberFormError(t("settings.commonFactorError"));
        return;
      }

      setMemberFormError(null);
      await onUpdateMemberSettings({
        roomSizeSqm: parsedRoomSize,
        commonAreaFactor: parsedFactor
      });
    }
  });

  useEffect(() => {
    householdForm.setFieldValue("imageUrl", household.image_url ?? "");
    householdForm.setFieldValue("address", household.address ?? "");
    householdForm.setFieldValue("currency", household.currency ?? "EUR");
    householdForm.setFieldValue("apartmentSizeSqm", toNumericInputValue(household.apartment_size_sqm));
    householdForm.setFieldValue("warmRentMonthly", toNumericInputValue(household.warm_rent_monthly));
  }, [
    household.address,
    household.apartment_size_sqm,
    household.currency,
    household.id,
    household.image_url,
    household.warm_rent_monthly,
    householdForm
  ]);

  useEffect(() => {
    profileForm.setFieldValue("profileImageUrl", userAvatarUrl ?? "");
  }, [profileForm, userAvatarUrl]);

  useEffect(() => {
    memberForm.setFieldValue("roomSizeSqm", toNumericInputValue(currentMember?.room_size_sqm ?? null));
    memberForm.setFieldValue("commonAreaFactor", currentMember ? String(currentMember.common_area_factor) : "1");
  }, [currentMember, memberForm]);

  const onProfileFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      profileForm.setFieldValue("profileImageUrl", dataUrl);
      setProfileUploadError(null);
    } catch {
      setProfileUploadError(t("settings.profileUploadError"));
    }
  };

  const onHouseholdFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      householdForm.setFieldValue("imageUrl", dataUrl);
      setHouseholdUploadError(null);
    } catch {
      setHouseholdUploadError(t("settings.householdUploadError"));
    }
  };

  const profileImageUrl = profileForm.state.values.profileImageUrl.trim();
  const householdImageUrl = householdForm.state.values.imageUrl.trim();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.clientTitle")}</CardTitle>
          <CardDescription>{t("settings.clientDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeLanguageControls surface="default" />
        </CardContent>
      </Card>

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
              void profileForm.handleSubmit();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="profile-image-upload">{t("settings.profileImageUploadLabel")}</Label>
              <Input
                id="profile-image-upload"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  void onProfileFileChange(event);
                }}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {userEmail ? t("settings.currentEmail", { value: userEmail }) : null}
              </p>
            </div>

            {profileImageUrl ? (
              <img
                src={profileImageUrl}
                alt={t("settings.profileImagePreviewAlt")}
                className="h-16 w-16 rounded-full border border-brand-200 object-cover dark:border-slate-700"
              />
            ) : null}

            {profileUploadError ? (
              <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                {profileUploadError}
              </p>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => profileForm.setFieldValue("profileImageUrl", "")}
            >
              {t("settings.removeImage")}
            </Button>

            <Button type="submit" disabled={busy}>
              {t("settings.profileSave")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.householdTitle")}</CardTitle>
          <CardDescription>{t("settings.householdDescription")}</CardDescription>
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
              <Label htmlFor="household-image-upload">{t("settings.householdImageUploadLabel")}</Label>
              <Input
                id="household-image-upload"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  void onHouseholdFileChange(event);
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
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <Input
                    id="household-currency"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(normalizeCurrency(event.target.value))}
                    placeholder={t("settings.householdCurrencyPlaceholder")}
                  />
                )}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="household-size-sqm">{t("settings.householdSizeLabel")}</Label>
                <householdForm.Field
                  name="apartmentSizeSqm"
                  children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                    <Input
                      id="household-size-sqm"
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder={t("settings.householdSizePlaceholder")}
                    />
                  )}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="household-warm-rent">{t("settings.warmRentLabel")}</Label>
                <householdForm.Field
                  name="warmRentMonthly"
                  children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                    <Input
                      id="household-warm-rent"
                      type="number"
                      min="0"
                      step="0.01"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder={t("settings.warmRentPlaceholder")}
                    />
                  )}
                />
              </div>
            </div>

            {householdImageUrl ? (
              <img
                src={householdImageUrl}
                alt={t("settings.householdImagePreviewAlt")}
                className="h-20 w-full rounded-xl border border-brand-200 object-cover dark:border-slate-700"
              />
            ) : null}

            {householdUploadError ? (
              <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                {householdUploadError}
              </p>
            ) : null}

            <Button type="button" variant="ghost" disabled={busy} onClick={() => householdForm.setFieldValue("imageUrl", "")}>
              {t("settings.removeImage")}
            </Button>

            {formError ? (
              <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                {formError}
              </p>
            ) : null}

            <Button type="submit" disabled={busy}>
              {t("settings.householdSave")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.memberTitle")}</CardTitle>
          <CardDescription>{t("settings.memberDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void memberForm.handleSubmit();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="member-room-sqm">{t("settings.roomSizeLabel")}</Label>
              <memberForm.Field
                name="roomSizeSqm"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <Input
                    id="member-room-sqm"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("settings.roomSizePlaceholder")}
                  />
                )}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="member-common-factor">{t("settings.commonFactorLabel")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 rounded-full p-0" aria-label={t("settings.commonFactorLabel")}>
                      <CircleHelp className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72">
                    {t("settings.commonFactorHint")}
                  </PopoverContent>
                </Popover>
              </div>
              <memberForm.Field
                name="commonAreaFactor"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <Input
                    id="member-common-factor"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("settings.commonFactorPlaceholder")}
                  />
                )}
              />
            </div>

            {memberFormError ? (
              <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                {memberFormError}
              </p>
            ) : null}

            <Button type="submit" disabled={busy}>
              {t("settings.memberSave")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-rose-200 dark:border-rose-900">
        <CardHeader>
          <CardTitle>{t("settings.leaveTitle")}</CardTitle>
          <CardDescription>{t("settings.leaveDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
};
