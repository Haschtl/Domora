import { activeSupabasePublishableKey, activeSupabaseUrl } from "./supabase";

const FIREBASE_RUNTIME_CONFIG_STORAGE_KEY_PREFIX = "domora-firebase-runtime-config:v1:";
const FIREBASE_RUNTIME_CONFIG_TTL_MS = 6 * 60 * 60 * 1000;
const FIREBASE_PUBLIC_CONFIG_PATH = "/functions/v1/firebase-public-config";

export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  storageBucket?: string;
  measurementId?: string;
};

export type FirebaseRuntimeConfig = {
  firebase: FirebaseClientConfig;
  vapidKey: string;
  fetchedAt: number;
};

type StoredRuntimeConfig = {
  fetchedAt: number;
  payload: unknown;
};

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const normalizeFirebaseClientConfig = (value: unknown): FirebaseClientConfig | null => {
  if (!isRecord(value)) return null;

  const apiKey = normalizeString(value.apiKey);
  const authDomain = normalizeString(value.authDomain);
  const projectId = normalizeString(value.projectId);
  const messagingSenderId = normalizeString(value.messagingSenderId);
  const appId = normalizeString(value.appId);
  if (!apiKey || !authDomain || !projectId || !messagingSenderId || !appId) {
    return null;
  }

  const storageBucket = normalizeString(value.storageBucket);
  const measurementId = normalizeString(value.measurementId);

  const config: FirebaseClientConfig = {
    apiKey,
    authDomain,
    projectId,
    messagingSenderId,
    appId
  };
  if (storageBucket) config.storageBucket = storageBucket;
  if (measurementId) config.measurementId = measurementId;
  return config;
};

const parseRuntimePayload = (
  value: unknown
): {
  firebase: FirebaseClientConfig;
  vapidKey: string;
} | null => {
  if (!isRecord(value)) return null;

  const nestedFirebase = normalizeFirebaseClientConfig(value.firebase);
  const flatFirebase = normalizeFirebaseClientConfig(value);
  const firebase = nestedFirebase ?? flatFirebase;
  const vapidKey = normalizeString(value.vapidKey);
  if (!firebase || !vapidKey) return null;

  return {
    firebase,
    vapidKey
  };
};

const canUseLocalStorage = () => typeof window !== "undefined" && "localStorage" in window;

const buildBackendNamespace = (url: string) => {
  try {
    const parsed = new URL(url);
    const raw = `${parsed.host}${parsed.pathname}`.toLowerCase();
    const cleaned = raw.replace(/[^a-z0-9._-]/g, "_");
    return cleaned.length > 0 ? cleaned : "unknown";
  } catch {
    return "unknown";
  }
};

const getStorageKeyForActiveBackend = () =>
  `${FIREBASE_RUNTIME_CONFIG_STORAGE_KEY_PREFIX}${buildBackendNamespace(activeSupabaseUrl)}`;

const isRuntimeConfigFresh = (config: FirebaseRuntimeConfig) => Date.now() - config.fetchedAt <= FIREBASE_RUNTIME_CONFIG_TTL_MS;

const parseStoredRuntimeConfig = (rawValue: string): FirebaseRuntimeConfig | null => {
  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredRuntimeConfig>;
    if (!isRecord(parsed)) return null;
    const normalized = parseRuntimePayload(parsed.payload);
    if (!normalized) return null;
    const fetchedAt = typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0;
    return {
      ...normalized,
      fetchedAt
    };
  } catch {
    return null;
  }
};

const readStoredRuntimeConfig = (allowStale: boolean) => {
  if (!canUseLocalStorage()) return null;
  const rawValue = window.localStorage.getItem(getStorageKeyForActiveBackend());
  if (!rawValue) return null;

  const parsed = parseStoredRuntimeConfig(rawValue);
  if (!parsed) {
    window.localStorage.removeItem(getStorageKeyForActiveBackend());
    return null;
  }
  if (!allowStale && !isRuntimeConfigFresh(parsed)) {
    return null;
  }
  return parsed;
};

const storeRuntimeConfig = (config: FirebaseRuntimeConfig) => {
  if (!canUseLocalStorage()) return;
  const payload = {
    fetchedAt: config.fetchedAt,
    payload: {
      firebase: config.firebase,
      vapidKey: config.vapidKey
    }
  } satisfies StoredRuntimeConfig;
  window.localStorage.setItem(getStorageKeyForActiveBackend(), JSON.stringify(payload));
};

const fetchRuntimeConfigFromBackend = async (): Promise<FirebaseRuntimeConfig | null> => {
  let endpoint: string;
  try {
    endpoint = new URL(FIREBASE_PUBLIC_CONFIG_PATH, activeSupabaseUrl).toString();
  } catch {
    return null;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: activeSupabasePublishableKey,
        accept: "application/json"
      },
      cache: "no-store"
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  const payload = parseRuntimePayload(body);
  if (!payload) return null;

  return {
    ...payload,
    fetchedAt: Date.now()
  };
};

let memoryRuntimeConfig: FirebaseRuntimeConfig | null = null;
let loadingPromise: Promise<FirebaseRuntimeConfig | null> | null = null;

export const getFirebaseRuntimeConfig = async (
  options: {
    forceRefresh?: boolean;
  } = {}
) => {
  const forceRefresh = options.forceRefresh === true;
  if (!forceRefresh && memoryRuntimeConfig && isRuntimeConfigFresh(memoryRuntimeConfig)) {
    return memoryRuntimeConfig;
  }

  if (!forceRefresh) {
    const stored = readStoredRuntimeConfig(false);
    if (stored) {
      memoryRuntimeConfig = stored;
      return stored;
    }
  }

  const staleFallback = memoryRuntimeConfig ?? readStoredRuntimeConfig(true);
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const fresh = await fetchRuntimeConfigFromBackend();
    if (fresh) {
      memoryRuntimeConfig = fresh;
      storeRuntimeConfig(fresh);
      return fresh;
    }

    memoryRuntimeConfig = staleFallback ?? null;
    return memoryRuntimeConfig;
  })();

  try {
    return await loadingPromise;
  } finally {
    loadingPromise = null;
  }
};

export const clearPersistedFirebaseRuntimeConfigs = () => {
  memoryRuntimeConfig = null;
  loadingPromise = null;
  if (!canUseLocalStorage()) return;

  const keysToDelete: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(FIREBASE_RUNTIME_CONFIG_STORAGE_KEY_PREFIX)) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    window.localStorage.removeItem(key);
  }
};

const encodeBase64Url = (input: string) =>
  btoa(input)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

export const serializeFirebaseConfigForServiceWorker = (config: FirebaseClientConfig) =>
  encodeBase64Url(JSON.stringify(config));
