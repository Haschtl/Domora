import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "./supabase";

const NATIVE_OAUTH_SCHEME = "app.domora.mobile";
const NATIVE_OAUTH_HOST = "auth";
const NATIVE_OAUTH_PATH = "/callback";

const NATIVE_OAUTH_REDIRECT_URL = `${NATIVE_OAUTH_SCHEME}://${NATIVE_OAUTH_HOST}${NATIVE_OAUTH_PATH}`;

type AppUrlOpenData = {
  url: string;
};

type PluginListenerHandle = {
  remove: () => Promise<void>;
};

type AppPlugin = {
  addListener(eventName: "appUrlOpen", listenerFunc: (data: AppUrlOpenData) => void): Promise<PluginListenerHandle>;
  getLaunchUrl?: () => Promise<{ url?: string }>;
};

type BrowserPlugin = {
  open(options: { url: string }): Promise<void>;
  close(): Promise<void>;
};

const App = registerPlugin<AppPlugin>("App");
const Browser = registerPlugin<BrowserPlugin>("Browser");
const NATIVE_OAUTH_REDIRECT_PREFIXES = [
  NATIVE_OAUTH_REDIRECT_URL,
  `${NATIVE_OAUTH_SCHEME}:/${NATIVE_OAUTH_HOST}${NATIVE_OAUTH_PATH}`
];

const buildWebRedirectUrl = () => {
  if (typeof window === "undefined") return undefined;
  return new URL(import.meta.env.BASE_URL || "/", window.location.origin).toString();
};

export const getOAuthRedirectTo = () => (Capacitor.isNativePlatform() ? NATIVE_OAUTH_REDIRECT_URL : buildWebRedirectUrl());
export const isNativePlatform = () => Capacitor.isNativePlatform();

export const signInWithGoogleViaCapacitor = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: NATIVE_OAUTH_REDIRECT_URL,
      skipBrowserRedirect: true
    }
  });

  if (error) throw error;

  const oauthUrl = data?.url;
  if (!oauthUrl) {
    throw new Error("Google OAuth URL missing.");
  }

  try {
    await Browser.open({ url: oauthUrl });
  } catch {
    if (typeof window !== "undefined") {
      window.location.assign(oauthUrl);
      return;
    }
    throw new Error("Unable to open native OAuth browser.");
  }
};

const getSearchParamsFromUrl = (url: string) => {
  const queryIndex = url.indexOf("?");
  if (queryIndex < 0) return new URLSearchParams();
  const hashIndex = url.indexOf("#");
  const query = hashIndex >= 0 ? url.slice(queryIndex + 1, hashIndex) : url.slice(queryIndex + 1);
  return new URLSearchParams(query);
};

const getHashParamsFromUrl = (url: string) => {
  const hashIndex = url.indexOf("#");
  if (hashIndex < 0) return new URLSearchParams();
  return new URLSearchParams(url.slice(hashIndex + 1));
};

const isNativeOAuthCallbackUrl = (url: string) => NATIVE_OAUTH_REDIRECT_PREFIXES.some((prefix) => url.startsWith(prefix));

const handleNativeOAuthCallback = async (url: string) => {
  if (!isNativeOAuthCallbackUrl(url)) return;

  const queryParams = getSearchParamsFromUrl(url);
  const hashParams = getHashParamsFromUrl(url);
  const code = queryParams.get("code") ?? hashParams.get("code");
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(url);
    if (error) throw error;
    return;
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (error) throw error;
    return;
  }

  const authErrorDescription = hashParams.get("error_description") ?? queryParams.get("error_description");
  if (authErrorDescription) {
    throw new Error(authErrorDescription);
  }
};

export const setupNativeOAuthListener = async () => {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await App.addListener("appUrlOpen", async ({ url }) => {
      if (typeof url !== "string") return;
      try {
        await handleNativeOAuthCallback(url);
      } catch (error) {
        console.error("Native OAuth callback failed", error);
      } finally {
        await Browser.close().catch(() => undefined);
      }
    });

    const launchUrl = await App.getLaunchUrl?.();
    if (typeof launchUrl?.url === "string") {
      await handleNativeOAuthCallback(launchUrl.url).catch((error) => {
        console.error("Native OAuth launch URL failed", error);
      });
    }
  } catch (error) {
    console.warn("Capacitor App plugin unavailable; native OAuth callback listener not installed.", error);
  }
};
