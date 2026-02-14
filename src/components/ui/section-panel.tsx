import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type SectionPanelProps = HTMLAttributes<HTMLDivElement>;

export const SectionPanel = ({ className, ...props }: SectionPanelProps) => (
  <div
    className={cn(
      "rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100",
      className
    )}
    {...props}
  />
);
