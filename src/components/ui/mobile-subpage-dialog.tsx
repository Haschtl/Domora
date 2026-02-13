import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "./dialog";
import { Button } from "./button";
import { cn } from "../../lib/utils";

interface MobileSubpageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
}

export const MobileSubpageDialog = ({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  contentClassName
}: MobileSubpageDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    <DialogContent
      className={cn(
        "left-2 right-2 top-24 bottom-[4.5rem] h-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-2xl p-0",
        "sm:left-1/2 sm:right-auto sm:top-1/2 sm:bottom-auto sm:h-auto sm:max-h-[88dvh] sm:w-[calc(100%-2rem)] sm:max-w-2xl",
        "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-0",
        contentClassName
      )}
    >
      <div className="flex h-full flex-col">
        <DialogHeader className="sticky top-0 z-10 border-b border-brand-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate">{title}</DialogTitle>
              {description ? <DialogDescription className="mt-1">{description}</DialogDescription> : null}
            </div>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer ? (
          <div className="sticky bottom-0 border-t border-brand-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            {footer}
          </div>
        ) : null}
      </div>
    </DialogContent>
  </Dialog>
);
