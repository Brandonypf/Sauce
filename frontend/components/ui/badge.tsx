import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium uppercase tracking-wider",
  {
    variants: {
      variant: {
        category: "bg-accent-soft text-accent-primary",
        new: "bg-bg-elevated text-text-primary border border-default",
        licensed: "bg-success-soft text-success",
        outline: "bg-transparent text-text-secondary border border-default",
      },
    },
    defaultVariants: {
      variant: "category",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {variant === "licensed" && <ShieldCheck className="h-3 w-3" />}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
