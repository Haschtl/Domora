import { forwardRef } from "react";
import { cn } from "../lib/utils";
import { PimpersIcon } from "./pimpers-icon";

interface PimpersStackProps {
  count: number;
  earned: number;
  maxPerRow?: number;
  className?: string;
}

export const PimpersStack = forwardRef<HTMLDivElement, PimpersStackProps>(
  ({ count, earned, maxPerRow = 5, className, ...rest }, ref) => {
    const safeCount = Math.max(0, Math.floor(count));
    if (safeCount === 0) {
      return null;
    }

    const rows = Math.ceil(safeCount / Math.max(1, maxPerRow));
    return (
      <div ref={ref} className={cn("flex flex-col", className)} {...rest}>
        {Array.from({ length: rows }).map((_, rowIndex) => {
          const rowStart = rowIndex * maxPerRow;
          const rowEnd = Math.min(rowStart + maxPerRow, safeCount);
          return (
            <div
              key={`pimpers-row-${rowIndex}`}
              className={cn("flex items-center -space-x-2", rowIndex > 0 && "-mt-2")}
            >
              {Array.from({ length: rowEnd - rowStart }).map((__, index) => {
                const globalIndex = rowStart + index;
                const fill = Math.max(0, Math.min(1, earned - globalIndex));
                return (
                  <PimpersIcon
                    key={`pimpers-icon-${globalIndex}`}
                    fillRatio={fill}
                    className="h-4 w-4 outline outline-1 outline-white/70 shadow-sm dark:outline-slate-900/70"
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }
);

PimpersStack.displayName = "PimpersStack";
