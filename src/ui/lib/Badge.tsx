import type { ReactNode } from "react";

export type BadgeVariant = "neutral" | "success" | "warning" | "error" | "info";

export interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = "neutral", dot, children, className }: BadgeProps) {
  return (
    <span className={`zw-badge ${className ?? ""}`} data-variant={variant}>
      {dot && <span className="zw-badge-dot" aria-hidden />}
      {children}
    </span>
  );
}
