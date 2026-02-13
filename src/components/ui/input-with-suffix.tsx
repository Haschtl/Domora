import * as React from "react";
import { cn } from "../../lib/utils";
import { Input } from "./input";

interface InputWithSuffixProps extends React.InputHTMLAttributes<HTMLInputElement> {
  suffix: React.ReactNode;
  containerClassName?: string;
  inputClassName?: string;
}

export const InputWithSuffix = React.forwardRef<HTMLInputElement, InputWithSuffixProps>(
  ({ suffix, className, containerClassName, inputClassName, ...props }, ref) => (
    <div className={cn("relative", containerClassName)}>
      <Input
        ref={ref}
        className={cn("pr-10", inputClassName, className)}
        {...props}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 dark:text-slate-400">
        {suffix}
      </span>
    </div>
  )
);

InputWithSuffix.displayName = "InputWithSuffix";

