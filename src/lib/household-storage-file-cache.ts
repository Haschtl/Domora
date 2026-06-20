const HOUSEHOLD_STORAGE_FILE_CACHE_NAME = "domora-household-storage-files-v1";
const HOUSEHOLD_STORAGE_FILE_CACHE_PATH = "/__domora_cache__/household-storage-file";

const canUseHouseholdStorageFileCache = () =>
  typeof window !== "undefined" &&
  typeof window.location?.origin === "string" &&
  "caches" in window;

const buildHouseholdStorageFileCacheRequest = (input: {
  backendUrl: string;
  householdId: string;
  targetPath: string;
  cacheVersion: string;
}) => {
  const url = new URL(HOUSEHOLD_STORAGE_FILE_CACHE_PATH, window.location.origin);
  url.searchParams.set("backend", input.backendUrl);
  url.searchParams.set("householdId", input.householdId);
  url.searchParams.set("targetPath", input.targetPath);
  url.searchParams.set("v", input.cacheVersion);
  return new Request(url.toString(), { method: "GET" });
};

const matchesSameFile = (
  request: Request,
  input: { backendUrl: string; householdId: string; targetPath: string }
) => {
  const url = new URL(request.url);
  return (
    url.pathname === HOUSEHOLD_STORAGE_FILE_CACHE_PATH &&
    url.searchParams.get("backend") === input.backendUrl &&
    url.searchParams.get("householdId") === input.householdId &&
    url.searchParams.get("targetPath") === input.targetPath
  );
};

export const readCachedHouseholdStorageFileResponse = async (input: {
  backendUrl: string;
  householdId: string;
  targetPath: string;
  cacheVersion: string | null | undefined;
}) => {
  if (!input.cacheVersion || !canUseHouseholdStorageFileCache()) return null;
  const cache = await caches.open(HOUSEHOLD_STORAGE_FILE_CACHE_NAME);
  const request = buildHouseholdStorageFileCacheRequest({
    backendUrl: input.backendUrl,
    householdId: input.householdId,
    targetPath: input.targetPath,
    cacheVersion: input.cacheVersion
  });
  return cache.match(request);
};

export const writeCachedHouseholdStorageFileResponse = async (input: {
  backendUrl: string;
  householdId: string;
  targetPath: string;
  cacheVersion: string | null | undefined;
  response: Response;
}) => {
  if (!input.cacheVersion || !canUseHouseholdStorageFileCache()) return;
  const cache = await caches.open(HOUSEHOLD_STORAGE_FILE_CACHE_NAME);
  const requests = await cache.keys();

  await Promise.all(
    requests
      .filter((request) =>
        matchesSameFile(request, {
          backendUrl: input.backendUrl,
          householdId: input.householdId,
          targetPath: input.targetPath
        })
      )
      .map((request) => cache.delete(request))
  );

  const request = buildHouseholdStorageFileCacheRequest({
    backendUrl: input.backendUrl,
    householdId: input.householdId,
    targetPath: input.targetPath,
    cacheVersion: input.cacheVersion
  });
  await cache.put(request, input.response);
};
