import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, File as FileIcon, RefreshCw, Upload, FolderPlus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createHouseholdStorageFolder,
  deleteHouseholdStorageEntry,
  listHouseholdStorage,
  uploadHouseholdStorageFile
} from "../../lib/api";
import type { Household } from "../../lib/types";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

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

export const FileExplorer = ({ household }: { household: Household }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [path, setPath] = useState("/");
  const [newFolderName, setNewFolderName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setErrorMessage(error instanceof Error ? error.message : "Could not create folder");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (targetPath: string) => {
      await deleteHouseholdStorageEntry({ householdId: household.id, targetPath });
    },
    onSuccess: () => {
      setErrorMessage(null);
      refresh();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Could not delete item");
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
      refresh();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed");
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

  const isBusy =
    mkdirMutation.isPending ||
    deleteMutation.isPending ||
    uploadMutation.isPending ||
    listQuery.isFetching;

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
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => uploadInputRef.current?.click()}
            disabled={!isConfigured || isBusy}
          >
            <Upload className="mr-1 h-3.5 w-3.5" />
            {t("common.upload", { defaultValue: "Upload" })}
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
                  <th className="px-2 py-1.5">{t("common.actions", { defaultValue: "Aktionen" })}</th>
                </tr>
              </thead>
              <tbody>
                {listQuery.isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-xs text-slate-500 dark:text-slate-300">
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : listQuery.isError ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-xs text-rose-600 dark:text-rose-300">
                      {listQuery.error instanceof Error ? listQuery.error.message : "Load failed"}
                    </td>
                  </tr>
                ) : (listQuery.data?.entries.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-xs text-slate-500 dark:text-slate-300">
                      {t("home.storageExplorerEmpty", { defaultValue: "Ordner ist leer." })}
                    </td>
                  </tr>
                ) : (
                  listQuery.data?.entries.map((entry) => (
                    <tr key={entry.path} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
                          onClick={() => {
                            if (entry.isDirectory) {
                              setPath(entry.path);
                            }
                          }}
                          disabled={isBusy || !entry.isDirectory}
                        >
                          {entry.isDirectory ? <Folder className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />}
                          <span className="truncate">{entry.name}</span>
                        </button>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300">
                        {entry.isDirectory ? "Ordner" : "Datei"}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300">
                        {entry.isDirectory ? "—" : entry.size == null ? "—" : `${Math.max(1, Math.round(entry.size / 1024))} KB`}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={isBusy}
                          onClick={() => {
                            if (!window.confirm(`\"${entry.name}\" löschen?`)) return;
                            deleteMutation.mutate(entry.path);
                          }}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          {t("common.delete")}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
};
