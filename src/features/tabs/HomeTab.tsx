import { useTranslation } from "react-i18next";
import type { Household } from "../../lib/types";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Progress } from "../../components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

interface HomeTabProps {
  household: Household;
  households: Household[];
  userEmail: string | undefined;
  completedTasks: number;
  totalTasks: number;
  onSelectHousehold: (householdId: string) => void;
}

export const HomeTab = ({
  household,
  households,
  userEmail,
  completedTasks,
  totalTasks,
  onSelectHousehold
}: HomeTabProps) => {
  const { t } = useTranslation();
  const taskProgress = totalTasks > 0 ? Math.min(100, Math.max(0, (completedTasks / totalTasks) * 100)) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t("home.title")}</CardTitle>
            <CardDescription>{userEmail ?? t("app.noUserLabel")}</CardDescription>
          </div>
          <Badge>{t("app.codeBadge", { code: household.invite_code })}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {households.length > 1 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("home.switchHousehold")}</p>
            <Select value={household.id} onValueChange={onSelectHousehold}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
              {households.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name}
                </SelectItem>
              ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.household")}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{household.name}</p>
          </div>

          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.tasksProgress")}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {completedTasks} / {totalTasks}
            </p>
            <Progress className="mt-2" value={taskProgress} />
          </div>

          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.currency")}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{household.currency}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
