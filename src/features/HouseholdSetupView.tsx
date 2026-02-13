import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { Household } from "../lib/types";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";

interface HouseholdSetupViewProps {
  households: Household[];
  busy: boolean;
  initialInviteCode?: string;
  onCreate: (name: string) => Promise<void>;
  onJoin: (inviteCode: string) => Promise<void>;
  onSelect: (household: Household) => void;
  onSignOut: () => Promise<void>;
}

export const HouseholdSetupView = ({
  households,
  busy,
  initialInviteCode,
  onCreate,
  onJoin,
  onSelect,
  onSignOut
}: HouseholdSetupViewProps) => {
  const { t } = useTranslation();
  const createSchema = z.object({
    newName: z.string().trim().min(1)
  });
  const joinSchema = z.object({
    inviteCode: z.string().trim().min(1)
  });

  const createForm = useForm({
    defaultValues: {
      newName: ""
    },
    onSubmit: async ({
      value,
      formApi
    }: {
      value: { newName: string };
      formApi: { setFieldValue: (name: "newName", value: string) => void };
    }) => {
      const parsed = createSchema.parse(value);
      await onCreate(parsed.newName);
      formApi.setFieldValue("newName", "");
    }
  });

  const joinForm = useForm({
    defaultValues: {
      inviteCode: initialInviteCode?.trim() ?? ""
    },
    onSubmit: async ({
      value,
      formApi
    }: {
      value: { inviteCode: string };
      formApi: { setFieldValue: (name: "inviteCode", value: string) => void };
    }) => {
      const parsed = joinSchema.parse(value);
      await onJoin(parsed.inviteCode);
      formApi.setFieldValue("inviteCode", "");
    }
  });

  useEffect(() => {
    const nextCode = initialInviteCode?.trim() ?? "";
    if (!nextCode) return;
    if (joinForm.state.values.inviteCode.trim() === nextCode) return;
    joinForm.setFieldValue("inviteCode", nextCode);
  }, [initialInviteCode, joinForm, joinForm.state.values.inviteCode]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("household.createTitle")}</CardTitle>
          <CardDescription>{t("household.createDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void createForm.handleSubmit();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="wg-name">{t("household.nameLabel")}</Label>
              <createForm.Field
                name="newName"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <Input
                    id="wg-name"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("household.namePlaceholder")}
                    required
                  />
                )}
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
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void joinForm.handleSubmit();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="invite-code">{t("household.inviteLabel")}</Label>
              <joinForm.Field
                name="inviteCode"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <Input
                    id="invite-code"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("household.invitePlaceholder")}
                    required
                  />
                )}
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

      <div className="md:col-span-2">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            void onSignOut();
          }}
        >
          {t("common.logout")}
        </Button>
      </div>
    </div>
  );
};
