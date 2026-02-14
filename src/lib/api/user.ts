import { z } from "./shared";
import { supabase } from "./shared";

export const signIn = async (email: string, password: string) => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
};

export const signUp = async (email: string, password: string) => {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
};

export const signInWithGoogle = async () => {
  const redirectTo =
    typeof window !== "undefined"
      ? new URL(import.meta.env.BASE_URL || "/", window.location.origin).toString()
      : undefined;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: redirectTo ? { redirectTo } : undefined
  });

  if (error) throw error;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
};

export const updateUserAvatar = async (avatarUrl: string) => {
  const normalizedAvatar = z.string().trim().parse(avatarUrl);

  const { error } = await supabase.auth.updateUser({
    data: {
      avatar_url: normalizedAvatar.length > 0 ? normalizedAvatar : null
    }
  });

  if (error) throw error;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) return;

  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      user_id: userId,
      avatar_url: normalizedAvatar.length > 0 ? normalizedAvatar : null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
  if (profileError) throw profileError;
};

export const updateUserDisplayName = async (displayName: string) => {
  const normalizedDisplayName = z.string().trim().max(80).parse(displayName);

  const { error } = await supabase.auth.updateUser({
    data: {
      display_name: normalizedDisplayName.length > 0 ? normalizedDisplayName : null
    }
  });

  if (error) throw error;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) return;

  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      user_id: userId,
      display_name: normalizedDisplayName.length > 0 ? normalizedDisplayName : null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
  if (profileError) throw profileError;
};
