import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../../lib/utils";

type ButtonVariant = "default" | "outline" | "ghost" | "danger";
type ButtonSize = "default" | "sm";

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-brand-700 text-white shadow-card hover:bg-brand-800 dark:bg-brand-600 dark:hover:bg-brand-500",
  outline:
    "border border-slate-300 bg-white text-slate-900 hover:bg-slate-100 dark:border-brand-700 dark:bg-slate-900 dark:text-brand-100 dark:hover:bg-slate-800",
  ghost: "text-slate-800 hover:bg-slate-200/80 dark:text-brand-100 dark:hover:bg-slate-800",
  danger: "bg-rose-600 text-white hover:bg-rose-700"
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-11 px-4 text-sm",
  sm: "h-9 px-3 text-xs"
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, asChild = false, variant = "default", size = "default", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
