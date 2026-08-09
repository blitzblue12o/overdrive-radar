import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]",
        secondary:
          "border-transparent bg-[var(--muted)] text-[var(--muted-foreground)]",
        outline: "border-[var(--border)] text-[var(--foreground)]",
        free: "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]",
        paid: "border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
