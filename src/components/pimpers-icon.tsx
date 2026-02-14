import { cn } from "../lib/utils";

interface PimpersIconProps {
  className?: string;
  iconClassName?: string;
}

export const PimpersIcon = ({ className, iconClassName }: PimpersIconProps) => (
  <span
    className={cn(
      "inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[10px] leading-none ring-1 ring-amber-300 dark:bg-amber-900/50 dark:ring-amber-700",
      className
    )}
    aria-hidden="true"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-2.5 w-2.5", iconClassName)}
    >
      <rect x="4" y="8" width="16" height="12" rx="3" fill="currentColor" opacity="0.9" />
      <circle cx="9" cy="12" r="1.1" fill="#fff" />
      <circle cx="13" cy="15" r="1" fill="#fff" />
      <circle cx="16" cy="12.5" r="0.9" fill="#fff" />
      <path d="M7 8V6.8C7 5.25 8.25 4 9.8 4h4.4C15.75 4 17 5.25 17 6.8V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  </span>
);
