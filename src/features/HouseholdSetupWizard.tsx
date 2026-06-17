import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, ChevronRight, Wand2 } from "lucide-react";
import type { Household, UpdateHouseholdInput } from "../lib/types";
import { normalizeTaskFeatureFlags } from "../lib/household-task-features";
import { FullscreenDialog } from "../components/ui/fullscreen-dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

interface HouseholdSetupWizardProps {
  open: boolean;
  onClose: () => void;
  household: Household;
  busy: boolean;
  onUpdateHousehold: (input: UpdateHouseholdInput) => Promise<void>;
}

const CURRENCY_OPTIONS = [
  { code: "EUR", label: "Euro (€)" },
  { code: "USD", label: "US Dollar ($)" },
  { code: "CHF", label: "Schweizer Franken (₣)" },
  { code: "GBP", label: "Britisches Pfund (£)" },
  { code: "SEK", label: "Schwedische Krone (kr)" },
  { code: "NOK", label: "Norwegische Krone (kr)" },
  { code: "DKK", label: "Dänische Krone (kr)" },
  { code: "PLN", label: "Polnischer Zloty (zł)" },
  { code: "CZK", label: "Tschechische Krone (Kč)" },
] as const;

const THEME_PRESETS = [
  { id: "domora", primary: "#1f8a7f", accent: "#14b8a6", font: '"Space Grotesk", "Segoe UI", sans-serif', radius: 1 },
  { id: "sunset", primary: "#f97316", accent: "#f43f5e", font: '"Plus Jakarta Sans", "Segoe UI", sans-serif', radius: 1.1 },
  { id: "ocean", primary: "#0ea5e9", accent: "#22c55e", font: '"IBM Plex Sans", "Segoe UI", sans-serif', radius: 0.9 },
  { id: "mono", primary: "#334155", accent: "#64748b", font: '"Source Sans 3", "Segoe UI", sans-serif', radius: 0.8 },
] as const;

type ThemePresetId = typeof THEME_PRESETS[number]["id"];

interface WizardState {
  name: string;
  address: string;
  currency: string;
  featureTasksEnabled: boolean;
  featureOneOffTasksEnabled: boolean;
  featureShoppingEnabled: boolean;
  featureFinancesEnabled: boolean;
  featureBucketEnabled: boolean;
  taskMode: "rotation" | "time";
  taskLazinessEnabled: boolean;
  taskSkipEnabled: boolean;
  vacationTasksExcludeEnabled: boolean;
  vacationFinancesExcludeEnabled: boolean;
  themePresetId: ThemePresetId;
}

const STEP_IDS = ["basics", "features", "tasks", "finances", "design", "done"] as const;
type StepId = typeof STEP_IDS[number];

