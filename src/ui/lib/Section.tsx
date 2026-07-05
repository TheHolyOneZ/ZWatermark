import type { ReactNode } from "react";

interface SectionProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <section className={`flex flex-col gap-3 ${className ?? ""}`}>
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="zw-h2">{title}</div>
          {description && <div className="zw-small mt-1">{description}</div>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
