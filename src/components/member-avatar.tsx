import type { ReactNode } from "react";
import { cn } from "../lib/utils";

type MemberAvatarProps = {
  src?: string | null;
  alt: string;
  isVacation?: boolean;
  className?: string;
  imageClassName?: string;
  fallback?: ReactNode;
};

export const MemberAvatar = ({
  src,
  alt,
  isVacation = false,
  className,
  imageClassName,
  fallback
}: MemberAvatarProps) => (
  <span className={cn("relative inline-flex items-center justify-center overflow-hidden", className)}>
    {src ? (
      <img src={src} alt={alt} className={cn("h-full w-full object-cover", imageClassName)} />
    ) : (
      fallback
    )}
    {isVacation ? (
      <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white bg-amber-100 text-[10px] shadow-sm dark:border-slate-900 dark:bg-amber-900/70">
        🌴
      </span>
    ) : null}
  </span>
);