export const HouseholdSetupWizard = ({
  open,
  onClose,
  household,
  busy,
  onUpdateHousehold,
}: HouseholdSetupWizardProps) => {
  const { t } = useTranslation();

  const detectPresetId = (h: Household): ThemePresetId => {
    const match = THEME_PRESETS.find((p) => p.primary === h.theme_primary_color);
    return match?.id ?? "domora";
  };

  const buildInitialState = useCallback((): WizardState => ({
    name: household.name ?? "",
    address: household.address ?? "",
    currency: household.currency ?? "EUR",
    featureTasksEnabled: household.feature_tasks_enabled ?? true,
    featureOneOffTasksEnabled: household.feature_one_off_tasks_enabled ?? true,
    featureShoppingEnabled: household.feature_shopping_enabled ?? true,
    featureFinancesEnabled: household.feature_finances_enabled ?? true,
    featureBucketEnabled: household.feature_bucket_enabled ?? true,
    taskMode: household.task_mode ?? "rotation",
    taskLazinessEnabled: household.task_laziness_enabled ?? false,
    taskSkipEnabled: household.task_skip_enabled ?? true,
    vacationTasksExcludeEnabled: household.vacation_tasks_exclude_enabled ?? true,
    vacationFinancesExcludeEnabled: household.vacation_finances_exclude_enabled ?? true,
    themePresetId: detectPresetId(household),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [household.id]);

  const [state, setState] = useState<WizardState>(buildInitialState);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      onClose();
    }
  };

  const resetAndOpen = () => {
    setState(buildInitialState());
    setStepIndex(0);
    setError(null);
  };

  const visibleSteps = STEP_IDS.filter((id) => {
    if (id === "tasks" && !state.featureTasksEnabled) return false;
    if (id === "finances" && !state.featureFinancesEnabled) return false;
    return true;
  });

  const currentStepId = visibleSteps[stepIndex] ?? "done";
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === visibleSteps.length - 1;

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const handleNext = () => {
    if (currentStepId === "basics" && !state.name.trim()) {
      setError(t("settings.householdNameError"));
      return;
    }
    setError(null);
    setStepIndex((i) => Math.min(i + 1, visibleSteps.length - 1));
  };

  const handleBack = () => {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const handleSave = async () => {
    const normalizedName = state.name.trim();
    if (!normalizedName) {
      setError(t("settings.householdNameError"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const preset = THEME_PRESETS.find((p) => p.id === state.themePresetId) ?? THEME_PRESETS[0];
      const normalizedTaskFeatures = normalizeTaskFeatureFlags({
        taskMode: state.taskMode,
        featureTasksEnabled: state.featureTasksEnabled,
        featureOneOffTasksEnabled: state.featureOneOffTasksEnabled,
      });
      await onUpdateHousehold({
        name: normalizedName,
        imageUrl: household.image_url ?? "",
        address: state.address,
        currency: state.currency,
        apartmentSizeSqm: household.apartment_size_sqm,
        coldRentMonthly: household.cold_rent_monthly,
        utilitiesMonthly: household.utilities_monthly,
        utilitiesOnRoomSqmPercent: household.utilities_on_room_sqm_percent,
        taskLazinessEnabled: state.taskLazinessEnabled,
        taskMode: state.taskMode,
        vacationTasksExcludeEnabled: state.vacationTasksExcludeEnabled,
        vacationFinancesExcludeEnabled: state.vacationFinancesExcludeEnabled,
        taskSkipEnabled: state.taskSkipEnabled,
        featureBucketEnabled: state.featureBucketEnabled,
        featureShoppingEnabled: state.featureShoppingEnabled,
        featureTasksEnabled: normalizedTaskFeatures.featureTasksEnabled,
        featureOneOffTasksEnabled: normalizedTaskFeatures.featureOneOffTasksEnabled,
        featureFinancesEnabled: state.featureFinancesEnabled,
        oneOffClaimTimeoutHours: household.one_off_claim_timeout_hours ?? 72,
        oneOffClaimMaxPimpers: household.one_off_claim_max_pimpers ?? 500,
        themePrimaryColor: preset.primary,
        themeAccentColor: preset.accent,
        themeFontFamily: preset.font,
        themeRadiusScale: preset.radius,
        translationOverrides: household.translation_overrides ?? [],
        householdMapMarkers: household.household_map_markers ?? [],
      });
      onClose();
    } catch {
      setError(t("wizard.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const progressPercent = visibleSteps.length > 1
    ? Math.round((stepIndex / (visibleSteps.length - 1)) * 100)
    : 100;

  const stepTitles: Record<StepId, string> = {
    basics: t("wizard.stepBasicsTitle"),
    features: t("wizard.stepFeaturesTitle"),
    tasks: t("wizard.stepTasksTitle"),
    finances: t("wizard.stepFinancesTitle"),
    design: t("wizard.stepDesignTitle"),
    done: t("wizard.stepDoneTitle"),
  };

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex-1">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t("wizard.stepProgress", {
              current: stepIndex + 1,
              total: visibleSteps.length,
            })}
          </span>
          <span className="text-xs font-medium text-brand-700 dark:text-brand-300">
            {stepTitles[currentStepId]}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!isFirst && (
          <Button type="button" variant="outline" size="sm" onClick={handleBack} disabled={saving || busy}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            {t("common.back")}
          </Button>
        )}
        {isLast ? (
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving || busy}>
            <Check className="mr-1 h-4 w-4" />
            {t("wizard.saveAction")}
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={handleNext} disabled={saving || busy}>
            {t("wizard.nextAction")}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <FullscreenDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) resetAndOpen();
        handleOpen(nextOpen);
      }}
      title={t("wizard.title")}
      description={t("wizard.description")}
      footer={footer}
      maxWidthClassName="sm:max-w-lg"
    >
      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {currentStepId === "basics" && (
        <StepBasics state={state} set={set} />
      )}
      {currentStepId === "features" && (
        <StepFeatures state={state} set={set} />
      )}
      {currentStepId === "tasks" && (
        <StepTasks state={state} set={set} />
      )}
      {currentStepId === "finances" && (
        <StepFinances state={state} set={set} />
      )}
      {currentStepId === "design" && (
        <StepDesign state={state} set={set} />
      )}
      {currentStepId === "done" && (
        <StepDone state={state} />
      )}
    </FullscreenDialog>
  );
};

type SetFn = <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;

