import * as React from "react";
import { cn } from "../../lib/utils";
import { Input } from "./input";

interface InputWithSuffixProps extends React.InputHTMLAttributes<HTMLInputElement> {
  suffix: React.ReactNode;
  containerClassName?: string;
  inputClassName?: string;
  suffixContainerClassName?: string;
  interactiveSuffix?: boolean;
}

export const InputWithSuffix = React.forwardRef<HTMLInputElement, InputWithSuffixProps>(
  (
    { suffix, className, containerClassName, inputClassName, suffixContainerClassName, interactiveSuffix = false, ...props },
    ref
  ) => (
    <div className={cn("relative", containerClassName)}>
      <Input
        ref={ref}
        className={cn("pr-10", inputClassName, className)}
        {...props}
      />
      <div
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2",
          interactiveSuffix ? "pointer-events-auto" : "pointer-events-none text-xs text-slate-500 dark:text-slate-400",
          suffixContainerClassName
        )}
      >
        {suffix}
      </div>
    </div>
  )
);

InputWithSuffix.displayName = "InputWithSuffix";
