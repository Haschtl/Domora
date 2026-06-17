const normalizeInviteBaseUrl = (value: string) => {
  const parsed = new URL(value);
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
    return null;
  }
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") + "/";
  return parsed.toString();
};

export const getPublicAppBaseUrl = () => {
  const envOrigin = typeof import.meta.env.VITE_PUBLIC_APP_ORIGIN === "string"
    ? import.meta.env.VITE_PUBLIC_APP_ORIGIN.trim()
    : "";
  const candidate = envOrigin || (
    typeof window !== "undefined"
      ? new URL(import.meta.env.BASE_URL || "/", window.location.origin).toString()
      : ""
  );
  if (!candidate) return "";

  try {
    return normalizeInviteBaseUrl(candidate) ?? "";
  } catch {
    return "";
  }
};

export const buildHouseholdInviteUrl = (inviteCode: string) => {
  const baseUrl = getPublicAppBaseUrl();
  if (!baseUrl) return "";
  return `${baseUrl}?invite=${encodeURIComponent(inviteCode)}`;
};
