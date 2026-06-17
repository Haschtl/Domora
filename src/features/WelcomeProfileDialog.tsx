import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import imageCompression from "browser-image-compression";
import { Camera, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createDiceBearAvatarDataUri } from "../lib/avatar";
import { MemberAvatar } from "../components/member-avatar";
import { Button } from "../components/ui/button";
import { FullscreenDialog } from "../components/ui/fullscreen-dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

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

type WelcomeProfileDialogProps = {
  open: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  userColor: string | null;
  avatarSeed: string;
  busy: boolean;
  onComplete: (input: { displayName: string; avatarUrl: string; userColor: string }) => Promise<void>;
};

export const WelcomeProfileDialog = ({
  open,
  displayName,
  avatarUrl,
  userColor,
  avatarSeed,
  busy,
  onComplete
}: WelcomeProfileDialogProps) => {
  const { t } = useTranslation();
  const [draftName, setDraftName] = useState(displayName ?? "");
  const [draftAvatarUrl, setDraftAvatarUrl] = useState(avatarUrl ?? "");
  const [draftUserColor, setDraftUserColor] = useState(normalizeUserColor(userColor ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const profileUploadInputRef = useRef<HTMLInputElement | null>(null);
  const profileCameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftName(displayName ?? "");
    setDraftAvatarUrl(avatarUrl ?? "");
    setDraftUserColor(normalizeUserColor(userColor ?? ""));
    setError(null);
    setUploadError(null);
  }, [avatarUrl, displayName, open, userColor]);

  const profilePreviewImageUrl = useMemo(() => {
    const normalizedName = draftName.trim();
    return (
      draftAvatarUrl ||
      createDiceBearAvatarDataUri(
        normalizedName.length > 0 ? normalizedName : avatarSeed,
        draftUserColor
      )
    );
  }, [avatarSeed, draftAvatarUrl, draftName, draftUserColor]);

  const onProfileFileChange = async (file: File) => {
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setDraftAvatarUrl(dataUrl);
      setUploadError(null);
    } catch {
      setUploadError(t("settings.profileUploadError"));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = draftName.trim();
    if (!normalizedName) {
      setError(t("settings.welcomeProfileNameRequired"));
      return;
    }

    setError(null);
    await onComplete({
      displayName: normalizedName,
      avatarUrl: draftAvatarUrl.trim(),
      userColor: normalizeUserColor(draftUserColor)
    });
  };

  return (
    <FullscreenDialog
      open={open}
      onOpenChange={() => undefined}
      title={t("settings.welcomeProfileTitle")}
      description={t("settings.welcomeProfileDescription")}
      onSubmit={handleSubmit}
      footer={
        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? t("settings.welcomeProfileSaving") : t("settings.welcomeProfileSave")}
          </Button>
        </div>
      }
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <input
            ref={profileUploadInputRef}
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
          <div className="relative">
            <button
              type="button"
              className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-brand-300"
              onClick={() => {
                if (!busy) profileUploadInputRef.current?.click();
              }}
              aria-label={t("settings.profileImageUploadLabel")}
            >
              <MemberAvatar
                src={profilePreviewImageUrl}
                alt={draftName.trim() || t("settings.profileImagePreviewAlt")}
                className="h-28 w-28 overflow-hidden rounded-full border border-brand-200 bg-brand-50 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                imageClassName="object-cover"
              />
              <span className="absolute bottom-1 right-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-md dark:bg-slate-900 dark:text-slate-200">
                <Camera className="h-4 w-4" />
              </span>
            </button>
            {draftAvatarUrl ? (
              <button
                type="button"
                className="absolute -right-1 -top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-white shadow-sm"
                onClick={() => setDraftAvatarUrl("")}
                aria-label={t("settings.removeImage")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => profileUploadInputRef.current?.click()}
            >
              {t("settings.profileImageUploadLabel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => profileCameraInputRef.current?.click()}
            >
              {t("tasks.stateImageCameraButton")}
            </Button>
          </div>
          {uploadError ? (
            <p className="w-full rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
              {uploadError}
            </p>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="welcome-profile-name">{t("settings.profileNameLabel")}</Label>
            <Input
              id="welcome-profile-name"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder={t("settings.profileNamePlaceholder")}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="welcome-profile-color">{t("settings.profileColorLabel")}</Label>
            <div className="flex items-center overflow-hidden rounded-xl border border-brand-200 bg-white focus-within:border-brand-500 focus-within:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.45)] dark:border-slate-700 dark:bg-slate-900 dark:focus-within:border-slate-500 dark:focus-within:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]">
              <Input
                id="welcome-profile-color"
                type="color"
                className="m-1 h-10 w-14 rounded-[8px] border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                value={normalizeUserColor(draftUserColor)}
                onChange={(event) => setDraftUserColor(normalizeUserColor(event.target.value))}
              />
              <Input
                className="h-10 flex-1 border-0 bg-transparent px-3 shadow-none focus-visible:ring-0"
                value={normalizeUserColor(draftUserColor)}
                onChange={(event) => setDraftUserColor(normalizeUserColor(event.target.value))}
                placeholder="#4f46e5"
              />
            </div>
          </div>

          {error ? (
            <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </FullscreenDialog>
  );
};
