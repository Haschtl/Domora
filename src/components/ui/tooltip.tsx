import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "../../lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

type TooltipTouchContextValue = {
  isCoarsePointer: boolean;
  setOpen: (open: boolean) => void;
  scheduleClose: () => void;
};

const TooltipTouchContext = React.createContext<TooltipTouchContextValue | null>(null);

const useIsCoarsePointer = () => {
  const [isCoarse, setIsCoarse] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarse(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  return isCoarse;
};

const Tooltip = ({ open, onOpenChange, ...props }: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) => {
  const isCoarsePointer = useIsCoarsePointer();
  const [touchOpen, setTouchOpen] = React.useState(false);
  const closeTimerRef = React.useRef<number | null>(null);

  const scheduleClose = React.useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setTouchOpen(false);
      closeTimerRef.current = null;
    }, 1800);
  }, []);

  React.useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    []
  );

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (isCoarsePointer) {
        setTouchOpen(next);
      }
      onOpenChange?.(next);
    },
    [isCoarsePointer, onOpenChange]
  );

  return (
    <TooltipTouchContext.Provider
      value={{
        isCoarsePointer,
        setOpen: setTouchOpen,
        scheduleClose
      }}
    >
      <TooltipPrimitive.Root
        open={isCoarsePointer ? touchOpen : open}
        onOpenChange={isCoarsePointer ? handleOpenChange : onOpenChange}
        {...props}
      />
    </TooltipTouchContext.Provider>
  );
};

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ onPointerDown, ...props }, ref) => {
  const context = React.useContext(TooltipTouchContext);
  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      {...props}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (!context?.isCoarsePointer) return;
        if (event.pointerType === "mouse") return;
        event.preventDefault();
        context.setOpen(true);
        context.scheduleClose();
      }}
    />
  );
});

TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md bg-slate-900 px-3 py-1.5 text-xs text-slate-50 shadow-md dark:bg-slate-100 dark:text-slate-900",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));

TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
