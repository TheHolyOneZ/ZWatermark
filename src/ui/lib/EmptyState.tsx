import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`zw-card flex flex-col items-center text-center py-12 px-6 ${className ?? ""}`}>
      {icon && (
        <div
          className="mb-4 text-[color:var(--zw-accent)] opacity-70"
          style={{ width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}
          aria-hidden
        >
          {icon}
        </div>
      )}
      <div className="zw-h3 mb-2">{title}</div>
      {description && (
        <div className="zw-small max-w-md">{description}</div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
