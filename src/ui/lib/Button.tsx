import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading,
    icon,
    iconRight,
    fullWidth,
    className,
    children,
    disabled,
    type,
    style,
    ...rest
  },
  ref,
) {
  const cls = [
    "zw-btn",
    `zw-btn--${variant}`,
    `zw-btn--${size}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cls}
      disabled={disabled || loading}
      style={fullWidth ? { width: "100%", ...style } : style}
      {...rest}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin" aria-hidden />
      ) : (
        icon
      )}
      {children}
      {iconRight}
    </button>
  );
});