const SwitchRow = ({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <div className="flex items-start justify-between gap-4 rounded-xl border border-brand-100 px-3 py-3 dark:border-slate-700">
    <div className="min-w-0">
      <Label htmlFor={id} className="cursor-pointer text-sm font-medium text-slate-900 dark:text-slate-100">
        {label}
      </Label>
      {description ? (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      ) : null}
    </div>
    <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
  </div>
);

const StepBasics = ({ state, set }: { state: WizardState; set: SetFn }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <StepHeader
        icon="🏠"
        title={t("wizard.stepBasicsTitle")}
        description={t("wizard.stepBasicsDescription")}
      />
      <div className="space-y-1">
        <Label htmlFor="wiz-name">{t("settings.householdNameLabel")}</Label>
        <Input
          id="wiz-name"
          value={state.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={t("settings.householdNamePlaceholder")}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="wiz-address">{t("settings.householdAddressLabel")}</Label>
        <Input
          id="wiz-address"
          value={state.address}
          onChange={(e) => set("address", e.target.value)}
          placeholder={t("settings.householdAddressPlaceholder")}
        />
      </div>
    </div>
  );
};

const StepFeatures = ({ state, set }: { state: WizardState; set: SetFn }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <StepHeader
        icon="✨"
        title={t("wizard.stepFeaturesTitle")}
        description={t("wizard.stepFeaturesDescription")}
      />
      <div className="space-y-2">
        <SwitchRow
          id="wiz-tasks"
          label={t("settings.featureTasksTitle")}
          description={t("wizard.featureTasksDescription")}
          checked={state.featureTasksEnabled}
          onCheckedChange={(v) => set("featureTasksEnabled", v)}
        />
        <SwitchRow
          id="wiz-one-off"
          label={t("settings.featureOneOffTasksTitle")}
          description={t("wizard.featureOneOffDescription")}
          checked={state.featureOneOffTasksEnabled && state.featureTasksEnabled}
          onCheckedChange={(v) => set("featureOneOffTasksEnabled", v)}
        />
        <SwitchRow
          id="wiz-shopping"
          label={t("settings.featureShoppingTitle")}
          description={t("wizard.featureShoppingDescription")}
          checked={state.featureShoppingEnabled}
          onCheckedChange={(v) => set("featureShoppingEnabled", v)}
        />
        <SwitchRow
          id="wiz-finances"
          label={t("settings.featureFinancesTitle")}
          description={t("wizard.featureFinancesDescription")}
          checked={state.featureFinancesEnabled}
          onCheckedChange={(v) => set("featureFinancesEnabled", v)}
        />
        <SwitchRow
          id="wiz-bucket"
          label={t("settings.featureBucketTitle")}
          description={t("wizard.featureBucketDescription")}
          checked={state.featureBucketEnabled}
          onCheckedChange={(v) => set("featureBucketEnabled", v)}
        />
      </div>
    </div>
  );
};

const StepTasks = ({ state, set }: { state: WizardState; set: SetFn }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <StepHeader
        icon="📋"
        title={t("wizard.stepTasksTitle")}
        description={t("wizard.stepTasksDescription")}
      />
      <div className="space-y-1">
        <Label htmlFor="wiz-task-mode">{t("settings.taskModeTitle")}</Label>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("settings.taskModeDescription")}</p>
        <Select
          value={state.taskMode}
          onValueChange={(v) => set("taskMode", v as "rotation" | "time")}
        >
          <SelectTrigger id="wiz-task-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rotation">{t("settings.taskModeRotation")}</SelectItem>
            <SelectItem value="time">{t("settings.taskModeTime")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <SwitchRow
          id="wiz-laziness"
          label={t("settings.householdLazinessTitle")}
          description={t("settings.householdLazinessDescription")}
          checked={state.taskLazinessEnabled}
          onCheckedChange={(v) => set("taskLazinessEnabled", v)}
        />
        <SwitchRow
          id="wiz-skip"
          label={t("settings.taskSkipTitle")}
          description={t("settings.taskSkipDescription")}
          checked={state.taskSkipEnabled}
          onCheckedChange={(v) => set("taskSkipEnabled", v)}
        />
        <SwitchRow
          id="wiz-vacation-tasks"
          label={t("settings.vacationExcludeTasksTitle")}
          description={t("settings.vacationExcludeTasksDescription")}
          checked={state.vacationTasksExcludeEnabled}
          onCheckedChange={(v) => set("vacationTasksExcludeEnabled", v)}
        />
      </div>
    </div>
  );
};

const StepFinances = ({ state, set }: { state: WizardState; set: SetFn }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <StepHeader
        icon="💰"
        title={t("wizard.stepFinancesTitle")}
        description={t("wizard.stepFinancesDescription")}
      />
      <div className="space-y-1">
        <Label htmlFor="wiz-currency">{t("settings.householdCurrencyLabel")}</Label>
        <Select
          value={state.currency}
          onValueChange={(v) => set("currency", v)}
        >
          <SelectTrigger id="wiz-currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCY_OPTIONS.map((opt) => (
              <SelectItem key={opt.code} value={opt.code}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SwitchRow
        id="wiz-vacation-finances"
        label={t("settings.vacationExcludeFinancesTitle")}
        description={t("settings.vacationExcludeFinancesDescription")}
        checked={state.vacationFinancesExcludeEnabled}
        onCheckedChange={(v) => set("vacationFinancesExcludeEnabled", v)}
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("wizard.financesDetailHint")}
      </p>
    </div>
  );
};

