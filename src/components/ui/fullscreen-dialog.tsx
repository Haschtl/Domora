import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";
import { cn } from "../../lib/utils";

interface FullscreenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit?: (
    event: React.SubmitEvent<HTMLFormElement> &
      React.SubmitEvent<HTMLDivElement>,
  ) => void;
  maxWidthClassName?: string;
  contentClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
}

export const FullscreenDialog = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  onSubmit,
  maxWidthClassName = "sm:max-w-3xl",
  contentClassName,
  headerClassName,
  bodyClassName,
  footerClassName
}: FullscreenDialogProps) => {
  const Wrapper = onSubmit ? "form" : "div";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:w-[100vw]",
          "max-sm:max-h-none max-w-none rounded-none sm:rounded-xl max-sm:-translate-x-0 max-sm:-translate-y-0",
          "overflow-hidden p-0",
          "sm:max-h-[88dvh] sm:w-[calc(100%-2rem)]",
          maxWidthClassName,
          contentClassName,
        )}
      >
        <Wrapper className="flex h-full flex-col" onSubmit={onSubmit}>
          <DialogHeader
            className={cn(
              "shrink-0 border-b border-brand-100 bg-white px-4 py-3",
              "shadow-[0_8px_18px_rgba(15,23,42,0.08)]",
              "dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_8px_18px_rgba(2,6,23,0.45)]",
              headerClassName,
            )}
          >
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div
            className={cn(
              "flex-1 overflow-y-auto px-4 py-4 sm:max-h-[70vh] overflow-auto",
              bodyClassName,
            )}
          >
            {children}
          </div>
          {footer ? (
            <div
              className={cn(
                "shrink-0 border-t border-brand-100 bg-white px-4 py-3",
                "shadow-[0_-8px_18px_rgba(15,23,42,0.08)]",
                "dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_-8px_18px_rgba(2,6,23,0.45)]",
                footerClassName,
              )}
            >
              {footer}
            </div>
          ) : null}
        </Wrapper>
      </DialogContent>
    </Dialog>
  );
};
