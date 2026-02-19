const BACKEND_CONFIG_STORAGE_KEY = "domora-backend-config:v1";
const QUERY_CACHE_KEY_PREFIX = "domora-query-cache:v1:";
const LEGACY_QUERY_CACHE_STORAGE_KEY = "domora-query-cache:v1";
const CONNECTION_TEST_TIMEOUT_MS = 10_000;

export type SupabaseBackendSource = "runtime" | "env" | "fallback";

export type SupabaseBackendConfig = {
  url: string;
  publishableKey: string;
  source: SupabaseBackendSource;
  queryCacheStorageKey: string;
};

export type SupabaseBackendConnectionInfo = {
  normalizedUrl: string;
  host: string;
};

type PersistedBackendConfig = {
  url: string;
  publishableKey: string;
  updatedAt: number;
};

const FALLBACK_URL = "https://example.supabase.co";
const FALLBACK_PUBLISHABLE_KEY = "public-publishable-key";

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const normalizeSupabaseUrl = (value: unknown) => {
  const normalized = normalizeString(value);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    parsed.hash = "";
    parsed.search = "";
    const sanitizedPathname = parsed.pathname.replace(/\/+$/, "");
    parsed.pathname = sanitizedPathname;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
};

export const normalizeSupabasePublishableKey = (value: unknown) => normalizeString(value);

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

export const getQueryCacheStorageKeyForUrl = (url: string) => `${QUERY_CACHE_KEY_PREFIX}${buildBackendNamespace(url)}`;

const parsePersistedBackendConfig = (value: string): PersistedBackendConfig | null => {
  try {
    const parsed = JSON.parse(value) as Partial<PersistedBackendConfig>;
    if (typeof parsed !== "object" || parsed === null) return null;
    const url = normalizeSupabaseUrl(parsed.url);
    const publishableKey = normalizeSupabasePublishableKey(parsed.publishableKey);
    if (!url || !publishableKey) return null;
    return {
      url,
      publishableKey,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now()
    };
  } catch {
    return null;
  }
};

export const readStoredSupabaseBackendConfig = () => {
  if (!canUseLocalStorage()) return null;
  const rawValue = window.localStorage.getItem(BACKEND_CONFIG_STORAGE_KEY);
  if (!rawValue) return null;

  const parsed = parsePersistedBackendConfig(rawValue);
  if (parsed) return parsed;

  window.localStorage.removeItem(BACKEND_CONFIG_STORAGE_KEY);
  return null;
};

export const saveStoredSupabaseBackendConfig = (input: { url: string; publishableKey: string }) => {
  const url = normalizeSupabaseUrl(input.url);
  if (!url) {
    throw new Error("Supabase URL ist ungültig.");
  }
  const publishableKey = normalizeSupabasePublishableKey(input.publishableKey);
  if (!publishableKey) {
    throw new Error("Publishable Key fehlt.");
  }
  if (!canUseLocalStorage()) return;

  const payload = {
    url,
    publishableKey,
    updatedAt: Date.now()
  } satisfies PersistedBackendConfig;
  window.localStorage.setItem(BACKEND_CONFIG_STORAGE_KEY, JSON.stringify(payload));
};

export const clearStoredSupabaseBackendConfig = () => {
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(BACKEND_CONFIG_STORAGE_KEY);
};

export const clearPersistedQueryCaches = () => {
  if (!canUseLocalStorage()) return;
  const keysToDelete: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && (key.startsWith(QUERY_CACHE_KEY_PREFIX) || key === LEGACY_QUERY_CACHE_STORAGE_KEY)) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    window.localStorage.removeItem(key);
  }
};

const fetchWithTimeout = async (input: string, init: RequestInit) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    controller.abort();
  }, CONNECTION_TEST_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
};

const createErrorWithCause = (message: string, cause: unknown) => {
  const error = new Error(message) as Error & { cause?: unknown };
  error.cause = cause;
  return error;
};

export const testSupabaseBackendConnection = async (input: {
  url: string;
  publishableKey: string;
}): Promise<SupabaseBackendConnectionInfo> => {
  const normalizedUrl = normalizeSupabaseUrl(input.url);
  if (!normalizedUrl) {
    throw new Error("Supabase URL ist ungültig.");
  }
  const normalizedKey = normalizeSupabasePublishableKey(input.publishableKey);
  if (!normalizedKey) {
    throw new Error("Publishable Key fehlt.");
  }

  const endpoint = `${normalizedUrl}/auth/v1/settings`;

  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: "GET",
      headers: {
        apikey: normalizedKey
      }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw createErrorWithCause("Timeout beim Verbinden mit Supabase.", error);
    }
    throw createErrorWithCause("Netzwerkfehler beim Verbinden mit Supabase.", error);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Publishable Key abgelehnt (401/403).");
    }
    throw new Error(`Supabase antwortete mit HTTP ${response.status}.`);
  }

  let host = normalizedUrl;
  try {
    host = new URL(normalizedUrl).host;
  } catch {
    // Keep normalized URL as fallback.
  }

  return {
    normalizedUrl,
    host
  };
};

export const resolveSupabaseBackendConfig = () => {
  const runtimeConfig = readStoredSupabaseBackendConfig();
  if (runtimeConfig) {
    return {
      url: runtimeConfig.url,
      publishableKey: runtimeConfig.publishableKey,
      source: "runtime",
      queryCacheStorageKey: getQueryCacheStorageKeyForUrl(runtimeConfig.url)
    } satisfies SupabaseBackendConfig;
  }

  const envUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
  const envPublishableKey = normalizeSupabasePublishableKey(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  if (envUrl && envPublishableKey) {
    return {
      url: envUrl,
      publishableKey: envPublishableKey,
      source: "env",
      queryCacheStorageKey: getQueryCacheStorageKeyForUrl(envUrl)
    } satisfies SupabaseBackendConfig;
  }

  return {
    url: FALLBACK_URL,
    publishableKey: FALLBACK_PUBLISHABLE_KEY,
    source: "fallback",
    queryCacheStorageKey: getQueryCacheStorageKeyForUrl(FALLBACK_URL)
  } satisfies SupabaseBackendConfig;
};
