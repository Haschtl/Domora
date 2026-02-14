import { PiSprayBottleDuotone } from "react-icons/pi";
import { cn } from "../lib/utils";

interface PimpersIconProps {
  className?: string;
  iconClassName?: string;
}

export const PimpersIcon = ({ className, iconClassName }: PimpersIconProps) => (
  <span
    className={cn(
      "inline-flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 text-[10px] leading-none text-amber-950 ring-1 ring-amber-500 shadow-[inset_0_0_0.5px_rgba(255,255,255,0.8)] dark:from-amber-400 dark:via-amber-500 dark:to-amber-700 dark:text-amber-950 dark:ring-amber-400",
      className
    )}
    aria-hidden="true"
  >
    <PiSprayBottleDuotone className={cn("h-3 w-3", iconClassName)} />
  </span>
);
