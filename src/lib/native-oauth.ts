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
};

type BrowserPlugin = {
  open(options: { url: string }): Promise<void>;
  close(): Promise<void>;
};

const App = registerPlugin<AppPlugin>("App");
const Browser = registerPlugin<BrowserPlugin>("Browser");

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

export const setupNativeOAuthListener = async () => {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await App.addListener("appUrlOpen", async ({ url }) => {
      if (typeof url !== "string") return;
      if (!url.startsWith(NATIVE_OAUTH_REDIRECT_URL)) return;
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(url);
        if (error) throw error;
      } catch (error) {
        console.error("Native OAuth callback failed", error);
      } finally {
        await Browser.close().catch(() => undefined);
      }
    });
  } catch (error) {
    console.warn("Capacitor App plugin unavailable; native OAuth callback listener not installed.", error);
  }
};
