import { createClient } from "@supabase/supabase-js";

const normalizeEnv = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const supabaseUrl = normalizeEnv(import.meta.env.VITE_SUPABASE_URL);
const supabasePublishableKey = normalizeEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

if (import.meta.env.DEV) {
  const origin = typeof window !== "undefined" ? window.location.origin : "server";
  // const keyPreview =
  //   supabasePublishableKey && supabasePublishableKey.length > 8
  //     ? `${supabasePublishableKey.slice(0, 8)}…(${supabasePublishableKey.length})`
  //     : supabasePublishableKey
  //       ? `set(${supabasePublishableKey.length})`
  //       : "missing";

  // console.info("[Supabase Debug]", {
  //   origin,
  //   isConfigured: isSupabaseConfigured,
  //   url: supabaseUrl ?? "missing",
  //   key: keyPreview
  // });

  if (typeof window !== "undefined") {
    Object.assign(window, {
      __DOMORA_SUPABASE_DEBUG__: {
        origin,
        isConfigured: isSupabaseConfigured,
        url: supabaseUrl ?? null,
        keyIsSet: Boolean(supabasePublishableKey)
      }
    });
  }
}

export const supabase = createClient(
  supabaseUrl || "https://example.supabase.co",
  supabasePublishableKey || "public-publishable-key"
);
