import type { ReactNode } from "react";

interface PanelProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function Panel({ title, subtitle, actions, children }: PanelProps) {
  return (
    <div className="zw-route flex flex-col gap-6 max-w-4xl">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="zw-h1">{title}</h1>
          {subtitle && <p className="zw-small mt-1.5 max-w-2xl">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
