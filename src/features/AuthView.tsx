import { FormEvent, useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

interface AuthViewProps {
  busy: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
}

export const AuthView = ({ busy, onSignIn, onSignUp, onGoogleSignIn }: AuthViewProps) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSignIn(email, password);
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
        </form>
      </CardContent>
    </Card>
  );
};
