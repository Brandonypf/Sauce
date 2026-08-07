import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-md border border-default bg-bg-surface px-4 py-2 text-small text-text-primary placeholder:text-text-tertiary transition-colors focus-visible:border-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

const SearchInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <input
          ref={ref}
          className={cn(
            "h-12 w-full rounded-md border border-default bg-bg-surface pl-10 pr-4 text-small text-text-primary placeholder:text-text-tertiary transition-colors focus-visible:border-focus focus-visible:outline-none",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
SearchInput.displayName = "SearchInput";

export { Input, SearchInput };
