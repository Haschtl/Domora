import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Clock3, RefreshCw, Send } from "lucide-react";
import { useWorkspace } from "../../context/workspace-context";
import { getPushTestJobs, queuePushTestJob } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

type PushTestTarget = "self" | "household";
type PushTestSchedule = "now" | "oneMinute" | "fiveMinutes" | "custom";

type PushTestCase = {
  type: string;
  title: string;
  description: string;
  expectedTitle: string;
  expectedBody: string;
  payload: Record<string, unknown>;
};

const PUSH_TEST_CASES: PushTestCase[] = [
  {
    type: "task_due",
    title: "Aufgabe faellig",
    description: "Direkter Cron-Job aus schedule-task-due.",
    expectedTitle: "Aufgabe faellig",
    expectedBody: "Kueche putzen ist faellig.",
    payload: {
      title: "Kueche putzen",
      taskId: "00000000-0000-0000-0000-000000000001",
      overdueDays: 0
    }
  },
  {
    type: "task_due",
    title: "Aufgabe ueberfaellig",
    description: "Wie task_due, aber mit Overdue-Text.",
    expectedTitle: "Aufgabe ueberfaellig",
    expectedBody: "Bad putzen ist seit 3 Tagen ueberfaellig.",
    payload: {
      title: "Bad putzen",
      taskId: "00000000-0000-0000-0000-000000000002",
      overdueDays: 3
    }
  },
  {
    type: "task_reminder",
    title: "Aufgaben-Erinnerung",
    description: "Manueller Reminder aus send-task-reminder.",
    expectedTitle: "Mach bitte die Aufgabe",
    expectedBody: "Der Flur wartet. Wenn du sie nicht puenktlich erledigst, verlierst du deine 2er-Serie.",
    payload: {
      title: "Mach bitte die Aufgabe",
      body: "Der Flur wartet.",
      taskId: "00000000-0000-0000-0000-000000000003",
      streakToLose: 2,
      lostPimpers: 1.25
    }
  },
  {
    type: "task_completed",
    title: "Aufgabe erledigt",
    description: "Household-Event task_completed.",
    expectedTitle: "Aufgabe erledigt",
    expectedBody: "Alex hat Aufgabe \"Kueche putzen\" puenktlich erledigt und dafuer 12 Pimpers erhalten.",
    payload: {
      payload: {
        actorName: "Alex",
        title: "Kueche putzen",
        taskId: "00000000-0000-0000-0000-000000000004",
        delayMinutes: 0,
        pimpersEarned: 12
      }
    }
  },
  {
    type: "task_skipped",
    title: "Aufgabe uebersprungen",
    description: "Household-Event task_skipped.",
    expectedTitle: "Aufgabe uebersprungen",
    expectedBody: "Muellsack rausbringen",
    payload: { payload: { title: "Muellsack rausbringen" } }
  },
  {
    type: "task_taken_over",
    title: "Aufgabe uebernommen",
    description: "Trigger nach Assignee-Wechsel.",
    expectedTitle: "Aufgabe uebernommen",
    expectedBody: "Bad putzen",
    payload: { title: "Bad putzen", taskId: "00000000-0000-0000-0000-000000000005" }
  },
  {
    type: "task_rated",
    title: "Aufgabe bewertet",
    description: "Household-Event task_rated.",
    expectedTitle: "Bewertung erhalten",
    expectedBody: "Sam hat Bad putzen mit 5 Sternen bewertet.",
    payload: { payload: { title: "Bad putzen", rating: 5, rater_name: "Sam" } }
  },
  {
    type: "vacation_mode_enabled",
    title: "Urlaubsmodus an",
    description: "Household-Event vacation_mode_enabled.",
    expectedTitle: "Urlaubsmodus aktiviert",
    expectedBody: "Mika ist jetzt im Urlaub.",
    payload: { payload: { name: "Mika" } }
  },
  {
    type: "vacation_mode_disabled",
    title: "Urlaubsmodus aus",
    description: "Household-Event vacation_mode_disabled.",
    expectedTitle: "Urlaubsmodus beendet",
    expectedBody: "Mika ist wieder da.",
    payload: { payload: { name: "Mika" } }
  },
  {
    type: "member_joined",
    title: "Mitglied eingezogen",
    description: "Household-Event member_joined.",
    expectedTitle: "Einzug",
    expectedBody: "Nora ist eingezogen.",
    payload: { payload: { name: "Nora" } }
  },
  {
    type: "member_left",
    title: "Mitglied ausgezogen",
    description: "Household-Event member_left.",
    expectedTitle: "Auszug",
    expectedBody: "Nora ist ausgezogen.",
    payload: { payload: { name: "Nora" } }
  },
  {
    type: "rent_updated",
    title: "Miete geaendert",
    description: "Household-Event rent_updated.",
    expectedTitle: "Mietkosten geaendert",
    expectedBody: "Alex hat die Mietkosten angepasst.",
    payload: { payload: { name: "Alex" } }
  },
  {
    type: "contract_created",
    title: "Vertrag erstellt",
    description: "Household-Event contract_created.",
    expectedTitle: "Vertrag hinzugefuegt",
    expectedBody: "Internet wurde angelegt.",
    payload: { payload: { contractName: "Internet" } }
  },
  {
    type: "contract_updated",
    title: "Vertrag geaendert",
    description: "Household-Event contract_updated.",
    expectedTitle: "Vertrag angepasst",
    expectedBody: "Strom wurde geaendert.",
    payload: { payload: { contractName: "Strom" } }
  },
  {
    type: "contract_deleted",
    title: "Vertrag entfernt",
    description: "Household-Event contract_deleted.",
    expectedTitle: "Vertrag entfernt",
    expectedBody: "Gas wurde geloescht.",
    payload: { payload: { contractName: "Gas" } }
  },
  {
    type: "member_of_month",
    title: "Mitbewohner des Monats",
    description: "Monats-Cron schedule-member-of-month.",
    expectedTitle: "Mitbewohner:in des Monats",
    expectedBody: "Alex hat im April die meisten Pimpers geholt.",
    payload: {
      title: "Mitbewohner:in des Monats",
      body: "Alex hat im April die meisten Pimpers geholt.",
      winner_user_id: "00000000-0000-0000-0000-000000000006"
    }
  },
  {
    type: "finance_created",
    title: "Finanzeintrag erstellt",
    description: "Household-Event finance_created.",
    expectedTitle: "Neuer Finanzeintrag",
    expectedBody: "WG Einkauf",
    payload: { payload: { description: "WG Einkauf", financeEntryId: "00000000-0000-0000-0000-000000000007" } }
  },
  {
    type: "shopping_added",
    title: "Einkauf hinzugefuegt",
    description: "Trigger nach neuem Einkaufslisten-Eintrag.",
    expectedTitle: "Einkaufsliste",
    expectedBody: "Hafermilch",
    payload: { title: "Hafermilch", shoppingItemId: "00000000-0000-0000-0000-000000000008" }
  },
  {
    type: "shopping_completed",
    title: "Einkauf erledigt",
    description: "Household-Event shopping_completed.",
    expectedTitle: "Einkauf erledigt",
    expectedBody: "Hafermilch",
    payload: { payload: { title: "Hafermilch", shoppingItemId: "00000000-0000-0000-0000-000000000008" } }
  },
  {
    type: "bucket_added",
    title: "Bucketlist hinzugefuegt",
    description: "Trigger nach neuem Bucketlist-Eintrag.",
    expectedTitle: "Bucketlist",
    expectedBody: "WG Brunch",
    payload: { title: "WG Brunch", bucketItemId: "00000000-0000-0000-0000-000000000009" }
  },
  {
    type: "cash_audit_requested",
    title: "Kassensturz",
    description: "Household-Event cash_audit_requested.",
    expectedTitle: "Kassensturz",
    expectedBody: "Ein Kassensturz wurde gestartet.",
    payload: { payload: {} }
  },
  {
    type: "live_location_started",
    title: "Live-Standort gestartet",
    description: "Household-Event live_location_started.",
    expectedTitle: "Live-Standort gestartet",
    expectedBody: "Alex teilt den Live-Standort fuer 30 Minuten.",
    payload: { payload: { actorName: "Alex", durationMinutes: 30 } }
  },
  {
    type: "one_off_claim_created",
    title: "Einmalige Aufgabe",
    description: "Household-Event one_off_claim_created.",
    expectedTitle: "Neue Einmalige Aufgabe",
    expectedBody: "Fenster geputzt (30 P)",
    payload: {
      payload: {
        title: "Fenster geputzt",
        requestedPimpers: 30,
        claimId: "00000000-0000-0000-0000-000000000010"
      }
    }
  }
];

