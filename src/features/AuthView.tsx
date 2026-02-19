import { FormEvent, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FcGoogle } from "react-icons/fc";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
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
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
}

const GITHUB_REPO_URL = "https://github.com/Haschtl/Domora";

export const AuthView = ({ busy, onSignIn, onSignUp, onGoogleSignIn }: AuthViewProps) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showBackendConfig, setShowBackendConfig] = useState(false);
  const [backendUrl, setBackendUrl] = useState(activeSupabaseUrl);
  const [backendKey, setBackendKey] = useState(activeSupabasePublishableKey);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendSaving, setBackendSaving] = useState(false);
  const [backendTestMessage, setBackendTestMessage] = useState<string | null>(null);
  const [backendTestState, setBackendTestState] = useState<"idle" | "testing" | "success" | "error">("idle");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSignIn(email, password);
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
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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

          <Button className="w-full" type="submit" disabled={busy}>
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
            disabled={busy}
            onClick={() => onSignUp(email, password)}
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
