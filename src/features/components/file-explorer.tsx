import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Folder,
  File as FileIcon,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  X,
  MoreVertical,
  ArrowRightLeft,
  Pencil,
  Trash2,
  Download,
  RefreshCw,
  Upload,
  FolderPlus,
  Plus
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createHouseholdStorageFolder,
  deleteHouseholdStorageEntry,
  downloadHouseholdStorageFile,
  listHouseholdStorage,
  moveHouseholdStorageEntry,
  renameHouseholdStorageEntry,
  uploadHouseholdStorageFile
} from "../../lib/api";
import type { Household } from "../../lib/types";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "../../components/ui/context-menu";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import type { LucideIcon } from "lucide-react";

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const commaIndex = result.indexOf(",");
      if (commaIndex < 0) {
        reject(new Error("Invalid file encoding"));
        return;
      }
      resolve(result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });

const formatFileSize = (bytes: number | null) => {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const digits = exponent === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[exponent]}`;
};

const FRIENDLY_MIME_TYPES: Record<string, string> = {
  "application/pdf": "PDF-Dokument",
  "application/zip": "ZIP-Archiv",
  "application/x-7z-compressed": "7Z-Archiv",
  "application/x-rar-compressed": "RAR-Archiv",
  "application/vnd.ms-excel": "Excel-Tabelle",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel-Tabelle",
  "application/msword": "Word-Dokument",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word-Dokument",
  "application/vnd.ms-powerpoint": "PowerPoint-Praesentation",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint-Praesentation",
  "text/plain": "Textdatei",
  "text/csv": "CSV-Datei",
  "text/markdown": "Markdown-Datei",
  "application/json": "JSON-Datei",
  "application/xml": "XML-Datei",
  "image/jpeg": "JPEG-Bild",
  "image/png": "PNG-Bild",
  "image/gif": "GIF-Bild",
  "image/webp": "WebP-Bild",
  "image/svg+xml": "SVG-Bild",
  "video/mp4": "MP4-Video",
  "video/webm": "WebM-Video",
  "audio/mpeg": "MP3-Audio",
  "audio/wav": "WAV-Audio",
  "audio/ogg": "OGG-Audio"
};

const FRIENDLY_EXT_TYPES: Record<string, string> = {
  pdf: "PDF-Dokument",
  txt: "Textdatei",
  md: "Markdown-Datei",
  csv: "CSV-Datei",
  json: "JSON-Datei",
  xml: "XML-Datei",
  doc: "Word-Dokument",
  docx: "Word-Dokument",
  xls: "Excel-Tabelle",
  xlsx: "Excel-Tabelle",
  ppt: "PowerPoint-Praesentation",
  pptx: "PowerPoint-Praesentation",
  zip: "ZIP-Archiv",
  rar: "RAR-Archiv",
  "7z": "7Z-Archiv",
  jpg: "JPEG-Bild",
  jpeg: "JPEG-Bild",
  png: "PNG-Bild",
  gif: "GIF-Bild",
  webp: "WebP-Bild",
  svg: "SVG-Bild",
  mp3: "MP3-Audio",
  wav: "WAV-Audio",
  ogg: "OGG-Audio",
  mp4: "MP4-Video",
  webm: "WebM-Video"
};

const formatEntryType = (entry: { isDirectory: boolean; contentType: string | null; name: string }) => {
  if (entry.isDirectory) return "Ordner";
  const mime = entry.contentType?.trim();
  if (mime) {
    const [type] = mime.split(";");
    const normalizedType = type?.trim().toLowerCase();
    if (normalizedType) {
      if (FRIENDLY_MIME_TYPES[normalizedType]) return FRIENDLY_MIME_TYPES[normalizedType];
      if (normalizedType.startsWith("image/")) return "Bilddatei";
      if (normalizedType.startsWith("video/")) return "Videodatei";
      if (normalizedType.startsWith("audio/")) return "Audiodatei";
      if (normalizedType.startsWith("text/")) return "Textdatei";
      if (normalizedType.startsWith("application/")) return "Dokument";
    }
  }
  const dotIndex = entry.name.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex < entry.name.length - 1) {
    const ext = entry.name.slice(dotIndex + 1).toLowerCase();
    return FRIENDLY_EXT_TYPES[ext] ?? `${ext.toUpperCase()}-Datei`;
  }
  return "Datei";
};

const getEntryIcon = (entry: { isDirectory: boolean; contentType: string | null; name: string }): LucideIcon => {
  if (entry.isDirectory) return Folder;
  const mime = entry.contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("video/")) return FileVideo;
  if (mime.startsWith("audio/")) return FileAudio;
  if (mime === "application/pdf") return FileText;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv") return FileSpreadsheet;
  if (mime === "application/json" || mime === "application/xml" || mime === "text/markdown") return FileCode2;
  if (mime.includes("zip") || mime.includes("rar") || mime.includes("7z") || mime.includes("tar")) return FileArchive;
  if (mime.startsWith("text/")) return FileText;

  const dotIndex = entry.name.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex < entry.name.length - 1) {
    const ext = entry.name.slice(dotIndex + 1).toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return FileImage;
    if (["mp4", "webm", "mov", "mkv"].includes(ext)) return FileVideo;
    if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) return FileAudio;
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return FileArchive;
    if (["csv", "xls", "xlsx"].includes(ext)) return FileSpreadsheet;
    if (["json", "xml", "md", "ts", "tsx", "js", "jsx", "css", "html"].includes(ext)) return FileCode2;
    if (["txt", "pdf", "doc", "docx", "rtf"].includes(ext)) return FileText;
  }

  return FileIcon;
};

const decodeBase64ToBytes = (contentBase64: string) => Uint8Array.from(atob(contentBase64), (char) => char.charCodeAt(0));

const downloadBase64File = (fileName: string, contentType: string, contentBase64: string) => {
  const bytes = decodeBase64ToBytes(contentBase64);
  const blob = new Blob([bytes], { type: contentType || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const decodeBase64Text = (contentBase64: string) => {
  try {
    const bytes = decodeBase64ToBytes(contentBase64);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

export const FileExplorer = ({ household }: { household: Household }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [path, setPath] = useState("/");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string } | null>(null);

  const isConfigured =
    household.storage_provider !== "none" &&
    household.storage_url.trim().length > 0 &&
    household.storage_username.trim().length > 0;

  const queryKey = useMemo(
    () => ["household", household.id, "storage", household.storage_provider, household.storage_url, path],
    [household.id, household.storage_provider, household.storage_url, path]
  );

  const listQuery = useQuery({
    queryKey,
    enabled: isConfigured,
    queryFn: () => listHouseholdStorage({ householdId: household.id, path })
  });

  const filePreviewQuery = useQuery({
    queryKey: ["household", household.id, "storage", "download", selectedFile?.path],
    enabled: Boolean(selectedFile?.path),
    queryFn: () =>
      downloadHouseholdStorageFile({
        householdId: household.id,
        targetPath: selectedFile?.path ?? ""
      })
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey });

  const mkdirMutation = useMutation({
    mutationFn: async () => {
      if (!newFolderName.trim()) return;
      await createHouseholdStorageFolder({
        householdId: household.id,
        path,
        name: newFolderName.trim()
      });
    },
    onSuccess: () => {
      setNewFolderName("");
      setErrorMessage(null);
      refresh();
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("home.storageExplorer.errorCreateFolder", { defaultValue: "Ordner konnte nicht erstellt werden" })
      );
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      for (const file of Array.from(files)) {
        const base64 = await readFileAsBase64(file);
        await uploadHouseholdStorageFile({
          householdId: household.id,
          path,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          contentBase64: base64
        });
      }
    },
    onSuccess: () => {
      setErrorMessage(null);
      setShowNewFolderInput(false);
      refresh();
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("home.storageExplorer.errorUpload", { defaultValue: "Upload fehlgeschlagen" })
      );
    }
  });

  const renameMutation = useMutation({
    mutationFn: async (input: { targetPath: string; newName: string }) => {
      await renameHouseholdStorageEntry({
        householdId: household.id,
        targetPath: input.targetPath,
        newName: input.newName
      });
    },
    onSuccess: () => {
      setErrorMessage(null);
      refresh();
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("home.storageExplorer.renameFailed", { defaultValue: "Umbenennen fehlgeschlagen" })
      );
    }
  });

  const moveMutation = useMutation({
    mutationFn: async (input: { targetPath: string; destinationPath: string }) => {
      await moveHouseholdStorageEntry({
        householdId: household.id,
        targetPath: input.targetPath,
        destinationPath: input.destinationPath
      });
    },
    onSuccess: () => {
      setErrorMessage(null);
      refresh();
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("home.storageExplorer.moveFailed", { defaultValue: "Verschieben fehlgeschlagen" })
      );
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (targetPath: string) => {
      await deleteHouseholdStorageEntry({
        householdId: household.id,
        targetPath
      });
    },
    onSuccess: () => {
      setErrorMessage(null);
      refresh();
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("home.storageExplorer.deleteFailed", { defaultValue: "Löschen fehlgeschlagen" })
      );
    }
  });

  const breadcrumbs = useMemo(() => {
    const parts = path.split("/").filter(Boolean);
    const result: Array<{ label: string; value: string }> = [{ label: "/", value: "/" }];
    let current = "";
    for (const part of parts) {
      current = `${current}/${part}`;
      result.push({ label: part, value: current });
    }
    return result;
  }, [path]);

  const parentPath = useMemo(() => {
    if (path === "/") return null;
    const parts = path.split("/").filter(Boolean);
    if (parts.length <= 1) return "/";
    return `/${parts.slice(0, -1).join("/")}`;
  }, [path]);

  const isBusy =
    mkdirMutation.isPending ||
    uploadMutation.isPending ||
    renameMutation.isPending ||
    moveMutation.isPending ||
    deleteMutation.isPending ||
    listQuery.isFetching;

  const preview = filePreviewQuery.data;
  const previewType = preview?.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const previewDataUrl = preview ? `data:${preview.contentType};base64,${preview.contentBase64}` : null;
  const previewText = preview && (previewType.startsWith("text/") || previewType === "application/json")
    ? decodeBase64Text(preview.contentBase64)
    : null;

  const runMoveAction = async (targetPath: string) => {
    const destinationPath = window.prompt(
      t("home.storageExplorer.movePrompt", {
        defaultValue: "Zielordnerpfad (z. B. / oder /unterordner)"
      }),
      path
    );
    if (destinationPath == null) return;
    const normalized = destinationPath.trim() || "/";
    await moveMutation.mutateAsync({
      targetPath,
      destinationPath: normalized.startsWith("/") ? normalized : `/${normalized}`
    });
  };

  const runRenameAction = async (targetPath: string, currentName: string) => {
    const newName = window.prompt(
      t("home.storageExplorer.renamePrompt", { defaultValue: "Neuer Dateiname" }),
      currentName
    );
    if (newName == null || newName.trim().length === 0) return;
    await renameMutation.mutateAsync({
      targetPath,
      newName: newName.trim()
    });
  };

  const runDeleteAction = async (targetPath: string) => {
    const confirmed = window.confirm(
      t("home.storageExplorer.deleteConfirm", {
        defaultValue: "Datei wirklich löschen?"
      })
    );
    if (!confirmed) return;
    await deleteMutation.mutateAsync(targetPath);
  };

  const runDownloadAction = async (targetPath: string) => {
    const file = await downloadHouseholdStorageFile({
      householdId: household.id,
      targetPath
    });
    downloadBase64File(file.fileName, file.contentType, file.contentBase64);
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-300 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t("home.storageExplorerTitle", { defaultValue: "WG Storage" })}
        </h3>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={refresh} disabled={!isConfigured || isBusy}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            {t("common.refresh", { defaultValue: "Aktualisieren" })}
          </Button>
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = event.target.files;
              if (files && files.length > 0) {
                uploadMutation.mutate(files);
              }
              event.target.value = "";
            }}
          />
        </div>
      </div>

      {!isConfigured ? (
        <p className="text-xs text-slate-500 dark:text-slate-300">
          {t("home.storageExplorerNeedsConfig", {
            defaultValue: "Storage ist nicht konfiguriert. Bitte in Einstellungen -> WG konfigurieren."
          })}
        </p>
      ) : null}

      {isConfigured ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
              {breadcrumbs.map((crumb, index) => (
                <button
                  key={`${crumb.value}-${index}`}
                  type="button"
                  className="rounded px-1 py-0.5 hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
                  onClick={() => setPath(crumb.value)}
                  disabled={isBusy}
                >
                  {crumb.label}
                </button>
              ))}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  disabled={isBusy}
                  aria-label={t("home.storageExplorerActions", { defaultValue: "Aktionen" })}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    uploadInputRef.current?.click();
                  }}
                  disabled={isBusy}
                >
                  <Upload className="mr-2 h-3.5 w-3.5" />
                  {t("common.upload", { defaultValue: "Datei hochladen" })}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setShowNewFolderInput(true);
                  }}
                  disabled={isBusy}
                >
                  <FolderPlus className="mr-2 h-3.5 w-3.5" />
                  {t("home.storageExplorerNewFolder", { defaultValue: "Neuer Ordner" })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {showNewFolderInput ? (
            <div className="flex items-center gap-2">
              <Input
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder={t("home.storageExplorerNewFolder", { defaultValue: "Neuer Ordnername" })}
                disabled={isBusy}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!newFolderName.trim() || isBusy}
                onClick={() => mkdirMutation.mutate()}
              >
                <FolderPlus className="mr-1 h-3.5 w-3.5" />
                {t("common.create", { defaultValue: "Erstellen" })}
              </Button>
            </div>
          ) : null}

          {errorMessage ? (
            <p className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {errorMessage}
            </p>
          ) : null}

          <div className="max-h-[380px] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-100/95 text-xs text-slate-600 dark:bg-slate-900/95 dark:text-slate-300">
                <tr>
                  <th className="px-2 py-1.5">{t("common.name", { defaultValue: "Name" })}</th>
                  <th className="px-2 py-1.5">{t("common.type", { defaultValue: "Typ" })}</th>
                  <th className="px-2 py-1.5">{t("common.size", { defaultValue: "Größe" })}</th>
                </tr>
              </thead>
              <tbody>
                {listQuery.isLoading ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-3 text-xs text-slate-500 dark:text-slate-300">
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : listQuery.isError ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-3 text-xs text-rose-600 dark:text-rose-300">
                      {listQuery.error instanceof Error
                        ? listQuery.error.message
                        : t("home.storageExplorer.errorLoad", { defaultValue: "Laden fehlgeschlagen" })}
                    </td>
                  </tr>
                ) : (listQuery.data?.entries.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-3 text-xs text-slate-500 dark:text-slate-300">
                      {t("home.storageExplorerEmpty", { defaultValue: "Ordner ist leer." })}
                    </td>
                  </tr>
                ) : (
                  <>
                    {parentPath ? (
                      <tr
                        key="parent-directory"
                        className="cursor-pointer border-t border-slate-200 transition-colors hover:bg-slate-200/70 dark:border-slate-700 dark:hover:bg-slate-700/70"
                        onClick={() => {
                          if (!isBusy) {
                            setPath(parentPath);
                          }
                        }}
                      >
                        <td className="px-2 py-1.5">
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <Folder className="h-4 w-4" />
                            <span className="truncate">..</span>
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300">
                          {t("home.storageExplorer.typeFolder", { defaultValue: "Ordner" })}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300">—</td>
                      </tr>
                    ) : null}
                    {listQuery.data?.entries.map((entry) => {
                      const EntryIcon = getEntryIcon(entry);
                      const row = (
                      <tr
                        key={entry.path}
                        className="cursor-pointer border-t border-slate-200 transition-colors hover:bg-slate-200/70 dark:border-slate-700 dark:hover:bg-slate-700/70"
                        onClick={(event) => {
                          const target = event.target as HTMLElement | null;
                          if (target?.closest("[data-storage-row-action='true']")) {
                            return;
                          }
                          if (isBusy) return;
                          if (entry.isDirectory) {
                            setPath(entry.path);
                            return;
                          }
                          setSelectedFile({ path: entry.path, name: entry.name });
                        }}
                      >
                        <td className="px-2 py-1.5">
                          <div className="flex min-w-0 items-center justify-between gap-2">
                            <span className="inline-flex min-w-0 items-center gap-2">
                              <EntryIcon className="h-4 w-4" />
                              <span className="truncate">{entry.name}</span>
                            </span>
                            {!entry.isDirectory ? (
                              <div data-storage-row-action="true">
                                <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    disabled={isBusy}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onClick={(event) => event.stopPropagation()}
                                    aria-label={t("home.storageExplorer.fileActions", { defaultValue: "Dateiaktionen" })}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onSelect={async (event) => {
                                      event.preventDefault();
                                      await runMoveAction(entry.path);
                                    }}
                                    disabled={isBusy}
                                  >
                                    <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
                                    {t("home.storageExplorer.move", { defaultValue: "Verschieben" })}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={async (event) => {
                                      event.preventDefault();
                                      await runRenameAction(entry.path, entry.name);
                                    }}
                                    disabled={isBusy}
                                  >
                                    <Pencil className="mr-2 h-3.5 w-3.5" />
                                    {t("home.storageExplorer.rename", { defaultValue: "Umbenennen" })}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={async (event) => {
                                      event.preventDefault();
                                      await runDeleteAction(entry.path);
                                    }}
                                    disabled={isBusy}
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    {t("home.storageExplorer.delete", { defaultValue: "Löschen" })}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={async (event) => {
                                      event.preventDefault();
                                      await runDownloadAction(entry.path);
                                    }}
                                    disabled={isBusy}
                                  >
                                    <Download className="mr-2 h-3.5 w-3.5" />
                                    {t("home.storageExplorer.download", { defaultValue: "Herunterladen" })}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300">
                          {formatEntryType(entry)}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300">
                          {entry.isDirectory ? "—" : formatFileSize(entry.size)}
                        </td>
                      </tr>
                      );

                      if (entry.isDirectory) {
                        return row;
                      }

                      return (
                        <ContextMenu key={`ctx-${entry.path}`}>
                          <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuItem
                              onSelect={(event) => {
                                event.preventDefault();
                                void runMoveAction(entry.path);
                              }}
                              disabled={isBusy}
                            >
                              <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
                              {t("home.storageExplorer.move", { defaultValue: "Verschieben" })}
                            </ContextMenuItem>
                            <ContextMenuItem
                              onSelect={(event) => {
                                event.preventDefault();
                                void runRenameAction(entry.path, entry.name);
                              }}
                              disabled={isBusy}
                            >
                              <Pencil className="mr-2 h-3.5 w-3.5" />
                              {t("home.storageExplorer.rename", { defaultValue: "Umbenennen" })}
                            </ContextMenuItem>
                            <ContextMenuItem
                              onSelect={(event) => {
                                event.preventDefault();
                                void runDeleteAction(entry.path);
                              }}
                              disabled={isBusy}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              {t("home.storageExplorer.delete", { defaultValue: "Löschen" })}
                            </ContextMenuItem>
                            <ContextMenuItem
                              onSelect={(event) => {
                                event.preventDefault();
                                void runDownloadAction(entry.path);
                              }}
                              disabled={isBusy}
                            >
                              <Download className="mr-2 h-3.5 w-3.5" />
                              {t("home.storageExplorer.download", { defaultValue: "Herunterladen" })}
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <Dialog
        open={Boolean(selectedFile)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedFile(null);
          }
        }}
      >
        <DialogContent className="p-2 sm:max-w-3xl sm:p-5">
          <DialogHeader className="px-1 pt-1 sm:px-0 sm:pt-0 flex flex-row items-center justify-between gap-3">
            <DialogTitle className="truncate text-base">{selectedFile?.name ?? ""}</DialogTitle>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label={t("common.close", { defaultValue: "Schließen" })}
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </DialogHeader>

          <div className="min-h-48 rounded-lg border border-slate-200 bg-slate-50  sm:p-4 dark:border-slate-700 dark:bg-slate-950/40">
            {filePreviewQuery.isLoading ? (
              <p className="text-sm text-slate-500 dark:text-slate-300">{t("common.loading", { defaultValue: "Laden..." })}</p>
            ) : filePreviewQuery.isError ? (
              <p className="text-sm text-rose-600 dark:text-rose-300">
                {filePreviewQuery.error instanceof Error
                  ? filePreviewQuery.error.message
                  : t("home.storageExplorer.previewFailed", { defaultValue: "Vorschau fehlgeschlagen" })}
              </p>
            ) : previewDataUrl && previewType.startsWith("image/") ? (
              <img
                src={previewDataUrl}
                alt={selectedFile?.name ?? t("home.storageExplorer.preview", { defaultValue: "Vorschau" })}
                className="max-h-[60vh] w-full rounded object-contain"
              />
            ) : previewDataUrl && previewType === "application/pdf" ? (
              <iframe
                src={previewDataUrl}
                title={selectedFile?.name ?? t("home.storageExplorer.preview", { defaultValue: "Vorschau" })}
                className="h-[60vh] w-full rounded border-0"
              />
            ) : previewDataUrl && previewType.startsWith("video/") ? (
              <video src={previewDataUrl} controls className="max-h-[60vh] w-full rounded" />
            ) : previewDataUrl && previewType.startsWith("audio/") ? (
              <audio src={previewDataUrl} controls className="w-full" />
            ) : previewText != null ? (
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700 dark:text-slate-200">{previewText}</pre>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-300">
                {t("home.storageExplorer.previewUnavailable", { defaultValue: "Keine Vorschau verfügbar." })}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-1 pb-1 pt-2 sm:px-0 sm:pb-0">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("common.back", { defaultValue: "Zurück" })}
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                if (!preview) return;
                downloadBase64File(preview.fileName, preview.contentType, preview.contentBase64);
              }}
              disabled={!preview || filePreviewQuery.isLoading}
            >
              {t("common.download", { defaultValue: "Download" })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
