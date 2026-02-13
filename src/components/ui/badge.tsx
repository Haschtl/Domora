import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export const Badge = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full bg-brand-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-900 dark:bg-brand-900 dark:text-brand-100",
      className
    )}
    {...props}
  />
);