const getCaseKey = (entry: PushTestCase) => `${entry.type}:${entry.title}`;
const queryKey = (householdId: string) => ["push-test-jobs", householdId] as const;

const getScheduledIso = (schedule: PushTestSchedule, customValue: string) => {
  if (schedule === "custom" && customValue) {
    const customDate = new Date(customValue);
    if (Number.isFinite(customDate.getTime())) return customDate.toISOString();
  }
  const now = Date.now();
  if (schedule === "oneMinute") return new Date(now + 60_000).toISOString();
  if (schedule === "fiveMinutes") return new Date(now + 5 * 60_000).toISOString();
  return new Date(now).toISOString();
};

const getStatusClass = (status: string) => {
  if (status === "sent") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
  if (status === "processing") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
};

const getLatestReason = (providerResponse: Record<string, unknown> | null) => {
  const rawReason = providerResponse?.reason;
  return typeof rawReason === "string" && rawReason.trim().length > 0 ? rawReason : null;
};

const formatLatestReason = (reason: string | null) => {
  if (!reason) return null;
  if (reason === "no_target_users") return "Kein Zielnutzer aufgelöst";
  if (reason === "all_targets_filtered") return "Alle Zielnutzer vor dem Versand gefiltert";
  if (reason === "no_active_tokens") return "Keine aktiven Push-Tokens gefunden";
  return reason;
};

