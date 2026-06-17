import { activeSupabasePublishableKey, activeSupabaseUrl } from "./supabase";

export type SupabaseAuthCaptchaProvider = "turnstile" | "hcaptcha";

export type SupabaseAuthCaptchaConfig = {
  enabled: boolean;
  provider: SupabaseAuthCaptchaProvider | null;
  siteKey: string | null;
};

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readNested = (value: unknown, path: string[]) => {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

const readBoolean = (value: unknown, paths: string[][]) => {
  for (const path of paths) {
    const candidate = readNested(value, path);
    if (typeof candidate === "boolean") return candidate;
  }
  return false;
};

const readProvider = (value: unknown, paths: string[][]) => {
  for (const path of paths) {
    const candidate = normalizeString(readNested(value, path));
    if (candidate === "turnstile" || candidate === "hcaptcha") return candidate;
  }
  return null;
};

const readSiteKey = (value: unknown, paths: string[][]) => {
  for (const path of paths) {
    const candidate = normalizeString(readNested(value, path));
    if (candidate) return candidate;
  }
  return null;
};

export const getSupabaseAuthCaptchaConfig =
  async (): Promise<SupabaseAuthCaptchaConfig> => {
    const response = await fetch(`${activeSupabaseUrl}/auth/v1/settings`, {
      method: "GET",
      headers: {
        apikey: activeSupabasePublishableKey
      }
    });

    if (!response.ok) {
      throw new Error(`Auth settings request failed with HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as unknown;

    const enabled = readBoolean(payload, [
      ["security", "captcha_enabled"],
      ["captcha_enabled"],
      ["captcha", "enabled"]
    ]);
    const provider = readProvider(payload, [
      ["security", "captcha_provider"],
      ["captcha_provider"],
      ["captcha", "provider"]
    ]);
    const siteKey = readSiteKey(payload, [
      ["security", "captcha_site_key"],
      ["captcha_site_key"],
      ["captcha", "site_key"],
      ["captcha", "siteKey"]
    ]);

    return {
      enabled,
      provider,
      siteKey
    };
  };
