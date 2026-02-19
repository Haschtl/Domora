import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseBackendConfig } from "./backend-config";

const resolvedBackend = resolveSupabaseBackendConfig();
export const activeSupabaseUrl = resolvedBackend.url;
export const activeSupabasePublishableKey = resolvedBackend.publishableKey;
export const supabaseConfigSource = resolvedBackend.source;
export const queryCacheStorageKey = resolvedBackend.queryCacheStorageKey;

export const isSupabaseConfigured = supabaseConfigSource !== "fallback";

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
        source: supabaseConfigSource,
        url: activeSupabaseUrl,
        keyIsSet: Boolean(activeSupabasePublishableKey)
      }
    });
  }
}

export const supabase = createClient(
  activeSupabaseUrl,
  activeSupabasePublishableKey
);
