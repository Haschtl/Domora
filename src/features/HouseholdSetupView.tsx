import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Household } from "../lib/types";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";

interface HouseholdSetupViewProps {
  households: Household[];
  busy: boolean;
  onCreate: (name: string) => Promise<void>;
  onJoin: (inviteCode: string) => Promise<void>;
  onSelect: (household: Household) => void;
}

export const HouseholdSetupView = ({
  households,
  busy,
  onCreate,
  onJoin,
  onSelect
}: HouseholdSetupViewProps) => {
  const { t } = useTranslation();
  const [newName, setNewName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onCreate(newName);
    setNewName("");
  };

  const submitJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onJoin(inviteCode);
    setInviteCode("");
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("household.createTitle")}</CardTitle>
          <CardDescription>{t("household.createDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submitCreate}>
            <div className="space-y-1">
              <Label htmlFor="wg-name">{t("household.nameLabel")}</Label>
              <Input
                id="wg-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={t("household.namePlaceholder")}
                required
              />
            </div>
            <Button className="w-full" type="submit" disabled={busy}>
              {t("household.createAction")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("household.joinTitle")}</CardTitle>
          <CardDescription>{t("household.joinDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submitJoin}>
            <div className="space-y-1">
              <Label htmlFor="invite-code">{t("household.inviteLabel")}</Label>
              <Input
                id="invite-code"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder={t("household.invitePlaceholder")}
                required
              />
            </div>
            <Button className="w-full" type="submit" variant="outline" disabled={busy}>
              {t("household.joinAction")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {households.length > 0 ? (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t("household.myHouseholdsTitle")}</CardTitle>
            <CardDescription>{t("household.myHouseholdsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {households.map((household) => (
              <button
                key={household.id}
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-brand-100 p-3 text-left hover:border-brand-300 dark:border-slate-700 dark:hover:border-brand-600"
                onClick={() => onSelect(household)}
              >
                <span className="font-medium">{household.name}</span>
                <Badge>{t("household.codeBadge", { code: household.invite_code })}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};
