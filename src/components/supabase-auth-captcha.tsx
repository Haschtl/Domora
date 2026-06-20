import { useEffect, useRef } from "react";
import { useTheme } from "../lib/use-theme";

type SupabaseAuthCaptchaProps = {
  provider: "turnstile" | "hcaptcha";
  siteKey: string;
  onTokenChange: (token: string | null) => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: Record<string, unknown>
      ) => string;
      remove: (widgetId: string) => void;
    };
    hcaptcha?: {
      render: (
        container: HTMLElement,
        options: Record<string, unknown>
      ) => string | number;
      remove: (widgetId: string | number) => void;
    };
  }
}

const loadScript = (id: string, src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`Failed to load script: ${src}`)),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    script.addEventListener(
      "error",
      () => reject(new Error(`Failed to load script: ${src}`)),
      { once: true }
    );
    document.head.appendChild(script);
  });

export const SupabaseAuthCaptcha = ({
  provider,
  siteKey,
  onTokenChange
}: SupabaseAuthCaptchaProps) => {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    onTokenChange(null);

    const renderWidget = async () => {
      if (!container) return;

      if (provider === "turnstile") {
        await loadScript(
          "domora-turnstile-script",
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        );
        if (cancelled || !container || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(container, {
          sitekey: siteKey,
          theme: resolvedTheme === "dark" ? "dark" : "light",
          callback: (token: string) => onTokenChange(token),
          "expired-callback": () => onTokenChange(null),
          "error-callback": () => onTokenChange(null)
        });
        return;
      }

      await loadScript(
        "domora-hcaptcha-script",
        "https://js.hcaptcha.com/1/api.js?render=explicit"
      );
      if (cancelled || !container || !window.hcaptcha) return;
      widgetIdRef.current = window.hcaptcha.render(container, {
        sitekey: siteKey,
        theme: resolvedTheme === "dark" ? "dark" : "light",
        callback: (token: string) => onTokenChange(token),
        "expired-callback": () => onTokenChange(null),
        "error-callback": () => onTokenChange(null)
      });
    };

    void renderWidget();

    return () => {
      cancelled = true;
      onTokenChange(null);
      if (provider === "turnstile" && widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(String(widgetIdRef.current));
      }
      if (provider === "hcaptcha" && widgetIdRef.current != null && window.hcaptcha) {
        window.hcaptcha.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [onTokenChange, provider, resolvedTheme, siteKey]);

  return <div ref={containerRef} className="min-h-16" />;
};