export const PushTestPage = () => {
  const { activeHousehold, currentMember, userId, notificationPermission, onEnableNotifications } = useWorkspace();
  const queryClient = useQueryClient();
  const [selectedCaseKey, setSelectedCaseKey] = useState(PUSH_TEST_CASES[0] ? getCaseKey(PUSH_TEST_CASES[0]) : "task_due");
  const [target, setTarget] = useState<PushTestTarget>("self");
  const [schedule, setSchedule] = useState<PushTestSchedule>("now");
  const [customSchedule, setCustomSchedule] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const selectedCase = useMemo(
    () => PUSH_TEST_CASES.find((entry) => getCaseKey(entry) === selectedCaseKey) ?? PUSH_TEST_CASES[0]!,
    [selectedCaseKey]
  );
  const canTest = currentMember?.role === "owner";

  const jobsQuery = useQuery({
    queryKey: activeHousehold ? queryKey(activeHousehold.id) : ["push-test-jobs", "none"],
    queryFn: () => getPushTestJobs(activeHousehold!.id, 25),
    enabled: Boolean(activeHousehold) && canTest,
    refetchInterval: 5000
  });

  const queueMutation = useMutation({
    mutationFn: async () => {
      if (!activeHousehold || !userId) return;
      const payload = {
        ...selectedCase.payload,
        ...(target === "self" ? { target_user_id: userId } : {})
      };
      await queuePushTestJob({
        householdId: activeHousehold.id,
        type: selectedCase.type,
        payload,
        scheduledFor: getScheduledIso(schedule, customSchedule)
      });
    },
    onSuccess: async () => {
      if (activeHousehold) {
        await queryClient.invalidateQueries({ queryKey: queryKey(activeHousehold.id) });
      }
    }
  });

  const sendLocalNotification = async () => {
    setLocalError(null);
    if (!("Notification" in window)) {
      setLocalError("Dieser Browser unterstuetzt keine lokalen Notifications.");
      return;
    }
    if (Notification.permission !== "granted") {
      await onEnableNotifications();
    }
    if (Notification.permission !== "granted") {
      setLocalError("Notification Permission ist nicht granted.");
      return;
    }
    new Notification(selectedCase.expectedTitle, {
      body: selectedCase.expectedBody,
      tag: `domora-push-test-${selectedCase.type}`
    });
  };

  if (!activeHousehold) return null;

  if (!canTest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Push-Test</CardTitle>
          <CardDescription>Nur Hauptmieter koennen Push-Test-Jobs erzeugen.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            Push-Test
          </CardTitle>
          <CardDescription>
            Testet die echte Push-Queue. Jobs erscheinen hier sofort, verschickt werden sie durch die Dispatch-Funktion, sobald `scheduled_for` erreicht ist.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
            <div className="space-y-1">
              <Label>Szenario</Label>
              <Select value={selectedCaseKey} onValueChange={setSelectedCaseKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {PUSH_TEST_CASES.map((entry) => (
                    <SelectItem key={getCaseKey(entry)} value={getCaseKey(entry)}>
                      {entry.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Ziel</Label>
              <Select value={target} onValueChange={(value) => setTarget(value as PushTestTarget)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">Nur ich</SelectItem>
                  <SelectItem value="household">WG ohne Actor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Zeitpunkt</Label>
              <Select value={schedule} onValueChange={(value) => setSchedule(value as PushTestSchedule)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Jetzt</SelectItem>
                  <SelectItem value="oneMinute">In 1 Minute</SelectItem>
                  <SelectItem value="fiveMinutes">In 5 Minuten</SelectItem>
                  <SelectItem value="custom">Manuell</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {schedule === "custom" ? (
            <div className="max-w-sm space-y-1">
              <Label>Manueller Zeitpunkt</Label>
              <Input
                type="datetime-local"
                value={customSchedule}
                onChange={(event) => setCustomSchedule(event.target.value)}
              />
            </div>
          ) : null}

          <div className="rounded-lg border border-brand-100 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="font-semibold text-slate-900 dark:text-slate-100">{selectedCase.title}</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300">{selectedCase.description}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/40">
                <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Erwarteter Titel</p>
                <p className="mt-1 text-slate-900 dark:text-slate-100">{selectedCase.expectedTitle}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/40">
                <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Erwarteter Text</p>
                <p className="mt-1 text-slate-900 dark:text-slate-100">{selectedCase.expectedBody}</p>
              </div>
            </div>
          </div>

          {queueMutation.error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {queueMutation.error instanceof Error ? queueMutation.error.message : "Push-Test konnte nicht queued werden."}
            </p>
          ) : null}
          {localError ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {localError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => queueMutation.mutate()}
              disabled={queueMutation.isPending || (schedule === "custom" && !customSchedule)}
            >
              <Send className="mr-2 h-4 w-4" />
              Test-Job queueen
            </Button>
            <Button type="button" variant="outline" onClick={() => void sendLocalNotification()}>
              <BellRing className="mr-2 h-4 w-4" />
              Lokal anzeigen
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void jobsQuery.refetch()}
              disabled={jobsQuery.isFetching}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Aktualisieren
            </Button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
            Browser-Permission: {notificationPermission}. Push-Jobs werden erst nach dem Dispatch-Cron bzw. `npm run push:dispatch` wirklich an FCM uebergeben.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Letzte Test-Jobs</CardTitle>
          <CardDescription>Status kommt aus `push_jobs`, Treffer aus `push_log`.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {jobsQuery.data?.length ? (
            jobsQuery.data.map((job) => (
              <div key={job.id} className="rounded-lg border border-brand-100 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{job.type}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusClass(job.status)}`}>
                        {job.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                      geplant: {new Date(job.scheduled_for).toLocaleString()} | erstellt: {new Date(job.created_at).toLocaleString()}
                    </p>
                    {job.last_error ? (
                      <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{job.last_error}</p>
                    ) : null}
                    {job.latest_log_status || job.latest_log_created_at ? (
                      <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-950/40">
                        <p className="font-semibold text-slate-700 dark:text-slate-200">Letzter Dispatch</p>
                        <p className="mt-1 text-slate-600 dark:text-slate-300">
                          Status: {job.latest_log_status ?? "—"}
                          {job.latest_log_created_at ? ` | ${new Date(job.latest_log_created_at).toLocaleString()}` : ""}
                        </p>
                        {formatLatestReason(getLatestReason(job.latest_log_provider_response)) ? (
                          <p className="mt-1 text-rose-700 dark:text-rose-300">
                            Grund: {formatLatestReason(getLatestReason(job.latest_log_provider_response))}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs sm:min-w-48">
                    <div className="rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-950/40">
                      <p className="font-semibold">{job.log_count}</p>
                      <p className="text-slate-500 dark:text-slate-400">Logs</p>
                    </div>
                    <div className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
                      <p className="font-semibold">{job.sent_count}</p>
                      <p>Sent</p>
                    </div>
                    <div className="rounded-md bg-rose-50 px-2 py-1 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
                      <p className="font-semibold">{job.failed_count}</p>
                      <p>Failed</p>
                    </div>
                  </div>
                </div>
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-slate-500 dark:text-slate-400">Payload</summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-slate-950 p-2 text-slate-100">
                    {JSON.stringify(job.payload, null, 2)}
                  </pre>
                </details>
                {job.latest_log_provider_response ? (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-slate-500 dark:text-slate-400">Letzte Provider-Response</summary>
                    <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-slate-950 p-2 text-slate-100">
                      {JSON.stringify(job.latest_log_provider_response, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {jobsQuery.isLoading ? "Test-Jobs werden geladen..." : "Noch keine Push-Test-Jobs."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
