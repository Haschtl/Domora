import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FcGoogle } from "react-icons/fc";
import { useTranslation } from "react-i18next";
import { SupabaseAuthCaptcha } from "../components/supabase-auth-captcha";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { getSupabaseAuthCaptchaConfig } from "../lib/auth-captcha";
import {
  clearPersistedQueryCaches,
  clearStoredSupabaseBackendConfig,
  saveStoredSupabaseBackendConfig,
  testSupabaseBackendConnection
} from "../lib/backend-config";
import { clearPersistedFirebaseRuntimeConfigs } from "../lib/firebase-config";
import { activeSupabasePublishableKey, activeSupabaseUrl, supabaseConfigSource } from "../lib/supabase";

interface AuthViewProps {
  busy: boolean;
  onSignIn: (email: string, password: string, captchaToken?: string) => Promise<void>;
  onSignUp: (email: string, password: string, captchaToken?: string) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
  onRequestPasswordReset: (email: string) => Promise<void>;
}

const GITHUB_REPO_URL = "https://github.com/Haschtl/Domora";

export const AuthView = ({ busy, onSignIn, onSignUp, onGoogleSignIn, onRequestPasswordReset }: AuthViewProps) => {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordResetState, setPasswordResetState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null);
  const [showBackendConfig, setShowBackendConfig] = useState(false);
  const [backendUrl, setBackendUrl] = useState(activeSupabaseUrl);
  const [backendKey, setBackendKey] = useState(activeSupabasePublishableKey);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendSaving, setBackendSaving] = useState(false);
  const [backendTestMessage, setBackendTestMessage] = useState<string | null>(null);
  const [backendTestState, setBackendTestState] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [authCaptchaToken, setAuthCaptchaToken] = useState<string | null>(null);
  const [authCaptchaVersion, setAuthCaptchaVersion] = useState(0);
  const [authCaptchaLoading, setAuthCaptchaLoading] = useState(true);
  const [authCaptchaError, setAuthCaptchaError] = useState<string | null>(null);
  const [authCaptchaConfig, setAuthCaptchaConfig] = useState<{
    enabled: boolean;
    provider: "turnstile" | "hcaptcha" | null;
    siteKey: string | null;
  }>({
    enabled: false,
    provider: null,
    siteKey: null
  });

  useEffect(() => {
    let cancelled = false;
    setAuthCaptchaLoading(true);
    setAuthCaptchaError(null);
    void (async () => {
      try {
        const config = await getSupabaseAuthCaptchaConfig();
        if (!cancelled) {
          setAuthCaptchaConfig(config);
        }
      } catch (error) {
        if (!cancelled) {
          setAuthCaptchaConfig({
            enabled: false,
            provider: null,
            siteKey: null
          });
          setAuthCaptchaError(
            error instanceof Error ? error.message : "Captcha-Konfiguration konnte nicht geladen werden."
          );
        }
      } finally {
        if (!cancelled) {
          setAuthCaptchaLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const captchaRequired =
    authCaptchaConfig.enabled &&
    Boolean(authCaptchaConfig.provider) &&
    Boolean(authCaptchaConfig.siteKey);
  const captchaUnavailable =
    authCaptchaConfig.enabled &&
    (!authCaptchaConfig.provider || !authCaptchaConfig.siteKey);

  const consumeCaptchaToken = useCallback(() => {
    const token = authCaptchaToken ?? undefined;
    if (captchaRequired) {
      setAuthCaptchaToken(null);
      setAuthCaptchaVersion((current) => current + 1);
    }
    return token;
  }, [authCaptchaToken, captchaRequired]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (captchaRequired && !authCaptchaToken) {
      setAuthCaptchaError("Bitte bestätige zuerst das Captcha.");
      return;
    }
    setAuthCaptchaError(null);
    await onSignIn(email, password, consumeCaptchaToken());
  };

  const onForgotPassword = async () => {
    if (!email.trim()) {
      setPasswordResetError(t("auth.passwordResetNeedsEmail"));
      setPasswordResetState("error");
      return;
    }
    setPasswordResetError(null);
    setPasswordResetState("sending");
    try {
      await onRequestPasswordReset(email.trim());
      setPasswordResetState("sent");
    } catch (error) {
      setPasswordResetError(error instanceof Error ? error.message : t("auth.passwordResetError"));
      setPasswordResetState("error");
    }
  };

  const backendSourceLabel =
    supabaseConfigSource === "runtime"
      ? t("auth.backendSourceRuntime")
      : supabaseConfigSource === "env"
      ? t("auth.backendSourceEnv")
      : t("auth.backendSourceFallback");

  const backendHost = (() => {
    try {
      return new URL(activeSupabaseUrl).host;
    } catch {
      return activeSupabaseUrl;
    }
  })();

  const onSaveBackendConfig = () => {
    setBackendError(null);
    setBackendTestMessage(null);
    setBackendTestState("idle");
    try {
      saveStoredSupabaseBackendConfig({ url: backendUrl, publishableKey: backendKey });
      clearPersistedQueryCaches();
      clearPersistedFirebaseRuntimeConfigs();
      setBackendSaving(true);
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setBackendError(t("auth.backendConfigError", { message }));
    }
  };

  const onResetBackendConfig = () => {
    setBackendError(null);
    setBackendTestMessage(null);
    setBackendTestState("idle");
    clearStoredSupabaseBackendConfig();
    clearPersistedQueryCaches();
    clearPersistedFirebaseRuntimeConfigs();
    setBackendSaving(true);
    window.location.reload();
  };

  const onTestBackendConnection = async () => {
    setBackendError(null);
    setBackendTestState("testing");
    setBackendTestMessage(t("auth.backendTesting"));

    try {
      const result = await testSupabaseBackendConnection({
        url: backendUrl,
        publishableKey: backendKey
      });
      setBackendTestState("success");
      setBackendTestMessage(t("auth.backendTestSuccess", { value: result.host }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setBackendTestState("error");
      setBackendTestMessage(t("auth.backendTestFailed", { message }));
    }
  };

  return (
    <Card className="mx-auto mt-8 max-w-md">
      <CardHeader>
        <CardTitle>{t("auth.title")}</CardTitle>
        <CardDescription>{t("auth.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (passwordResetState !== "idle") {
                  setPasswordResetState("idle");
                  setPasswordResetError(null);
                }
              }}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder={t("auth.passwordPlaceholder")}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              className="h-auto px-0 py-0 text-xs text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              disabled={busy || authCaptchaLoading}
              onClick={() => void onForgotPassword()}
            >
              {passwordResetState === "sending"
                ? t("auth.passwordResetSending")
                : passwordResetState === "sent"
                  ? t("auth.passwordResetSent")
                  : t("auth.passwordResetAction")}
            </Button>
          </div>

          {passwordResetState === "sent" ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              {t("auth.passwordResetSentHint")}
            </p>
          ) : null}

          {passwordResetError ? (
            <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
              {passwordResetError}
            </p>
          ) : null}

          {authCaptchaLoading ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Captcha-Konfiguration wird geladen...
            </p>
          ) : null}

          {captchaRequired && authCaptchaConfig.provider && authCaptchaConfig.siteKey ? (
            <div className="space-y-2">
              <Label>Captcha</Label>
              <SupabaseAuthCaptcha
                key={`${authCaptchaConfig.provider}-${authCaptchaVersion}`}
                provider={authCaptchaConfig.provider}
                siteKey={authCaptchaConfig.siteKey}
                onTokenChange={(token) => {
                  setAuthCaptchaToken(token);
                  if (token) {
                    setAuthCaptchaError(null);
                  }
                }}
              />
            </div>
          ) : null}

          {authCaptchaConfig.enabled && (!authCaptchaConfig.provider || !authCaptchaConfig.siteKey) ? (
            <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
              Captcha-Schutz ist im Backend aktiv, aber Provider oder Site Key fehlen.
            </p>
          ) : null}

          {authCaptchaError ? (
            <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
              {authCaptchaError}
            </p>
          ) : null}

          <Button
            className="w-full"
            type="submit"
            disabled={busy || authCaptchaLoading || captchaUnavailable}
          >
            {t("auth.signIn")}
          </Button>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-brand-100 dark:bg-slate-700" />
            <span className="text-xs text-slate-500 dark:text-slate-400">{t("auth.or")}</span>
            <div className="h-px flex-1 bg-brand-100 dark:bg-slate-700" />
          </div>

          <Button className="w-full" type="button" variant="outline" disabled={busy} onClick={onGoogleSignIn}>
            <FcGoogle className="mr-2 h-4 w-4" />
            {t("auth.googleSignIn")}
          </Button>

          <Button
            className="w-full"
            type="button"
            variant="outline"
            disabled={busy || authCaptchaLoading || captchaUnavailable}
            onClick={() => {
              if (!formRef.current?.reportValidity()) {
                return;
              }
              if (captchaRequired && !authCaptchaToken) {
                setAuthCaptchaError("Bitte bestätige zuerst das Captcha.");
                return;
              }
              setAuthCaptchaError(null);
              void onSignUp(email.trim(), password, consumeCaptchaToken());
            }}
          >
            {t("auth.signUp")}
          </Button>

          <div className="rounded-xl border border-brand-200/80 bg-brand-50/30 p-3 dark:border-slate-700 dark:bg-slate-900/60">
            <button
              type="button"
              className="w-full text-left text-sm font-medium text-slate-800 hover:text-brand-700 dark:text-slate-100 dark:hover:text-brand-300"
              onClick={() => setShowBackendConfig((current) => !current)}
            >
              {t("auth.backendTitle")}
            </button>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {t("auth.backendCurrent", { value: backendHost, source: backendSourceLabel })}
            </p>

            {showBackendConfig ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-600 dark:text-slate-300">{t("auth.backendDescription")}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {t("auth.backendSelfHost")}{" "}
                  <a
                    href={GITHUB_REPO_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline decoration-brand-300 underline-offset-2 hover:text-brand-700 dark:hover:text-brand-300"
                  >
                    {t("auth.backendRepoLink")}
                  </a>
                </p>
                <div className="space-y-1">
                  <Label htmlFor="backend-url">{t("auth.backendUrl")}</Label>
                  <Input
                    id="backend-url"
                    type="url"
                    autoComplete="off"
                    value={backendUrl}
                    placeholder={t("auth.backendUrlPlaceholder")}
                    onChange={(event) => {
                      setBackendUrl(event.target.value);
                      setBackendTestMessage(null);
                      setBackendTestState("idle");
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="backend-key">{t("auth.backendKey")}</Label>
                  <Input
                    id="backend-key"
                    type="text"
                    autoComplete="off"
                    value={backendKey}
                    placeholder={t("auth.backendKeyPlaceholder")}
                    onChange={(event) => {
                      setBackendKey(event.target.value);
                      setBackendTestMessage(null);
                      setBackendTestState("idle");
                    }}
                  />
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-300">{t("auth.backendSecurityHint")}</p>
                {backendError ? (
                  <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{backendError}</p>
                ) : null}
                {backendTestMessage ? (
                  <p
                    className={
                      backendTestState === "success"
                        ? "text-xs font-medium text-emerald-700 dark:text-emerald-300"
                        : backendTestState === "error"
                        ? "text-xs font-medium text-rose-700 dark:text-rose-300"
                        : "text-xs font-medium text-slate-700 dark:text-slate-300"
                    }
                  >
                    {backendTestMessage}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void onTestBackendConnection()}
                    disabled={busy || backendSaving || backendTestState === "testing"}
                  >
                    {backendTestState === "testing" ? t("auth.backendTesting") : t("auth.backendTest")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={onSaveBackendConfig}
                    disabled={busy || backendSaving || backendTestState === "testing"}
                  >
                    {t("auth.backendSave")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onResetBackendConfig}
                    disabled={busy || backendSaving || backendTestState === "testing"}
                  >
                    {t("auth.backendReset")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <p className="pt-2 text-center text-xs text-slate-500 dark:text-slate-400">
            <Link
              to="/privacy-policy"
              className="underline decoration-brand-300 underline-offset-2 hover:text-brand-700 dark:hover:text-brand-300"
            >
              {t("auth.privacyPolicy")}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
};
