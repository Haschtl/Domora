import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type SectionPanelProps = HTMLAttributes<HTMLDivElement>;

export const SectionPanel = ({ className, ...props }: SectionPanelProps) => (
  <div
    className={cn("rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60", className)}
    {...props}
  />
);
