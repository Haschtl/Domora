import { PiSprayBottleDuotone } from "react-icons/pi";
import { cn } from "../lib/utils";

interface PimpersIconProps {
  className?: string;
  iconClassName?: string;
  fillRatio?: number;
}

export const PimpersIcon = ({ className, iconClassName, fillRatio = 1 }: PimpersIconProps) => {
  const clamped = Math.max(0, Math.min(1, fillRatio));
  const showOverlay = clamped < 1;
  return (
    <span
      className={cn(
        "relative inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 text-[10px] leading-none text-amber-950 ring-1 ring-amber-500 shadow-[inset_0_0_0.5px_rgba(255,255,255,0.8)] dark:from-amber-400 dark:via-amber-500 dark:to-amber-700 dark:text-amber-950 dark:ring-amber-400",
        className
      )}
      aria-hidden="true"
    >
      <PiSprayBottleDuotone className={cn("h-3 w-3", iconClassName)} />
      {showOverlay ? (
        <span
          className="pointer-events-none absolute inset-0 bg-slate-200/80 dark:bg-slate-700/80"
          style={{
            clipPath: `polygon(${(clamped * 100).toFixed(2)}% 0, 100% 0, 100% 100%, ${(clamped * 100).toFixed(2)}% 100%)`
          }}
        />
      ) : null}
    </span>
  );
};
