import type { CaptchaProps, CaptchaType } from "recaptz";
import { Captcha } from "recaptz";
import { Button } from "./ui/button";
import { useTheme } from "../lib/use-theme";
import { cn } from "../lib/utils";

type RecaptzCaptchaProps = {
  type: CaptchaType;
  className?: string;
  onValidate: (isValid: boolean) => void;
  onReload?: () => void;
  reloadLabel?: string;
};

const typeDefaults: Partial<Record<CaptchaType, Partial<CaptchaProps>>> = {
  numbers: { length: 4, caseSensitive: false },
  letters: { length: 5, caseSensitive: false },
  mixed: { length: 6, caseSensitive: true },
  slider: {
    sliderConfig: {
      width: 280,
      height: 140,
      pieceSize: 40,
      tolerance: 12
    }
  },
  pattern: {
    patternConfig: {
      patternTypes: ["shape", "color", "rotation", "size", "mixed"],
      gridSize: 3
    }
  },
  math: {
    mathConfig: {
      difficulty: "medium",
      operations: ["add", "subtract", "multiply"]
    }
  }
};

export const RecaptzCaptcha = ({
  type,
  className,
  onValidate,
  onReload,
  reloadLabel
}: RecaptzCaptchaProps) => {
  const { resolvedTheme } = useTheme();
  const defaults = typeDefaults[type] ?? {};

  return (
    <div
      className={cn(
        "relative rounded-xl border border-brand-200 bg-white p-3 text-slate-900 shadow-card dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
        className
      )}
    >
      <Captcha
        {...defaults}
        type={type}
        darkMode={resolvedTheme === "dark"}
        showSuccessAnimation
        refreshable={false}
        onValidate={onValidate}
      />
      {onReload ? (
        <div className="absolute right-2 top-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-full px-2.5 text-[11px]"
            onClick={onReload}
          >
            {reloadLabel ?? "Neu laden"}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
