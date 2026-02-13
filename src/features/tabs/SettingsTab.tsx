import { FormEvent, useEffect, useState } from "react";
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

  const [householdImageUrl, setHouseholdImageUrl] = useState(household.image_url ?? "");
  const [householdAddress, setHouseholdAddress] = useState(household.address ?? "");
  const [householdCurrency, setHouseholdCurrency] = useState(household.currency ?? "EUR");
  const [householdSizeSqm, setHouseholdSizeSqm] = useState(toNumericInputValue(household.apartment_size_sqm));
  const [warmRentMonthly, setWarmRentMonthly] = useState(toNumericInputValue(household.warm_rent_monthly));
  const [roomSizeSqm, setRoomSizeSqm] = useState(toNumericInputValue(currentMember?.room_size_sqm ?? null));
  const [commonAreaFactor, setCommonAreaFactor] = useState(
    currentMember ? String(currentMember.common_area_factor) : "1"
  );
  const [profileImageUrl, setProfileImageUrl] = useState(userAvatarUrl ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [memberFormError, setMemberFormError] = useState<string | null>(null);

  useEffect(() => {
    setHouseholdImageUrl(household.image_url ?? "");
    setHouseholdAddress(household.address ?? "");
    setHouseholdCurrency(household.currency ?? "EUR");
    setHouseholdSizeSqm(toNumericInputValue(household.apartment_size_sqm));
    setWarmRentMonthly(toNumericInputValue(household.warm_rent_monthly));
  }, [household.id, household.image_url, household.address, household.currency, household.apartment_size_sqm, household.warm_rent_monthly]);

  useEffect(() => {
    setProfileImageUrl(userAvatarUrl ?? "");
  }, [userAvatarUrl]);

  useEffect(() => {
    setRoomSizeSqm(toNumericInputValue(currentMember?.room_size_sqm ?? null));
    setCommonAreaFactor(currentMember ? String(currentMember.common_area_factor) : "1");
  }, [currentMember?.room_size_sqm, currentMember?.common_area_factor]);

  const submitHousehold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalized = normalizeCurrency(householdCurrency);
    if (normalized.length !== 3) {
      setFormError(t("settings.currencyError"));
      return;
    }

    const parsedHouseholdSize = parseOptionalNumber(householdSizeSqm);
    if (Number.isNaN(parsedHouseholdSize) || (parsedHouseholdSize !== null && parsedHouseholdSize <= 0)) {
      setFormError(t("settings.householdSizeError"));
      return;
    }

    const parsedWarmRent = parseOptionalNumber(warmRentMonthly);
    if (Number.isNaN(parsedWarmRent) || (parsedWarmRent !== null && parsedWarmRent < 0)) {
      setFormError(t("settings.warmRentError"));
      return;
    }

    setFormError(null);
    await onUpdateHousehold({
      imageUrl: householdImageUrl,
      address: householdAddress,
      currency: normalized,
      apartmentSizeSqm: parsedHouseholdSize,
      warmRentMonthly: parsedWarmRent
    });
  };

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onUpdateUserAvatar(profileImageUrl);
  };

  const submitMemberSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsedRoomSize = parseOptionalNumber(roomSizeSqm);
    if (Number.isNaN(parsedRoomSize) || (parsedRoomSize !== null && parsedRoomSize <= 0)) {
      setMemberFormError(t("settings.roomSizeError"));
      return;
    }

    const parsedFactor = Number(commonAreaFactor);
    if (!Number.isFinite(parsedFactor) || parsedFactor <= 0) {
      setMemberFormError(t("settings.commonFactorError"));
      return;
    }

    setMemberFormError(null);
    await onUpdateMemberSettings({
      roomSizeSqm: parsedRoomSize,
      commonAreaFactor: parsedFactor
    });
  };

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
          <form className="space-y-3" onSubmit={submitProfile}>
            <div className="space-y-1">
              <Label htmlFor="profile-image">{t("settings.profileImageLabel")}</Label>
              <Input
                id="profile-image"
                value={profileImageUrl}
                onChange={(event) => setProfileImageUrl(event.target.value)}
                placeholder={t("settings.profileImagePlaceholder")}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {userEmail ? t("settings.currentEmail", { value: userEmail }) : null}
              </p>
            </div>

            {profileImageUrl.trim() ? (
              <img
                src={profileImageUrl.trim()}
                alt={t("settings.profileImagePreviewAlt")}
                className="h-16 w-16 rounded-full border border-brand-200 object-cover dark:border-slate-700"
              />
            ) : null}

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
          <form className="space-y-3" onSubmit={submitHousehold}>
            <div className="space-y-1">
              <Label htmlFor="household-image">{t("settings.householdImageLabel")}</Label>
              <Input
                id="household-image"
                value={householdImageUrl}
                onChange={(event) => setHouseholdImageUrl(event.target.value)}
                placeholder={t("settings.householdImagePlaceholder")}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="household-address">{t("settings.householdAddressLabel")}</Label>
              <Input
                id="household-address"
                value={householdAddress}
                onChange={(event) => setHouseholdAddress(event.target.value)}
                placeholder={t("settings.householdAddressPlaceholder")}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="household-currency">{t("settings.householdCurrencyLabel")}</Label>
              <Input
                id="household-currency"
                value={householdCurrency}
                onChange={(event) => setHouseholdCurrency(normalizeCurrency(event.target.value))}
                placeholder={t("settings.householdCurrencyPlaceholder")}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="household-size-sqm">{t("settings.householdSizeLabel")}</Label>
                <Input
                  id="household-size-sqm"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={householdSizeSqm}
                  onChange={(event) => setHouseholdSizeSqm(event.target.value)}
                  placeholder={t("settings.householdSizePlaceholder")}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="household-warm-rent">{t("settings.warmRentLabel")}</Label>
                <Input
                  id="household-warm-rent"
                  type="number"
                  min="0"
                  step="0.01"
                  value={warmRentMonthly}
                  onChange={(event) => setWarmRentMonthly(event.target.value)}
                  placeholder={t("settings.warmRentPlaceholder")}
                />
              </div>
            </div>

            {householdImageUrl.trim() ? (
              <img
                src={householdImageUrl.trim()}
                alt={t("settings.householdImagePreviewAlt")}
                className="h-20 w-full rounded-xl border border-brand-200 object-cover dark:border-slate-700"
              />
            ) : null}

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
          <form className="space-y-3" onSubmit={submitMemberSettings}>
            <div className="space-y-1">
              <Label htmlFor="member-room-sqm">{t("settings.roomSizeLabel")}</Label>
              <Input
                id="member-room-sqm"
                type="number"
                min="0.1"
                step="0.1"
                value={roomSizeSqm}
                onChange={(event) => setRoomSizeSqm(event.target.value)}
                placeholder={t("settings.roomSizePlaceholder")}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="member-common-factor">{t("settings.commonFactorLabel")}</Label>
              <Input
                id="member-common-factor"
                type="number"
                min="0.01"
                step="0.01"
                value={commonAreaFactor}
                onChange={(event) => setCommonAreaFactor(event.target.value)}
                placeholder={t("settings.commonFactorPlaceholder")}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("settings.commonFactorHint")}</p>
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
