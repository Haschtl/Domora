import type { DehydratedState, QueryClient } from "@tanstack/react-query";
import { dehydrate, hydrate } from "@tanstack/react-query";

const STORAGE_KEY = "domora-query-cache:v1";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const WRITE_DEBOUNCE_MS = 700;

type PersistedQueryCache = {
  timestamp: number;
  clientState: DehydratedState;
};

const canUseLocalStorage = () => typeof window !== "undefined" && "localStorage" in window;

const shouldPersistKey = (queryKey: readonly unknown[]) => {
  const root = queryKey[0];
  return root === "household" || root === "households";
};

const tryReadPersistedCache = (): PersistedQueryCache | null => {
  if (!canUseLocalStorage()) return null;

  const rawValue = window.localStorage.getItem(STORAGE_KEY);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedQueryCache>;
    if (typeof parsed !== "object" || parsed === null) return null;
    if (typeof parsed.timestamp !== "number") return null;
    if (typeof parsed.clientState !== "object" || parsed.clientState === null) return null;

    return {
      timestamp: parsed.timestamp,
      clientState: parsed.clientState as DehydratedState
    };
  } catch {
    return null;
  }
};

const removePersistedCache = () => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
};

const writePersistedCache = (queryClient: QueryClient) => {
  if (!canUseLocalStorage()) return;

  try {
    const clientState = dehydrate(queryClient, {
      shouldDehydrateQuery: (query) => query.state.status === "success" && shouldPersistKey(query.queryKey)
    });

    const payload = {
      timestamp: Date.now(),
      clientState
    } satisfies PersistedQueryCache;

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
};

export const restorePersistedQueryCache = (queryClient: QueryClient) => {
  const persisted = tryReadPersistedCache();
  if (!persisted) return;

  const isExpired = Date.now() - persisted.timestamp > MAX_AGE_MS;
  if (isExpired) {
    removePersistedCache();
    return;
  }

  try {
    hydrate(queryClient, persisted.clientState);
  } catch {
    removePersistedCache();
  }
};

export const setupPersistedQueryCache = (queryClient: QueryClient) => {
  if (!canUseLocalStorage()) return () => {};

  let debounceTimer: number | null = null;
  const flushNow = () => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    writePersistedCache(queryClient);
  };

  const scheduleWrite = () => {
    if (debounceTimer !== null) return;
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      writePersistedCache(queryClient);
    }, WRITE_DEBOUNCE_MS);
  };

  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    scheduleWrite();
  });

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      flushNow();
    }
  };

  window.addEventListener("pagehide", flushNow);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    unsubscribe();
    window.removeEventListener("pagehide", flushNow);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
    }
  };
};
