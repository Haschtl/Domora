import { createClient } from "@supabase/supabase-js";

const normalizeEnv = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const supabaseUrl = normalizeEnv(import.meta.env.VITE_SUPABASE_URL);
const supabasePublishableKey = normalizeEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = createClient(
  supabaseUrl || "https://example.supabase.co",
  supabasePublishableKey || "public-publishable-key"
);
