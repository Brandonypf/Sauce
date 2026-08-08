"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-small font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-accent-primary text-white px-6 py-3 shadow-sm hover:bg-accent-hover hover:shadow-glow hover:-translate-y-px active:scale-[0.98]",
        secondary:
          "bg-transparent border border-default text-text-primary px-6 py-3 hover:bg-bg-elevated active:scale-[0.98]",
        ghost:
          "bg-transparent text-text-secondary px-3 py-2 hover:text-text-primary hover:bg-bg-elevated",
        success:
          "bg-success text-white px-6 py-3 shadow-sm hover:shadow-glow-success hover:-translate-y-px active:scale-[0.98]",
      },
      size: {
        sm: "h-9 text-caption px-3",
        md: "h-11 px-6",
        lg: "h-12 px-8 text-body",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, className }));

    if (asChild) {
      return (
        <Slot className={classes} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
