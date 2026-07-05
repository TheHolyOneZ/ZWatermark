import { type ElementType, type ReactNode, type HTMLAttributes } from "react";

export type CardVariant = "default" | "hover" | "warning" | "success" | "error";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  variant?: CardVariant;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  as?: ElementType;
  children?: ReactNode;
}

export function Card({
  variant = "default",
  title,
  subtitle,
  actions,
  as,
  className,
  children,
  ...rest
}: CardProps) {
  const Comp = (as ?? "div") as ElementType;
  const cls = [
    "zw-card",
    variant === "hover" ? "zw-card--hover" : "",
    variant === "warning" ? "zw-card--warning" : "",
    variant === "success" ? "zw-card--success" : "",
    variant === "error" ? "zw-card--error" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const hasHeader = title || subtitle || actions;
  return (
    <Comp className={cls} {...rest}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            {title && <div className="zw-h3">{title}</div>}
            {subtitle && (
              <div className="zw-small mt-0.5">{subtitle}</div>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Comp>
  );
}
