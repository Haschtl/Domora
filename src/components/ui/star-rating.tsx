import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

interface StarRatingProps {
  value: number;
  displayValue?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  getLabel?: (value: number) => string;
  className?: string;
}

export const StarRating = ({
  value,
  displayValue,
  max = 5,
  disabled = false,
  onChange,
  getLabel,
  className
}: StarRatingProps) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const isHovering = hovered !== null;
  const barPercent = Math.max(0, Math.min(1, (displayValue ?? value) / max)) * 100;

  return (
    <TooltipProvider>
      <div
        className={cn("relative inline-flex items-center gap-0.5", className)}
        onMouseLeave={() => setHovered(null)}
        role="radiogroup"
      >
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
          <span
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500"
            style={{ width: `${barPercent}%` }}
          />
        </span>
        {Array.from({ length: max }, (_, index) => {
          const starValue = index + 1;
          const isActive = isHovering ? starValue <= (hovered ?? 0) : starValue <= value;
          const isHovered = hovered === starValue;
          const label = getLabel?.(starValue);
          const button = (
            <button
              key={`star-${starValue}`}
              type="button"
              className={cn(
                "relative z-10 rounded p-1 transition",
                isActive
                  ? "text-amber-500 hover:text-amber-600"
                  : "text-slate-300 hover:text-amber-400 dark:text-slate-600",
                isHovered ? "scale-110" : "scale-100"
              )}
              onMouseEnter={() => setHovered(starValue)}
              onFocus={() => setHovered(starValue)}
              onBlur={() => setHovered(null)}
              onClick={() => onChange(starValue)}
              disabled={disabled}
              aria-label={label}
              role="radio"
              aria-checked={value >= starValue}
            >
              <Star
                className={cn(
                  "h-4 w-4 drop-shadow-[0_0_6px_rgba(15,23,42,0.35)] dark:drop-shadow-[0_0_1px_rgba(15,23,42,1)]",
                  isActive ? "fill-current" : ""
                )}
              />
            </button>
          );

          if (!label) {
            return button;
          }

          return (
            <Tooltip key={`star-${starValue}`}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};