const StepDesign = ({ state, set }: { state: WizardState; set: SetFn }) => {
  const { t } = useTranslation();
  const presetLabels: Record<ThemePresetId, string> = {
    domora: t("settings.householdThemePresetDefault"),
    sunset: t("settings.householdThemePresetSunset"),
    ocean: t("settings.householdThemePresetOcean"),
    mono: t("settings.householdThemePresetMono"),
  };
  return (
    <div className="space-y-4">
      <StepHeader
        icon="🎨"
        title={t("wizard.stepDesignTitle")}
        description={t("wizard.stepDesignDescription")}
      />
      <div className="grid grid-cols-2 gap-3">
        {THEME_PRESETS.map((preset) => {
          const selected = state.themePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => set("themePresetId", preset.id)}
              className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-left transition-all ${
                selected
                  ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/40"
                  : "border-brand-100 bg-white hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-slate-500"
              }`}
            >
              <div className="flex w-full gap-1.5">
                <div
                  className="h-8 flex-1 rounded-lg"
                  style={{ backgroundColor: preset.primary }}
                />
                <div
                  className="h-8 w-6 rounded-lg"
                  style={{ backgroundColor: preset.accent }}
                />
              </div>
              <span
                className="text-xs font-semibold text-slate-800 dark:text-slate-200"
                style={{ fontFamily: preset.font }}
              >
                {presetLabels[preset.id]}
              </span>
              {selected ? (
                <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500">
                  <Check className="h-3 w-3 text-white" />
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("wizard.designDetailHint")}
      </p>
    </div>
  );
};

const StepDone = ({ state }: { state: WizardState }) => {
  const { t } = useTranslation();
  const preset = THEME_PRESETS.find((p) => p.id === state.themePresetId) ?? THEME_PRESETS[0];
  const enabledFeatures = [
    state.featureTasksEnabled && t("settings.featureTasksTitle"),
    state.featureOneOffTasksEnabled && state.featureTasksEnabled && t("settings.featureOneOffTasksTitle"),
    state.featureShoppingEnabled && t("settings.featureShoppingTitle"),
    state.featureFinancesEnabled && t("settings.featureFinancesTitle"),
    state.featureBucketEnabled && t("settings.featureBucketTitle"),
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <StepHeader
        icon="🎉"
        title={t("wizard.stepDoneTitle")}
        description={t("wizard.stepDoneDescription")}
      />
      <div className="space-y-2 rounded-xl border border-brand-100 bg-brand-50/50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
        <SummaryRow label={t("wizard.summaryName")} value={state.name || "—"} />
        {state.address ? (
          <SummaryRow label={t("wizard.summaryAddress")} value={state.address} />
        ) : null}
        <SummaryRow
          label={t("wizard.summaryFeatures")}
          value={enabledFeatures.length > 0 ? enabledFeatures.join(", ") : t("wizard.summaryNoFeatures")}
        />
        {state.featureTasksEnabled ? (
          <SummaryRow
            label={t("settings.taskModeTitle")}
            value={state.taskMode === "rotation" ? t("settings.taskModeRotation") : t("settings.taskModeTime")}
          />
        ) : null}
        {state.featureFinancesEnabled ? (
          <SummaryRow label={t("settings.householdCurrencyLabel")} value={state.currency} />
        ) : null}
        <SummaryRow
          label={t("wizard.summaryDesign")}
          value={
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: preset.primary }}
              />
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: preset.accent }}
              />
              <span style={{ fontFamily: preset.font }}>{state.themePresetId}</span>
            </span>
          }
        />
      </div>
    </div>
  );
};

const StepHeader = ({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) => (
  <div className="flex items-start gap-3">
    <span className="text-3xl">{icon}</span>
    <div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  </div>
);

const SummaryRow = ({
  label,
  value,
}: {
  label: string;
  value: string | React.ReactNode;
}) => (
  <div className="flex items-baseline justify-between gap-3 py-0.5">
    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
    <span className="text-xs text-slate-900 dark:text-slate-100">{value}</span>
  </div>
);

export const HouseholdWizardTriggerButton = ({
  onStart,
}: {
  onStart: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <Button type="button" variant="outline" size="sm" onClick={onStart}>
      <Wand2 className="mr-1.5 h-4 w-4" />
      {t("wizard.startAction")}
    </Button>
  );
};
