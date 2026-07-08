import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold", {
  variants: {
    variant: {
      disponible: "border-vm-green/20 bg-emerald-50 text-vm-green",
      reservado: "border-vm-gold/35 bg-amber-50 text-amber-800",
      pagado: "border-emerald-200 bg-emerald-50 text-emerald-700",
      pendiente: "border-orange-200 bg-orange-50 text-orange-700",
      neutral: "border-border bg-vm-cream text-muted-foreground"
    }
  },
  defaultVariants: {
    variant: "neutral"
  }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
