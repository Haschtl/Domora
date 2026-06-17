import type { ReactNode, RefObject } from "react";
import { cn } from "../../lib/utils";

interface MobileBottomComposerProps {
  children: ReactNode;
  containerRef?: RefObject<HTMLDivElement | null>;
  mobileTabBarVisible?: boolean;
  withTabBarBottomClassName: string;
  withoutTabBarBottomClassName: string;
  outerClassName?: string;
  innerClassName?: string;
}

export const MobileBottomComposer = ({
  children,
  containerRef,
  mobileTabBarVisible = true,
  withTabBarBottomClassName,
  withoutTabBarBottomClassName,
  outerClassName,
  innerClassName
}: MobileBottomComposerProps) => (
  <div
    className={cn(
      "fixed inset-x-0 z-40 sm:hidden",
      mobileTabBarVisible
        ? withTabBarBottomClassName
        : withoutTabBarBottomClassName,
      outerClassName
    )}
  >
    <div
      ref={containerRef}
      className={cn(
        "w-full border border-brand-200/70 border-x-0 border-b-0 bg-white/80 p-1.5 shadow-xl backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/80",
        "rounded-t-2xl",
        innerClassName
      )}
    >
      {children}
    </div>
  </div>
);
