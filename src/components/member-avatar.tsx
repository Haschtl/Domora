import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { cn } from "../lib/utils";

type MemberAvatarProps = {
  src?: string | null;
  alt: string;
  isVacation?: boolean;
  className?: string;
  imageClassName?: string;
  fallback?: ReactNode;
  tooltip?: string;
};
const l=8

export const MemberAvatar = ({
  src,
  alt,
  isVacation = false,
  className,
  imageClassName,
  fallback,
  tooltip,
}: MemberAvatarProps) => {
  const label = tooltip ?? alt;
  const avatar = (
    <span
      className={cn(
        "relative inline-flex items-center justify-center overflow-visible",
        className,
      )}
      aria-label={label}
    >
      {isVacation ? (
        <span className="pointer-events-none absolute inset-0">
          {Array.from({ length: l }).map((_, index) => (
            <span
              key={index}
              className="absolute left-1/2 top-1/2 inline-flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-base drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
              style={{
                transform: `rotate(${index * (360 / l) + 7}deg) translate(62%)`,
              }}
            >
              🌴
            </span>
          ))}
        </span>
      ) : null}
      <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
        {src ? (
          <img
            src={src}
            alt={alt}
            className={cn("h-full w-full object-cover", imageClassName)}
          />
        ) : (
          fallback
        )}
      </span>
      <span className="pointer-events-none invisible h-full w-full" />
    </span>
  );

  if (!label) {
    return avatar;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{avatar}</TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
